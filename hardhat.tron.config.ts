import { HardhatUserConfig } from "hardhat/config";
import baseConfig from "./hardhat.config";

// Isolated Tron/TVM compile profile. TVM lacks the Shanghai+ opcodes solc emits by
// default (PUSH0, MCOPY, transient storage), so evmVersion is pinned to "paris" and
// output goes to a separate artifacts/cache dir — the default EVM build, its
// deployed-bytecode reference (bytecode:check) and gas snapshot stay untouched.
//
// HTLC.sol needs no source change for Tron: claim() uses sha256(preImage) +
// block.timestamp (unix), byte-identical to the EVM/Canton legs; the Permit2 and
// EIP-2612 lock paths are dead-but-harmless on Tron (backend uses plain lock()).
// See TRON.md.
//
// Deploy uses TronWeb (Tron's protobuf tx format), not ethers over this network —
// the `nile` entry only exposes the EVM-compat JSON-RPC for reads / the indexer.
const tronConfig: HardhatUserConfig = {
  ...baseConfig,
  solidity: {
    version: "0.8.33",
    settings: {
      evmVersion: "paris",
      optimizer: { enabled: true, runs: 200 },
      metadata: { bytecodeHash: "none" },
    },
  },
  paths: {
    ...baseConfig.paths,
    artifacts: "./artifacts-tron",
    cache: "./cache-tron",
  },
  networks: {
    ...baseConfig.networks,
    nile: {
      url: process.env.TRON_JSONRPC_URL || "https://nile.trongrid.io/jsonrpc",
      chainId: 3448148188, // Tron Nile testnet (eth_chainId 0xcd8690dc)
      accounts: [],
    },
  },
};

export default tronConfig;
