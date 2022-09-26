const { ethers, upgrades } = require("hardhat");

const PROXY = "0x32b78F7269C9fd7F65C8dCD0bD0721B0B522F31C";

async function main() {
  const Contract = await ethers.getContractFactory("Contract");

  await upgrades.upgradeProxy(PROXY, Contract);
  console.log("Upgraded!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
