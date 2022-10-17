const { ethers, upgrades } = require("hardhat");

async function main() {
  console.log("Deploying CandyMachineFactory...");

  const CandyMachineFactory = await ethers.getContractFactory("CandyMachineFactory");  

  const candyMachineFactory = await upgrades.deployProxy(CandyMachineFactory, [], {
    initializer: "initialize",
    kind: "uups",
  });
  await candyMachineFactory.deployed();

  if (!ethers.utils.isAddress(candyMachineFactory.address)) {
    throw new Error('CandyMachineFactory deployment failed!');
  }

  console.log(`CandyMachineFactory deployed at ${candyMachineFactory.address}!`);

  console.log("Deploying Contract...");

  const Contract = await ethers.getContractFactory("Contract");

  const contract = await upgrades.deployProxy(Contract, [candyMachineFactory.address], {
    initializer: "initialize",
    kind: "uups",
  });
  await contract.deployed();

  if (!ethers.utils.isAddress(contract.address)) {
    throw new Error('Contract deployment failed!');
  }

  console.log(`Contract deployed at ${contract.address}!`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
