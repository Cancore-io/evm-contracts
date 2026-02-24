import { HardhatRuntimeEnvironment } from "hardhat/types";
import { TaskArguments } from "hardhat/types";

export async function setFeeRateTask(
  args: TaskArguments,
  hre: HardhatRuntimeEnvironment
) {
  const { ethers } = hre;
  const { htlc, rate } = args as { htlc: string; rate: string };

  const [deployer] = await ethers.getSigners();
  const rateBigInt = BigInt(rate);

  console.log("Using deployer:", deployer.address);
  console.log("HTLC address:", htlc);
  console.log("New fee rate (bps):", rateBigInt.toString());

  const htlcContract = await ethers.getContractAt("HTLC", htlc);

  const currentRate = await htlcContract.feeRate();
  console.log("Current fee rate (bps):", currentRate.toString());

  const tx = await htlcContract.connect(deployer).setFeeRate(rateBigInt);
  console.log("setFeeRate tx sent:", tx.hash);
  const receipt = await tx.wait();
  console.log("setFeeRate tx mined in block:", receipt.blockNumber);

  const updatedRate = await htlcContract.feeRate();
  console.log("Updated fee rate (bps):", updatedRate.toString());
}


