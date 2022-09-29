const { ethers, upgrades } = require("hardhat");

async function main() {
  const ExampleERC4907 = await ethers.getContractFactory("ExampleERC4907");

  await upgrades.upgradeProxy(process.env.PROXY_ADDR_ERC4907_EXAMPLE, ExampleERC4907);
  console.log("Upgraded!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
