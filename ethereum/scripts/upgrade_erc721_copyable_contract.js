const { ethers, upgrades } = require("hardhat");

async function main() {
  const ExampleERC721Copyable = await ethers.getContractFactory("ExampleERC721Copyable");

  await upgrades.upgradeProxy(process.env.PROXY_ADDR_ERC721_COPYABLE_EXAMPLE, ExampleERC721Copyable);
  console.log("Upgraded!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
