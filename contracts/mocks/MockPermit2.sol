// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MockPermit2
 * @notice Minimal mock of Uniswap Permit2 used for testing HTLC.lockWithPermit2
 * @dev This mock ignores signatures and directly pulls tokens via ERC20 transferFrom.
 *      It is NOT a drop-in replacement for real Permit2 and MUST NOT be used in production.
 */
contract MockPermit2 {
    struct TokenPermissions {
        address token;
        uint256 amount;
    }

    struct PermitTransferFrom {
        TokenPermissions permitted;
        uint256 nonce;
        uint256 deadline;
    }

    struct SignatureTransferDetails {
        address to;
        uint256 requestedAmount;
    }

    function permitTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata /* signature */
    ) external {
        IERC20 token = IERC20(permit.permitted.token);
        require(transferDetails.to != address(0), "MockPermit2: zero to");
        require(permit.permitted.amount >= transferDetails.requestedAmount, "MockPermit2: amount too high");

        // Pull tokens from owner to the target address.
        // Requires owner to have approved this MockPermit2 for at least requestedAmount.
        bool ok = token.transferFrom(owner, transferDetails.to, transferDetails.requestedAmount);
        require(ok, "MockPermit2: transferFrom failed");
    }
}


