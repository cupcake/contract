const { ethers, upgrades } = require("hardhat");

async function main() {
  const ExampleERC4907 = await ethers.getContractFactory("ExampleERC4907");

  const contract = await upgrades.deployProxy(ExampleERC4907, [], {
    initializer: "initialize",
  });
  await contract.deployed();

  console.log("Deployed:");
  console.log(contract.address);
  console.log(contract);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
