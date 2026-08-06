// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "./IPermit2.sol";

/**
 * @title IHTLC
 * @notice Interface for Hashed Timelock Contract (HTLC)
 * @dev This interface defines the public API for HTLC contract implementation.
 *      HTLC allows users to lock ERC20 tokens with a hash commitment and time-based unlock mechanism.
 *      The receiver can claim tokens by revealing the pre-image before unlock time,
 *      or the sender can retake tokens after the unlock time has elapsed.
 * @author Cancore Team
 */
interface IHTLC {
    // ============ State Variables ============

    /**
     * @notice Mapping from lock key (keccak256(hashValue, senderAddress)) to Lock struct
     * @param lockKey The computed lock key from hashValue and senderAddress
     * @return unlockTime Timestamp after which the sender can retake the tokens
     * @return amount Amount of tokens locked
     * @return tokenAddress Address of the ERC20 token contract
     * @return senderAddress Address of the user who locked the tokens
     * @return receiverAddress Address of the user who can claim the tokens
     */
    function locks(bytes32 lockKey) external view returns (
        uint256 unlockTime,
        uint256 amount,
        address tokenAddress,
        address senderAddress,
        address receiverAddress
    );

    /**
     * @notice Address where fees are collected
     * @return The current fee recipient address
     */
    function feeRecipient() external view returns (address);

    /**
     * @notice Address of the Permit2 contract used for gasless approvals
     * @return The current Permit2 contract address, or zero if not set
     */
    function permit2() external view returns (address);

    /**
     * @notice Fee rate in basis points (1000 = 10%, 100 = 1%, 50 = 0.5%)
     * @return The current fee rate in basis points
     */
    function feeRate() external view returns (uint256);

    /**
     * @notice Maximum fee rate allowed in basis points
     * @return The maximum allowed fee rate (1000 = 10%)
     */
    function MAX_FEE_RATE() external view returns (uint256);

    // ============ Core Functions ============

    /**
     * @notice Allows the receiver to claim locked tokens by revealing the pre-image
     * @param preImage The secret pre-image that hashes to the hashValue used in lock()
     * @param senderAddress The address of the sender who created the lock
     * @dev The pre-image must hash to the hashValue used when locking
     * @dev Uses SHA256 for hash computation (to match DAML contracts which use SHA256)
     * @dev Can only be called by the receiver before unlockTime
     * @dev Emits a Claimed event upon successful claim
     * @custom:security Reentrancy protection: state is cleared before external call
     */
    function claim(string calldata preImage, address senderAddress) external;
    
    /**
     * @notice Locks ERC20 tokens with a hash commitment and time-based unlock
     * @param hashValue The SHA256 hash of the pre-image (secret)
     * @param unlockTime Timestamp after which the sender can retake tokens if not claimed
     * @param amount Amount of tokens to lock
     * @param tokenAddress Address of the ERC20 token contract
     * @param receiverAddress Address of the user who can claim with the pre-image
     * @dev The sender must have approved this contract to spend at least `amount` tokens
     * @dev unlockTime must be in the future (checked implicitly by claim/retake logic)
     * @dev Prevents duplicate locks with same hashValue and sender
     * @dev Uses SHA256 for hash computation (to match DAML contracts which use SHA256)
     * @dev Emits a Locked event upon successful lock
     * @custom:security Reentrancy protection: state is set after external call
     */
    function lock(
        bytes32 hashValue,
        uint256 unlockTime,
        uint256 amount,
        address tokenAddress,
        address receiverAddress
    ) external;

