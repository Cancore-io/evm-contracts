import { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";

/**
 * Deploys MultiBalanceChecker (no constructor args).
 * Use: npx hardhat deployMultiBalanceChecker --network <network>
 */
export async function deployMultiBalanceCheckerTask(
  _args: TaskArguments,
  hre: HardhatRuntimeEnvironment
) {
  const { ethers } = hre;

  const [deployer] = await ethers.getSigners();

  console.log("Deploying MultiBalanceChecker with account:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "native");

  const MultiBalanceChecker = await ethers.getContractFactory("MultiBalanceChecker");
  const checker = await MultiBalanceChecker.deploy();
  await checker.waitForDeployment();

  const address = await checker.getAddress();
  console.log("MultiBalanceChecker deployed to:", address);
  console.log("\nTo verify on a block explorer:");
  console.log(`npx hardhat verify --network <network> ${address}`);
}
