const { ethers, upgrades } = require("hardhat");

async function main() {
  const RentableWrapper = await ethers.getContractFactory("RentableWrapper");

  const rentableWrapper = await upgrades.deployProxy(RentableWrapper, ["TestRentableWrapper","TRW"], {
    initializer: "initialize",
    kind: "uups",
  });
  await rentableWrapper.deployed();

  if (!ethers.utils.isAddress(rentableWrapper.address)) {
    throw new Error('RentableWrapper deployment failed!');
  }

  console.log(`RentableWrapper deployed at ${rentableWrapper.address}!`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
