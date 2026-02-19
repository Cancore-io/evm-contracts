# Project Structure

This document describes the organization of the HTLC project files.

## Directory Structure

```
evm-htlc/
├── contracts/              # Solidity smart contracts
│   ├── HTLC.sol           # Main HTLC contract
│   └── TestToken.sol      # ERC20 test token
│
├── scripts/                # Scripts and utilities
│   ├── deploy/            # Deployment scripts
│   │   ├── deployHTLC.ts # Deploy HTLC contract
│   │   └── deployTokens.ts # Deploy test tokens
│   └── tools/             # Utility scripts
│       ├── setup-slither.sh      # Setup Slither
│       ├── slither-analysis.sh   # Run Slither analysis
│       └── slither-check.sh      # Quick Slither check
│
├── test/                   # Test files
│   └── HTLC.ts            # Comprehensive test suite
│
├── docs/                   # Documentation
│   ├── README.md          # Documentation index
│   ├── ARCHITECTURE.md    # Technical architecture
│   ├── AUDIT.md           # Audit information
│   ├── SECURITY.md        # Security policy
│   └── ...                # Other documentation
│
├── reports/                # Analysis reports
│   ├── .gitkeep           # Keep directory in git
│   └── slither-*.txt      # Slither analysis reports
│
├── hardhat.config.ts       # Hardhat configuration
├── package.json            # NPM dependencies and scripts
├── tsconfig.json           # TypeScript configuration
├── .gitignore             # Git ignore rules
├── LICENSE                # License file
└── README.md              # Main project README
```

## File Organization Principles

### Contracts (`contracts/`)
- Production contracts
- Test contracts (TestToken)
- Follows Hardhat standard structure

### Scripts (`scripts/`)
- **deploy/**: Deployment scripts for different networks
- **tools/**: Utility scripts (analysis, setup, etc.)
- Organized by purpose for clarity

### Tests (`test/`)
- Comprehensive test suites
- Organized by contract/feature
- Follows Hardhat testing conventions

### Documentation (`docs/`)
- All project documentation
- Separated from code for clarity
- Easy to navigate and maintain

### Reports (`reports/`)
- Analysis reports (Slither, etc.)
- Generated files (gitignored)
- Kept separate from source code

## Benefits of This Structure

1. **Clarity**: Clear separation of concerns
2. **Scalability**: Easy to add new contracts, scripts, or docs
3. **Maintainability**: Logical organization makes maintenance easier
4. **Standards**: Follows Hardhat best practices
5. **Professional**: Industry-standard structure

## Migration Notes

If migrating from old structure:
- `solidity/` → `contracts/`
- Documentation moved to `docs/`
- Reports moved to `reports/`
- Scripts organized by purpose

