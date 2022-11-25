const { ethers, upgrades } = require("hardhat");

async function main() {
  const ExampleERC1155Copyable = await ethers.getContractFactory("ExampleERC1155Copyable");

  const contract = await upgrades.deployProxy(ExampleERC1155Copyable, [], {
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
