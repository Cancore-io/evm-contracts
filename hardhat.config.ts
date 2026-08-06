import { HardhatUserConfig, task } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

import { setFeeRecipientTask } from "./scripts/tasks/setFeeRecipient";
import { setFeeRateTask } from "./scripts/tasks/setFeeRate";
import { setPermit2Task } from "./scripts/tasks/setPermit2";
import { deployMultiBalanceCheckerTask } from "./scripts/tasks/deployMultiBalanceChecker";
import { deployFeeVaultTask } from "./scripts/tasks/deployFeeVault";
import { setFeeVaultSignerTask } from "./scripts/tasks/setFeeVaultSigner";
import { transferFeeVaultOwnershipTask } from "./scripts/tasks/transferFeeVaultOwnership";
import { acceptFeeVaultOwnershipTask } from "./scripts/tasks/acceptFeeVaultOwnership";

// Separate keys per tier so a mainnet owner key is never loaded into routine
// testnet workflows. MAINNET_PRIVATE_KEY / TESTNET_PRIVATE_KEY take precedence;
// PRIVATE_KEY stays as the legacy fallback.
//
// No all-zero fallback: an unset key yields an EMPTY accounts list, so read-only
// tasks still work and any signing attempt fails with a plain "no signer"
// instead of a confusing invalid-key error deep in a money-moving task.
const MAINNET_KEY = process.env.MAINNET_PRIVATE_KEY || process.env.PRIVATE_KEY;
const TESTNET_KEY = process.env.TESTNET_PRIVATE_KEY || process.env.PRIVATE_KEY;

const mainnetAccounts = MAINNET_KEY ? [MAINNET_KEY] : [];
const testnetAccounts = TESTNET_KEY ? [TESTNET_KEY] : [];

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

task("deployMultiBalanceChecker", "Deploys MultiBalanceChecker utility contract (batch ERC20/native balances)")
  .setAction(deployMultiBalanceCheckerTask);

task("deployFeeVault", "Deploys FeeVault (partner fee-refund voucher vault)")
  .addOptionalParam("owner", "Multisig to nominate as owner (required on mainnet; it must then call acceptOwnership)")
  .setAction(deployFeeVaultTask);

task("setFeeVaultSigner", "Grants (or revokes with --revoke) a FeeVault voucher signer")
  .addParam("vault", "FeeVault contract address")
  .addParam("signer", "Backend voucher signer address")
  .addFlag("revoke", "Revoke instead of grant — kills every voucher this signer produced")
  .setAction(setFeeVaultSignerTask);

task("transferFeeVaultOwnership", "Nominates a new FeeVault owner (Ownable2Step; nominee must then call acceptOwnership)")
  .addParam("vault", "FeeVault contract address")
  .addParam("owner", "New owner to nominate (must then call acceptOwnership to take control)")
  .setAction(transferFeeVaultOwnershipTask);

task("acceptFeeVaultOwnership", "Accepts a pending FeeVault ownership transfer (Ownable2Step; run as the nominated pendingOwner)")
  .addParam("vault", "FeeVault contract address")
  .setAction(acceptFeeVaultOwnershipTask);

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.33",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      metadata: {
        bytecodeHash: "none"
      },
      ...(process.env.ENABLE_SMT === "true" ? {
        modelChecker: {
          engine: "chc",
          targets: ["overflow", "underflow", "assert", "outOfBounds"],
          contracts: {
            "contracts/HTLC.sol": ["HTLC"],
            "contracts/FeeVault.sol": ["FeeVault"]
          }
        }
      } : {})
    }
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== "false",
    currency: "USD",
    outputFile: "reports/gas-report.txt",
    noColors: true,
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
    ethereum: {
      url: process.env.ETHEREUM_RPC_URL || "https://ethereum-rpc.publicnode.com",
      chainId: 1,
      accounts: mainnetAccounts
    },
    bnb: {
      url: process.env.BNB_RPC_URL || "https://bsc-rpc.publicnode.com",
      chainId: 56,
      accounts: mainnetAccounts
    },
    arbitrum: {
      url: process.env.ARBITRUM_RPC_URL || "https://arbitrum.drpc.org",
      chainId: 42161,
      accounts: mainnetAccounts
    },
    // Robinhood Chain — Arbitrum Orbit / Nitro L2, native ETH, Blockscout explorer.
    robinhood: {
      url: process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
      chainId: 4663,
      accounts: mainnetAccounts
    },
    robinhoodTestnet: {
      url: process.env.ROBINHOOD_TESTNET_RPC_URL || "https://rpc.testnet.chain.robinhood.com",
      chainId: 46630,
      accounts: testnetAccounts
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
      chainId: 11155111,
      accounts: testnetAccounts
    },
    bnbTestnet: {
      url: process.env.BNB_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97,
      accounts: testnetAccounts
    },
    arbitrumSepolia: {
      url: process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
      chainId: 421614,
      accounts: testnetAccounts
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
    // Robinhood uses Blockscout (no API key required). Verify with e.g.
    // `npx hardhat verify --network robinhood <address>`.
    customChains: [
      {
        network: "robinhood",
        chainId: 4663,
        urls: {
          apiURL: "https://robinhoodchain.blockscout.com/api",
          browserURL: "https://robinhoodchain.blockscout.com"
        }
      },
      {
        network: "robinhoodTestnet",
        chainId: 46630,
        urls: {
          apiURL: "https://explorer.testnet.chain.robinhood.com/api",
          browserURL: "https://explorer.testnet.chain.robinhood.com"
        }
      }
    ]
  },
  sourcify: {
    enabled: true
  }
};

export default config;
