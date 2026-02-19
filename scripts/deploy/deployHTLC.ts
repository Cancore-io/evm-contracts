import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying HTLC contract with account:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  // Deploy HTLC contract
  const HTLC = await ethers.getContractFactory("HTLC");
  const htlc = await HTLC.deploy();
  await htlc.waitForDeployment();

  const htlcAddress = await htlc.getAddress();
  console.log("HTLC deployed to:", htlcAddress);

  console.log("\nDeployment complete!");
  console.log("-------------------");
  console.log("To verify on Etherscan:");
  console.log(`npx hardhat verify --network <network> ${htlcAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


