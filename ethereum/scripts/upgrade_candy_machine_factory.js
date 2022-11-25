const { ethers, upgrades } = require("hardhat");

async function main() {
  const CandyMachineFactory = await ethers.getContractFactory("CandyMachineFactory");

  await upgrades.upgradeProxy(process.env.PROXY_ADDR_CANDY_MACHINE_FACTORY, CandyMachineFactory);
  console.log("Upgraded!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
