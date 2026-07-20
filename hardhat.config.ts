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
    apiKey: process.env.ETHERSCAN_API_KEY || ""
  },
  sourcify: {
    enabled: true
  }
};

export default config;
