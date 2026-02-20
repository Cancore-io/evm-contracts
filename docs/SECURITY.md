# Security Policy

## Supported Versions

We actively support the following versions of the HTLC contract:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Security Considerations

### Known Security Features

1. **Reentrancy Protection**: The contract follows the Checks-Effects-Interactions pattern. State is modified before external calls to prevent reentrancy attacks.

2. **Access Control**: 
   - Only the receiver can claim tokens
   - Only the sender can retake tokens
   - Proper validation of addresses and amounts

3. **Input Validation**:
   - Zero address checks for tokenAddress and receiverAddress
   - Zero amount checks
   - Duplicate lock prevention

4. **Time-based Security**:
   - Claim can only happen before unlockTime
   - Retake can only happen on or after unlockTime
   - Uses `block.timestamp` for time checks

### Potential Risks

1. **ERC20 Token Risks**: The contract accepts any ERC20 token. Some tokens may have non-standard behavior:
   - Tokens that don't return boolean from `transfer()`/`transferFrom()`
   - Tokens with fees on transfer
   - Rebase tokens
   - Tokens with hooks

2. **Timestamp Manipulation**: 
   - `block.timestamp` can be manipulated by miners/validators within a small range
   - This is a known limitation of blockchain-based time

3. **Hash Collision**: 
   - While extremely unlikely, sha256 hash collisions are theoretically possible
   - The contract uses sha256 which is cryptographically secure

4. **Pre-image Discovery**:
   - If the pre-image is weak or predictable, funds could be stolen
   - Users should use cryptographically secure random pre-images

## Reporting a Vulnerability

If you discover a security vulnerability, please **DO NOT** open a public issue. Instead, please report it via one of the following methods:

1. **Email**: security@cancore.io
2. **Private Disclosure**: Contact the development team directly

### What to Include

When reporting a vulnerability, please include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)
- Your contact information

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Resolution**: Depends on severity and complexity

### Security Best Practices for Users

1. **Pre-image Generation**: Use cryptographically secure random number generators
2. **Token Selection**: Verify the ERC20 token contract before locking
3. **Time Windows**: Set appropriate unlock times based on network conditions
4. **Address Verification**: Always verify receiver addresses before locking
5. **Amount Limits**: Consider setting reasonable limits for locked amounts

## Audit Status

This contract is prepared for external security audit. See [AUDIT.md](./AUDIT.md) for audit-specific information.

## Disclaimer

This contract is provided "as is" without warranty of any kind. Users should conduct their own security review before using in production.

