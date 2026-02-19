# Migration Guide

This document helps you understand the project structure changes and how to update your workflows.

## Structure Changes

### Contracts Directory
- **Before**: `solidity/HTLC.sol`
- **After**: `contracts/HTLC.sol`

### Scripts Organization
- **Before**: All scripts in `scripts/`
- **After**: 
  - Deployment: `scripts/deploy/`
  - Tools: `scripts/tools/`

### Documentation
- **Before**: All `.md` files in root
- **After**: All documentation in `docs/`

### Reports
- **Before**: Reports in root directory
- **After**: All reports in `reports/`

## Updated Commands

### Compilation
```bash
# Same as before
npx hardhat compile
# or
npm run compile
```

### Testing
```bash
# Same as before
npx hardhat test
# or
npm run test
```

### Deployment
```bash
# Before
npx hardhat run scripts/deployHTLC.ts

# After
npm run deploy:local
# or
npx hardhat run scripts/deploy/deployHTLC.ts
```

### Slither Analysis
```bash
# Setup (first time)
npm run slither:setup

# Run analysis
npm run slither
```

## Configuration Updates

### hardhat.config.ts
- Updated `paths.sources` from `./solidity` to `./contracts`
- Added explicit paths for tests and scripts

### package.json
- Added organized npm scripts
- Updated script paths

## File Path Updates

If you have custom scripts or CI/CD pipelines, update paths:

- `solidity/` → `contracts/`
- `scripts/deployHTLC.ts` → `scripts/deploy/deployHTLC.ts`
- Documentation files → `docs/`
- Slither reports → `reports/`

## Benefits

1. **Better Organization**: Clear separation of concerns
2. **Scalability**: Easy to add new files
3. **Standards**: Follows Hardhat best practices
4. **Maintainability**: Easier to navigate and maintain
5. **Professional**: Industry-standard structure

## Verification

After migration, verify everything works:

```bash
# Compile
npm run compile

# Test
npm run test

# Security analysis
npm run slither
```

All should work without errors.

