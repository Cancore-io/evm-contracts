// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

/**
 * @dev Minimal interface for Uniswap Permit2 (Signature Transfer) used by HTLC contract.
 *      We intentionally depend only on the specific structs and function we need.
 *      See: https://docs.uniswap.org/contracts/permit2
 */
interface IPermit2 {
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
        bytes calldata signature
    ) external;
}