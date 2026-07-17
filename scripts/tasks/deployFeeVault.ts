import { HardhatRuntimeEnvironment } from "hardhat/types";
import { TaskArguments } from "hardhat/types";

/**
 * Deploys FeeVault — the partner fee-refund vault. After deploying:
 *   1. point the HTLC at it:  npx hardhat setFeeRecipient --htlc <htlc> --recipient <vault>
 *   2. grant the backend signer: npx hardhat setFeeVaultSigner --vault <vault> --signer <addr>
 * Until a signer is granted no voucher can be redeemed.
 */
export async function deployFeeVaultTask(
  _args: TaskArguments,
  hre: HardhatRuntimeEnvironment
) {
  const { ethers } = hre;

  const [deployer] = await ethers.getSigners();
  console.log("Deploying FeeVault with account:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  const FeeVault = await ethers.getContractFactory("FeeVault");
  const vault = await FeeVault.deploy();
  await vault.waitForDeployment();

  const vaultAddress = await vault.getAddress();
  console.log("FeeVault deployed to:", vaultAddress);
  console.log("Owner:", await vault.owner());

  console.log("\nNext steps");
  console.log("----------");
  console.log(`1) Route fees here:  npx hardhat setFeeRecipient --htlc <htlc> --recipient ${vaultAddress} --network ${hre.network.name}`);
  console.log(`2) Grant signer:     npx hardhat setFeeVaultSigner --vault ${vaultAddress} --signer <backendSigner> --network ${hre.network.name}`);
  console.log(`3) Backend config:   ${hre.network.name.toUpperCase()}_FEE_VAULT_ADDRESS=${vaultAddress}`);
  console.log(`\nVerify:  npx hardhat verify --network ${hre.network.name} ${vaultAddress}`);
}
