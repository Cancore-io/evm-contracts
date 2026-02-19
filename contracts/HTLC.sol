// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title HTLC
 * @author Cancore Team
 * @notice A Hashed Timelock Contract (HTLC) implementation for atomic swaps and conditional payments
 * @dev This contract allows users to lock ERC20 tokens with a hash commitment and time-based unlock mechanism.
 *      The receiver can claim tokens by revealing the pre-image before unlock time,
 *      or the sender can retake tokens after the unlock time has elapsed.
 */
contract HTLC {
    // Custom errors for gas efficiency
    error ZeroAddress();
    error ZeroAmount();
    error InvalidPreImage();
    error ClaimTimeExpired();
    error RetakeTimeNotReached();
    error UnauthorizedClaim();
    error UnauthorizedRetake();
    error LockAlreadyExists();
    error LockNotFound();
    error TransferFailed();
    error SenderEqualsReceiver();

    /**
     * @notice Lock structure storing all information about a locked token transfer
     * @param unlockTime Timestamp after which the sender can retake the tokens
     * @param amount Amount of tokens locked
     * @param tokenAddress Address of the ERC20 token contract
     * @param senderAddress Address of the user who locked the tokens
     * @param receiverAddress Address of the user who can claim the tokens
     */
    struct Lock {
        uint256 unlockTime;
        uint256 amount;
        address tokenAddress;
        address senderAddress;
        address receiverAddress;
    }

    /**
     * @notice Mapping from lock key (keccak256(hashValue, senderAddress)) to Lock struct
     * @dev Using hashValue + senderAddress as key allows multiple locks with the same hashValue
     */
    mapping(bytes32 => Lock) public locks;

    /**
     * @notice Computes the unique lock key from hashValue and senderAddress
     * @param hashValue The keccak256 hash of the pre-image
     * @param senderAddress The address of the sender who created the lock
     * @return The computed lock key
     * @dev This allows multiple users to create locks with the same hashValue
     */
    function getLockKey(bytes32 hashValue, address senderAddress) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(hashValue, senderAddress));
    }

    /**
     * @notice Emitted when tokens are successfully claimed by the receiver
     * @param preImage The pre-image that was revealed to claim the tokens
     * @param hashValue The keccak256 hash of the pre-image
     * @param when Timestamp when the claim occurred
     * @param amount Amount of tokens claimed
     * @param tokenAddress Address of the ERC20 token
     * @param senderAddress Address of the original sender
     * @param receiverAddress Address of the receiver who claimed
     */
    event Claimed(
        bytes preImage,
        bytes32 hashValue,
        uint256 when,
        uint256 amount,
        address indexed tokenAddress,
        address indexed senderAddress,
        address indexed receiverAddress
    );

    /**
     * @notice Emitted when tokens are successfully locked
     * @param hashValue The keccak256 hash of the pre-image
     * @param when The unlock time for this lock
     * @param amount Amount of tokens locked
     * @param tokenAddress Address of the ERC20 token
     * @param senderAddress Address of the sender who locked the tokens
     * @param receiverAddress Address of the receiver who can claim
     */
    event Locked(
        bytes32 hashValue,
        uint256 when,
        uint256 amount,
        address indexed tokenAddress,
        address indexed senderAddress,
        address indexed receiverAddress
    );

    /**
     * @notice Emitted when tokens are retaken by the sender after unlock time
     * @param hashValue The keccak256 hash of the pre-image
     * @param when Timestamp when the retake occurred
     * @param amount Amount of tokens retaken
     * @param tokenAddress Address of the ERC20 token
     * @param senderAddress Address of the sender who retook the tokens
     * @param receiverAddress Address of the original receiver
     */
    event Retaken(
        bytes32 hashValue,
        uint256 when,
        uint256 amount,
        address indexed tokenAddress,
        address indexed senderAddress,
        address indexed receiverAddress
    );

    /**
     * @notice Allows the receiver to claim locked tokens by revealing the pre-image
     * @param preImage The secret pre-image that hashes to the hashValue used in lock()
     * @param senderAddress The address of the sender who created the lock
     * @dev The pre-image must hash to the hashValue used when locking
     * @dev Can only be called by the receiver before unlockTime
     * @dev Uses Checks-Effects-Interactions pattern: delete lock before external call
     * @custom:security Reentrancy protection: state is cleared before external call
     */
    function claim(bytes calldata preImage, address senderAddress) external {
        if (senderAddress == address(0)) revert ZeroAddress();
        
        bytes32 hashValue = keccak256(preImage);
        bytes32 lockKey = getLockKey(hashValue, senderAddress);
        Lock storage l = locks[lockKey];
        uint256 amount = l.amount;
        if (amount == 0) revert InvalidPreImage();

        // Note: block.timestamp can be manipulated by miners within ~15 seconds
        // This is acceptable for HTLC use cases where time windows are typically hours/days
        if (block.timestamp >= l.unlockTime) revert ClaimTimeExpired();
        address receiverAddress = l.receiverAddress;
        if (receiverAddress == address(0)) revert ZeroAddress();
        if (msg.sender != receiverAddress) revert UnauthorizedClaim();

        // Save values before delete (Checks-Effects-Interactions pattern)
        address tokenAddr = l.tokenAddress;
        if (tokenAddr == address(0)) revert ZeroAddress();
        address senderAddr = l.senderAddress;
        
        // Effects: Delete lock before external call to prevent reentrancy
        delete locks[lockKey];
        
        // Emit event before external call (if transfer fails, transaction reverts and event won't be recorded)
        emit Claimed({
            preImage: preImage,
            hashValue: hashValue,
            amount: amount,
            when: block.timestamp,
            tokenAddress: tokenAddr,
            senderAddress: senderAddr,
            receiverAddress: receiverAddress
        });
        
        // Interactions: Transfer tokens after state changes
        IERC20 erc20 = IERC20(tokenAddr);
        if (!erc20.transfer(receiverAddress, amount)) revert TransferFailed();
    }

    /**
     * @notice Locks ERC20 tokens with a hash commitment and time-based unlock
     * @param hashValue The keccak256 hash of the pre-image (secret)
     * @param unlockTime Timestamp after which the sender can retake tokens if not claimed
     * @param amount Amount of tokens to lock
     * @param tokenAddress Address of the ERC20 token contract
     * @param receiverAddress Address of the user who can claim with the pre-image
     * @dev The sender must have approved this contract to spend at least `amount` tokens
     * @dev unlockTime must be in the future (checked implicitly by claim/retake logic)
     * @dev Prevents duplicate locks with same hashValue and sender
     * @custom:security Reentrancy protection: state is set before external call
     */
    function lock(
        bytes32 hashValue,
        uint256 unlockTime,
        uint256 amount,
        address tokenAddress,
        address receiverAddress
    ) external {
        if (tokenAddress == address(0)) revert ZeroAddress();
        if (receiverAddress == address(0)) revert ZeroAddress();
        if (receiverAddress == msg.sender) revert SenderEqualsReceiver();
        if (amount == 0) revert ZeroAmount();
        
        bytes32 lockKey = getLockKey(hashValue, msg.sender);
        if (locks[lockKey].amount != 0) revert LockAlreadyExists();

        // Effects: Set state before external call
        locks[lockKey] = Lock({
            unlockTime: unlockTime,
            amount: amount,
            tokenAddress: tokenAddress,
            senderAddress: msg.sender,
            receiverAddress: receiverAddress
        });

        // Emit event before external call (if transferFrom fails, transaction reverts and event won't be recorded)
        emit Locked({
            hashValue: hashValue,
            when: unlockTime,  // Emit actual unlock time, not current timestamp
            amount: amount,
            tokenAddress: tokenAddress,
            senderAddress: msg.sender,
            receiverAddress: receiverAddress
        });

        // Interactions: Transfer tokens after state changes
        IERC20 erc20 = IERC20(tokenAddress);
        if (!erc20.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
    }

    /**
     * @notice Allows the sender to retake locked tokens after the unlock time has elapsed
     * @param hashValue The keccak256 hash that was used when locking
     * @dev Can only be called by the original sender after unlockTime
     * @dev Uses Checks-Effects-Interactions pattern: delete lock before external call
     * @custom:security Reentrancy protection: state is cleared before external call
     */
    function retake(bytes32 hashValue) external {
        bytes32 lockKey = getLockKey(hashValue, msg.sender);
        Lock storage l = locks[lockKey];
        uint256 amount = l.amount;
        if (amount == 0) revert LockNotFound();

        // Note: block.timestamp can be manipulated by miners within ~15 seconds
        // This is acceptable for HTLC use cases where time windows are typically hours/days
        if (block.timestamp < l.unlockTime) revert RetakeTimeNotReached();
        address senderAddress = l.senderAddress;
        if (msg.sender != senderAddress) revert UnauthorizedRetake();

        // Save values before delete (Checks-Effects-Interactions pattern)
        address tokenAddr = l.tokenAddress;
        if (tokenAddr == address(0)) revert ZeroAddress();
        address receiverAddr = l.receiverAddress;

        // Effects: Delete lock before external call to prevent reentrancy
        delete locks[lockKey];
        
        // Emit event before external call (if transfer fails, transaction reverts and event won't be recorded)
        emit Retaken({
            hashValue: hashValue,
            amount: amount,
            when: block.timestamp,
            tokenAddress: tokenAddr,
            senderAddress: senderAddress,
            receiverAddress: receiverAddr
        });
        
        // Interactions: Transfer tokens after state changes
        IERC20 erc20 = IERC20(tokenAddr);
        if (!erc20.transfer(senderAddress, amount)) revert TransferFailed();
    }

    /**
     * @notice Retrieves lock information by hashValue and senderAddress
     * @param hashValue The keccak256 hash used when locking
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
    ) {
        bytes32 lockKey = getLockKey(hashValue, senderAddress);
        Lock storage l = locks[lockKey];
        return (l.unlockTime, l.amount, l.tokenAddress, l.senderAddress, l.receiverAddress);
    }
}
