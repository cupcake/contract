const { ethers, upgrades } = require("hardhat");

async function main() {
  const Contract = await ethers.getContractFactory("Contract");

  await upgrades.upgradeProxy(process.env.INFURA_API_KEY, Contract);
  console.log("Upgraded!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
