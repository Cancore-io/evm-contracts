import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000000";

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
    // // Ethereum Holesky Testnet
    // holesky: {
    //   url: process.env.HOLESKY_RPC_URL || "https://ethereum-holesky.publicnode.com",
    //   chainId: 17000,
    //   accounts: [PRIVATE_KEY]
    // },
    // Polygon Amoy Testnet
    // amoy: {
    //   url: process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
    //   chainId: 80002,
    //   accounts: [PRIVATE_KEY]
    // },
    // BSC Testnet
    bscTestnet: {
      url: process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97,
      accounts: [PRIVATE_KEY]
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://goerli.base.org",
      chainId: 84532,
      accounts: [PRIVATE_KEY]
    },
    // // Arbitrum Sepolia Testnet
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
