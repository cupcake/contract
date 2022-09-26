const { ethers, upgrades } = require("hardhat");

async function main() {
  const Contract = await ethers.getContractFactory("Contract");

  const contract = await upgrades.deployProxy(Contract, [], {
    initializer: "initialize",
    kind: "uups",
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
