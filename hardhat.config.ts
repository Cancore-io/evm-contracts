import { HardhatUserConfig, task } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

import { setFeeRecipientTask } from "./scripts/tasks/setFeeRecipient";
import { setFeeRateTask } from "./scripts/tasks/setFeeRate";
import { setPermit2Task } from "./scripts/tasks/setPermit2";

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000000";

// =========================
// Custom Tasks
// =========================

task("setFeeRecipient", "Sets the fee recipient address on the HTLC contract")
  .addParam("htlc", "HTLC contract address")
  .addParam("recipient", "New fee recipient address")
  .setAction(setFeeRecipientTask);

task("setFeeRate", "Sets the fee rate (in basis points) on the HTLC contract")
  .addParam("htlc", "HTLC contract address")
  .addParam("rate", "New fee rate in basis points (1000 = 10%, 100 = 1%)")
  .setAction(setFeeRateTask);

task("setPermit2", "Sets the Permit2 contract address on the HTLC contract")
  .addParam("htlc", "HTLC contract address")
  .addParam("permit2", "New Permit2 contract address")
  .setAction(setPermit2Task);

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.33",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    scripts: "./scripts"
  },
  networks: {
    hardhat: {
      chainId: 31337
    },
    // Ethereum Sepolia Testnet
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
      chainId: 11155111,
      accounts: [PRIVATE_KEY]
    },
    // BNB Testnet
    bnbTestnet: {
      url: process.env.BNB_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97,
      accounts: [PRIVATE_KEY]
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://goerli.base.org",
      chainId: 84532,
      accounts: [PRIVATE_KEY]
    },
    // Arbitrum Sepolia Testnet
    arbitrumSepolia: {
      url: process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
      chainId: 421614,
      accounts: [PRIVATE_KEY]
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || ""
  },
  sourcify: {
    enabled: true
  }
};

export default config;
