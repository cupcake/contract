const { ethers, upgrades } = require("hardhat");

async function main() {
  const RentableWrapper = await ethers.getContractFactory("RentableWrapper");

  await upgrades.upgradeProxy(process.env.PROXY_ADDR_RENTABLE_WRAPPER, RentableWrapper);
  console.log("Upgraded!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
