# HTLC - Hashed Timelock Contract

A secure, production-ready implementation of a Hashed Timelock Contract (HTLC) in Solidity for atomic swaps and conditional payments.

## ⚠️ Security Notice

**This contract is prepared for external security audit.** While comprehensive testing has been performed, the contract should undergo professional security audit before use in production with significant funds.

- See [SECURITY.md](./SECURITY.md) for security policy and vulnerability reporting
- See [AUDIT.md](./AUDIT.md) for audit-specific information

## Features

- ✅ **Secure**: Follows Checks-Effects-Interactions pattern for reentrancy protection
- ✅ **Well-tested**: 42 comprehensive tests covering all functionality
- ✅ **Documented**: Full NatSpec documentation
- ✅ **Flexible**: Supports any ERC20 token
- ✅ **Gas-optimized**: Efficient storage and operations

## Overview

The HTLC contract allows users to:

1. **Lock** ERC20 tokens with a hash commitment and unlock time
2. **Claim** tokens by revealing the pre-image (before unlock time)
3. **Retake** tokens after unlock time (if not claimed)

### Use Cases

- Atomic swaps between different blockchains
- Conditional payments
- Escrow services
- Cross-chain bridges

## Installation

```bash
npm install
```

## Testing

Run the comprehensive test suite:

```bash
npx hardhat test
```

**Test Coverage**: 42 tests covering:
- Locking functionality (12 tests)
- Claiming functionality (11 tests)
- Retaking functionality (8 tests)
- getLock function (5 tests)
- Edge cases and security scenarios (6 tests)

## Contract Architecture

### Functions

- **`lock(hashValue, unlockTime, amount, tokenAddress, receiverAddress)`**: Locks ERC20 tokens with a hash commitment
- **`claim(preImage, senderAddress)`**: Claims locked tokens by revealing the pre-image
- **`retake(hashValue)`**: Retakes tokens after unlock time if not claimed
- **`getLock(hashValue, senderAddress)`**: View function to query lock information

### Security Features

- ✅ Reentrancy protection (CEI pattern)
- ✅ Access control (only receiver can claim, only sender can retake)
- ✅ Input validation (zero addresses, zero amounts)
- ✅ State management (locks deleted after claim/retake)

## Configuration

1. Copy `env.example` to `.env`:
   ```bash
   cp env.example .env
   ```

2. Edit `.env` and add your configuration:
   ```env
   PRIVATE_KEY=your_private_key_here
   SEPOLIA_RPC_URL=https://rpc.sepolia.org
   ETHERSCAN_API_KEY=your_etherscan_api_key
   ```

## Deployment

### Local Network

```bash
npm run deploy:local
# or
npx hardhat run scripts/deploy/deployHTLC.ts
```

### Testnet Deployment

Deploy to Sepolia:
```bash
npm run deploy:sepolia
# or
npx hardhat run scripts/deploy/deployHTLC.ts --network sepolia
```

Deploy test tokens:
```bash
npm run deploy:tokens
```

### Supported Networks

- **Sepolia** - Ethereum testnet
- **BSC Testnet** - Binance Smart Chain testnet
- **Base Sepolia** - Base testnet
- **Arbitrum Sepolia** - Arbitrum testnet

## Verification

Verify contract on Etherscan:
```bash
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

## Security Analysis

### Setup Slither (First Time)

```bash
npm run slither:setup
```

This will:
- Create Python virtual environment
- Install Slither 0.11.5
- Install Solidity compiler 0.8.33

### Run Analysis

```bash
npm run slither
```

**Slither Version**: 0.11.5 (supports custom errors)  
**Results**: 0 High, 0 Medium, 2 Low (acceptable), 2 Informational (acceptable)  
**Status**: ✅ **SECURE** - All fixable issues resolved

**Fixes Applied**:
- ✅ Reentrancy-events: Fixed by reordering emit statements
- ✅ Unindexed-event-address: Already fixed (all addresses indexed)

See [docs/SLITHER_FIXES.md](./docs/SLITHER_FIXES.md) for details on fixes and [docs/SLITHER_REPORT.md](./docs/SLITHER_REPORT.md) for full analysis.

## Project Structure

```
evm-htlc/
├── contracts/          # Solidity contracts
│   ├── HTLC.sol       # Main HTLC contract
│   └── TestToken.sol  # Test token for testing
├── scripts/            # Deployment and utility scripts
│   ├── deploy/        # Deployment scripts
│   └── tools/         # Utility scripts (Slither, etc.)
├── test/              # Test files
├── docs/              # Documentation
├── reports/           # Analysis reports (Slither, etc.)
└── README.md          # This file
```

## Documentation

All documentation is located in the [`docs/`](./docs/) directory:

- **[docs/SECURITY.md](./docs/SECURITY.md)** - Security policy and vulnerability reporting
- **[docs/AUDIT.md](./docs/AUDIT.md)** - Information for security auditors
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - Technical architecture
- **[docs/SECURITY_ANALYSIS.md](./docs/SECURITY_ANALYSIS.md)** - Manual security analysis
- **[docs/SLITHER.md](./docs/SLITHER.md)** - Slither analysis setup
- **Contract NatSpec** - Inline documentation in `contracts/HTLC.sol`

See [docs/README.md](./docs/README.md) for complete documentation index.

## Development

### Compile

```bash
npx hardhat compile
```

### Test Coverage

```bash
npx hardhat test
```

**Current Coverage**: 42 tests covering all functionality and edge cases

### Code Quality

- Solidity compiler version: 0.8.33
- Optimizer enabled: Yes (200 runs)
- NatSpec documentation: Complete

## License

MIT License - See [LICENSE](./LICENSE) file for details

## Disclaimer

This contract is provided "as is" without warranty. Users should:
- Conduct their own security review
- Use only after professional audit
- Test thoroughly on testnets
- Start with small amounts
