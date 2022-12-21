const { expect } = require('chai');
const { ethers, upgrades } = require("hardhat");

upgrades.silenceWarnings();

describe('RentableWrapper', function () {

  const NULL_ADDR = '0x0000000000000000000000000000000000000000';
  const ADDR_1 = '0x3991aCBBD3E6bf973295e1FAad070De97289b4CA';
  const METADATA_URIS = ['https://google.com', 'https://twitter.com', 'https://facebook.com'];
  const TIME_NOW = () => Math.round((Date.now() / 1000));

  before(async function () {
    this.provider = await ethers.getDefaultProvider();
    this.currentBlockTimestamp = async () => (await this.provider.getBlock()).timestamp;
    this.TIME_IN_X_SECONDS = async (x) => (await this.currentBlockTimestamp()) + x;
    this.passBlocks = async num => {
      for (let i = 0; i < num; i++) {
        await ethers.provider.send("evm_increaseTime", [1]);
        await ethers.provider.send("evm_mine", []); 
      }
    };

    this.signer = await ethers.getSigner(0);
    this.owner = await this.signer.getAddress();

    this.signer2 = await ethers.getSigner(1);
    this.otherAddr = await this.signer2.getAddress();

    this.RentableWrapper = await ethers.getContractFactory('RentableWrapper');
    this.ExampleERC721Mintable = await ethers.getContractFactory('ExampleERC721Mintable');
  });

  describe('initialize', function () {
    it('should should not revert when name and symbol are empty', async function () {
      await expect(await upgrades.deployProxy(this.RentableWrapper, ['', ''], {
        initializer: "initialize",
        kind: "uups",
      })).to.not.be.reverted;
    });

    it('should set owner', async function () {
      this.rentableWrapper = await upgrades.deployProxy(this.RentableWrapper, ['Wrapper Asset', 'TST'], {
        initializer: "initialize",
        kind: "uups",
      });
      await this.rentableWrapper.deployed();
      expect(await this.rentableWrapper.owner()).to.be.equal(this.owner);
    });

    it('should set name', async function () {
      this.rentableWrapper = await upgrades.deployProxy(this.RentableWrapper, ['Wrapper Asset', 'TST'], {
        initializer: "initialize",
        kind: "uups",
      });
      await this.rentableWrapper.deployed();
      expect(await this.rentableWrapper.name()).to.be.equal('Wrapper Asset');
    });

    it('should set symbol', async function () {
      this.rentableWrapper = await upgrades.deployProxy(this.RentableWrapper, ['Wrapper Asset', 'TST'], {
        initializer: "initialize",
        kind: "uups",
      });
      await this.rentableWrapper.deployed();
      expect(await this.rentableWrapper.symbol()).to.be.equal('TST');
    });
  });

  describe('wrap', function () {
    beforeEach(async function () {
      this.exampleERC721Mintable = await upgrades.deployProxy(this.ExampleERC721Mintable, ['Wrapped Asset', 'TST']);
      await this.exampleERC721Mintable.deployed();
      this.rentableWrapper = await upgrades.deployProxy(this.RentableWrapper, ['Wrapper Asset', 'TST'], {
        initializer: "initialize",
        kind: "uups",
      });
      await this.rentableWrapper.deployed();
    });

    it('should revert when token is not owned by wrap executer', async function () {
      await this.exampleERC721Mintable.mint(ADDR_1, 0, { from: this.owner });
      await expect(this.rentableWrapper.wrap(this.exampleERC721Mintable.address, 0, { from: this.owner })).to.be.reverted;
    });

    it('should revert when token is not approved for use', async function () {
      await this.exampleERC721Mintable.mint(this.owner, 0, { from: this.owner });
      await expect(this.rentableWrapper.wrap(this.exampleERC721Mintable.address, 0, { from: this.owner })).to.be.reverted;
    });

    it('should wrap token and issue wrapped token and emit a Wrap event', async function () {
      await this.exampleERC721Mintable.mint(this.owner, 0, { from: this.owner });
      await this.exampleERC721Mintable.approve(this.rentableWrapper.address, 0, { from: this.owner });
      await expect(this.rentableWrapper.wrap(this.exampleERC721Mintable.address, 0, { from: this.owner })).to.emit(this.rentableWrapper, "Wrap");
      await new Promise(async resolve => {
        this.rentableWrapper.on("Wrap", async (asset, underlyingTokenId, wrappedTokenId, tokenDepositor) => {
          expect(wrappedTokenId).to.be.equal(0);
          resolve();
        });
      });
      expect(await this.rentableWrapper.ownerOf(0)).to.be.equal(this.owner);
    });

    it('should revert when attempting to (recursively) wrap a wrapper token', async function () {
      await this.exampleERC721Mintable.mint(this.owner, 0, { from: this.owner });
      await this.exampleERC721Mintable.approve(this.rentableWrapper.address, 0, { from: this.owner });
      await expect(this.rentableWrapper.wrap(this.exampleERC721Mintable.address, 0, { from: this.owner })).to.emit(this.rentableWrapper, "Wrap");
      await new Promise(async resolve => {
        this.rentableWrapper.on("Wrap", async (asset, underlyingTokenId, wrappedTokenId, tokenDepositor) => {
          expect(wrappedTokenId).to.be.equal(0);
          resolve();
        });
      });
      expect(await this.rentableWrapper.ownerOf(0)).to.be.equal(this.owner);
      await expect(this.rentableWrapper.wrap(this.rentableWrapper.address, 0, { from: this.owner })).to.be.reverted;
    });
  });

  describe('unwrap', function () {
    beforeEach(async function () {
      this.exampleERC721Mintable = await upgrades.deployProxy(this.ExampleERC721Mintable, ['Wrapped Asset', 'TST']);
      await this.exampleERC721Mintable.deployed();
      this.rentableWrapper = await upgrades.deployProxy(this.RentableWrapper, ['Wrapper Asset', 'TST'], {
        initializer: "initialize",
        kind: "uups",
      });
      await this.rentableWrapper.deployed();
      await this.exampleERC721Mintable.mint(this.owner, 0, { from: this.owner });
      await this.exampleERC721Mintable.approve(this.rentableWrapper.address, 0, { from: this.owner });
      await expect(this.rentableWrapper.wrap(this.exampleERC721Mintable.address, 0, { from: this.owner })).to.emit(this.rentableWrapper, "Wrap");
    });

    it('should revert when wrapper token is not owned by unwrap executer', async function () {
      await this.rentableWrapper.transferFrom(this.owner, ADDR_1, 0, { from: this.owner });
      await expect(this.rentableWrapper.unwrap(0, { from: this.owner })).to.be.reverted;
    });

    it('should revert when owner of wrapper token is not the current user', async function () {
      await this.rentableWrapper.setUser(0, ADDR_1, await this.TIME_IN_X_SECONDS(100), { from: this.owner });
      await expect(this.rentableWrapper.unwrap(0, { from: this.owner })).to.be.reverted;
    });

    it('should unwrap token and take wrapped token back and emit an Unwrap event', async function () {
      await expect(this.rentableWrapper.unwrap(0, { from: this.owner })).to.emit(this.rentableWrapper, "Unwrap");
      await new Promise(async resolve => {
        this.rentableWrapper.on("Unwrap", async (asset, underlyingTokenId, wrappedTokenId, tokenDepositor) => {
          expect(underlyingTokenId).to.be.equal(0);
          resolve();
        });
      });
      expect(await this.exampleERC721Mintable.ownerOf(0)).to.be.equal(this.owner);
    });

    it('should (not revert and) unwrap token and take wrapped token back and emit an Unwrap event when non-owner usership has expired', async function () {
      await this.rentableWrapper.setUser(0, ADDR_1, await this.TIME_IN_X_SECONDS(100), { from: this.owner });
      await this.passBlocks(150);
      await expect(this.rentableWrapper.unwrap(0, { from: this.owner })).to.emit(this.rentableWrapper, "Unwrap");
      await new Promise(async resolve => {
        this.rentableWrapper.on("Unwrap", async (asset, underlyingTokenId, wrappedTokenId, tokenDepositor) => {
          expect(underlyingTokenId).to.be.equal(0);
          resolve();
        });
      });
      expect(await this.exampleERC721Mintable.ownerOf(0)).to.be.equal(this.owner);
    });
  });

  describe('transferFrom', function () {
    beforeEach(async function () {
      this.exampleERC721Mintable = await upgrades.deployProxy(this.ExampleERC721Mintable, ['Wrapped Asset', 'TST']);
      await this.exampleERC721Mintable.deployed();
      this.rentableWrapper = await upgrades.deployProxy(this.RentableWrapper, ['Wrapper Asset', 'TST'], {
        initializer: "initialize",
        kind: "uups",
      });
      await this.rentableWrapper.deployed();
      await this.exampleERC721Mintable.mint(this.owner, 0, { from: this.owner });
      await this.exampleERC721Mintable.approve(this.rentableWrapper.address, 0, { from: this.owner });
      await expect(this.rentableWrapper.wrap(this.exampleERC721Mintable.address, 0, { from: this.owner })).to.emit(this.rentableWrapper, "Wrap");
    });

    it('should revert when owner of wrapper token is not the current user', async function () {
      await this.rentableWrapper.setUser(0, ADDR_1, await this.TIME_IN_X_SECONDS(300), { from: this.owner });
      await expect(this.rentableWrapper.transferFrom(this.owner, ADDR_1, 0, { from: this.owner })).to.be.reverted;
    });

    it('should allow transfer when there is no user of the token', async function () {
      await expect(this.rentableWrapper.transferFrom(this.owner, ADDR_1, 0, { from: this.owner })).to.not.be.reverted;
    });

    it('should allow transfer when owner of wrapper token is also the current user', async function () {
      await this.rentableWrapper.setUser(0, this.owner, await this.TIME_IN_X_SECONDS(300), { from: this.owner });
      await expect(this.rentableWrapper.transferFrom(this.owner, ADDR_1, 0, { from: this.owner })).to.not.be.reverted;
    });
  });

  describe('isWrapped', function () {
    beforeEach(async function () {
      this.exampleERC721Mintable = await upgrades.deployProxy(this.ExampleERC721Mintable, ['Wrapped Asset', 'TST']);
      await this.exampleERC721Mintable.deployed();
      this.rentableWrapper = await upgrades.deployProxy(this.RentableWrapper, ['Wrapper Asset', 'TST'], {
        initializer: "initialize",
        kind: "uups",
      });
      await this.rentableWrapper.deployed();
      await this.exampleERC721Mintable.mint(this.owner, 0, { from: this.owner });
      await this.exampleERC721Mintable.approve(this.rentableWrapper.address, 0, { from: this.owner });
    });

    it('should return false when no such wrapped token exists for the provided tokenId', async function () {
      expect(await this.rentableWrapper.isWrapped(100, { from: this.owner })).to.be.false;
    });

    it('should return true when a wrapped token exists for the provided tokenId', async function () {
      await this.rentableWrapper.wrap(this.exampleERC721Mintable.address, 0, { from: this.owner });
      expect(await this.rentableWrapper.isWrapped(0, { from: this.owner })).to.be.true;
    });

    it('should return false when a wrapped token has been unwrapped for the provided tokenId', async function () {
      await this.rentableWrapper.wrap(this.exampleERC721Mintable.address, 0, { from: this.owner });
      await this.rentableWrapper.unwrap(0, { from: this.owner });
      expect(await this.rentableWrapper.isWrapped(0, { from: this.owner })).to.be.false;
    });
  });

  describe('tokenURI', function () {
    beforeEach(async function () {
      this.exampleERC721Mintable = await upgrades.deployProxy(this.ExampleERC721Mintable, ['Wrapped Asset', 'TST']);
      await this.exampleERC721Mintable.deployed();
      this.rentableWrapper = await upgrades.deployProxy(this.RentableWrapper, ['Wrapper Asset', 'TST'], {
        initializer: "initialize",
        kind: "uups",
      });
      await this.rentableWrapper.deployed();
      await this.exampleERC721Mintable.mint(this.owner, 0, { from: this.owner });
      await this.exampleERC721Mintable.approve(this.rentableWrapper.address, 0, { from: this.owner });
      await this.rentableWrapper.wrap(this.exampleERC721Mintable.address, 0, { from: this.owner });
    });

    it('should return tokenURI when wrapped token has tokenURI set', async function () {
      await this.exampleERC721Mintable.setTokenURI(0, METADATA_URIS[0], { from: this.owner });
      expect(await this.rentableWrapper.tokenURI(0, { from: this.owner })).to.be.equal(METADATA_URIS[0]);
    });

    it('should return empty tokenURI when wrapped token has no tokenURI set', async function () {
      expect(await this.rentableWrapper.tokenURI(0, { from: this.owner })).to.be.equal('');
    });
  });

  describe('setUser', function () {
    beforeEach(async function () {
      this.exampleERC721Mintable = await upgrades.deployProxy(this.ExampleERC721Mintable, ['Wrapped Asset', 'TST']);
      await this.exampleERC721Mintable.deployed();
      this.rentableWrapper = await upgrades.deployProxy(this.RentableWrapper, ['Wrapper Asset', 'TST'], {
        initializer: "initialize",
        kind: "uups",
      });
      await this.rentableWrapper.deployed();
      await this.exampleERC721Mintable.mint(this.owner, 0, { from: this.owner });
      await this.exampleERC721Mintable.approve(this.rentableWrapper.address, 0, { from: this.owner });
      await this.rentableWrapper.wrap(this.exampleERC721Mintable.address, 0, { from: this.owner });
    });

    it('should revert when expires is not in the future', async function () {
      await expect(this.rentableWrapper.setUser(0, ADDR_1, TIME_NOW() - 100, { from: this.owner })).to.be.reverted;
    });

    it('should revert when not called by the owner', async function () {
      await expect(this.rentableWrapper.connect(this.signer2).setUser(0, ADDR_1, await this.TIME_IN_X_SECONDS(100), { from: this.otherAddr })).to.be.reverted;
    });

    it('should set user correctly', async function () {
      await this.rentableWrapper.connect(this.signer).setUser(0, ADDR_1, await this.TIME_IN_X_SECONDS(300), { from: this.owner });
      expect(await this.rentableWrapper.userOf(0, { from: this.owner })).to.be.equal(ADDR_1);
    });

    it('should emit an UpdateUser event when user is set correctly', async function () {
      await expect(this.rentableWrapper.setUser(0, ADDR_1, await this.TIME_IN_X_SECONDS(400), { from: this.owner })).to.emit(this.rentableWrapper, "UpdateUser");
    });

    it('should set user correctly when called by other address that is approved by owner', async function () {
      await this.rentableWrapper.approve(this.otherAddr, 0, { from: this.owner });
      await this.rentableWrapper.connect(this.signer2).setUser(0, ADDR_1, await this.TIME_IN_X_SECONDS(400), { from: this.otherAddr });
      expect(await this.rentableWrapper.connect(this.signer).userOf(0, { from: this.owner })).to.be.equal(ADDR_1);
    });
  });

  describe('userOf', function () {
    beforeEach(async function () {
      this.exampleERC721Mintable = await upgrades.deployProxy(this.ExampleERC721Mintable, ['Wrapped Asset', 'TST']);
      await this.exampleERC721Mintable.deployed();
      this.rentableWrapper = await upgrades.deployProxy(this.RentableWrapper, ['Wrapper Asset', 'TST'], {
        initializer: "initialize",
        kind: "uups",
      });
      await this.rentableWrapper.deployed();
      await this.exampleERC721Mintable.mint(this.owner, 0, { from: this.owner });
      await this.exampleERC721Mintable.approve(this.rentableWrapper.address, 0, { from: this.owner });
      await this.rentableWrapper.wrap(this.exampleERC721Mintable.address, 0, { from: this.owner });
    });

    it('should return null address when no user is set', async function () {
      expect(await this.rentableWrapper.userOf(0, { from: this.owner })).to.be.equal(NULL_ADDR);
    });

    it('should return address when user is set', async function () {
      await this.rentableWrapper.setUser(0, ADDR_1, await this.TIME_IN_X_SECONDS(400), { from: this.owner });
      expect(await this.rentableWrapper.userOf(0, { from: this.owner })).to.be.equal(ADDR_1);
    });

    it('should return null address when user has expired', async function () {
      await this.rentableWrapper.setUser(0, ADDR_1, await this.TIME_IN_X_SECONDS(400), { from: this.owner });
      await this.passBlocks(600);
      expect(await this.rentableWrapper.userOf(0, { from: this.owner })).to.be.equal(NULL_ADDR);
    });
  });

  describe('userExpires', function () {
    beforeEach(async function () {
      this.exampleERC721Mintable = await upgrades.deployProxy(this.ExampleERC721Mintable, ['Wrapped Asset', 'TST']);
      await this.exampleERC721Mintable.deployed();
      this.rentableWrapper = await upgrades.deployProxy(this.RentableWrapper, ['Wrapper Asset', 'TST'], {
        initializer: "initialize",
        kind: "uups",
      });
      await this.rentableWrapper.deployed();
      await this.exampleERC721Mintable.mint(this.owner, 0, { from: this.owner });
      await this.exampleERC721Mintable.approve(this.rentableWrapper.address, 0, { from: this.owner });
      await expect(this.rentableWrapper.wrap(this.exampleERC721Mintable.address, 0, { from: this.owner })).to.emit(this.rentableWrapper, "Wrap");
    });

    it('should revert when owner of wrapper token is not the current user', async function () {
      const expiryTime = await this.TIME_IN_X_SECONDS(1000);
      await this.rentableWrapper.setUser(0, ADDR_1, expiryTime, { from: this.owner });
      expect(await this.rentableWrapper.userExpires(0, { from: this.owner })).to.be.equal(expiryTime);
    });
  });
});
