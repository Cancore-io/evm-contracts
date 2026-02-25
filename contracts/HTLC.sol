// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IPermit2.sol";
import "./interfaces/IERC20Permit.sol";
import "./interfaces/IHTLC.sol";

/**
 * @title HTLC
 * @author Cancore Team
 * @notice A Hashed Timelock Contract (HTLC) implementation for atomic swaps and conditional payments
 * @dev This contract allows users to lock ERC20 tokens with a hash commitment and time-based unlock mechanism.
 *      The receiver can claim tokens by revealing the pre-image before unlock time,
 *      or the sender can retake tokens after the unlock time has elapsed.
 */
contract HTLC is Ownable, IHTLC {
    
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
    error InvalidFeeRate();
    error Permit2NotSet();
    error InvalidPermit2Parameters();
    error InvalidPermitParameters();

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
     * @dev Using hashValue (SHA256) + senderAddress as key allows multiple locks with the same hashValue
     */
    mapping(bytes32 => Lock) public locks;

    /**
     * @notice Address where fees are collected
     */
    address public feeRecipient;

    /**
     * @notice Address of the Permit2 contract used for gasless approvals
     * @dev Can be configured by the owner via setPermit2 and is then used in lockWithPermit2
     */
    address public permit2;

    /**
     * @notice Fee rate in basis points (10000 = 100%, 100 = 1%, 50 = 0.5%)
     */
    uint256 public feeRate;

    /**
     * @notice Maximum fee rate allowed (10000 = 100%)
     */
    uint256 public constant MAX_FEE_RATE = 10000;

    /**
     * @notice Computes the unique lock key from hashValue and senderAddress
     * @param hashValue The SHA256 hash of the pre-image
     * @param senderAddress The address of the sender who created the lock
     * @return The computed lock key
     * @dev This allows multiple users to create locks with the same hashValue
     */
    function getLockKey(bytes32 hashValue, address senderAddress) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(hashValue, senderAddress));
    }

    /**
     * @notice Constructor sets the deployer as the owner
     */
    constructor() Ownable() {
        feeRecipient = msg.sender;
        feeRate = 0;
    }

    /**
     * @notice Emitted when tokens are successfully claimed by the receiver
     * @param preImage The pre-image that was revealed to claim the tokens
     * @param hashValue The SHA256 hash of the pre-image
     * @param when Timestamp when the claim occurred
     * @param amount Amount of tokens claimed
     * @param feeAmount Amount of fees charged
     * @param tokenAddress Address of the ERC20 token
     * @param senderAddress Address of the original sender
     * @param receiverAddress Address of the receiver who claimed
     */
    event Claimed(
        string preImage,
        bytes32 hashValue,
        uint256 when,
        uint256 amount,
        uint256 feeAmount,
        address indexed tokenAddress,
        address indexed senderAddress,
        address indexed receiverAddress
    );

    /**
     * @notice Emitted when tokens are successfully locked
     * @param hashValue The SHA256 hash of the pre-image
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
     * @param hashValue The SHA256 hash of the pre-image
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
     * @notice Emitted when fee recipient is updated
     * @param oldRecipient Previous fee recipient address
     * @param newRecipient New fee recipient address
     */
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);

    /**
     * @notice Emitted when fee rate is updated
     * @param oldRate Previous fee rate in basis points
     * @param newRate New fee rate in basis points
     */
    event FeeRateUpdated(uint256 oldRate, uint256 newRate);

    /**
     * @notice Emitted when Permit2 contract address is updated
     * @param oldPermit2 Previous Permit2 contract address
     * @param newPermit2 New Permit2 contract address
     */
    event Permit2Updated(address indexed oldPermit2, address indexed newPermit2);

    /**
     * @notice Allows the receiver to claim locked tokens by revealing the pre-image
     * @param preImage The secret pre-image that hashes to the hashValue used in lock()
     * @param senderAddress The address of the sender who created the lock
     * @dev The pre-image must hash to the hashValue used when locking
     * @dev Uses SHA256 for hash computation (to match DAML contracts which use SHA256)
     * @dev Can only be called by the receiver before unlockTime
     * @dev Uses Checks-Effects-Interactions pattern: delete lock before external call
     * @custom:security Reentrancy protection: state is cleared before external call
     */
    function claim(string calldata preImage, address senderAddress) external {
        if (senderAddress == address(0)) revert ZeroAddress();
        
        bytes32 hashValue = sha256(bytes(preImage));
        bytes32 lockKey = getLockKey(hashValue, senderAddress);
        Lock storage l = locks[lockKey];
        if (l.amount == 0) revert InvalidPreImage();
        if (block.timestamp >= l.unlockTime) revert ClaimTimeExpired();
        if (l.receiverAddress == address(0)) revert ZeroAddress();
        if (msg.sender != l.receiverAddress) revert UnauthorizedClaim();
        if (l.tokenAddress == address(0)) revert ZeroAddress();

        uint256 amount = l.amount;
        address tokenAddr = l.tokenAddress;
        address senderAddr = l.senderAddress;
        address receiverAddr = l.receiverAddress;
        
        delete locks[lockKey];
        
        uint256 feeAmount = 0;
        if (feeRate > 0 && feeRecipient != address(0)) {
            // Frontends are expected to lock the total amount = principal + fee.
            // To preserve the intended principal amount for the receiver,
            // we derive principal from the total using:
            // principal = amount * MAX_FEE_RATE / (MAX_FEE_RATE + feeRate)
            uint256 principal = (amount * MAX_FEE_RATE) / (MAX_FEE_RATE + feeRate);
            feeAmount = amount - principal;
            if (feeAmount > 0) {
                if (!IERC20(tokenAddr).transfer(feeRecipient, feeAmount)) revert TransferFailed();
            }
        }
        
        uint256 receiverAmount = amount - feeAmount;
        if (!IERC20(tokenAddr).transfer(receiverAddr, receiverAmount)) revert TransferFailed();

        emit Claimed({
            preImage: preImage,
            hashValue: hashValue,
            amount: receiverAmount,
            feeAmount: feeAmount,
            when: block.timestamp,
            tokenAddress: tokenAddr,
            senderAddress: senderAddr,
            receiverAddress: receiverAddr
        });
    }

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
     * @custom:security Reentrancy protection: state is set after external call
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

        IERC20 erc20 = IERC20(tokenAddress);
        if (!erc20.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();

        _lock(hashValue, unlockTime, amount, tokenAddress, msg.sender, receiverAddress);
    }

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
     * @dev Uses Uniswap Permit2 (Signature Transfer) to pull tokens from msg.sender without prior ERC20 approve.
     * @dev Follows Checks-Effects-Interactions: state is updated after successful external call to Permit2.
     * @custom:security The permit must be specifically bound to this contract and the expected amount.
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
    ) external {
        if (permit2 == address(0)) revert Permit2NotSet();
        if (tokenAddress == address(0)) revert ZeroAddress();
        if (receiverAddress == address(0)) revert ZeroAddress();
        if (receiverAddress == msg.sender) revert SenderEqualsReceiver();
        if (amount == 0) revert ZeroAmount();

        if (permit.permitted.token != tokenAddress) revert InvalidPermit2Parameters();
        if (permit.permitted.amount < amount) revert InvalidPermit2Parameters();
        if (transferDetails.to != address(this)) revert InvalidPermit2Parameters();
        if (transferDetails.requestedAmount != amount) revert InvalidPermit2Parameters();
        
        if (block.timestamp > permit.deadline) revert InvalidPermit2Parameters();

        IPermit2(permit2).permitTransferFrom(
            permit,
            transferDetails,
            msg.sender,
            signature
        );

        _lock(hashValue, unlockTime, amount, tokenAddress, msg.sender, receiverAddress);
    }

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
    ) external {
        if (tokenAddress == address(0)) revert ZeroAddress();
        if (receiverAddress == address(0)) revert ZeroAddress();
        if (receiverAddress == msg.sender) revert SenderEqualsReceiver();
        if (amount == 0) revert ZeroAmount();

        if (block.timestamp > deadline) revert InvalidPermitParameters();

        IERC20Permit(tokenAddress).permit(
            msg.sender,
            address(this),
            amount,
            deadline,
            v,
            r,
            s
        );

        IERC20 erc20 = IERC20(tokenAddress);
        if (!erc20.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();

        _lock(hashValue, unlockTime, amount, tokenAddress, msg.sender, receiverAddress);
    }

    /**
     * @notice Allows the sender to retake locked tokens after the unlock time has elapsed
     * @param hashValue The SHA256 hash that was used when locking
     * @dev Can only be called by the original sender after unlockTime
     * @dev Uses Checks-Effects-Interactions pattern: delete lock before external call
     * @custom:security Reentrancy protection: state is cleared before external call
     */
    function retake(bytes32 hashValue) external {
        bytes32 lockKey = getLockKey(hashValue, msg.sender);
        Lock storage l = locks[lockKey];
        uint256 amount = l.amount;
        if (amount == 0) revert LockNotFound();

        if (block.timestamp < l.unlockTime) revert RetakeTimeNotReached();
        address senderAddress = l.senderAddress;
        if (msg.sender != senderAddress) revert UnauthorizedRetake();

        address tokenAddr = l.tokenAddress;
        if (tokenAddr == address(0)) revert ZeroAddress();
        address receiverAddr = l.receiverAddress;

        delete locks[lockKey];
        
        IERC20 erc20 = IERC20(tokenAddr);
        if (!erc20.transfer(senderAddress, amount)) revert TransferFailed();

        emit Retaken({
            hashValue: hashValue,
            amount: amount,
            when: block.timestamp,
            tokenAddress: tokenAddr,
            senderAddress: senderAddress,
            receiverAddress: receiverAddr
        });
    }

    /**
     * @notice Sets the fee recipient address (admin only)
     * @param newFeeRecipient The new address to receive fees
     * @dev Only owner can call this function
     * @dev Cannot set to zero address
     */
    function setFeeRecipient(address newFeeRecipient) external onlyOwner {
        if (newFeeRecipient == address(0)) revert ZeroAddress();
        
        address oldRecipient = feeRecipient;
        feeRecipient = newFeeRecipient;
        
        emit FeeRecipientUpdated(oldRecipient, newFeeRecipient);
    }

    /**
     * @notice Sets the fee rate in basis points (admin only)
     * @param newFeeRate The new fee rate in basis points (10000 = 100%, 100 = 1%)
     * @dev Only owner can call this function
     * @dev Fee rate cannot exceed MAX_FEE_RATE (10000 = 100%)
     */
    function setFeeRate(uint256 newFeeRate) external onlyOwner {
        if (newFeeRate > MAX_FEE_RATE) revert InvalidFeeRate();
        
        uint256 oldRate = feeRate;
        feeRate = newFeeRate;
        
        emit FeeRateUpdated(oldRate, newFeeRate);
    }

    /**
     * @notice Sets the Permit2 contract address (admin only)
     * @param newPermit2 The new Permit2 contract address
     * @dev Only owner can call this function
     * @dev Cannot set to zero address
     */
    function setPermit2(address newPermit2) external onlyOwner {
        if (newPermit2 == address(0)) revert ZeroAddress();

        address oldPermit2 = permit2;
        permit2 = newPermit2;

        emit Permit2Updated(oldPermit2, newPermit2);
    }

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
    ) {
        bytes32 lockKey = getLockKey(hashValue, senderAddress);
        Lock storage l = locks[lockKey];
        return (l.unlockTime, l.amount, l.tokenAddress, l.senderAddress, l.receiverAddress);
    }

    /**
     * @notice Internal function to create a lock after tokens have been transferred
     * @param hashValue The SHA256 hash of the pre-image (secret)
     * @param unlockTime Timestamp after which the sender can retake tokens if not claimed
     * @param amount Amount of tokens to lock
     * @param tokenAddress Address of the ERC20 token contract
     * @param senderAddress Address of the user who locked the tokens
     * @param receiverAddress Address of the user who can claim with the pre-image
     * @dev This function assumes all validations and token transfers have been completed
     * @dev Uses Checks-Effects-Interactions pattern: effects happen after interactions
     */
    function _lock(
        bytes32 hashValue,
        uint256 unlockTime,
        uint256 amount,
        address tokenAddress,
        address senderAddress,
        address receiverAddress
    ) internal {
        bytes32 lockKey = getLockKey(hashValue, senderAddress);
        if (locks[lockKey].amount != 0) revert LockAlreadyExists();

        locks[lockKey] = Lock({
            unlockTime: unlockTime,
            amount: amount,
            tokenAddress: tokenAddress,
            senderAddress: senderAddress,
            receiverAddress: receiverAddress
        });

        emit Locked({
            hashValue: hashValue,
            when: unlockTime,
            amount: amount,
            tokenAddress: tokenAddress,
            senderAddress: senderAddress,
            receiverAddress: receiverAddress
        });
    }
}
