// require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");
require("@openzeppelin/hardhat-upgrades");
require("@nomiclabs/hardhat-etherscan");

module.exports = {
  solidity: "0.8.17",
  networks: {
  	goerli: {
  		url: `https://goerli.infura.io/v3/${process.env.INFURA_API_KEY}`,
  		accounts: [process.env.PRI_KEY],
  	},
  },
  etherscan: {
  	apiKey: process.env.ETHERSCAN_API_KEY,
  },
  paths: {
    root: "./ethereum"
  },
};
