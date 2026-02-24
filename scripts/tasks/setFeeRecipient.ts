import { HardhatRuntimeEnvironment } from "hardhat/types";
import { TaskArguments } from "hardhat/types";

export async function setFeeRecipientTask(
  args: TaskArguments,
  hre: HardhatRuntimeEnvironment
) {
  const { ethers } = hre;
  const { htlc, recipient } = args as { htlc: string; recipient: string };

  const [deployer] = await ethers.getSigners();

  console.log("Using deployer:", deployer.address);
  console.log("HTLC address:", htlc);
  console.log("New fee recipient:", recipient);

  const htlcContract = await ethers.getContractAt("HTLC", htlc);

  const currentRecipient = await htlcContract.feeRecipient();
  console.log("Current fee recipient:", currentRecipient);

  const tx = await htlcContract.connect(deployer).setFeeRecipient(recipient);
  console.log("setFeeRecipient tx sent:", tx.hash);
  const receipt = await tx.wait();
  console.log("setFeeRecipient tx mined in block:", receipt.blockNumber);

  const updatedRecipient = await htlcContract.feeRecipient();
  console.log("Updated fee recipient:", updatedRecipient);
}


