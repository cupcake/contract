const { ethers, upgrades } = require("hardhat");

async function main() {
  const ExampleERC721Copyable = await ethers.getContractFactory("ExampleERC721Copyable");

  const contract = await upgrades.deployProxy(ExampleERC721Copyable, [], {
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
