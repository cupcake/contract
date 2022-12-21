const { expect } = require('chai');
const { ethers } = require("hardhat");

const keyHash = "0x79d3d8832d904592c0bf9818b621522c988bb8b0c05cdc3b15aea1b6e8db0c15";

describe('CandyMachine', function () {

  const NULL_ADDR = '0x0000000000000000000000000000000000000000';
  const METADATA_URIS = ['https://google.com', 'https://twitter.com', 'https://facebook.com'];

  let chainlinkReqNonce = 1;

  before(async function () {
    this.signer = await ethers.getSigner();
    this.owner = await this.signer.getAddress();

    this.signer2 = await ethers.getSigner(1);
    this.otherAddr = await this.signer2.getAddress();

    this.CandyMachine = await ethers.getContractFactory('CandyMachine');

    const vrfCoordinatorV2Mock = await ethers.getContractFactory("VRFCoordinatorV2Mock");
    this.hardhatVrfCoordinatorV2Mock = await vrfCoordinatorV2Mock.deploy(0, 0);

    await this.hardhatVrfCoordinatorV2Mock.createSubscription();

    await this.hardhatVrfCoordinatorV2Mock.fundSubscription(1, ethers.utils.parseEther("50"));
  });

  describe('constructor', function () {
    it('should revert when metadataURIs array is empty', async function () {
      await expect(this.CandyMachine.deploy([], this.owner, 1, this.hardhatVrfCoordinatorV2Mock.address)).to.be.reverted;
    });

    it('should revert when ownerArg is the null address', async function () {
      await expect(this.CandyMachine.deploy(METADATA_URIS, NULL_ADDR, 1, this.hardhatVrfCoordinatorV2Mock.address)).to.be.reverted;
    });

    it('should populate URIs when passed', async function () {
      this.candyMachine = await this.CandyMachine.deploy(METADATA_URIS, this.owner, 1, this.hardhatVrfCoordinatorV2Mock.address);
      await this.candyMachine.deployed();
      expect(await this.candyMachine.uri(0)).to.be.equal(METADATA_URIS[0]);
      expect(await this.candyMachine.uri(1)).to.be.equal(METADATA_URIS[1]);
      expect(await this.candyMachine.uri(2)).to.be.equal(METADATA_URIS[2]);
    });
  });

  describe('mint', function () {
    beforeEach(async function () {
      this.candyMachine = await this.CandyMachine.deploy(METADATA_URIS, this.owner, 1, this.hardhatVrfCoordinatorV2Mock.address);
      await this.candyMachine.deployed();
      await this.hardhatVrfCoordinatorV2Mock.addConsumer(1, this.candyMachine.address);
    });

    it('should set unique metadata URIs for all assets that are minted', async function () {
      await new Promise(async resolve => {
        let count = 0;
        for (var i = 0; i < 3; i++) {
          await this.candyMachine.once("RandomWordsRequested", async _ => {
            const reqId = chainlinkReqNonce;
            chainlinkReqNonce++;
            expect(
              await this.hardhatVrfCoordinatorV2Mock.fulfillRandomWords(reqId, this.candyMachine.address)
            ).to.emit(this.hardhatVrfCoordinatorV2Mock, "RandomWordsFulfilled");
            count++;
            if (count >= 3) {
              expect(await this.candyMachine.uri(0)).to.not.be.equal(await this.candyMachine.uri(1));
              expect(await this.candyMachine.uri(0)).to.not.be.equal(await this.candyMachine.uri(2));
              expect(await this.candyMachine.uri(1)).to.not.be.equal(await this.candyMachine.uri(2));
              resolve();
            }
          });
          await this.candyMachine.mint(this.owner, keyHash, { from: this.owner });
        }
      });
    });

    it('should revert after all assets have already been minted', async function () {
      await new Promise(async resolve => {
        let count = 0;
        for (var i = 0; i < 3; i++) {
          await this.candyMachine.once("RandomWordsRequested", async _ => {
            const reqId = chainlinkReqNonce;
            chainlinkReqNonce++;
            expect(
              await this.hardhatVrfCoordinatorV2Mock.fulfillRandomWords(reqId, this.candyMachine.address)
            ).to.emit(this.hardhatVrfCoordinatorV2Mock, "RandomWordsFulfilled");
            count++;
            if (count >= 3) {
              resolve();
            }
          });
          await this.candyMachine.mint(this.owner, keyHash, { from: this.owner });
        }
      });
      await expect(this.candyMachine.mint(this.owner, keyHash, { from: this.owner })).to.be.reverted;
    });

    it('should emit a TransferSingle event when an asset is minted', async function () {
      await new Promise(async resolve => {
        this.candyMachine.on("RandomWordsRequested", async _ => {
          const reqId = chainlinkReqNonce;
          chainlinkReqNonce++;
          expect(
            await this.hardhatVrfCoordinatorV2Mock.fulfillRandomWords(reqId, this.candyMachine.address)
          ).to.emit(this.hardhatVrfCoordinatorV2Mock, "TransferSingle");
          resolve();
        });
        await this.candyMachine.mint(this.owner, keyHash, { from: this.owner });
      });
    });

    it('should revert when a non-owner address calls', async function () {
      await expect(this.candyMachine.connect(this.signer2).mint(this.owner, keyHash, { from: this.otherAddr })).to.be.reverted;
    });
  });

  describe('cancel', function () {
    beforeEach(async function () {
      this.candyMachine = await this.CandyMachine.deploy(METADATA_URIS, this.owner, 1, this.hardhatVrfCoordinatorV2Mock.address);
      await this.candyMachine.deployed();
      await this.hardhatVrfCoordinatorV2Mock.addConsumer(1, this.candyMachine.address);
    });

    it('should override all metadata URIs before any assets have been minted', async function () {
      await this.candyMachine.connect(this.signer).cancel({ from: this.owner });
      expect(await this.candyMachine.uri(0)).to.be.equal('');
      expect(await this.candyMachine.uri(1)).to.be.equal('');
      expect(await this.candyMachine.uri(2)).to.be.equal('');
    });

    it('should override two metadata URIs when only one asset has been minted', async function () {
      await new Promise(async resolve => {
        await this.candyMachine.once("RandomWordsRequested", async _ => {
          const reqId = chainlinkReqNonce;
          chainlinkReqNonce++;
          expect(
            await this.hardhatVrfCoordinatorV2Mock.fulfillRandomWords(reqId, this.candyMachine.address)
          ).to.emit(this.hardhatVrfCoordinatorV2Mock, "RandomWordsFulfilled");
          resolve();
        });
        await this.candyMachine.mint(this.owner, keyHash, { from: this.owner });
      });
      await this.candyMachine.cancel({ from: this.owner });
      expect(await this.candyMachine.uri(0)).to.not.be.equal('');
      expect(await this.candyMachine.uri(1)).to.be.equal('');
      expect(await this.candyMachine.uri(2)).to.be.equal('');
    });

    it('should override one metadata URIs when two assets have been minted', async function () {
      await new Promise(async resolve => {
        let count = 0;
        for (var i = 0; i < 2; i++) {
          await this.candyMachine.once("RandomWordsRequested", async _ => {
            const reqId = chainlinkReqNonce;
            chainlinkReqNonce++;
            expect(
              await this.hardhatVrfCoordinatorV2Mock.fulfillRandomWords(reqId, this.candyMachine.address)
            ).to.emit(this.hardhatVrfCoordinatorV2Mock, "RandomWordsFulfilled");
            count++;
            if (count >= 2) {
              resolve();
            }
          });
          await this.candyMachine.mint(this.owner, keyHash, { from: this.owner });
        }
      });
      await this.candyMachine.cancel({ from: this.owner });
      expect(await this.candyMachine.uri(0)).to.not.be.equal('');
      expect(await this.candyMachine.uri(1)).to.not.be.equal('');
      expect(await this.candyMachine.uri(2)).to.be.equal('');
    });

    it('should override zero metadata URIs when all three assets have been minted', async function () {
      await new Promise(async resolve => {
        let count = 0;
        for (var i = 0; i < 3; i++) {
          await this.candyMachine.once("RandomWordsRequested", async _ => {
            const reqId = chainlinkReqNonce;
            chainlinkReqNonce++;
            expect(
              await this.hardhatVrfCoordinatorV2Mock.fulfillRandomWords(reqId, this.candyMachine.address)
            ).to.emit(this.hardhatVrfCoordinatorV2Mock, "RandomWordsFulfilled");
            count++;
            if (count >= 3) {
              resolve();
            }
          });
          await this.candyMachine.mint(this.owner, keyHash, { from: this.owner });
        }
      });
      await this.candyMachine.cancel({ from: this.owner });
      expect(await this.candyMachine.uri(0)).to.not.be.equal('');
      expect(await this.candyMachine.uri(1)).to.not.be.equal('');
      expect(await this.candyMachine.uri(2)).to.not.be.equal('');
    });

    it('should emit a Cancellation event when the cancellation occurs', async function () {
      await new Promise(async resolve => {
        await this.candyMachine.once("RandomWordsRequested", async _ => {
          const reqId = chainlinkReqNonce;
          chainlinkReqNonce++;
          expect(
            await this.hardhatVrfCoordinatorV2Mock.fulfillRandomWords(reqId, this.candyMachine.address)
          ).to.emit(this.hardhatVrfCoordinatorV2Mock, "RandomWordsFulfilled");
          resolve();
        });
        await this.candyMachine.mint(this.owner, keyHash, { from: this.owner });
      });
      await expect(this.candyMachine.cancel({ from: this.owner })).to.emit(this.candyMachine, "Cancellation");
    });

    it('should revert when a non-owner address calls', async function () {
      await expect(this.candyMachine.connect(this.signer2).cancel({ from: this.otherAddr })).to.be.reverted;
    });
  });
});
