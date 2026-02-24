// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

/**
 * @dev Interface for EIP-2612 permit functionality
 * @notice Allows gasless approvals via signature-based permits
 * @dev See EIP-2612: https://eips.ethereum.org/EIPS/eip-2612
 */
interface IERC20Permit {
    /**
     * @dev Sets the allowance for a spender via signature
     * @param owner The address that owns the tokens
     * @param spender The address that will be allowed to spend
     * @param value The amount of tokens to allow
     * @param deadline The timestamp after which the permit is no longer valid
     * @param v The recovery byte of the signature
     * @param r Half of the ECDSA signature pair
     * @param s Half of the ECDSA signature pair
     */
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

