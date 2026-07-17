// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title FeeVault
 * @author Cancore Team
 * @notice Holds collected swap fees and pays partner fee refunds against
 *         backend-signed EIP-712 vouchers.
 * @dev Set as `HTLC.feeRecipient`, so every HTLC claim forwards its fee here.
 *      The vault therefore holds ONLY fees — never a swap's locked principal —
 *      which is why a compromised voucher signer can never touch user funds.
 *
 *      Redemption is pull-based: the backend signs a `FeeClaim` off-chain and
 *      the partner submits `redeem` themselves (they pay the gas; the backend
 *      never broadcasts a transaction). The recipient is bound inside the
 *      signature, so a voucher may be relayed by anyone without being redirected.
 *
 *      Replay protection is threefold:
 *        - the EIP-712 domain binds a voucher to one chain and one vault,
 *        - `usedNonces` makes each voucher single-use,
 *        - `deadline` expires unredeemed vouchers.
 *      Revoking a signer via {setSigner} invalidates every voucher it ever
 *      signed — the kill-switch for a leaked key.
 *
 *      Designed for standard ERC20 tokens without fee-on-transfer or rebasing
 *      mechanics; with such tokens the recipient would receive less than the
 *      signed `amount`.
 */
contract FeeVault is Ownable, Pausable, EIP712 {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error ZeroAmount();
    error VoucherExpired();
    error NonceAlreadyUsed();
    error InvalidSigner();

    /**
     * @notice A backend-signed authorization to pull a fee refund from this vault
     * @param token ERC20 the refund is paid in
     * @param to Recipient of the refund (chosen by the partner, bound by the signature)
     * @param amount Refund amount in token base units
     * @param nonce Single-use 256-bit value; a voucher can never be redeemed twice
     * @param deadline Unix timestamp after which the voucher is no longer redeemable
     */
    struct FeeClaim {
        address token;
        address to;
        uint256 amount;
        uint256 nonce;
        uint256 deadline;
    }

    /**
     * @dev EIP-712 type hash of {FeeClaim}. The backend signer must build the
     *      exact same type string, field order included, or recovery yields a
     *      different address and the voucher is rejected.
     */
    bytes32 private constant FEE_CLAIM_TYPEHASH =
        keccak256("FeeClaim(address token,address to,uint256 amount,uint256 nonce,uint256 deadline)");

    /**
     * @notice Nonces already redeemed. The backend polls this to settle a voucher.
     */
    mapping(uint256 => bool) public usedNonces;

    /**
     * @notice Addresses whose signatures authorize a redeem
     * @dev A set (not a single address) so a key can be rotated without a gap:
     *      grant the new signer, then revoke the old one.
     */
    mapping(address => bool) public isSigner;

    /**
     * @notice Emitted when a voucher is redeemed and the refund is transferred
     * @param token ERC20 the refund was paid in
     * @param to Recipient that received the refund
     * @param amount Amount transferred, in token base units
     * @param nonce The voucher nonce, now consumed
     * @param caller Address that submitted the redeem (may relay for `to`)
     */
    event FeeClaimed(
        address indexed token,
        address indexed to,
        uint256 amount,
        uint256 nonce,
        address caller
    );

    /**
     * @notice Emitted when a signer is granted or revoked
     * @param signer The signer address
     * @param allowed True when granted, false when revoked
     */
    event SignerUpdated(address indexed signer, bool allowed);

    /**
     * @notice Emitted when the owner sweeps collected fees out of the vault
     * @param token ERC20 swept
     * @param to Destination of the swept funds
     * @param amount Amount swept, in token base units
     */
    event Swept(address indexed token, address indexed to, uint256 amount);

    /**
     * @notice Deploys the vault with the deployer as owner and no signers
     * @dev The domain name/version are part of every voucher digest and must
     *      match the backend signer exactly. Grant a signer via {setSigner}
     *      before any voucher can be redeemed.
     */
    constructor() Ownable() EIP712("CancoreFeeVault", "1") {}

    /**
     * @notice Redeems a backend-signed voucher, transferring the refund to `voucher.to`
     * @param voucher The signed fee-refund authorization
     * @param signature EIP-712 signature over `voucher` by a currently-granted signer
     * @dev Callable by anyone — the funds go to `voucher.to`, which is covered by
     *      the signature, so relaying cannot redirect them.
     * @dev Uses Checks-Effects-Interactions: the nonce is consumed before the
     *      token transfer, so a reentrant call re-using the voucher reverts with
     *      {NonceAlreadyUsed}.
     * @custom:security Rejects the voucher if the recovered signer is not (or is
     *      no longer) granted, which retroactively kills a leaked key's vouchers.
     */
    function redeem(FeeClaim calldata voucher, bytes calldata signature) external whenNotPaused {
        if (voucher.token == address(0)) revert ZeroAddress();
        if (voucher.to == address(0)) revert ZeroAddress();
        if (voucher.amount == 0) revert ZeroAmount();
        if (block.timestamp > voucher.deadline) revert VoucherExpired();
        if (usedNonces[voucher.nonce]) revert NonceAlreadyUsed();

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    FEE_CLAIM_TYPEHASH,
                    voucher.token,
                    voucher.to,
                    voucher.amount,
                    voucher.nonce,
                    voucher.deadline
                )
            )
        );
        // Reverts on a malformed signature; also rejects malleable high-s values.
        address signer = ECDSA.recover(digest, signature);
        if (!isSigner[signer]) revert InvalidSigner();

        usedNonces[voucher.nonce] = true;

        IERC20(voucher.token).safeTransfer(voucher.to, voucher.amount);

        emit FeeClaimed(voucher.token, voucher.to, voucher.amount, voucher.nonce, msg.sender);
    }

    /**
     * @notice Grants or revokes a voucher signer (admin only)
     * @param signer The signer address to update
     * @param allowed True to grant, false to revoke
     * @dev Only owner can call this function
     * @dev Revoking invalidates every voucher that signer produced, redeemed or not
     */
    function setSigner(address signer, bool allowed) external onlyOwner {
        if (signer == address(0)) revert ZeroAddress();

        isSigner[signer] = allowed;

        emit SignerUpdated(signer, allowed);
    }

    /**
     * @notice Halts all redemptions (admin only)
     * @dev Only owner can call this function. Use on a suspected signer compromise.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Resumes redemptions (admin only)
     * @dev Only owner can call this function
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Moves collected fees out of the vault (admin only)
     * @param token ERC20 to sweep
     * @param to Destination of the swept funds
     * @param amount Amount to sweep, in token base units
     * @dev Only owner can call this function — the vault holds fee revenue, so
     *      the owner (a multisig) can route it to the treasury. This does not put
     *      user principal at risk: locked swap funds never reach this contract.
     * @dev Sweeping below the outstanding voucher liability will make later
     *      redemptions revert on an insufficient balance.
     */
    function sweep(address token, address to, uint256 amount) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        IERC20(token).safeTransfer(to, amount);

        emit Swept(token, to, amount);
    }
}