    /**
     * @notice Locks ERC20 tokens using Uniswap Permit2 for gasless approval
     * @param hashValue The SHA256 hash of the pre-image (secret)
     * @param unlockTime Timestamp after which the sender can retake tokens if not claimed
     * @param amount Amount of tokens to lock
     * @param tokenAddress Address of the ERC20 token contract
     * @param receiverAddress Address of the user who can claim with the pre-image
     * @param permit The Permit2 permit describing the allowed token and amount
     * @param transferDetails Transfer details specifying destination (must be this contract) and amount
     * @param signature Off-chain signature authorizing the Permit2 transfer
     * @dev Uses Uniswap Permit2 (Signature Transfer) to pull tokens from msg.sender without prior ERC20 approve
     * @dev Follows Checks-Effects-Interactions: state is updated after successful external call to Permit2
     * @dev Emits a Locked event upon successful lock
     * @custom:security The permit must be specifically bound to this contract and the expected amount
     */
    function lockWithPermit2(
        bytes32 hashValue,
        uint256 unlockTime,
        uint256 amount,
        address tokenAddress,
        address receiverAddress,
        IPermit2.PermitTransferFrom calldata permit,
        IPermit2.SignatureTransferDetails calldata transferDetails,
        bytes calldata signature
    ) external;

    /**
     * @notice Locks ERC20 tokens using EIP-2612 permit for gasless approval
     * @param hashValue The SHA256 hash of the pre-image (secret)
     * @param unlockTime Timestamp after which the sender can retake tokens if not claimed
     * @param amount Amount of tokens to lock
     * @param tokenAddress Address of the ERC20 token contract (must support EIP-2612 permit)
     * @param receiverAddress Address of the user who can claim with the pre-image
     * @param deadline The timestamp after which the permit is no longer valid
     * @param v The recovery byte of the signature
     * @param r Half of the ECDSA signature pair
     * @param s Half of the ECDSA signature pair
     * @dev Uses EIP-2612 permit to set allowance, then transfers tokens to this contract
     * @dev The token must support EIP-2612 permit functionality
     * @dev Follows Checks-Effects-Interactions: state is updated after successful token transfer
     * @dev Emits a Locked event upon successful lock
     * @custom:security The permit must be specifically bound to this contract and the expected amount
     */
    function lockWithPermit(
        bytes32 hashValue,
        uint256 unlockTime,
        uint256 amount,
        address tokenAddress,
        address receiverAddress,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /**
     * @notice Allows the sender to retake locked tokens after the unlock time has elapsed
     * @param hashValue The SHA256 hash that was used when locking
     * @dev Can only be called by the original sender after unlockTime
     * @dev Uses Checks-Effects-Interactions pattern: delete lock before external call
     * @dev Emits a Retaken event upon successful retake
     * @custom:security Reentrancy protection: state is cleared before external call
     */
    function retake(bytes32 hashValue) external;

    /**
     * @notice Retrieves lock information by hashValue and senderAddress
     * @param hashValue The SHA256 hash used when locking
     * @param senderAddress The address of the sender who created the lock
     * @return unlockTime Timestamp after which sender can retake
     * @return amount Amount of tokens locked
     * @return tokenAddress Address of the ERC20 token
     * @return senderAddr Address of the sender
     * @return receiverAddress Address of the receiver
     * @dev Returns zero values if lock doesn't exist
     */
    function getLock(bytes32 hashValue, address senderAddress) external view returns (
        uint256 unlockTime,
        uint256 amount,
        address tokenAddress,
        address senderAddr,
        address receiverAddress
    );

    // ============ Owner Functions ============

    /**
     * @notice Sets the fee recipient address (admin only)
     * @param newFeeRecipient The new address to receive fees
     * @dev Only owner can call this function
     * @dev Cannot set to zero address
     * @dev Emits a FeeRecipientUpdated event
     */
    function setFeeRecipient(address newFeeRecipient) external;

    /**
     * @notice Sets the fee rate in basis points (admin only)
     * @param newFeeRate The new fee rate in basis points (1000 = 10%, 100 = 1%)
     * @dev Only owner can call this function
     * @dev Fee rate cannot exceed MAX_FEE_RATE (1000 = 10%)
     * @dev Emits a FeeRateUpdated event
     */
    function setFeeRate(uint256 newFeeRate) external;

    /**
     * @notice Sets the Permit2 contract address (admin only)
     * @param newPermit2 The new Permit2 contract address
     * @dev Only owner can call this function
     * @dev Cannot set to zero address
     * @dev Emits a Permit2Updated event
     */
    function setPermit2(address newPermit2) external;
}
