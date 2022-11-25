const { ethers, upgrades } = require("hardhat");

async function main() {
  const ExampleERC1155Copyable = await ethers.getContractFactory("ExampleERC1155Copyable");

  await upgrades.upgradeProxy(process.env.PROXY_ADDR_ERC1155_COPYABLE_EXAMPLE, ExampleERC1155Copyable);
  console.log("Upgraded!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
