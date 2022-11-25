const { ethers, upgrades } = require("hardhat");

async function main() {
  const ExampleERC1155 = await ethers.getContractFactory("ExampleERC1155");

  const contract = await upgrades.deployProxy(ExampleERC1155, [], {
    initializer: "initialize",
  });
  await contract.deployed();

  console.log("Deployed:");
  console.log(contract.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
