import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying test tokens with account:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  const tokensConfig = [
    { name: "Ether", symbol: "ETH" },
    { name: "Bitcoin", symbol: "BTC" },
    { name: "USD Coin", symbol: "USDC" },
    { name: "Tether USD", symbol: "USDT" },
    { name: "Dai Stablecoin", symbol: "DAI" },
  ];

  const TestToken = await ethers.getContractFactory("TestToken");

  const initialSupply = ethers.parseEther("1000000"); // 1,000,000 tokens each

  const deployed: { name: string; symbol: string; address: string }[] = [];

  for (const cfg of tokensConfig) {
    console.log(`\nDeploying ${cfg.symbol} token...`);

    // Cast to any to bypass outdated typechain constructor typing
    const token = await (TestToken as any).deploy(cfg.name, cfg.symbol);
    await token.waitForDeployment();
    const address = await token.getAddress();

    // Mint initial supply to deployer (anyone can mint in TestToken)
    await (token as any).connect(deployer).mint(initialSupply);

    console.log(`${cfg.symbol} deployed to: ${address}`);
    console.log(
      `Minted initial supply to deployer: ${ethers.formatEther(initialSupply)} ${cfg.symbol}`
    );

    deployed.push({ name: cfg.name, symbol: cfg.symbol, address });
  }

  console.log("\nDeployment complete!");
  console.log("-------------------");
  console.log("Deployed test tokens:");
  for (const t of deployed) {
    console.log(`- ${t.symbol} (${t.name}): ${t.address}`);
  }

  console.log("\nTo verify tokens on Etherscan:");
  for (const t of deployed) {
    console.log(
      `npx hardhat verify --network <network> ${t.address} "${t.name}" "${t.symbol}"`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


