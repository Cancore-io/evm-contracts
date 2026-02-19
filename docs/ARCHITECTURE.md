# HTLC Contract Architecture

## Overview

The HTLC (Hashed Timelock Contract) implements a secure pattern for atomic swaps and conditional payments using hash commitments and time-based unlocks.

## Design Principles

1. **Security First**: All functions follow security best practices
2. **Simplicity**: Minimal complexity reduces attack surface
3. **Gas Efficiency**: Optimized storage and operations
4. **Flexibility**: Supports any ERC20 token

## Contract Structure

### Storage

```solidity
mapping(bytes32 => Lock) public locks;
```

- **Key**: `keccak256(hashValue, senderAddress)`
- **Value**: `Lock` struct containing all lock information
- **Purpose**: Allows multiple locks with same hashValue from different senders

### Lock Structure

```solidity
struct Lock {
    uint unlockTime;           // Timestamp when sender can retake
    uint amount;                // Amount of tokens locked
    address tokenAddress;      // ERC20 token contract address
    address senderAddress;     // Address of user who locked tokens
    address receiverAddress;   // Address of user who can claim
}
```

## Function Flow

### 1. Lock Flow

```
User calls lock()
  ↓
Validate inputs (addresses, amounts)
  ↓
Check for duplicate lock
  ↓
Store lock in mapping
  ↓
Transfer tokens from user to contract
  ↓
Emit Locked event
```

**Security**: State set before external call (CEI pattern)

### 2. Claim Flow

```
Receiver calls claim(preImage, senderAddress)
  ↓
Validate senderAddress != zero
  ↓
Compute hashValue = keccak256(preImage)
  ↓
Compute lockKey = keccak256(hashValue, senderAddress)
  ↓
Load lock from mapping
  ↓
Validate: amount > 0, time < unlockTime, msg.sender == receiver
  ↓
Save values before delete
  ↓
Delete lock (prevent reentrancy)
  ↓
Transfer tokens to receiver
  ↓
Emit Claimed event
```

**Security**: 
- State cleared before external call
- Access control enforced
- Input validation

### 3. Retake Flow

```
Sender calls retake(hashValue)
  ↓
Compute lockKey = keccak256(hashValue, msg.sender)
  ↓
Load lock from mapping
  ↓
Validate: amount > 0, time >= unlockTime, msg.sender == sender
  ↓
Save values before delete
  ↓
Delete lock (prevent reentrancy)
  ↓
Transfer tokens to sender
  ↓
Emit Retaken event
```

**Security**: 
- State cleared before external call
- Access control enforced
- Time-based validation

## Security Mechanisms

### 1. Reentrancy Protection

**Pattern**: Checks-Effects-Interactions (CEI)

- **Checks**: All validations first
- **Effects**: State changes (delete lock)
- **Interactions**: External calls (ERC20 transfer)

This prevents reentrancy attacks even with malicious ERC20 tokens.

### 2. Access Control

- `claim()`: Only receiver can call
- `retake()`: Only sender can call
- Enforced via `require(msg.sender == ...)`

### 3. Input Validation

- Zero address checks
- Zero amount checks
- Sender != receiver check
- Duplicate lock prevention

### 4. State Management

- Locks deleted after claim/retake
- Prevents double-spending
- Clean state after operations

## Key Design Decisions

### 1. Lock Key Design

**Decision**: Use `keccak256(hashValue, senderAddress)` as key

**Rationale**:
- Allows multiple locks with same hashValue
- Prevents collisions between different senders
- Enables parallel atomic swaps

### 2. Time-based Unlock

**Decision**: Use `block.timestamp` for time checks

**Rationale**:
- Standard blockchain time mechanism
- Sufficient precision for HTLC use cases
- Known limitations documented

### 3. No Pause Mechanism

**Decision**: Contract cannot be paused

**Rationale**:
- Simplicity and security
- Users control their own locks
- No central point of failure

### 4. No Upgrade Mechanism

**Decision**: Contract is not upgradeable

**Rationale**:
- Immutability provides security guarantees
- Users can verify contract code
- No proxy-related risks

## Gas Optimization

1. **Storage**: Single mapping instead of multiple
2. **Events**: Efficient event emission
3. **Operations**: Minimal external calls
4. **State**: Clean state after operations

## Limitations

1. **ERC20 Assumptions**: Assumes standard ERC20 behavior
2. **Timestamp Precision**: `block.timestamp` can be manipulated slightly
3. **No Fee Mechanism**: No fees collected by contract
4. **No Batch Operations**: One lock per transaction

## Future Considerations

Potential improvements (not implemented):
- Batch operations
- Fee mechanism
- Pause functionality (if needed)
- Upgrade mechanism (if needed)

## Testing Strategy

1. **Unit Tests**: Individual function testing
2. **Integration Tests**: Full flow testing
3. **Edge Cases**: Boundary conditions
4. **Security Tests**: Reentrancy, access control
5. **Gas Tests**: Optimization verification

## Deployment Considerations

1. **Network Selection**: Choose based on requirements
2. **Gas Costs**: Consider network gas prices
3. **Verification**: Verify contract on block explorer
4. **Monitoring**: Monitor contract events

## References

- [HTLC Pattern](https://en.bitcoin.it/wiki/Hash_Time_Locked_Contracts)
- [Checks-Effects-Interactions](https://docs.soliditylang.org/en/latest/security-considerations.html#use-the-checks-effects-interactions-pattern)
- [OpenZeppelin Security](https://docs.openzeppelin.com/contracts/security)

