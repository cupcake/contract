require("@nomicfoundation/hardhat-chai-matchers");
require("@nomiclabs/hardhat-ethers");
require("@openzeppelin/hardhat-upgrades");
require("@nomiclabs/hardhat-etherscan");
require('hardhat-contract-sizer');

module.exports = {
  solidity: "0.8.7",
  networks: {
  	goerli: {
  		url: `https://goerli.infura.io/v3/${process.env.INFURA_API_KEY}`,
  		accounts: [process.env.PRI_KEY, process.env.PRI_KEY_2],
  	},
  },
  etherscan: {
  	apiKey: process.env.ETHERSCAN_API_KEY,
  },
  paths: {
    root: "./ethereum"
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: true,
    only: [],
  },
};
