// CAN-599 Ф3b — TVM build of the HTLC contract (Shasta / Nile testnets).
//
// The contracts under tron/contracts are pragma-only copies of the canonical
// Solidity sources (tron-solc tops out at 0.8.26; canonical pins 0.8.33) —
// guarded by scripts/tools/check-tron-drift.mjs. Deployer key: Tron shares
// secp256k1 with EVM, so the existing testnet key doubles as TRON_PRIVATE_KEY;
// its T-address must be funded via the Shasta/Nile faucet before migrating.
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });

module.exports = {
  networks: {
    shasta: {
      privateKey: process.env.TRON_PRIVATE_KEY || process.env.TESTNET_PRIVATE_KEY || process.env.PRIVATE_KEY,
      fullHost: 'https://api.shasta.trongrid.io',
      network_id: '2',
      feeLimit: 1_000_000_000,
      userFeePercentage: 100,
    },
    nile: {
      privateKey: process.env.TRON_PRIVATE_KEY || process.env.TESTNET_PRIVATE_KEY || process.env.PRIVATE_KEY,
      fullHost: 'https://nile.trongrid.io',
      network_id: '3',
      feeLimit: 1_000_000_000,
      userFeePercentage: 100,
    },
  },
  compilers: {
    solc: {
      version: '0.8.26',
      // Mirror hardhat.config.ts so TVM bytecode is optimized the same way.
      settings: {
        optimizer: { enabled: true, runs: 200 },
      },
    },
  },
};
