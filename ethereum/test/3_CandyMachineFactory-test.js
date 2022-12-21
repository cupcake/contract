const { expect } = require('chai');
const { ethers, upgrades } = require("hardhat");

const keyHash = "0x79d3d8832d904592c0bf9818b621522c988bb8b0c05cdc3b15aea1b6e8db0c15";

describe('CandyMachineFactory', function () {

  const NULL_ADDR = '0x0000000000000000000000000000000000000000';
  const METADATA_URIS = ['https://google.com', 'https://twitter.com', 'https://facebook.com'];

  let chainlinkReqNonce = 1;

  before(async function () {
    const signer = await ethers.getSigner();
    this.owner = await signer.getAddress();

    this.CandyMachineFactory = await ethers.getContractFactory('CandyMachineFactory');

    const vrfCoordinatorV2Mock = await ethers.getContractFactory("VRFCoordinatorV2Mock");
    this.hardhatVrfCoordinatorV2Mock = await vrfCoordinatorV2Mock.deploy(0, 0);

    await this.hardhatVrfCoordinatorV2Mock.createSubscription();

    await this.hardhatVrfCoordinatorV2Mock.fundSubscription(1, ethers.utils.parseEther("50"));
  });

  describe('initialize', function () {
    it('should set owner', async function () {
      this.candyMachineFactory = await upgrades.deployProxy(this.CandyMachineFactory, [], {
        initializer: "initialize",
        kind: "uups",
      });
      await this.candyMachineFactory.deployed();
      expect(await this.candyMachineFactory.owner()).to.be.equal(this.owner);
    });
  });

  describe('newCandyMachine', function () {
    beforeEach(async function () {
      this.candyMachineFactory = await upgrades.deployProxy(this.CandyMachineFactory, [], {
        initializer: "initialize",
        kind: "uups",
      });
      await this.candyMachineFactory.deployed();
    });

    it('should create a new CandyMachine contract that is functional', async function () {
      await this.candyMachineFactory.newCandyMachine(METADATA_URIS, 1, this.hardhatVrfCoordinatorV2Mock.address, { from: this.owner });
      let candyMachine;
      await new Promise(async resolve => {
        this.candyMachineFactory.on("Creation", async (newCandyMachineAddr) => {
          candyMachine = await ethers.getContractAt('CandyMachine', newCandyMachineAddr);
          await this.hardhatVrfCoordinatorV2Mock.addConsumer(1, newCandyMachineAddr);
          resolve();
        });
      });

      await new Promise(async resolve => {
        await candyMachine.mint(this.owner, keyHash, { from: this.owner });
        await candyMachine.once("RandomWordsRequested", async _ => {
          const reqId = chainlinkReqNonce;
          chainlinkReqNonce++;
          expect(
            await this.hardhatVrfCoordinatorV2Mock.fulfillRandomWords(reqId, candyMachine.address)
          ).to.emit(this.hardhatVrfCoordinatorV2Mock, "RandomWordsFulfilled");
          resolve();
        });
      });
      expect(await candyMachine.uri(0)).to.contain.oneOf(METADATA_URIS)
    });

    it('should revert when trying to create a CandyMachine contract with an empty array of metadata URIs', async function () {
      await expect(this.candyMachineFactory.newCandyMachine([], 1, this.hardhatVrfCoordinatorV2Mock.address, { from: this.owner })).to.be.reverted;
    });

    it('should emit a Creation event when new newCandyMachine is created', async function () {
      await expect(this.candyMachineFactory.newCandyMachine(METADATA_URIS, 1, this.hardhatVrfCoordinatorV2Mock.address, { from: this.owner })).to.emit(this.candyMachineFactory, "Creation");
    });
  });
});
