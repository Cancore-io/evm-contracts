import { HardhatRuntimeEnvironment } from "hardhat/types";
import { TaskArguments } from "hardhat/types";

export async function setPermit2Task(
  args: TaskArguments,
  hre: HardhatRuntimeEnvironment
) {
  const { ethers } = hre;
  const { htlc, permit2 } = args as { htlc: string; permit2: string };

  const [deployer] = await ethers.getSigners();

  console.log("Using deployer:", deployer.address);
  console.log("HTLC address:", htlc);
  console.log("New Permit2 address:", permit2);

  const htlcContract = await ethers.getContractAt("HTLC", htlc);

  const currentPermit2 = await htlcContract.permit2();
  console.log("Current Permit2 address:", currentPermit2);

  const tx = await htlcContract.connect(deployer).setPermit2(permit2);
  console.log("setPermit2 tx sent:", tx.hash);
  const receipt = await tx.wait();
  console.log("setPermit2 tx mined in block:", receipt.blockNumber);

  const updatedPermit2 = await htlcContract.permit2();
  console.log("Updated Permit2 address:", updatedPermit2);
}


