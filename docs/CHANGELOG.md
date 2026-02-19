# Changelog

All notable changes to the HTLC project structure and codebase.

## [Unreleased]

### Refactored - Project Structure

#### Added
- Organized project structure following Hardhat best practices
- `contracts/` directory for Solidity contracts (renamed from `solidity/`)
- `docs/` directory for all documentation
- `reports/` directory for analysis reports
- `scripts/deploy/` for deployment scripts
- `scripts/tools/` for utility scripts
- `docs/PROJECT_STRUCTURE.md` - Project structure documentation
- `docs/README.md` - Documentation index

#### Changed
- Moved all `.md` files to `docs/` directory
- Reorganized scripts by purpose (deploy vs tools)
- Updated `hardhat.config.ts` paths
- Updated all script paths and references
- Improved `.gitignore` with better organization

#### Fixed
- Script paths corrected for new structure
- Documentation links updated
- Package.json scripts updated

### Security Improvements

#### Added
- Custom errors for gas efficiency
- Indexed event parameters for better filtering
- Comprehensive input validation
- Zero address checks

#### Changed
- All `uint` replaced with `uint256` for explicit typing
- String error messages replaced with custom errors
- Solidity version fixed to 0.8.33

### Testing

#### Added
- 42 comprehensive tests (increased from 38)
- Tests for zero address validation
- Tests for custom errors
- Edge case coverage

### Documentation

#### Added
- Full NatSpec documentation
- Security analysis reports
- Slither analysis reports
- Architecture documentation
- Audit preparation documentation

## Structure Migration

### Before
```
evm-htlc/
├── solidity/
├── scripts/
├── test/
└── *.md (in root)
```

### After
```
evm-htlc/
├── contracts/      # Renamed from solidity/
├── scripts/
│   ├── deploy/     # Deployment scripts
│   └── tools/      # Utility scripts
├── test/
├── docs/           # All documentation
└── reports/        # Analysis reports
```

