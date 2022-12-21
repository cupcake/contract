const { expect } = require('chai');
const { ethers, upgrades } = require("hardhat");

upgrades.silenceWarnings();

describe('Contract', function () {

  const KEY_HASH = '0x79d3d8832d904592c0bf9818b621522c988bb8b0c05cdc3b15aea1b6e8db0c15';
  const NULL_ADDR = '0x0000000000000000000000000000000000000000';
  const ADDR_1 = '0x3991aCBBD3E6bf973295e1FAad070De97289b4CA';
  const METADATA_URIS = ['https://google.com', 'https://twitter.com'];
  const hashUniqueTag = (address, tagUid) => {
    const tagPackedEncoding = ethers.utils.solidityPack(['address', 'uint256'], [address, tagUid]);
    return ethers.utils.solidityKeccak256(['bytes'], [tagPackedEncoding]);
  };
  let chainlinkReqNonce = 1;

  before(async function () {
    this.provider = await ethers.getDefaultProvider();

    this.signer = await ethers.getSigner(0);
    this.owner = await this.signer.getAddress();

    this.signer2 = await ethers.getSigner(1);
    this.otherAddr = await this.signer2.getAddress();

    this.Contract = await ethers.getContractFactory('Contract');
    this.CandyMachineFactory = await ethers.getContractFactory('CandyMachineFactory');
    this.ExampleERC721Copyable = await ethers.getContractFactory('ExampleERC721Copyable');
    this.ExampleERC721Mintable = await ethers.getContractFactory('ExampleERC721Mintable');
    this.ExampleERC1155Copyable = await ethers.getContractFactory('ExampleERC1155Copyable');
    this.ExampleERC1155Mintable = await ethers.getContractFactory('ExampleERC1155Mintable');
    this.ExampleERC20Mintable = await ethers.getContractFactory('ExampleERC20Mintable');
    this.ExampleERC4907 = await ethers.getContractFactory('ExampleERC4907');

    const vrfCoordinatorV2Mock = await ethers.getContractFactory("VRFCoordinatorV2Mock");
    this.hardhatVrfCoordinatorV2Mock = await vrfCoordinatorV2Mock.deploy(0, 0);

    await this.hardhatVrfCoordinatorV2Mock.createSubscription();

    await this.hardhatVrfCoordinatorV2Mock.fundSubscription(1, ethers.utils.parseEther("50"));
  });

  describe('initialize', function () {
    beforeEach(async function () {
      this.candyMachineFactory = await upgrades.deployProxy(this.CandyMachineFactory, [], {
        initializer: "initialize",
        kind: "uups",
      });
      await this.candyMachineFactory.deployed();
    });

    it('should revert when the null address is provided for the CandyMachineFactory address argument', async function () {
      await expect(upgrades.deployProxy(this.Contract, [NULL_ADDR], {
        initializer: "initialize",
        kind: "uups",
      })).to.be.reverted;
    });

    it('should set the owner', async function () {
      this.contract = await upgrades.deployProxy(this.Contract, [this.candyMachineFactory.address], {
        initializer: "initialize",
        kind: "uups",
      });
      expect(await this.contract.owner()).to.be.equal(this.owner);
    });
  });

  describe('addOrRefillTag', function () {
    beforeEach(async function () {
      this.candyMachineFactory = await upgrades.deployProxy(this.CandyMachineFactory, [], {
        initializer: "initialize",
        kind: "uups",
      });
      await this.candyMachineFactory.deployed();
      this.contract = await upgrades.deployProxy(this.Contract, [this.candyMachineFactory.address], {
        initializer: "initialize",
        kind: "uups",
      });

      this.exampleERC721Mintable = await upgrades.deployProxy(this.ExampleERC721Mintable, ['Wrapped Asset', 'TST']);
      await this.exampleERC721Mintable.deployed();
      await this.exampleERC721Mintable.mint(this.owner, 0, { from: this.owner });
      await this.exampleERC721Mintable.approve(this.contract.address, 0, { from: this.owner });

      this.exampleERC721Copyable = await upgrades.deployProxy(this.ExampleERC721Copyable, []);
      await this.exampleERC721Copyable.deployed();
      await this.exampleERC721Copyable.mint(this.owner, 0, { from: this.owner });
      await this.exampleERC721Copyable.approve(this.contract.address, 0, { from: this.owner });

      this.exampleERC1155Copyable = await upgrades.deployProxy(this.ExampleERC1155Copyable, []);
      await this.exampleERC1155Copyable.deployed();
      await this.exampleERC1155Copyable.mint(this.owner, 0, { from: this.owner });
      await this.exampleERC1155Copyable.setApprovalForAll(this.contract.address, true, { from: this.owner });

      this.exampleERC1155Mintable = await upgrades.deployProxy(this.ExampleERC1155Mintable, ['https://google.com/']);
      await this.exampleERC1155Mintable.deployed();
      await this.exampleERC1155Mintable.mint(this.owner, 0, 100000, '0x00', { from: this.owner });
      await this.exampleERC1155Mintable.setApprovalForAll(this.contract.address, true, { from: this.owner });

      this.exampleERC20Mintable = await upgrades.deployProxy(this.ExampleERC20Mintable, ['Fungible Asset', 'FNA']);
      await this.exampleERC20Mintable.deployed();
      await this.exampleERC20Mintable.mint(this.owner, 1000000000, { from: this.owner });
      await this.exampleERC20Mintable.approve(this.contract.address, 1000000000, { from: this.owner });

      this.exampleERC4907 = await upgrades.deployProxy(this.ExampleERC4907, []);
      await this.exampleERC4907.deployed();
      await this.exampleERC4907.nftMint({ from: this.owner });
      await this.exampleERC4907.approve(this.contract.address, 1, { from: this.owner });
    });

    describe('LimitedOrOpenEdition', function () {
      it('should revert when totalSupply is set to zero', async function () {
        const tagUid = 1001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            0,                                  // TagType tagType;
            this.exampleERC721Copyable.address, // address assetAddress;
            0,                                  // uint256 erc721TokenId;
            this.otherAddr,                     // address tagAuthority;
            0,                                 // uint256 totalSupply;
            2,                                  // uint256 perUser;
            0,                                  // uint256 fungiblePerClaim;
            tagUid,                             // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.reverted;
      });

      it('should revert when perUser is set to zero', async function () {
        const tagUid = 1001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            0,                                  // TagType tagType;
            this.exampleERC721Copyable.address, // address assetAddress;
            0,                                  // uint256 erc721TokenId;
            this.otherAddr,                     // address tagAuthority;
            10,                                 // uint256 totalSupply;
            0,                                  // uint256 perUser;
            0,                                  // uint256 fungiblePerClaim;
            tagUid,                             // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.reverted;
      });

      it('should revert when perUser is greater than totalSupply', async function () {
        const tagUid = 1001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            0,                                  // TagType tagType;
            this.exampleERC721Copyable.address, // address assetAddress;
            0,                                  // uint256 erc721TokenId;
            this.otherAddr,                     // address tagAuthority;
            4,                                  // uint256 totalSupply;
            5,                                  // uint256 perUser;
            0,                                  // uint256 fungiblePerClaim;
            tagUid,                             // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.reverted;
      });

      it('should revert when tag is already in use and undrained', async function () {
        const tagUid = 1001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            0,                                  // TagType tagType;
            this.exampleERC721Copyable.address, // address assetAddress;
            0,                                  // uint256 erc721TokenId;
            this.otherAddr,                     // address tagAuthority;
            1,                                  // uint256 totalSupply;
            1,                                  // uint256 perUser;
            0,                                  // uint256 fungiblePerClaim;
            tagUid,                             // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;

        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            0,                                  // TagType tagType;
            this.exampleERC721Copyable.address, // address assetAddress;
            0,                                  // uint256 erc721TokenId;
            this.otherAddr,                     // address tagAuthority;
            10,                                 // uint256 totalSupply;
            2,                                  // uint256 perUser;
            0,                                  // uint256 fungiblePerClaim;
            tagUid,                             // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.reverted;
      });

      describe('ERC-721', function () {
        it('should revert and not create ERC-721 tag when non-IERC721CopyableUpgradeable-compliant asset is passed', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [     // TagPassed passedTag
              0,                                  // TagType tagType;
              this.exampleERC721Mintable.address, // address assetAddress;
              0,                                  // uint256 erc721TokenId;
              this.otherAddr,                     // address tagAuthority;
              10,                                 // uint256 totalSupply;
              2,                                  // uint256 perUser;
              0,                                  // uint256 fungiblePerClaim;
              tagUid,                             // uint256 uid;
              1,                                  // uint64 subscriptionId;
              this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            true, // bool isNotErc1155
            [],   // string[] metadataURIs
            { from: this.owner }
          )).to.be.reverted;
        });

        it('should create ERC-721 tag', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [     // TagPassed passedTag
              0,                                  // TagType tagType;
              this.exampleERC721Copyable.address, // address assetAddress;
              0,                                  // uint256 erc721TokenId;
              this.otherAddr,                     // address tagAuthority;
              10,                                 // uint256 totalSupply;
              2,                                  // uint256 perUser;
              0,                                  // uint256 fungiblePerClaim;
              tagUid,                             // uint256 uid;
              1,                                  // uint64 subscriptionId;
              this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            true, // bool isNotErc1155
            [],   // string[] metadataURIs
            { from: this.owner }
          )).to.emit(this.contract, "TagCreationOrRefill").withArgs(
            this.owner,
            0,
            this.exampleERC721Copyable.address,
            0,
            this.otherAddr,
            10,
            2,
            0,
            tagUid,
            true
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, tagUid));
          expect(tag.tagType).to.be.equal(0);
          expect(tag.assetAddress).to.be.equal(this.exampleERC721Copyable.address);
          expect(tag.erc721TokenId).to.be.equal(0);
          expect(tag.tagAuthority).to.be.equal(this.otherAddr);
          expect(tag.totalSupply).to.be.equal(10);
          expect(tag.perUser).to.be.equal(2);
          expect(tag.fungiblePerClaim).to.be.equal(0);
          expect(tag.uid).to.be.equal(tagUid);
          expect(tag.numClaimed).to.be.equal(0);
          expect(tag.claimsMade).to.be.undefined;

          expect(await this.exampleERC721Copyable.ownerOf(0)).to.be.equal(this.contract.address);
        });

        it('should create ERC-721 tag, ignoring passed value for fungiblePerClaim (always set to 0)', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [     // TagPassed passedTag
              0,                                  // TagType tagType;
              this.exampleERC721Copyable.address, // address assetAddress;
              0,                                  // uint256 erc721TokenId;
              this.otherAddr,                     // address tagAuthority;
              10,                                 // uint256 totalSupply;
              2,                                  // uint256 perUser;
              10,                                 // uint256 fungiblePerClaim;
              tagUid,                             // uint256 uid;
              1,                                  // uint64 subscriptionId;
              this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            true, // bool isNotErc1155
            [],   // string[] metadataURIs
            { from: this.owner }
          )).to.emit(this.contract, "TagCreationOrRefill").withArgs(
            this.owner,                         // address bakery
            0,                                  // TagType tagType
            this.exampleERC721Copyable.address, // address indexed assetAddress
            0,                                  // uint256 erc721TokenId
            this.otherAddr,                     // address indexed tagAuthority
            10,                                 // uint256 totalSupply
            2,                                  // uint256 perUser
            0,                                  // uint256 fungiblePerClaim
            tagUid,                             // uint256 indexed uid
            true                                // bool isNotErc1155
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, tagUid));
          expect(tag.tagType).to.be.equal(0);
          expect(tag.assetAddress).to.be.equal(this.exampleERC721Copyable.address);
          expect(tag.erc721TokenId).to.be.equal(0);
          expect(tag.tagAuthority).to.be.equal(this.otherAddr);
          expect(tag.totalSupply).to.be.equal(10);
          expect(tag.perUser).to.be.equal(2);
          expect(tag.fungiblePerClaim).to.be.equal(0);
          expect(tag.uid).to.be.equal(tagUid);
          expect(tag.numClaimed).to.be.equal(0);
          expect(tag.claimsMade).to.be.undefined;

          expect(await this.exampleERC721Copyable.ownerOf(0)).to.be.equal(this.contract.address);
        });

        it('should create ERC-721 tag even when tag existed before but is now drained', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [     // TagPassed passedTag
              0,                                  // TagType tagType;
              this.exampleERC721Copyable.address, // address assetAddress;
              0,                                  // uint256 erc721TokenId;
              this.otherAddr,                     // address tagAuthority;
              1,                                  // uint256 totalSupply;
              1,                                  // uint256 perUser;
              0,                                  // uint256 fungiblePerClaim;
              tagUid,                             // uint256 uid;
              1,                                  // uint64 subscriptionId;
              this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            true, // bool isNotErc1155
            [],   // string[] metadataURIs
            { from: this.owner }
          )).to.be.not.reverted;

          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner, // address recipient
            tagUid,     // uint256 uid
            this.owner, // address bakeryAddress
            true,       // bool isNotErc1155
            tagUid + 1, // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.be.not.reverted;

          await expect(this.contract.connect(this.signer).cancelAndEmpty(
            tagUid, // uint256 uid
            true,   // bool isNotErc1155
            { from: this.owner }
          )).to.be.not.reverted;

          await this.exampleERC721Copyable.approve(this.contract.address, 0, { from: this.owner });

          await expect(this.contract.addOrRefillTag(
            [     // TagPassed passedTag
              0,                                  // TagType tagType;
              this.exampleERC721Copyable.address, // address assetAddress;
              0,                                  // uint256 erc721TokenId;
              this.otherAddr,                     // address tagAuthority;
              10,                                 // uint256 totalSupply;
              2,                                  // uint256 perUser;
              0,                                  // uint256 fungiblePerClaim;
              tagUid,                             // uint256 uid;
              1,                                  // uint64 subscriptionId;
              this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            true, // bool isNotErc1155
            [],   // string[] metadataURIs
            { from: this.owner }
          )).to.be.not.reverted;
          const tag = await this.contract.tags(hashUniqueTag(this.owner, tagUid));
          expect(tag.tagType).to.be.equal(0);
          expect(tag.assetAddress).to.be.equal(this.exampleERC721Copyable.address);
          expect(tag.erc721TokenId).to.be.equal(0);
          expect(tag.tagAuthority).to.be.equal(this.otherAddr);
          expect(tag.totalSupply).to.be.equal(10);
          expect(tag.perUser).to.be.equal(2);
          expect(tag.fungiblePerClaim).to.be.equal(0);
          expect(tag.uid).to.be.equal(tagUid);
          expect(tag.numClaimed).to.be.equal(0);
          expect(tag.claimsMade).to.be.undefined;

          expect(await this.exampleERC721Copyable.ownerOf(0)).to.be.equal(this.contract.address);
        });
      });

      describe('ERC-1155', function () {
        it('should revert and not create ERC-1155 tag when non-IERC1155CopyableUpgradeable-compliant asset is passed', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [      // TagPassed passedTag
              0,                                   // TagType tagType;
              this.exampleERC1155Mintable.address, // address assetAddress;
              0,                                   // uint256 erc721TokenId;
              this.otherAddr,                      // address tagAuthority;
              10,                                  // uint256 totalSupply;
              2,                                   // uint256 perUser;
              0,                                   // uint256 fungiblePerClaim;
              tagUid,                              // uint256 uid;
              1,                                  // uint64 subscriptionId;
              this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            false, // bool isNotErc1155
            [],    // string[] metadataURIs
            { from: this.owner }
          )).to.be.reverted;
        });

        it('should create ERC-1155 tag', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [      // TagPassed passedTag
              0,                                   // TagType tagType;
              this.exampleERC1155Copyable.address, // address assetAddress;
              0,                                   // uint256 erc721TokenId;
              this.otherAddr,                      // address tagAuthority;
              10,                                  // uint256 totalSupply;
              2,                                   // uint256 perUser;
              0,                                   // uint256 fungiblePerClaim;
              tagUid,                              // uint256 uid;
              1,                                  // uint64 subscriptionId;
              this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            false, // bool isNotErc1155
            [],    // string[] metadataURIs
            { from: this.owner }
          )).to.emit(this.contract, "TagCreationOrRefill").withArgs(
            this.owner,
            0,
            this.exampleERC1155Copyable.address,
            0,
            this.otherAddr,
            10,
            2,
            0,
            tagUid,
            false
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, tagUid));
          expect(tag.tagType).to.be.equal(0);
          expect(tag.assetAddress).to.be.equal(this.exampleERC1155Copyable.address);
          expect(tag.erc721TokenId).to.be.equal(0);
          expect(tag.tagAuthority).to.be.equal(this.otherAddr);
          expect(tag.totalSupply).to.be.equal(10);
          expect(tag.perUser).to.be.equal(2);
          expect(tag.fungiblePerClaim).to.be.equal(0);
          expect(tag.uid).to.be.equal(tagUid);
          expect(tag.numClaimed).to.be.equal(0);
          expect(tag.claimsMade).to.be.undefined;

          expect(await this.exampleERC1155Copyable.balanceOf(this.contract.address, 0)).to.be.equal(1);
        });

        it('should create ERC-1155 tag, ignoring passed value for fungiblePerClaim (always set to 0)', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [      // TagPassed passedTag
              0,                                   // TagType tagType;
              this.exampleERC1155Copyable.address, // address assetAddress;
              0,                                   // uint256 erc721TokenId;
              this.otherAddr,                      // address tagAuthority;
              10,                                  // uint256 totalSupply;
              2,                                   // uint256 perUser;
              10,                                  // uint256 fungiblePerClaim;
              tagUid,                              // uint256 uid;
              1,                                  // uint64 subscriptionId;
              this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            false, // bool isNotErc1155
            [],    // string[] metadataURIs
            { from: this.owner }
          )).to.emit(this.contract, "TagCreationOrRefill").withArgs(
            this.owner,                          // address bakery
            0,                                   // TagType tagType
            this.exampleERC1155Copyable.address, // address indexed assetAddress
            0,                                   // uint256 erc721TokenId
            this.otherAddr,                      // address indexed tagAuthority
            10,                                  // uint256 totalSupply
            2,                                   // uint256 perUser
            0,                                   // uint256 fungiblePerClaim
            tagUid,                              // uint256 indexed uid
            false                                // bool isNotErc1155
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, tagUid));
          expect(tag.tagType).to.be.equal(0);
          expect(tag.assetAddress).to.be.equal(this.exampleERC1155Copyable.address);
          expect(tag.erc721TokenId).to.be.equal(0);
          expect(tag.tagAuthority).to.be.equal(this.otherAddr);
          expect(tag.totalSupply).to.be.equal(10);
          expect(tag.perUser).to.be.equal(2);
          expect(tag.fungiblePerClaim).to.be.equal(0);
          expect(tag.uid).to.be.equal(tagUid);
          expect(tag.numClaimed).to.be.equal(0);
          expect(tag.claimsMade).to.be.undefined;

          expect(await this.exampleERC1155Copyable.balanceOf(this.contract.address, 0)).to.be.equal(1);
        });

        it('should create ERC-1155 tag even when tag existed before but is now drained', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [      // TagPassed passedTag
              0,                                   // TagType tagType;
              this.exampleERC1155Copyable.address, // address assetAddress;
              0,                                   // uint256 erc721TokenId;
              this.otherAddr,                      // address tagAuthority;
              1,                                   // uint256 totalSupply;
              1,                                   // uint256 perUser;
              0,                                   // uint256 fungiblePerClaim;
              tagUid,                              // uint256 uid;
              1,                                  // uint64 subscriptionId;
              this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            false, // bool isNotErc1155
            [],    // string[] metadataURIs
            { from: this.owner }
          )).to.be.not.reverted;

          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner, // address recipient
            tagUid,     // uint256 uid
            this.owner, // address bakeryAddress
            false,      // bool isNotErc1155
            tagUid + 1, // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.be.not.reverted;

          await expect(this.contract.connect(this.signer).cancelAndEmpty(
            tagUid, // uint256 uid
            false,   // bool isNotErc1155
            { from: this.owner }
          )).to.be.not.reverted;

          await this.exampleERC1155Copyable.setApprovalForAll(this.contract.address, true, { from: this.owner });

          await expect(this.contract.addOrRefillTag(
            [      // TagPassed passedTag
              0,                                   // TagType tagType;
              this.exampleERC1155Copyable.address, // address assetAddress;
              0,                                   // uint256 erc721TokenId;
              this.otherAddr,                      // address tagAuthority;
              10,                                  // uint256 totalSupply;
              2,                                   // uint256 perUser;
              0,                                   // uint256 fungiblePerClaim;
              tagUid,                              // uint256 uid;
              1,                                  // uint64 subscriptionId;
              this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            false, // bool isNotErc1155
            [],    // string[] metadataURIs
            { from: this.owner }
          )).to.be.not.reverted;
          const tag = await this.contract.tags(hashUniqueTag(this.owner, tagUid));
          expect(tag.tagType).to.be.equal(0);
          expect(tag.assetAddress).to.be.equal(this.exampleERC1155Copyable.address);
          expect(tag.erc721TokenId).to.be.equal(0);
          expect(tag.tagAuthority).to.be.equal(this.otherAddr);
          expect(tag.totalSupply).to.be.equal(10);
          expect(tag.perUser).to.be.equal(2);
          expect(tag.fungiblePerClaim).to.be.equal(0);
          expect(tag.uid).to.be.equal(tagUid);
          expect(tag.numClaimed).to.be.equal(0);
          expect(tag.claimsMade).to.be.undefined;

          expect(await this.exampleERC1155Copyable.balanceOf(this.contract.address, 0)).to.be.equal(1);
        });
      });
    });
    
    describe('SingleUse1Of1', function () {
      it('should revert when tag has been used / uncleared', async function () {
        const tagUid = 1001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            1,                                  // TagType tagType;
            this.exampleERC721Mintable.address, // address assetAddress;
            0,                                  // uint256 erc721TokenId;
            this.otherAddr,                     // address tagAuthority;
            1,                                  // uint256 totalSupply;
            1,                                  // uint256 perUser;
            0,                                  // uint256 fungiblePerClaim;
            tagUid,                             // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;

        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            1,                                  // TagType tagType;
            this.exampleERC721Mintable.address, // address assetAddress;
            0,                                  // uint256 erc721TokenId;
            this.otherAddr,                     // address tagAuthority;
            1,                                  // uint256 totalSupply;
            1,                                  // uint256 perUser;
            0,                                  // uint256 fungiblePerClaim;
            tagUid,                             // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.reverted;
      });

      describe('ERC-721', function () {
        it('should revert and not create ERC-721 tag when non-IERC721-compliant asset is passed', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [     // TagPassed passedTag
              1,                                   // TagType tagType;
              this.exampleERC1155Mintable.address, // address assetAddress;
              0,                                   // uint256 erc721TokenId;
              this.otherAddr,                      // address tagAuthority;
              1,                                   // uint256 totalSupply;
              1,                                   // uint256 perUser;
              0,                                   // uint256 fungiblePerClaim;
              tagUid,                              // uint256 uid;
              1,                                  // uint64 subscriptionId;
              this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            true, // bool isNotErc1155
            [],   // string[] metadataURIs
            { from: this.owner }
          )).to.be.reverted;
        });

        it('should revert if tag ever existed', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [     // TagPassed passedTag
              1,                                  // TagType tagType;
              this.exampleERC721Mintable.address, // address assetAddress;
              0,                                  // uint256 erc721TokenId;
              this.otherAddr,                     // address tagAuthority;
              1,                                  // uint256 totalSupply;
              1,                                  // uint256 perUser;
              0,                                  // uint256 fungiblePerClaim;
              tagUid,                             // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            true, // bool isNotErc1155
            [],   // string[] metadataURIs
            { from: this.owner }
          )).to.be.not.reverted;

          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner, // address recipient
            tagUid,     // uint256 uid
            this.owner, // address bakeryAddress
            true,       // bool isNotErc1155
            0, // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.be.not.reverted;

          await this.exampleERC721Mintable.mint(this.owner, 1, { from: this.owner });
          await this.exampleERC721Mintable.approve(this.contract.address, 1, { from: this.owner });

          await expect(this.contract.addOrRefillTag(
            [     // TagPassed passedTag
              1,                                  // TagType tagType;
              this.exampleERC721Mintable.address, // address assetAddress;
              1,                                  // uint256 erc721TokenId;
              this.otherAddr,                     // address tagAuthority;
              1,                                  // uint256 totalSupply;
              1,                                  // uint256 perUser;
              0,                                  // uint256 fungiblePerClaim;
              tagUid,                             // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            true, // bool isNotErc1155
            [],   // string[] metadataURIs
            { from: this.owner }
          )).to.be.reverted;
        });

        it('should create ERC-721 tag', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [     // TagPassed passedTag
              1,                                  // TagType tagType;
              this.exampleERC721Mintable.address, // address assetAddress;
              0,                                  // uint256 erc721TokenId;
              this.otherAddr,                     // address tagAuthority;
              1,                                  // uint256 totalSupply;
              1,                                  // uint256 perUser;
              0,                                  // uint256 fungiblePerClaim;
              tagUid,                             // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            true, // bool isNotErc1155
            [],   // string[] metadataURIs
            { from: this.owner }
          )).to.emit(this.contract, "TagCreationOrRefill").withArgs(
            this.owner,                         // address bakery
            1,                                  // TagType tagType
            this.exampleERC721Mintable.address, // address assetAddress
            0,                                  // uint256 erc721TokenId
            this.otherAddr,                     // address tagAuthority
            1,                                  // uint256 totalSupply
            1,                                  // uint256 perUser
            0,                                  // uint256 fungiblePerClaim
            tagUid,                             // uint256 uid
            true                                // bool isNotErc1155
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, tagUid));
          expect(tag.tagType).to.be.equal(1);
          expect(tag.assetAddress).to.be.equal(this.exampleERC721Mintable.address);
          expect(tag.erc721TokenId).to.be.equal(0);
          expect(tag.tagAuthority).to.be.equal(this.otherAddr);
          expect(tag.totalSupply).to.be.equal(1);
          expect(tag.perUser).to.be.equal(1);
          expect(tag.fungiblePerClaim).to.be.equal(0);
          expect(tag.uid).to.be.equal(tagUid);
          expect(tag.numClaimed).to.be.equal(0);
          expect(tag.claimsMade).to.be.undefined;

          expect(await this.exampleERC721Mintable.ownerOf(0)).to.be.equal(this.contract.address);
        });

        it('should create ERC-721 tag, ignoring passed values for totalSupply, perUser, and fungiblePerClaim', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [     // TagPassed passedTag
              1,                                  // TagType tagType;
              this.exampleERC721Mintable.address, // address assetAddress;
              0,                                  // uint256 erc721TokenId;
              this.otherAddr,                     // address tagAuthority;
              10,                                 // uint256 totalSupply;
              2,                                  // uint256 perUser;
              10,                                 // uint256 fungiblePerClaim;
              tagUid,                             // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            true, // bool isNotErc1155
            [],   // string[] metadataURIs
            { from: this.owner }
          )).to.emit(this.contract, "TagCreationOrRefill").withArgs(
            this.owner,                         // address bakery
            1,                                  // TagType tagType
            this.exampleERC721Mintable.address, // address indexed assetAddress
            0,                                  // uint256 erc721TokenId
            this.otherAddr,                     // address indexed tagAuthority
            1,                                  // uint256 totalSupply
            1,                                  // uint256 perUser
            0,                                  // uint256 fungiblePerClaim
            tagUid,                             // uint256 indexed uid
            true                                // bool isNotErc1155
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, tagUid));
          expect(tag.tagType).to.be.equal(1);
          expect(tag.assetAddress).to.be.equal(this.exampleERC721Mintable.address);
          expect(tag.erc721TokenId).to.be.equal(0);
          expect(tag.tagAuthority).to.be.equal(this.otherAddr);
          expect(tag.totalSupply).to.be.equal(1);
          expect(tag.perUser).to.be.equal(1);
          expect(tag.fungiblePerClaim).to.be.equal(0);
          expect(tag.uid).to.be.equal(tagUid);
          expect(tag.numClaimed).to.be.equal(0);
          expect(tag.claimsMade).to.be.undefined;

          expect(await this.exampleERC721Mintable.ownerOf(0)).to.be.equal(this.contract.address);
        });
      });

      describe('ERC-1155', function () {
        it('should revert and not create ERC-1155 tag when non-IERC1155-compliant asset is passed', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [      // TagPassed passedTag
              1,                                   // TagType tagType;
              this.exampleERC721Mintable.address,  // address assetAddress;
              0,                                   // uint256 erc721TokenId;
              this.otherAddr,                      // address tagAuthority;
              1,                                   // uint256 totalSupply;
              1,                                   // uint256 perUser;
              0,                                   // uint256 fungiblePerClaim;
              tagUid,                              // uint256 uid;
              1,                                  // uint64 subscriptionId;
              this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            false, // bool isNotErc1155
            [],    // string[] metadataURIs
            { from: this.owner }
          )).to.be.reverted;
        });

        it('should revert if tag ever existed', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [     // TagPassed passedTag
              1,                                  // TagType tagType;
              this.exampleERC1155Mintable.address, // address assetAddress;
              0,                                  // uint256 erc721TokenId;
              this.otherAddr,                     // address tagAuthority;
              1,                                  // uint256 totalSupply;
              1,                                  // uint256 perUser;
              0,                                  // uint256 fungiblePerClaim;
              tagUid,                             // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            false, // bool isNotErc1155
            [],   // string[] metadataURIs
            { from: this.owner }
          )).to.be.not.reverted;

          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner, // address recipient
            tagUid,     // uint256 uid
            this.owner, // address bakeryAddress
            false,       // bool isNotErc1155
            0, // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.be.not.reverted;

          await this.exampleERC1155Mintable.mint(this.owner, 1, 1, '0x00', { from: this.owner });
          await this.exampleERC1155Mintable.setApprovalForAll(this.contract.address, true, { from: this.owner });

          await expect(this.contract.addOrRefillTag(
            [     // TagPassed passedTag
              1,                                   // TagType tagType;
              this.exampleERC1155Mintable.address, // address assetAddress;
              1,                                   // uint256 erc721TokenId;
              this.otherAddr,                      // address tagAuthority;
              1,                                   // uint256 totalSupply;
              1,                                   // uint256 perUser;
              0,                                   // uint256 fungiblePerClaim;
              tagUid,                              // uint256 uid;
              1,                                  // uint64 subscriptionId;
              this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            false, // bool isNotErc1155
            [],   // string[] metadataURIs
            { from: this.owner }
          )).to.be.reverted;
        });

        it('should create ERC-1155 tag', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [      // TagPassed passedTag
              1,                                   // TagType tagType;
              this.exampleERC1155Mintable.address, // address assetAddress;
              0,                                   // uint256 erc721TokenId;
              this.otherAddr,                      // address tagAuthority;
              1,                                   // uint256 totalSupply;
              1,                                   // uint256 perUser;
              0,                                   // uint256 fungiblePerClaim;
              tagUid,                              // uint256 uid;
              1,                                  // uint64 subscriptionId;
              this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            false, // bool isNotErc1155
            [],    // string[] metadataURIs
            { from: this.owner }
          )).to.emit(this.contract, "TagCreationOrRefill").withArgs(
            this.owner,                          // address bakery
            1,                                   // TagType tagType
            this.exampleERC1155Mintable.address, // address assetAddress
            0,                                   // uint256 erc721TokenId
            this.otherAddr,                      // address tagAuthority
            1,                                   // uint256 totalSupply
            1,                                   // uint256 perUser
            0,                                   // uint256 fungiblePerClaim
            tagUid,                              // uint256 uid
            false                                // bool isNotErc1155
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, tagUid));
          expect(tag.tagType).to.be.equal(1);
          expect(tag.assetAddress).to.be.equal(this.exampleERC1155Mintable.address);
          expect(tag.erc721TokenId).to.be.equal(0);
          expect(tag.tagAuthority).to.be.equal(this.otherAddr);
          expect(tag.totalSupply).to.be.equal(1);
          expect(tag.perUser).to.be.equal(1);
          expect(tag.fungiblePerClaim).to.be.equal(0);
          expect(tag.uid).to.be.equal(tagUid);
          expect(tag.numClaimed).to.be.equal(0);
          expect(tag.claimsMade).to.be.undefined;

          expect(await this.exampleERC1155Mintable.balanceOf(this.contract.address, 0)).to.be.equal(1);
        });

        it('should create ERC-1155 tag, ignoring passed value for totalSupply, perUser, and fungiblePerClaim', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [      // TagPassed passedTag
              1,                                   // TagType tagType;
              this.exampleERC1155Mintable.address, // address assetAddress;
              0,                                   // uint256 erc721TokenId;
              this.otherAddr,                      // address tagAuthority;
              10,                                  // uint256 totalSupply;
              2,                                   // uint256 perUser;
              10,                                  // uint256 fungiblePerClaim;
              tagUid,                              // uint256 uid;
              1,                                  // uint64 subscriptionId;
              this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            false, // bool isNotErc1155
            [],    // string[] metadataURIs
            { from: this.owner }
          )).to.emit(this.contract, "TagCreationOrRefill").withArgs(
            this.owner,                          // address bakery
            1,                                   // TagType tagType
            this.exampleERC1155Mintable.address, // address indexed assetAddress
            0,                                   // uint256 erc721TokenId
            this.otherAddr,                      // address indexed tagAuthority
            1,                                   // uint256 totalSupply
            1,                                   // uint256 perUser
            0,                                   // uint256 fungiblePerClaim
            tagUid,                              // uint256 indexed uid
            false                                // bool isNotErc1155
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, tagUid));
          expect(tag.tagType).to.be.equal(1);
          expect(tag.assetAddress).to.be.equal(this.exampleERC1155Mintable.address);
          expect(tag.erc721TokenId).to.be.equal(0);
          expect(tag.tagAuthority).to.be.equal(this.otherAddr);
          expect(tag.totalSupply).to.be.equal(1);
          expect(tag.perUser).to.be.equal(1);
          expect(tag.fungiblePerClaim).to.be.equal(0);
          expect(tag.uid).to.be.equal(tagUid);
          expect(tag.numClaimed).to.be.equal(0);
          expect(tag.claimsMade).to.be.undefined;

          expect(await this.exampleERC1155Mintable.balanceOf(this.contract.address, 0)).to.be.equal(1);
        });
      });
    });

    describe('Refillable1Of1', function () {
      it('should revert when tag has been used / uncleared', async function () {
        const tagUid = 1001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            2,                                  // TagType tagType;
            this.exampleERC721Mintable.address, // address assetAddress;
            0,                                  // uint256 erc721TokenId;
            this.otherAddr,                     // address tagAuthority;
            1,                                  // uint256 totalSupply;
            1,                                  // uint256 perUser;
            0,                                  // uint256 fungiblePerClaim;
            tagUid,                             // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;

        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            2,                                  // TagType tagType;
            this.exampleERC721Mintable.address, // address assetAddress;
            0,                                  // uint256 erc721TokenId;
            this.otherAddr,                     // address tagAuthority;
            1,                                  // uint256 totalSupply;
            1,                                  // uint256 perUser;
            0,                                  // uint256 fungiblePerClaim;
            tagUid,                             // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.reverted;
      });

      describe('ERC-721', function () {
        it('should revert and not create ERC-721 tag when non-IERC721-compliant asset is passed', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [     // TagPassed passedTag
              2,                                   // TagType tagType;
              this.exampleERC1155Mintable.address, // address assetAddress;
              0,                                   // uint256 erc721TokenId;
              this.otherAddr,                      // address tagAuthority;
              1,                                   // uint256 totalSupply;
              1,                                   // uint256 perUser;
              0,                                   // uint256 fungiblePerClaim;
              tagUid,                              // uint256 uid;
              1,                                  // uint64 subscriptionId;
              this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            true, // bool isNotErc1155
            [],   // string[] metadataURIs
            { from: this.owner }
          )).to.be.reverted;
        });

        it('should create ERC-721 tag', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [     // TagPassed passedTag
              2,                                  // TagType tagType;
              this.exampleERC721Mintable.address, // address assetAddress;
              0,                                  // uint256 erc721TokenId;
              this.otherAddr,                     // address tagAuthority;
              1,                                  // uint256 totalSupply;
              1,                                  // uint256 perUser;
              0,                                  // uint256 fungiblePerClaim;
              tagUid,                             // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            true, // bool isNotErc1155
            [],   // string[] metadataURIs
            { from: this.owner }
          )).to.emit(this.contract, "TagCreationOrRefill").withArgs(
            this.owner,                         // address bakery
            2,                                  // TagType tagType
            this.exampleERC721Mintable.address, // address assetAddress
            0,                                  // uint256 erc721TokenId
            this.otherAddr,                     // address tagAuthority
            1,                                  // uint256 totalSupply
            1,                                  // uint256 perUser
            0,                                  // uint256 fungiblePerClaim
            tagUid,                             // uint256 uid
            true                                // bool isNotErc1155
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, tagUid));
          expect(tag.tagType).to.be.equal(2);
          expect(tag.assetAddress).to.be.equal(this.exampleERC721Mintable.address);
          expect(tag.erc721TokenId).to.be.equal(0);
          expect(tag.tagAuthority).to.be.equal(this.otherAddr);
          expect(tag.totalSupply).to.be.equal(1);
          expect(tag.perUser).to.be.equal(1);
          expect(tag.fungiblePerClaim).to.be.equal(0);
          expect(tag.uid).to.be.equal(tagUid);
          expect(tag.numClaimed).to.be.equal(0);
          expect(tag.claimsMade).to.be.undefined;

          expect(await this.exampleERC721Mintable.ownerOf(0)).to.be.equal(this.contract.address);
        });

        it('should create ERC-721 tag, ignoring passed values for totalSupply, perUser, and fungiblePerClaim', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [     // TagPassed passedTag
              2,                                  // TagType tagType;
              this.exampleERC721Mintable.address, // address assetAddress;
              0,                                  // uint256 erc721TokenId;
              this.otherAddr,                     // address tagAuthority;
              10,                                 // uint256 totalSupply;
              2,                                  // uint256 perUser;
              10,                                 // uint256 fungiblePerClaim;
              tagUid,                             // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            true, // bool isNotErc1155
            [],   // string[] metadataURIs
            { from: this.owner }
          )).to.emit(this.contract, "TagCreationOrRefill").withArgs(
            this.owner,                         // address bakery
            2,                                  // TagType tagType
            this.exampleERC721Mintable.address, // address indexed assetAddress
            0,                                  // uint256 erc721TokenId
            this.otherAddr,                     // address indexed tagAuthority
            1,                                  // uint256 totalSupply
            1,                                  // uint256 perUser
            0,                                  // uint256 fungiblePerClaim
            tagUid,                             // uint256 indexed uid
            true                                // bool isNotErc1155
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, tagUid));
          expect(tag.tagType).to.be.equal(2);
          expect(tag.assetAddress).to.be.equal(this.exampleERC721Mintable.address);
          expect(tag.erc721TokenId).to.be.equal(0);
          expect(tag.tagAuthority).to.be.equal(this.otherAddr);
          expect(tag.totalSupply).to.be.equal(1);
          expect(tag.perUser).to.be.equal(1);
          expect(tag.fungiblePerClaim).to.be.equal(0);
          expect(tag.uid).to.be.equal(tagUid);
          expect(tag.numClaimed).to.be.equal(0);
          expect(tag.claimsMade).to.be.undefined;

          expect(await this.exampleERC721Mintable.ownerOf(0)).to.be.equal(this.contract.address);
        });

        it('should create / refill tag if it existed before but has already been claimed', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [     // TagPassed passedTag
              2,                                  // TagType tagType;
              this.exampleERC721Mintable.address, // address assetAddress;
              0,                                  // uint256 erc721TokenId;
              this.otherAddr,                     // address tagAuthority;
              1,                                  // uint256 totalSupply;
              1,                                  // uint256 perUser;
              0,                                  // uint256 fungiblePerClaim;
              tagUid,                             // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            true, // bool isNotErc1155
            [],   // string[] metadataURIs
            { from: this.owner }
          )).to.be.not.reverted;

          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner, // address recipient
            tagUid,     // uint256 uid
            this.owner, // address bakeryAddress
            true,       // bool isNotErc1155
            0, // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.be.not.reverted;

          await this.exampleERC721Mintable.mint(this.owner, 1, { from: this.owner });
          await this.exampleERC721Mintable.approve(this.contract.address, 1, { from: this.owner });

          await expect(this.contract.addOrRefillTag(
            [     // TagPassed passedTag
              2,                                  // TagType tagType;
              this.exampleERC721Mintable.address, // address assetAddress;
              1,                                  // uint256 erc721TokenId;
              this.otherAddr,                     // address tagAuthority;
              1,                                  // uint256 totalSupply;
              1,                                  // uint256 perUser;
              0,                                  // uint256 fungiblePerClaim;
              tagUid,                             // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            true, // bool isNotErc1155
            [],   // string[] metadataURIs
            { from: this.owner }
          )).to.emit(this.contract, "TagCreationOrRefill").withArgs(
            this.owner,                         // address bakery
            2,                                  // TagType tagType
            this.exampleERC721Mintable.address, // address indexed assetAddress
            1,                                  // uint256 erc721TokenId
            this.otherAddr,                     // address indexed tagAuthority
            1,                                  // uint256 totalSupply
            1,                                  // uint256 perUser
            0,                                  // uint256 fungiblePerClaim
            tagUid,                             // uint256 indexed uid
            true                                // bool isNotErc1155
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, tagUid));
          expect(tag.tagType).to.be.equal(2);
          expect(tag.assetAddress).to.be.equal(this.exampleERC721Mintable.address);
          expect(tag.erc721TokenId).to.be.equal(1);
          expect(tag.tagAuthority).to.be.equal(this.otherAddr);
          expect(tag.totalSupply).to.be.equal(1);
          expect(tag.perUser).to.be.equal(1);
          expect(tag.fungiblePerClaim).to.be.equal(0);
          expect(tag.uid).to.be.equal(tagUid);
          expect(tag.numClaimed).to.be.equal(0);
          expect(tag.claimsMade).to.be.undefined;

          expect(await this.exampleERC721Mintable.ownerOf(1)).to.be.equal(this.contract.address);
        });
      });

      describe('ERC-1155', function () {
        it('should revert and not create ERC-1155 tag when non-IERC1155-compliant asset is passed', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [      // TagPassed passedTag
              2,                                   // TagType tagType;
              this.exampleERC721Mintable.address,  // address assetAddress;
              0,                                   // uint256 erc721TokenId;
              this.otherAddr,                      // address tagAuthority;
              1,                                   // uint256 totalSupply;
              1,                                   // uint256 perUser;
              0,                                   // uint256 fungiblePerClaim;
              tagUid,                              // uint256 uid;
              1,                                  // uint64 subscriptionId;
              this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            false, // bool isNotErc1155
            [],    // string[] metadataURIs
            { from: this.owner }
          )).to.be.reverted;
        });

        it('should create ERC-1155 tag', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [      // TagPassed passedTag
              2,                                   // TagType tagType;
              this.exampleERC1155Mintable.address, // address assetAddress;
              0,                                   // uint256 erc721TokenId;
              this.otherAddr,                      // address tagAuthority;
              1,                                   // uint256 totalSupply;
              1,                                   // uint256 perUser;
              0,                                   // uint256 fungiblePerClaim;
              tagUid,                              // uint256 uid;
              1,                                  // uint64 subscriptionId;
              this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            false, // bool isNotErc1155
            [],    // string[] metadataURIs
            { from: this.owner }
          )).to.emit(this.contract, "TagCreationOrRefill").withArgs(
            this.owner,                          // address bakery
            2,                                   // TagType tagType
            this.exampleERC1155Mintable.address, // address assetAddress
            0,                                   // uint256 erc721TokenId
            this.otherAddr,                      // address tagAuthority
            1,                                   // uint256 totalSupply
            1,                                   // uint256 perUser
            0,                                   // uint256 fungiblePerClaim
            tagUid,                              // uint256 uid
            false                                // bool isNotErc1155
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, tagUid));
          expect(tag.tagType).to.be.equal(2);
          expect(tag.assetAddress).to.be.equal(this.exampleERC1155Mintable.address);
          expect(tag.erc721TokenId).to.be.equal(0);
          expect(tag.tagAuthority).to.be.equal(this.otherAddr);
          expect(tag.totalSupply).to.be.equal(1);
          expect(tag.perUser).to.be.equal(1);
          expect(tag.fungiblePerClaim).to.be.equal(0);
          expect(tag.uid).to.be.equal(tagUid);
          expect(tag.numClaimed).to.be.equal(0);
          expect(tag.claimsMade).to.be.undefined;

          expect(await this.exampleERC1155Mintable.balanceOf(this.contract.address, 0)).to.be.equal(1);
        });

        it('should create ERC-1155 tag, ignoring passed value for totalSupply, perUser, and fungiblePerClaim', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [      // TagPassed passedTag
              2,                                   // TagType tagType;
              this.exampleERC1155Mintable.address, // address assetAddress;
              0,                                   // uint256 erc721TokenId;
              this.otherAddr,                      // address tagAuthority;
              10,                                  // uint256 totalSupply;
              2,                                   // uint256 perUser;
              10,                                  // uint256 fungiblePerClaim;
              tagUid,                              // uint256 uid;
              1,                                  // uint64 subscriptionId;
              this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            false, // bool isNotErc1155
            [],    // string[] metadataURIs
            { from: this.owner }
          )).to.emit(this.contract, "TagCreationOrRefill").withArgs(
            this.owner,                          // address bakery
            2,                                   // TagType tagType
            this.exampleERC1155Mintable.address, // address indexed assetAddress
            0,                                   // uint256 erc721TokenId
            this.otherAddr,                      // address indexed tagAuthority
            1,                                   // uint256 totalSupply
            1,                                   // uint256 perUser
            0,                                   // uint256 fungiblePerClaim
            tagUid,                              // uint256 indexed uid
            false                                // bool isNotErc1155
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, tagUid));
          expect(tag.tagType).to.be.equal(2);
          expect(tag.assetAddress).to.be.equal(this.exampleERC1155Mintable.address);
          expect(tag.erc721TokenId).to.be.equal(0);
          expect(tag.tagAuthority).to.be.equal(this.otherAddr);
          expect(tag.totalSupply).to.be.equal(1);
          expect(tag.perUser).to.be.equal(1);
          expect(tag.fungiblePerClaim).to.be.equal(0);
          expect(tag.uid).to.be.equal(tagUid);
          expect(tag.numClaimed).to.be.equal(0);
          expect(tag.claimsMade).to.be.undefined;

          expect(await this.exampleERC1155Mintable.balanceOf(this.contract.address, 0)).to.be.equal(1);
        });

        it('should create / refill tag if it existed before but has already been claimed', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [     // TagPassed passedTag
              2,                                  // TagType tagType;
              this.exampleERC1155Mintable.address, // address assetAddress;
              0,                                  // uint256 erc721TokenId;
              this.otherAddr,                     // address tagAuthority;
              1,                                  // uint256 totalSupply;
              1,                                  // uint256 perUser;
              0,                                  // uint256 fungiblePerClaim;
              tagUid,                             // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            false, // bool isNotErc1155
            [],   // string[] metadataURIs
            { from: this.owner }
          )).to.be.not.reverted;

          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner, // address recipient
            tagUid,     // uint256 uid
            this.owner, // address bakeryAddress
            false,       // bool isNotErc1155
            0, // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.be.not.reverted;

          await this.exampleERC1155Mintable.mint(this.owner, 1, 1, '0x00', { from: this.owner });
          await this.exampleERC1155Mintable.setApprovalForAll(this.contract.address, true, { from: this.owner });

          await expect(this.contract.addOrRefillTag(
            [     // TagPassed passedTag
              2,                                   // TagType tagType;
              this.exampleERC1155Mintable.address, // address assetAddress;
              1,                                   // uint256 erc721TokenId;
              this.otherAddr,                      // address tagAuthority;
              1,                                   // uint256 totalSupply;
              1,                                   // uint256 perUser;
              0,                                   // uint256 fungiblePerClaim;
              tagUid,                              // uint256 uid;
              1,                                  // uint64 subscriptionId;
              this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            false, // bool isNotErc1155
            [],   // string[] metadataURIs
            { from: this.owner }
          )).to.emit(this.contract, "TagCreationOrRefill").withArgs(
            this.owner,                          // address bakery
            2,                                   // TagType tagType
            this.exampleERC1155Mintable.address, // address indexed assetAddress
            1,                                   // uint256 erc721TokenId
            this.otherAddr,                      // address indexed tagAuthority
            1,                                   // uint256 totalSupply
            1,                                   // uint256 perUser
            0,                                   // uint256 fungiblePerClaim
            tagUid,                              // uint256 indexed uid
            false                                // bool isNotErc1155
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, tagUid));
          expect(tag.tagType).to.be.equal(2);
          expect(tag.assetAddress).to.be.equal(this.exampleERC1155Mintable.address);
          expect(tag.erc721TokenId).to.be.equal(1);
          expect(tag.tagAuthority).to.be.equal(this.otherAddr);
          expect(tag.totalSupply).to.be.equal(1);
          expect(tag.perUser).to.be.equal(1);
          expect(tag.fungiblePerClaim).to.be.equal(0);
          expect(tag.uid).to.be.equal(tagUid);
          expect(tag.numClaimed).to.be.equal(0);
          expect(tag.claimsMade).to.be.undefined;

          expect(await this.exampleERC1155Mintable.balanceOf(this.contract.address, 1)).to.be.equal(1);
        });
      });
    });

    describe('WalletRestrictedFungible', function () {
      it('should revert when tag is already in use and unused (not even partially drained)', async function () {
        const tagUid = 1001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            3,                                  // TagType tagType;
            this.exampleERC20Mintable.address, // address assetAddress;
            0,                                  // uint256 erc721TokenId;
            this.otherAddr,                     // address tagAuthority;
            10000,                              // uint256 totalSupply;
            1000,                               // uint256 perUser;
            100,                                // uint256 fungiblePerClaim;
            tagUid,                             // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;

        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            3,                                  // TagType tagType;
            this.exampleERC20Mintable.address, // address assetAddress;
            0,                                  // uint256 erc721TokenId;
            this.otherAddr,                     // address tagAuthority;
            10000,                              // uint256 totalSupply;
            1000,                               // uint256 perUser;
            100,                                // uint256 fungiblePerClaim;
            tagUid,                             // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.reverted;
      });

      it('should revert when tag is already in use and partially drained', async function () {
        const tagUid = 1001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            3,                                  // TagType tagType;
            this.exampleERC20Mintable.address, // address assetAddress;
            0,                                  // uint256 erc721TokenId;
            this.otherAddr,                     // address tagAuthority;
            10000,                              // uint256 totalSupply;
            1000,                               // uint256 perUser;
            100,                                // uint256 fungiblePerClaim;
            tagUid,                             // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;

        await expect(this.contract.connect(this.signer2).claimTag(
          this.owner, // address recipient
          tagUid,     // uint256 uid
          this.owner, // address bakeryAddress
          true,       // bool isNotErc1155
          0,          // uint256 newTokenId
          KEY_HASH,   // bytes32 keyHash
          { from: this.otherAddr }
        )).to.be.not.reverted;

        await expect(this.contract.connect(this.signer).addOrRefillTag(
          [     // TagPassed passedTag
            3,                                  // TagType tagType;
            this.exampleERC20Mintable.address, // address assetAddress;
            0,                                  // uint256 erc721TokenId;
            this.otherAddr,                     // address tagAuthority;
            10000,                              // uint256 totalSupply;
            1000,                               // uint256 perUser;
            100,                                // uint256 fungiblePerClaim;
            tagUid,                             // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.reverted;
      });

      it('should revert when fungiblePerClaim is greater than perUser', async function () {
        const tagUid = 1001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            3,                                  // TagType tagType;
            this.exampleERC20Mintable.address,  // address assetAddress;
            0,                                  // uint256 erc721TokenId;
            this.otherAddr,                     // address tagAuthority;
            10000,                              // uint256 totalSupply;
            100,                                // uint256 perUser;
            1000,                               // uint256 fungiblePerClaim;
            tagUid,                             // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.reverted;
      });

      it('should revert when totalSupply is set to zero', async function () {
        const tagUid = 1001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            3,                                  // TagType tagType;
            this.exampleERC20Mintable.address,  // address assetAddress;
            0,                                  // uint256 erc721TokenId;
            this.otherAddr,                     // address tagAuthority;
            0,                                  // uint256 totalSupply;
            1000,                               // uint256 perUser;
            100,                                // uint256 fungiblePerClaim;
            tagUid,                             // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.reverted;
      });

      it('should revert when fungiblePerClaim is set to zero', async function () {
        const tagUid = 1001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            3,                                  // TagType tagType;
            this.exampleERC20Mintable.address,  // address assetAddress;
            0,                                  // uint256 erc721TokenId;
            this.otherAddr,                     // address tagAuthority;
            10000,                              // uint256 totalSupply;
            1000,                               // uint256 perUser;
            0,                                  // uint256 fungiblePerClaim;
            tagUid,                             // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.reverted;
      });

      describe('ERC-20', function () {
        it('should revert and not create ERC-20 tag when non-IERC20-compliant asset is passed', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [     // TagPassed passedTag
              3,                                   // TagType tagType;
              this.exampleERC1155Mintable.address, // address assetAddress;
              0,                                   // uint256 erc721TokenId;
              this.otherAddr,                      // address tagAuthority;
              10000,                               // uint256 totalSupply;
              1000,                                // uint256 perUser;
              100,                                 // uint256 fungiblePerClaim;
              tagUid,                              // uint256 uid;
              1,                                  // uint64 subscriptionId;
              this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            true, // bool isNotErc1155
            [],   // string[] metadataURIs
            { from: this.owner }
          )).to.be.reverted;
        });

        it('should create ERC-20 tag', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [     // TagPassed passedTag
              3,                                  // TagType tagType;
              this.exampleERC20Mintable.address,  // address assetAddress;
              0,                                  // uint256 erc721TokenId;
              this.otherAddr,                     // address tagAuthority;
              10000,                              // uint256 totalSupply;
              1000,                               // uint256 perUser;
              100,                                // uint256 fungiblePerClaim;
              tagUid,                             // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            true, // bool isNotErc1155
            [],   // string[] metadataURIs
            { from: this.owner }
          )).to.emit(this.contract, "TagCreationOrRefill").withArgs(
            this.owner,                         // address bakery
            3,                                  // TagType tagType
            this.exampleERC20Mintable.address,  // address assetAddress
            0,                                  // uint256 erc721TokenId
            this.otherAddr,                     // address tagAuthority
            10000,                              // uint256 totalSupply
            1000,                               // uint256 perUser
            100,                                // uint256 fungiblePerClaim
            tagUid,                             // uint256 uid
            true                                // bool isNotErc1155
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, tagUid));
          expect(tag.tagType).to.be.equal(3);
          expect(tag.assetAddress).to.be.equal(this.exampleERC20Mintable.address);
          expect(tag.erc721TokenId).to.be.equal(0);
          expect(tag.tagAuthority).to.be.equal(this.otherAddr);
          expect(tag.totalSupply).to.be.equal(10000);
          expect(tag.perUser).to.be.equal(1000);
          expect(tag.fungiblePerClaim).to.be.equal(100);
          expect(tag.uid).to.be.equal(tagUid);
          expect(tag.numClaimed).to.be.equal(0);
          expect(tag.claimsMade).to.be.undefined;

          expect(await this.exampleERC20Mintable.balanceOf(this.contract.address)).to.be.equal(10000);
        });

        it('should create / refill tag if it existed before but has already been totally claimed', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [     // TagPassed passedTag
              3,                                  // TagType tagType;
              this.exampleERC20Mintable.address,  // address assetAddress;
              0,                                  // uint256 erc721TokenId;
              this.otherAddr,                     // address tagAuthority;
              100,                                // uint256 totalSupply;
              100,                                // uint256 perUser;
              50,                                 // uint256 fungiblePerClaim;
              tagUid,                             // uint256 uid;
              1,                                  // uint64 subscriptionId;
              this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            true, // bool isNotErc1155
            [],   // string[] metadataURIs
            { from: this.owner }
          )).to.be.not.reverted;

          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner, // address recipient
            tagUid,     // uint256 uid
            this.owner, // address bakeryAddress
            true,       // bool isNotErc1155
            0, // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.be.not.reverted;

          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner, // address recipient
            tagUid,     // uint256 uid
            this.owner, // address bakeryAddress
            true,       // bool isNotErc1155
            0, // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.be.not.reverted;

          await expect(this.contract.connect(this.signer).addOrRefillTag(
            [     // TagPassed passedTag
              3,                                  // TagType tagType;
              this.exampleERC20Mintable.address,  // address assetAddress;
              0,                                  // uint256 erc721TokenId;
              this.otherAddr,                     // address tagAuthority;
              100,                                // uint256 totalSupply;
              100,                                // uint256 perUser;
              50,                                 // uint256 fungiblePerClaim;
              tagUid,                             // uint256 uid;
              1,                                  // uint64 subscriptionId;
              this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            true, // bool isNotErc1155
            [],   // string[] metadataURIs
            { from: this.owner }
          )).to.emit(this.contract, "TagCreationOrRefill").withArgs(
            this.owner,                         // address bakery
            3,                                  // TagType tagType
            this.exampleERC20Mintable.address,  // address indexed assetAddress
            0,                                  // uint256 erc721TokenId
            this.otherAddr,                     // address indexed tagAuthority
            100,                                // uint256 totalSupply
            100,                                // uint256 perUser
            50,                                 // uint256 fungiblePerClaim
            tagUid,                             // uint256 indexed uid
            true                                // bool isNotErc1155
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, tagUid));
          expect(tag.tagType).to.be.equal(3);
          expect(tag.assetAddress).to.be.equal(this.exampleERC20Mintable.address);
          expect(tag.erc721TokenId).to.be.equal(0);
          expect(tag.tagAuthority).to.be.equal(this.otherAddr);
          expect(tag.totalSupply).to.be.equal(100);
          expect(tag.perUser).to.be.equal(100);
          expect(tag.fungiblePerClaim).to.be.equal(50);
          expect(tag.uid).to.be.equal(tagUid);
          expect(tag.numClaimed).to.be.equal(0);
          expect(tag.claimsMade).to.be.undefined;

          expect(await this.exampleERC20Mintable.balanceOf(this.contract.address)).to.be.equal(100);
        });
      });

      describe('ERC-1155', function () {
        it('should revert and not create ERC-1155 tag when non-IERC1155-compliant asset is passed', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [      // TagPassed passedTag
              3,                                   // TagType tagType;
              this.exampleERC721Mintable.address,  // address assetAddress;
              0,                                   // uint256 erc721TokenId;
              this.otherAddr,                      // address tagAuthority;
              10000,                               // uint256 totalSupply;
              1000,                                // uint256 perUser;
              100,                                 // uint256 fungiblePerClaim;
              tagUid,                              // uint256 uid;
              1,                                  // uint64 subscriptionId;
              this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            false, // bool isNotErc1155
            [],    // string[] metadataURIs
            { from: this.owner }
          )).to.be.reverted;
        });

        it('should create ERC-1155 tag', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [      // TagPassed passedTag
              3,                                   // TagType tagType;
              this.exampleERC1155Mintable.address, // address assetAddress;
              0,                                   // uint256 erc721TokenId;
              this.otherAddr,                      // address tagAuthority;
              10000,                               // uint256 totalSupply;
              1000,                                // uint256 perUser;
              100,                                 // uint256 fungiblePerClaim;
              tagUid,                              // uint256 uid;
              1,                                  // uint64 subscriptionId;
              this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            false, // bool isNotErc1155
            [],    // string[] metadataURIs
            { from: this.owner }
          )).to.emit(this.contract, "TagCreationOrRefill").withArgs(
            this.owner,                          // address bakery
            3,                                   // TagType tagType
            this.exampleERC1155Mintable.address, // address assetAddress
            0,                                   // uint256 erc721TokenId
            this.otherAddr,                      // address tagAuthority
            10000,                               // uint256 totalSupply
            1000,                                // uint256 perUser
            100,                                 // uint256 fungiblePerClaim
            tagUid,                              // uint256 uid
            false                                // bool isNotErc1155
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, tagUid));
          expect(tag.tagType).to.be.equal(3);
          expect(tag.assetAddress).to.be.equal(this.exampleERC1155Mintable.address);
          expect(tag.erc721TokenId).to.be.equal(0);
          expect(tag.tagAuthority).to.be.equal(this.otherAddr);
          expect(tag.totalSupply).to.be.equal(10000);
          expect(tag.perUser).to.be.equal(1000);
          expect(tag.fungiblePerClaim).to.be.equal(100);
          expect(tag.uid).to.be.equal(tagUid);
          expect(tag.numClaimed).to.be.equal(0);
          expect(tag.claimsMade).to.be.undefined;

          expect(await this.exampleERC1155Mintable.balanceOf(this.contract.address, 0)).to.be.equal(10000);
        });

        it('should create / refill tag if it existed before but has already been totally claimed', async function () {
          const tagUid = 1001;
          await expect(this.contract.addOrRefillTag(
            [     // TagPassed passedTag
              3,                                   // TagType tagType;
              this.exampleERC1155Mintable.address, // address assetAddress;
              0,                                   // uint256 erc721TokenId;
              this.otherAddr,                      // address tagAuthority;
              1000,                                // uint256 totalSupply;
              1000,                                // uint256 perUser;
              500,                                 // uint256 fungiblePerClaim;
              tagUid,                              // uint256 uid;
              1,                                  // uint64 subscriptionId;
              this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            false, // bool isNotErc1155
            [],   // string[] metadataURIs
            { from: this.owner }
          )).to.be.not.reverted;

          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner, // address recipient
            tagUid,     // uint256 uid
            this.owner, // address bakeryAddress
            false,      // bool isNotErc1155
            0,          // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.be.not.reverted;

          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner, // address recipient
            tagUid,     // uint256 uid
            this.owner, // address bakeryAddress
            false,      // bool isNotErc1155
            0,          // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.be.not.reverted;

          await expect(this.contract.connect(this.signer).addOrRefillTag(
            [     // TagPassed passedTag
              3,                                   // TagType tagType;
              this.exampleERC1155Mintable.address, // address assetAddress;
              0,                                   // uint256 erc721TokenId;
              this.otherAddr,                      // address tagAuthority;
              1000,                                // uint256 totalSupply;
              500,                                 // uint256 perUser;
              500,                                 // uint256 fungiblePerClaim;
              tagUid,                              // uint256 uid;
              1,                                  // uint64 subscriptionId;
              this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            false, // bool isNotErc1155
            [],   // string[] metadataURIs
            { from: this.owner }
          )).to.emit(this.contract, "TagCreationOrRefill").withArgs(
            this.owner,                          // address bakery
            3,                                   // TagType tagType
            this.exampleERC1155Mintable.address, // address indexed assetAddress
            0,                                   // uint256 erc721TokenId
            this.otherAddr,                      // address indexed tagAuthority
            1000,                                // uint256 totalSupply
            500,                                 // uint256 perUser
            500,                                 // uint256 fungiblePerClaim
            tagUid,                              // uint256 indexed uid
            false                                // bool isNotErc1155
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, tagUid));
          expect(tag.tagType).to.be.equal(3);
          expect(tag.assetAddress).to.be.equal(this.exampleERC1155Mintable.address);
          expect(tag.erc721TokenId).to.be.equal(0);
          expect(tag.tagAuthority).to.be.equal(this.otherAddr);
          expect(tag.totalSupply).to.be.equal(1000);
          expect(tag.perUser).to.be.equal(500);
          expect(tag.fungiblePerClaim).to.be.equal(500);
          expect(tag.uid).to.be.equal(tagUid);
          expect(tag.numClaimed).to.be.equal(0);
          expect(tag.claimsMade).to.be.undefined;

          expect(await this.exampleERC1155Mintable.balanceOf(this.contract.address, 0)).to.be.equal(1000);
        });
      });
    });

    describe('HotPotato', function () {
      it('should revert when tag is currently in use', async function () {
        const tagUid = 1001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            4,                           // TagType tagType;
            this.exampleERC4907.address, // address assetAddress;
            1,                           // uint256 erc721TokenId;
            this.otherAddr,              // address tagAuthority;
            1,                           // uint256 totalSupply;
            0,                           // uint256 perUser;
            0,                           // uint256 fungiblePerClaim;
            tagUid,                      // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;

        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            4,                           // TagType tagType;
            this.exampleERC4907.address, // address assetAddress;
            1,                           // uint256 erc721TokenId;
            this.otherAddr,              // address tagAuthority;
            1,                           // uint256 totalSupply;
            0,                           // uint256 perUser;
            0,                           // uint256 fungiblePerClaim;
            tagUid,                      // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.reverted;
      });

      it('should revert and not create tag when non-IERC4907-compliant asset is passed', async function () {
        const tagUid = 1001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            4,                                   // TagType tagType;
            this.exampleERC721Mintable.address, // address assetAddress;
            1,                                   // uint256 erc721TokenId;
            this.otherAddr,                      // address tagAuthority;
            1,                                   // uint256 totalSupply;
            0,                                   // uint256 perUser;
            0,                                   // uint256 fungiblePerClaim;
            tagUid,                              // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.reverted;
      });

      it('should revert when tag already existed and has even been claimed', async function () {
        const tagUid = 1001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            4,                           // TagType tagType;
            this.exampleERC4907.address, // address assetAddress;
            1,                           // uint256 erc721TokenId;
            this.otherAddr,              // address tagAuthority;
            1,                           // uint256 totalSupply;
            0,                           // uint256 perUser;
            0,                           // uint256 fungiblePerClaim;
            tagUid,                      // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;

        await expect(this.contract.connect(this.signer2).claimTag(
          this.owner, // address recipient
          tagUid,     // uint256 uid
          this.owner, // address bakeryAddress
          true,       // bool isNotErc1155
          0, // uint256 newTokenId
          KEY_HASH,   // bytes32 keyHash
          { from: this.otherAddr }
        )).to.be.not.reverted;

        await this.exampleERC4907.nftMint({ from: this.owner });
        await this.exampleERC4907.approve(this.contract.address, 2, { from: this.owner });

        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            4,                           // TagType tagType;
            this.exampleERC4907.address, // address assetAddress;
            2,                           // uint256 erc721TokenId;
            this.otherAddr,              // address tagAuthority;
            1,                           // uint256 totalSupply;
            0,                           // uint256 perUser;
            0,                           // uint256 fungiblePerClaim;
            tagUid,                      // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.reverted;
      });

      it('should create tag', async function () {
        const tagUid = 1001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            4,                           // TagType tagType;
            this.exampleERC4907.address, // address assetAddress;
            1,                           // uint256 erc721TokenId;
            this.otherAddr,              // address tagAuthority;
            1,                           // uint256 totalSupply;
            0,                           // uint256 perUser;
            0,                           // uint256 fungiblePerClaim;
            tagUid,                      // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.emit(this.contract, "TagCreationOrRefill").withArgs(
          this.owner,                  // address bakery
          4,                           // TagType tagType
          this.exampleERC4907.address, // address assetAddress
          1,                           // uint256 erc721TokenId
          this.otherAddr,              // address tagAuthority
          1,                           // uint256 totalSupply
          0,                           // uint256 perUser
          0,                           // uint256 fungiblePerClaim
          tagUid,                      // uint256 uid
          true                         // bool isNotErc1155
        );
        const tag = await this.contract.tags(hashUniqueTag(this.owner, tagUid));
        expect(tag.tagType).to.be.equal(4);
        expect(tag.assetAddress).to.be.equal(this.exampleERC4907.address);
        expect(tag.erc721TokenId).to.be.equal(1);
        expect(tag.tagAuthority).to.be.equal(this.otherAddr);
        expect(tag.totalSupply).to.be.equal(1);
        expect(tag.perUser).to.be.equal(0);
        expect(tag.fungiblePerClaim).to.be.equal(0);
        expect(tag.uid).to.be.equal(tagUid);
        expect(tag.numClaimed).to.be.equal(0);
        expect(tag.claimsMade).to.be.undefined;

        expect(await this.exampleERC4907.ownerOf(1)).to.be.equal(this.contract.address);
      });

      it('should create tag, ignoring passed values for totalSupply, perUser, and fungiblePerClaim', async function () {
        const tagUid = 1001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            4,                           // TagType tagType;
            this.exampleERC4907.address, // address assetAddress;
            1,                           // uint256 erc721TokenId;
            this.otherAddr,              // address tagAuthority;
            10,                          // uint256 totalSupply;
            2,                           // uint256 perUser;
            10,                          // uint256 fungiblePerClaim;
            tagUid,                      // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.emit(this.contract, "TagCreationOrRefill").withArgs(
          this.owner,                  // address bakery
          4,                           // TagType tagType
          this.exampleERC4907.address, // address indexed assetAddress
          1,                           // uint256 erc721TokenId
          this.otherAddr,              // address indexed tagAuthority
          1,                           // uint256 totalSupply
          0,                           // uint256 perUser
          0,                           // uint256 fungiblePerClaim
          tagUid,                      // uint256 indexed uid
          true                         // bool isNotErc1155
        );
        const tag = await this.contract.tags(hashUniqueTag(this.owner, tagUid));
        expect(tag.tagType).to.be.equal(4);
        expect(tag.assetAddress).to.be.equal(this.exampleERC4907.address);
        expect(tag.erc721TokenId).to.be.equal(1);
        expect(tag.tagAuthority).to.be.equal(this.otherAddr);
        expect(tag.totalSupply).to.be.equal(1);
        expect(tag.perUser).to.be.equal(0);
        expect(tag.fungiblePerClaim).to.be.equal(0);
        expect(tag.uid).to.be.equal(tagUid);
        expect(tag.numClaimed).to.be.equal(0);
        expect(tag.claimsMade).to.be.undefined;

        expect(await this.exampleERC4907.ownerOf(1)).to.be.equal(this.contract.address);
      });
    });

    describe('CandyMachineDrop', function () {
      it('should revert when perUser is set to zero', async function () {
        const tagUid = 1001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            5,                           // TagType tagType;
            NULL_ADDR,                   // address assetAddress;
            0,                           // uint256 erc721TokenId;
            this.otherAddr,              // address tagAuthority;
            0,                           // uint256 totalSupply;
            0,                           // uint256 perUser;
            0,                           // uint256 fungiblePerClaim;
            tagUid,                      // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          METADATA_URIS,   // string[] metadataURIs
          { from: this.owner }
        )).to.be.reverted;
      });

      it('should revert when perUser is greater than the number of metadataURIs provided', async function () {
        const tagUid = 1001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            5,                           // TagType tagType;
            NULL_ADDR,                   // address assetAddress;
            0,                           // uint256 erc721TokenId;
            this.otherAddr,              // address tagAuthority;
            0,                           // uint256 totalSupply;
            3,                           // uint256 perUser;
            0,                           // uint256 fungiblePerClaim;
            tagUid,                      // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          METADATA_URIS,   // string[] metadataURIs
          { from: this.owner }
        )).to.be.reverted;
      });

      it('should revert when tag is currently in use', async function () {
        const tagUid = 1001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            5,                           // TagType tagType;
            NULL_ADDR, // address assetAddress;
            0,                           // uint256 erc721TokenId;
            this.otherAddr,              // address tagAuthority;
            0,                           // uint256 totalSupply;
            1,                           // uint256 perUser;
            0,                           // uint256 fungiblePerClaim;
            tagUid,                      // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          ['https://google.com/', 'https://twitter.com/'],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;

        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            5,                           // TagType tagType;
            NULL_ADDR, // address assetAddress;
            0,                           // uint256 erc721TokenId;
            this.otherAddr,              // address tagAuthority;
            0,                           // uint256 totalSupply;
            1,                           // uint256 perUser;
            0,                           // uint256 fungiblePerClaim;
            tagUid,                      // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          METADATA_URIS,   // string[] metadataURIs
          { from: this.owner }
        )).to.be.reverted;
      });

      it('should revert when tag already existed and has even been claimed', async function () {
        const tagUid = 1001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            5,                           // TagType tagType;
            NULL_ADDR, // address assetAddress;
            0,                           // uint256 erc721TokenId;
            this.otherAddr,              // address tagAuthority;
            0,                           // uint256 totalSupply;
            1,                           // uint256 perUser;
            0,                           // uint256 fungiblePerClaim;
            tagUid,                      // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          METADATA_URIS,   // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;

        let candyMachine;
        await new Promise(async resolve => {
          this.candyMachineFactory.on("Creation", async (newCandyMachineAddr) => {
            candyMachine = await ethers.getContractAt('CandyMachine', newCandyMachineAddr);
            await this.hardhatVrfCoordinatorV2Mock.addConsumer(1, newCandyMachineAddr);
            resolve();
          });
        });

        await new Promise(async resolve => {
          expect(await this.contract.connect(this.signer2).claimTag(
            this.owner, // address recipient
            tagUid,     // uint256 uid
            this.owner, // address bakeryAddress
            true,       // bool isNotErc1155
            0, // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.be.not.reverted;
          await candyMachine.once("RandomWordsRequested", async _ => {
            const reqId = chainlinkReqNonce;
            chainlinkReqNonce++;
            expect(
              await this.hardhatVrfCoordinatorV2Mock.fulfillRandomWords(reqId, candyMachine.address)
            ).to.emit(this.hardhatVrfCoordinatorV2Mock, "RandomWordsFulfilled");
            resolve();
          });
        });

        await expect(this.contract.connect(this.signer).addOrRefillTag(
          [     // TagPassed passedTag
            5,                           // TagType tagType;
            NULL_ADDR, // address assetAddress;
            0,                           // uint256 erc721TokenId;
            this.otherAddr,              // address tagAuthority;
            0,                           // uint256 totalSupply;
            1,                           // uint256 perUser;
            0,                           // uint256 fungiblePerClaim;
            tagUid,                      // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          METADATA_URIS,   // string[] metadataURIs
          { from: this.owner }
        )).to.be.reverted;
      });

      it('should create tag', async function () {
        const tagUid = 1001;
        let newCandyMachine;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            5,                           // TagType tagType;
            NULL_ADDR, // address assetAddress;
            0,                           // uint256 erc721TokenId;
            this.otherAddr,              // address tagAuthority;
            0,                           // uint256 totalSupply;
            1,                           // uint256 perUser;
            0,                           // uint256 fungiblePerClaim;
            tagUid,                      // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          METADATA_URIS,   // string[] metadataURIs
          { from: this.owner }
        ));
        await new Promise(async resolve => {
          let count = 0;
          this.candyMachineFactory.on("Creation", newCandyMachineAddr => {
            newCandyMachine = newCandyMachineAddr;
            count++;
            if (count >= 2) {
              resolve();
            }
          });
          this.contract.on("TagCreationOrRefill", (
            bakery,
            tagType,
            assetAddress,
            erc721TokenId,
            tagAuthority,
            totalSupply,
            perUser,
            fungiblePerClaim,
            uid,
            isNotErc1155
          ) => {
            expect(bakery).to.be.equal(this.owner);            // address bakery
            expect(tagType).to.be.equal(5);                    // TagType tagType
            expect(assetAddress).to.be.equal(newCandyMachine); // address assetAddress
            expect(erc721TokenId).to.be.equal(0);              // uint256 erc721TokenId
            expect(tagAuthority).to.be.equal(this.otherAddr);  // address tagAuthority
            expect(totalSupply).to.be.equal(2);                // uint256 totalSupply
            expect(perUser).to.be.equal(1);                    // uint256 perUser
            expect(fungiblePerClaim).to.be.equal(0);           // uint256 fungiblePerClaim
            expect(uid).to.be.equal(tagUid);                   // uint256 uid
            expect(isNotErc1155).to.be.equal(true);            // bool isNotErc1155
            count++;
            if (count >= 2) {
              resolve();
            }
          });
        });
        const tag = await this.contract.tags(hashUniqueTag(this.owner, tagUid));
        expect(tag.tagType).to.be.equal(5);
        expect(tag.assetAddress).to.be.equal(newCandyMachine);
        expect(tag.erc721TokenId).to.be.equal(0);
        expect(tag.tagAuthority).to.be.equal(this.otherAddr);
        expect(tag.totalSupply).to.be.equal(2);
        expect(tag.perUser).to.be.equal(1);
        expect(tag.fungiblePerClaim).to.be.equal(0);
        expect(tag.uid).to.be.equal(tagUid);
        expect(tag.numClaimed).to.be.equal(0);
        expect(tag.claimsMade).to.be.undefined;
      });

      it('should create tag, ignoring passed values for assetAddress, erc721TokenId, totalSupply, and fungiblePerClaim', async function () {
        const tagUid = 1001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            5,                           // TagType tagType;
            NULL_ADDR, // address assetAddress;
            10,                           // uint256 erc721TokenId;
            this.otherAddr,              // address tagAuthority;
            10,                          // uint256 totalSupply;
            3,                           // uint256 perUser;
            10,                          // uint256 fungiblePerClaim;
            tagUid,                      // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          METADATA_URIS,   // string[] metadataURIs
          { from: this.owner }
        ));
        await new Promise(async resolve => {
          let count = 0;
          this.candyMachineFactory.on("Creation", newCandyMachineAddr => {
            newCandyMachine = newCandyMachineAddr;
            count++;
            if (count >= 2) {
              resolve();
            }
          });
          this.contract.on("TagCreationOrRefill", (
            bakery,
            tagType,
            assetAddress,
            erc721TokenId,
            tagAuthority,
            totalSupply,
            perUser,
            fungiblePerClaim,
            uid,
            isNotErc1155
          ) => {
            expect(bakery).to.be.equal(this.owner);            // address bakery
            expect(tagType).to.be.equal(5);                    // TagType tagType
            expect(assetAddress).to.be.equal(newCandyMachine); // address assetAddress
            expect(erc721TokenId).to.be.equal(0);              // uint256 erc721TokenId
            expect(tagAuthority).to.be.equal(this.otherAddr);  // address tagAuthority
            expect(totalSupply).to.be.equal(2);                // uint256 totalSupply
            expect(perUser).to.be.equal(3);                    // uint256 perUser
            expect(fungiblePerClaim).to.be.equal(0);           // uint256 fungiblePerClaim
            expect(uid).to.be.equal(tagUid);                   // uint256 uid
            expect(isNotErc1155).to.be.equal(true);            // bool isNotErc1155
            count++;
            if (count >= 2) {
              resolve();
            }
          });
        });
        const tag = await this.contract.tags(hashUniqueTag(this.owner, tagUid));
        expect(tag.tagType).to.be.equal(5);
        expect(tag.assetAddress).to.be.equal(newCandyMachine);
        expect(tag.erc721TokenId).to.be.equal(0);
        expect(tag.tagAuthority).to.be.equal(this.otherAddr);
        expect(tag.totalSupply).to.be.equal(2);
        expect(tag.perUser).to.be.equal(3);
        expect(tag.fungiblePerClaim).to.be.equal(0);
        expect(tag.uid).to.be.equal(tagUid);
        expect(tag.numClaimed).to.be.equal(0);
        expect(tag.claimsMade).to.be.undefined;
      });
    });
  });

  describe('claimTag', function () {
    beforeEach(async function () {
      this.candyMachineFactory = await upgrades.deployProxy(this.CandyMachineFactory, [], {
        initializer: "initialize",
        kind: "uups",
      });
      await this.candyMachineFactory.deployed();
      this.contract = await upgrades.deployProxy(this.Contract, [this.candyMachineFactory.address], {
        initializer: "initialize",
        kind: "uups",
      });

      this.exampleERC721Mintable = await upgrades.deployProxy(this.ExampleERC721Mintable, ['Wrapped Asset', 'TST']);
      await this.exampleERC721Mintable.deployed();
      await this.exampleERC721Mintable.mint(this.owner, 0, { from: this.owner });
      await this.exampleERC721Mintable.approve(this.contract.address, 0, { from: this.owner });

      this.exampleERC721Copyable = await upgrades.deployProxy(this.ExampleERC721Copyable, []);
      await this.exampleERC721Copyable.deployed();
      await this.exampleERC721Copyable.mint(this.owner, 0, { from: this.owner });
      await this.exampleERC721Copyable.approve(this.contract.address, 0, { from: this.owner });

      this.exampleERC1155Copyable = await upgrades.deployProxy(this.ExampleERC1155Copyable, []);
      await this.exampleERC1155Copyable.deployed();
      await this.exampleERC1155Copyable.mint(this.owner, 0, { from: this.owner });
      await this.exampleERC1155Copyable.setApprovalForAll(this.contract.address, true, { from: this.owner });

      this.exampleERC1155Mintable = await upgrades.deployProxy(this.ExampleERC1155Mintable, ['https://google.com/']);
      await this.exampleERC1155Mintable.deployed();
      await this.exampleERC1155Mintable.mint(this.owner, 0, 1, '0x00', { from: this.owner });
      await this.exampleERC1155Mintable.setApprovalForAll(this.contract.address, true, { from: this.owner });

      this.exampleERC20Mintable = await upgrades.deployProxy(this.ExampleERC20Mintable, ['Fungible Asset', 'FNA']);
      await this.exampleERC20Mintable.deployed();
      await this.exampleERC20Mintable.mint(this.owner, 75000000, { from: this.owner });
      await this.exampleERC20Mintable.approve(this.contract.address, 75000000, { from: this.owner });

      this.exampleERC4907 = await upgrades.deployProxy(this.ExampleERC4907, []);
      await this.exampleERC4907.deployed();
      await this.exampleERC4907.nftMint({ from: this.owner });
      await this.exampleERC4907.approve(this.contract.address, 1, { from: this.owner });
    });

    describe('LimitedOrOpenEdition', function () {
      beforeEach(async function () {
        this.tagUid_721 = 1001;
        this.tagUid_1155 = 2001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            0,                                  // TagType tagType;
            this.exampleERC721Copyable.address, // address assetAddress;
            0,                                  // uint256 erc721TokenId;
            this.otherAddr,                     // address tagAuthority;
            3,                                  // uint256 totalSupply;
            2,                                  // uint256 perUser;
            0,                                  // uint256 fungiblePerClaim;
            this.tagUid_721,                    // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;
        await expect(this.contract.addOrRefillTag(
          [      // TagPassed passedTag
            0,                                   // TagType tagType;
            this.exampleERC1155Copyable.address, // address assetAddress;
            0,                                   // uint256 erc721TokenId;
            this.otherAddr,                      // address tagAuthority;
            3,                                   // uint256 totalSupply;
            2,                                   // uint256 perUser;
            0,                                   // uint256 fungiblePerClaim;
            this.tagUid_1155,                    // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          false, // bool isNotErc1155
          [],    // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;
      });

      it('should revert when totalSupply is zero', async function () {
        await expect(this.contract.connect(this.signer).cancelAndEmpty(
          this.tagUid_721, // uint256 uid
          true,   // bool isNotErc1155
          { from: this.owner }
        )).to.be.not.reverted;
        await expect(this.contract.connect(this.signer2).claimTag(
          this.owner,      // address recipient,
          this.tagUid_721,     // uint256 uid,
          this.owner,      // address bakeryAddress,
          true,            // bool isNotErc1155,
          1, // uint256 newTokenId
          KEY_HASH,   // bytes32 keyHash
          { from: this.otherAddr }
        )).to.be.reverted;
      });

      it('should revert when non-tagAuthority signer sends transaction', async function () {
        await expect(this.contract.connect(this.signer).claimTag(
          this.owner,      // address recipient,
          this.tagUid_721,     // uint256 uid,
          this.owner,      // address bakeryAddress,
          true,            // bool isNotErc1155,
          1, // uint256 newTokenId
          KEY_HASH,   // bytes32 keyHash
          { from: this.owner }
        )).to.be.reverted;
      });

      it('should revert when the numClaimed equals totalSupply', async function () {
        for (let i = 0; i < 2; i++) {
          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner,      // address recipient,
            this.tagUid_721,     // uint256 uid,
            this.owner,      // address bakeryAddress,
            true,            // bool isNotErc1155,
            i + 1, // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.be.not.reverted;
        }
        await expect(this.contract.connect(this.signer2).claimTag(
          this.otherAddr,  // address recipient,
          this.tagUid_721,     // uint256 uid,
          this.owner,      // address bakeryAddress,
          true,            // bool isNotErc1155,
          3, // uint256 newTokenId
          KEY_HASH,   // bytes32 keyHash
          { from: this.otherAddr }
        )).to.be.not.reverted;
        await expect(this.contract.connect(this.signer2).claimTag(
          this.otherAddr,      // address recipient,
          this.tagUid_721,     // uint256 uid,
          this.owner,      // address bakeryAddress,
          true,            // bool isNotErc1155,
          4, // uint256 newTokenId
          KEY_HASH,   // bytes32 keyHash
          { from: this.otherAddr }
        )).to.be.reverted;
      });

      it('should revert when the claimsMade for a specified recipient equals perUser', async function () {
        for (let i = 0; i < 2; i++) {
          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner,      // address recipient,
            this.tagUid_721,     // uint256 uid,
            this.owner,      // address bakeryAddress,
            true,            // bool isNotErc1155,
            i + 1, // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.be.not.reverted;
        }
        await expect(this.contract.connect(this.signer2).claimTag(
          this.owner,      // address recipient,
          this.tagUid_721,     // uint256 uid,
          this.owner,      // address bakeryAddress,
          true,            // bool isNotErc1155,
          3, // uint256 newTokenId
          KEY_HASH,   // bytes32 keyHash
          { from: this.otherAddr }
        )).to.be.reverted;
      });

      it('should revert when newTokenId equals existing tokenId', async function () {
        await expect(this.contract.connect(this.signer2).claimTag(
          this.owner,      // address recipient,
          this.tagUid_721, // uint256 uid,
          this.owner,      // address bakeryAddress,
          true,            // bool isNotErc1155,
          0, // uint256 newTokenId
          KEY_HASH,   // bytes32 keyHash
          { from: this.otherAddr }
        )).to.be.reverted;
      });

      describe('ERC-721', function () {
        it('should claim tag', async function () {
          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner,          // address recipient,
            this.tagUid_721,     // uint256 uid,
            this.owner,          // address bakeryAddress,
            true,                // bool isNotErc1155,
            1, // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.emit(this.contract, "TagClaim").withArgs(
            this.otherAddr, // address tagAuthority
            this.owner, // address recipient
            this.exampleERC721Copyable.address, // address assetAddress
            0, // uint256 erc721TokenId
            0, // uint256 fungiblePerClaim
            this.tagUid_721, // uint256 uid
            true // bool isNotErc1155
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, this.tagUid_721));
          expect(tag.numClaimed).to.be.equal(1);
          expect(await this.contract.getClaimsMade(this.owner, this.tagUid_721, this.owner)).to.be.equal(1);
          expect(await this.exampleERC721Copyable.ownerOf(0)).to.be.equal(this.contract.address);
          expect(await this.exampleERC721Copyable.ownerOf(1)).to.be.equal(this.owner);
        });
      });

      describe('ERC-1155', function () {
        it('should claim tag', async function () {
          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner,          // address recipient,
            this.tagUid_1155,    // uint256 uid,
            this.owner,          // address bakeryAddress,
            false,                // bool isNotErc1155,
            1, // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.emit(this.contract, "TagClaim").withArgs(
            this.otherAddr, // address tagAuthority
            this.owner, // address recipient
            this.exampleERC1155Copyable.address, // address assetAddress
            0, // uint256 erc721TokenId
            0, // uint256 fungiblePerClaim
            this.tagUid_1155, // uint256 uid
            false // bool isNotErc1155
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, this.tagUid_1155));
          expect(await this.contract.getClaimsMade(this.owner, this.tagUid_1155, this.owner)).to.be.equal(1);
          expect(await this.exampleERC1155Copyable.balanceOf(this.contract.address, 0)).to.be.equal(1);
          expect(await this.exampleERC1155Copyable.balanceOf(this.owner, 1)).to.be.equal(1);
        });
      });
    });
    
    describe('SingleUse1Of1', function () {
      beforeEach(async function () {
        this.tagUid_721 = 1001;
        this.tagUid_1155 = 2001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            1,                                  // TagType tagType;
            this.exampleERC721Mintable.address, // address assetAddress;
            0,                                  // uint256 erc721TokenId;
            this.otherAddr,                     // address tagAuthority;
            1,                                  // uint256 totalSupply;
            1,                                  // uint256 perUser;
            0,                                  // uint256 fungiblePerClaim;
            this.tagUid_721,                    // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;
        await expect(this.contract.addOrRefillTag(
          [      // TagPassed passedTag
            1,                                   // TagType tagType;
            this.exampleERC1155Mintable.address, // address assetAddress;
            0,                                   // uint256 erc721TokenId;
            this.otherAddr,                      // address tagAuthority;
            1,                                   // uint256 totalSupply;
            1,                                   // uint256 perUser;
            0,                                   // uint256 fungiblePerClaim;
            this.tagUid_1155,                    // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          false, // bool isNotErc1155
          [],    // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;
      });

      it('should revert when totalSupply is zero', async function () {
        await expect(this.contract.connect(this.signer).cancelAndEmpty(
          this.tagUid_721, // uint256 uid
          true,   // bool isNotErc1155
          { from: this.owner }
        )).to.be.not.reverted;
        await expect(this.contract.connect(this.signer2).claimTag(
          this.owner,      // address recipient,
          this.tagUid_721, // uint256 uid,
          this.owner,      // address bakeryAddress,
          true,            // bool isNotErc1155,
          0,               // uint256 newTokenId
          KEY_HASH,   // bytes32 keyHash
          { from: this.otherAddr }
        )).to.be.reverted;
      });

      it('should revert when non-tagAuthority signer sends transaction', async function () {
        await expect(this.contract.connect(this.signer).claimTag(
          this.owner,      // address recipient,
          this.tagUid_721, // uint256 uid,
          this.owner,      // address bakeryAddress,
          true,            // bool isNotErc1155,
          0,               // uint256 newTokenId
          KEY_HASH,   // bytes32 keyHash
          { from: this.owner }
        )).to.be.reverted;
      });

      it('should revert when the numClaimed equals totalSupply / when the claimsMade for a specified recipient equals perUser', async function () {
        await expect(this.contract.connect(this.signer2).claimTag(
            this.otherAddr,  // address recipient,
            this.tagUid_721, // uint256 uid,
            this.owner,      // address bakeryAddress,
            true,            // bool isNotErc1155,
            0,               // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.be.not.reverted;
        await expect(this.contract.connect(this.signer2).claimTag(
          this.owner,      // address recipient,
          this.tagUid_721, // uint256 uid,
          this.owner,      // address bakeryAddress,
          true,            // bool isNotErc1155,
          0,               // uint256 newTokenId
          KEY_HASH,   // bytes32 keyHash
          { from: this.otherAddr }
        )).to.be.reverted;
      });

      describe('ERC-721', function () {
        it('should claim tag', async function () {
          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner,      // address recipient,
            this.tagUid_721, // uint256 uid,
            this.owner,      // address bakeryAddress,
            true,            // bool isNotErc1155,
            0,               // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.emit(this.contract, "TagClaim").withArgs(
            this.otherAddr, // address tagAuthority
            this.owner, // address recipient
            this.exampleERC721Mintable.address, // address assetAddress
            0, // uint256 erc721TokenId
            0, // uint256 fungiblePerClaim
            this.tagUid_721, // uint256 uid
            true // bool isNotErc1155
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, this.tagUid_721));
          expect(tag.numClaimed).to.be.equal(1);
          expect(await this.contract.getClaimsMade(this.owner, this.tagUid_721, this.owner)).to.be.equal(1);
          expect(await this.exampleERC721Mintable.ownerOf(0)).to.be.equal(this.owner);
        });
      });

      describe('ERC-1155', function () {
        it('should claim tag', async function () {
          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner,       // address recipient,
            this.tagUid_1155, // uint256 uid,
            this.owner,       // address bakeryAddress,
            false,            // bool isNotErc1155,
            0,                // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.emit(this.contract, "TagClaim").withArgs(
            this.otherAddr, // address tagAuthority
            this.owner, // address recipient
            this.exampleERC1155Mintable.address, // address assetAddress
            0, // uint256 erc721TokenId
            0, // uint256 fungiblePerClaim
            this.tagUid_1155, // uint256 uid
            false // bool isNotErc1155
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, this.tagUid_1155));
          expect(await this.contract.getClaimsMade(this.owner, this.tagUid_1155, this.owner)).to.be.equal(1);
          expect(await this.exampleERC1155Mintable.balanceOf(this.owner, 0)).to.be.gte(1);
        });
      });
    });
    
    describe('Refillable1Of1', function () {
      beforeEach(async function () {
        this.tagUid_721 = 1001;
        this.tagUid_1155 = 2001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            2,                                  // TagType tagType;
            this.exampleERC721Mintable.address, // address assetAddress;
            0,                                  // uint256 erc721TokenId;
            this.otherAddr,                     // address tagAuthority;
            1,                                  // uint256 totalSupply;
            1,                                  // uint256 perUser;
            0,                                  // uint256 fungiblePerClaim;
            this.tagUid_721,                    // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;
        await expect(this.contract.addOrRefillTag(
          [      // TagPassed passedTag
            2,                                   // TagType tagType;
            this.exampleERC1155Mintable.address, // address assetAddress;
            0,                                   // uint256 erc721TokenId;
            this.otherAddr,                      // address tagAuthority;
            1,                                   // uint256 totalSupply;
            1,                                   // uint256 perUser;
            0,                                   // uint256 fungiblePerClaim;
            this.tagUid_1155,                    // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          false, // bool isNotErc1155
          [],    // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;
      });

      it('should revert when non-tagAuthority signer sends transaction', async function () {
        await expect(this.contract.connect(this.signer).claimTag(
          this.owner,      // address recipient,
          this.tagUid_721, // uint256 uid,
          this.owner,      // address bakeryAddress,
          true,            // bool isNotErc1155,
          0,               // uint256 newTokenId
          KEY_HASH,   // bytes32 keyHash
          { from: this.owner }
        )).to.be.reverted;
      });

      describe('ERC-721', function () {
        it('should revert if tag has been claimed and not refilled yet', async function () {
          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner,      // address recipient,
            this.tagUid_721, // uint256 uid,
            this.owner,      // address bakeryAddress,
            true,            // bool isNotErc1155,
            0,               // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.not.be.reverted;

          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner,      // address recipient,
            this.tagUid_721, // uint256 uid,
            this.owner,      // address bakeryAddress,
            true,            // bool isNotErc1155,
            0,               // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.be.reverted;
          const tag = await this.contract.tags(hashUniqueTag(this.owner, this.tagUid_721));
          expect(tag.numClaimed).to.be.equal(1);
          expect(await this.contract.getClaimsMade(this.owner, this.tagUid_721, this.owner)).to.be.equal(1);
          expect(await this.exampleERC721Mintable.ownerOf(0)).to.be.equal(this.owner);
        });

        it('should claim tag', async function () {
          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner,      // address recipient,
            this.tagUid_721, // uint256 uid,
            this.owner,      // address bakeryAddress,
            true,            // bool isNotErc1155,
            0,               // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.emit(this.contract, "TagClaim").withArgs(
            this.otherAddr, // address tagAuthority
            this.owner, // address recipient
            this.exampleERC721Mintable.address, // address assetAddress
            0, // uint256 erc721TokenId
            0, // uint256 fungiblePerClaim
            this.tagUid_721, // uint256 uid
            true // bool isNotErc1155
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, this.tagUid_721));
          expect(tag.numClaimed).to.be.equal(1);
          expect(await this.contract.getClaimsMade(this.owner, this.tagUid_721, this.owner)).to.be.equal(1);
          expect(await this.exampleERC721Mintable.ownerOf(0)).to.be.equal(this.owner);
        });

        it('should create refill tag after a claim', async function () {
          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner,      // address recipient,
            this.tagUid_721, // uint256 uid,
            this.owner,      // address bakeryAddress,
            true,            // bool isNotErc1155,
            0,               // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.not.be.reverted;

          await this.exampleERC721Mintable.approve(this.contract.address, 0, { from: this.owner });
          await expect(this.contract.addOrRefillTag(
            [     // TagPassed passedTag
              2,                                  // TagType tagType;
              this.exampleERC721Mintable.address, // address assetAddress;
              0,                                  // uint256 erc721TokenId;
              this.otherAddr,                     // address tagAuthority;
              1,                                  // uint256 totalSupply;
              1,                                  // uint256 perUser;
              0,                                  // uint256 fungiblePerClaim;
              this.tagUid_721,                    // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            true, // bool isNotErc1155
            [],   // string[] metadataURIs
            { from: this.owner }
          )).to.be.not.reverted;

          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner,      // address recipient,
            this.tagUid_721, // uint256 uid,
            this.owner,      // address bakeryAddress,
            true,            // bool isNotErc1155,
            0,               // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.emit(this.contract, "TagClaim").withArgs(
            this.otherAddr, // address tagAuthority
            this.owner, // address recipient
            this.exampleERC721Mintable.address, // address assetAddress
            0, // uint256 erc721TokenId
            0, // uint256 fungiblePerClaim
            this.tagUid_721, // uint256 uid
            true // bool isNotErc1155
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, this.tagUid_721));
          expect(tag.numClaimed).to.be.equal(1);
          expect(await this.contract.getClaimsMade(this.owner, this.tagUid_721, this.owner)).to.be.equal(2);
          expect(await this.exampleERC721Mintable.ownerOf(0)).to.be.equal(this.owner);
        });
      });

      describe('ERC-1155', function () {
        it('should revert if tag has been claimed and not refilled yet', async function () {
          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner,      // address recipient,
            this.tagUid_1155, // uint256 uid,
            this.owner,      // address bakeryAddress,
            false,            // bool isNotErc1155,
            0,               // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.not.be.reverted;

          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner,      // address recipient,
            this.tagUid_1155, // uint256 uid,
            this.owner,      // address bakeryAddress,
            false,            // bool isNotErc1155,
            0,               // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.be.reverted;
          const tag = await this.contract.tags(hashUniqueTag(this.owner, this.tagUid_1155));
          expect(tag.numClaimed).to.be.equal(1);
          expect(await this.contract.getClaimsMade(this.owner, this.tagUid_1155, this.owner)).to.be.equal(1);
          expect(await this.exampleERC1155Mintable.balanceOf(this.owner, 0)).to.be.equal(1);
        });

        it('should claim tag', async function () {
          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner,       // address recipient,
            this.tagUid_1155, // uint256 uid,
            this.owner,       // address bakeryAddress,
            false,            // bool isNotErc1155,
            0,                // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.emit(this.contract, "TagClaim").withArgs(
            this.otherAddr, // address tagAuthority
            this.owner, // address recipient
            this.exampleERC1155Mintable.address, // address assetAddress
            0, // uint256 erc721TokenId
            0, // uint256 fungiblePerClaim
            this.tagUid_1155, // uint256 uid
            false // bool isNotErc1155
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, this.tagUid_1155));
          expect(await this.contract.getClaimsMade(this.owner, this.tagUid_1155, this.owner)).to.be.equal(1);
          expect(await this.exampleERC1155Mintable.balanceOf(this.owner, 0)).to.be.gte(1);
        });

        it('should create refill tag after a claim', async function () {
          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner,      // address recipient,
            this.tagUid_1155, // uint256 uid,
            this.owner,      // address bakeryAddress,
            false,            // bool isNotErc1155,
            0,               // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.not.be.reverted;

          await this.exampleERC1155Mintable.setApprovalForAll(this.contract.address, true, { from: this.owner });
          await expect(this.contract.addOrRefillTag(
            [      // TagPassed passedTag
              2,                                   // TagType tagType;
              this.exampleERC1155Mintable.address, // address assetAddress;
              0,                                   // uint256 erc721TokenId;
              this.otherAddr,                      // address tagAuthority;
              1,                                   // uint256 totalSupply;
              1,                                   // uint256 perUser;
              0,                                   // uint256 fungiblePerClaim;
              this.tagUid_1155,                    // uint256 uid;
              1,                                  // uint64 subscriptionId;
              this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
            ],
            false, // bool isNotErc1155
            [],    // string[] metadataURIs
            { from: this.owner }
          )).to.be.not.reverted;

          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner,      // address recipient,
            this.tagUid_1155, // uint256 uid,
            this.owner,      // address bakeryAddress,
            false,            // bool isNotErc1155,
            0,               // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.emit(this.contract, "TagClaim").withArgs(
            this.otherAddr, // address tagAuthority
            this.owner, // address recipient
            this.exampleERC1155Mintable.address, // address assetAddress
            0, // uint256 erc721TokenId
            0, // uint256 fungiblePerClaim
            this.tagUid_1155, // uint256 uid
            false // bool isNotErc1155
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, this.tagUid_1155));
          expect(tag.numClaimed).to.be.equal(1);
          expect(await this.contract.getClaimsMade(this.owner, this.tagUid_1155, this.owner)).to.be.equal(2);
          expect(await this.exampleERC1155Mintable.balanceOf(this.owner, 0)).to.be.equal(1);
        });
      });
    });

    describe('WalletRestrictedFungible', function () {
      beforeEach(async function () {
        this.tagUid_20 = 1001;
        this.tagUid_1155 = 2001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            3,                                 // TagType tagType;
            this.exampleERC20Mintable.address, // address assetAddress;
            0,                                 // uint256 erc721TokenId;
            this.otherAddr,                    // address tagAuthority;
            75000000,                          // uint256 totalSupply;
            50000000,                          // uint256 perUser;
            25000000,                          // uint256 fungiblePerClaim;
            this.tagUid_20,                     // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;
        await this.exampleERC1155Mintable.mint(this.owner, 0, 74999999, '0x00', { from: this.owner });
        await this.exampleERC1155Mintable.setApprovalForAll(this.contract.address, true, { from: this.owner });
        await expect(this.contract.addOrRefillTag(
          [      // TagPassed passedTag
            3,                                   // TagType tagType;
            this.exampleERC1155Mintable.address, // address assetAddress;
            0,                                   // uint256 erc721TokenId;
            this.otherAddr,                      // address tagAuthority;
            75000000,                            // uint256 totalSupply;
            50000000,                            // uint256 perUser;
            25000000,                            // uint256 fungiblePerClaim;
            this.tagUid_1155,                    // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          false, // bool isNotErc1155
          [],    // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;
      });

      it('should revert when totalSupply is zero', async function () {
        await expect(this.contract.connect(this.signer).cancelAndEmpty(
          this.tagUid_20, // uint256 uid
          true,   // bool isNotErc1155
          { from: this.owner }
        )).to.be.not.reverted;
        await expect(this.contract.connect(this.signer2).claimTag(
          this.owner,      // address recipient,
          this.tagUid_20, // uint256 uid,
          this.owner,      // address bakeryAddress,
          true,            // bool isNotErc1155,
          0,               // uint256 newTokenId
          KEY_HASH,   // bytes32 keyHash
          { from: this.otherAddr }
        )).to.be.reverted;
      });

      it('should revert when non-tagAuthority signer sends transaction', async function () {
        await expect(this.contract.connect(this.signer).claimTag(
          this.owner,      // address recipient,
          this.tagUid_20, // uint256 uid,
          this.owner,      // address bakeryAddress,
          true,            // bool isNotErc1155,
          0,               // uint256 newTokenId
          KEY_HASH,   // bytes32 keyHash
          { from: this.owner }
        )).to.be.reverted;
      });

      it('should revert when the numClaimed equals totalSupply', async function () {
        for (let i = 0; i < 2; i++) {
          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner,      // address recipient,
            this.tagUid_20,     // uint256 uid,
            this.owner,      // address bakeryAddress,
            true,            // bool isNotErc1155,
            0, // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.be.not.reverted;
        }
        await expect(this.contract.connect(this.signer2).claimTag(
          this.otherAddr,  // address recipient,
          this.tagUid_20, // uint256 uid,
          this.owner,      // address bakeryAddress,
          true,            // bool isNotErc1155,
          0,               // uint256 newTokenId
          KEY_HASH,   // bytes32 keyHash
          { from: this.otherAddr }
        )).to.be.not.reverted;
        await expect(this.contract.connect(this.signer2).claimTag(
          this.otherAddr, // address recipient,
          this.tagUid_20, // uint256 uid,
          this.owner,      // address bakeryAddress,
          true,            // bool isNotErc1155,
          0,               // uint256 newTokenId
          KEY_HASH,   // bytes32 keyHash
          { from: this.otherAddr }
        )).to.be.reverted;
        const tag = await this.contract.tags(hashUniqueTag(this.owner, this.tagUid_20));
        expect(tag.numClaimed).to.be.equal(75000000);
        expect(await this.contract.getClaimsMade(this.owner, this.tagUid_20, this.owner)).to.be.equal(50000000);
        expect(await this.contract.getClaimsMade(this.owner, this.tagUid_20, this.otherAddr)).to.be.equal(25000000);
        expect(await this.exampleERC20Mintable.balanceOf(this.owner)).to.be.equal(50000000);
        expect(await this.exampleERC20Mintable.balanceOf(this.otherAddr)).to.be.equal(25000000);
        expect(await this.exampleERC20Mintable.balanceOf(this.contract.address)).to.be.equal(0);
      });

      it('should revert when the claimsMade for a specified recipient equals perUser', async function () {
        for (let i = 0; i < 2; i++) {
          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner,      // address recipient,
            this.tagUid_20,     // uint256 uid,
            this.owner,      // address bakeryAddress,
            true,            // bool isNotErc1155,
            0, // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.be.not.reverted;
        }
        await expect(this.contract.connect(this.signer2).claimTag(
          this.owner,      // address recipient,
          this.tagUid_20,     // uint256 uid,
          this.owner,      // address bakeryAddress,
          true,            // bool isNotErc1155,
          0, // uint256 newTokenId
          KEY_HASH,   // bytes32 keyHash
          { from: this.otherAddr }
        )).to.be.reverted;
        const tag = await this.contract.tags(hashUniqueTag(this.owner, this.tagUid_20));
        expect(tag.numClaimed).to.be.equal(50000000);
        expect(await this.contract.getClaimsMade(this.owner, this.tagUid_20, this.owner)).to.be.equal(50000000);
        expect(await this.exampleERC20Mintable.balanceOf(this.owner)).to.be.equal(50000000);
        expect(await this.exampleERC20Mintable.balanceOf(this.contract.address)).to.be.equal(25000000);
      });

      describe('ERC-20', function () {
        it('should claim tag', async function () {
          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner,      // address recipient,
            this.tagUid_20, // uint256 uid,
            this.owner,      // address bakeryAddress,
            true,            // bool isNotErc1155,
            0,               // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.emit(this.contract, "TagClaim").withArgs(
            this.otherAddr, // address tagAuthority
            this.owner, // address recipient
            this.exampleERC20Mintable.address, // address assetAddress
            0, // uint256 erc721TokenId
            25000000, // uint256 fungiblePerClaim
            this.tagUid_20, // uint256 uid
            true // bool isNotErc1155
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, this.tagUid_20));
          expect(tag.numClaimed).to.be.equal(25000000);
          expect(await this.contract.getClaimsMade(this.owner, this.tagUid_20, this.owner)).to.be.equal(25000000);
          expect(await this.exampleERC20Mintable.balanceOf(this.owner)).to.be.equal(25000000);
          expect(await this.exampleERC20Mintable.balanceOf(this.contract.address)).to.be.equal(50000000);
        });
      });

      describe('ERC-1155', function () {
        it('should claim tag', async function () {
          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner,       // address recipient,
            this.tagUid_1155, // uint256 uid,
            this.owner,       // address bakeryAddress,
            false,            // bool isNotErc1155,
            0,                // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.emit(this.contract, "TagClaim").withArgs(
            this.otherAddr, // address tagAuthority
            this.owner, // address recipient
            this.exampleERC1155Mintable.address, // address assetAddress
            0, // uint256 erc721TokenId
            25000000, // uint256 fungiblePerClaim
            this.tagUid_1155, // uint256 uid
            false // bool isNotErc1155
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, this.tagUid_1155));
          expect(tag.numClaimed).to.be.equal(25000000);
          expect(await this.contract.getClaimsMade(this.owner, this.tagUid_1155, this.owner)).to.be.equal(25000000);
          expect(await this.exampleERC1155Mintable.balanceOf(this.owner, 0)).to.be.equal(25000000);
          expect(await this.exampleERC1155Mintable.balanceOf(this.contract.address, 0)).to.be.equal(50000000);
        });
      });
    });

    describe('HotPotato', function () {
      beforeEach(async function () {
        this.tagUid_4907 = 1001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            4,                                  // TagType tagType;
            this.exampleERC4907.address, // address assetAddress;
            1,                                  // uint256 erc721TokenId;
            this.otherAddr,                     // address tagAuthority;
            1,                                  // uint256 totalSupply;
            1,                                  // uint256 perUser;
            0,                                  // uint256 fungiblePerClaim;
            this.tagUid_4907,                   // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;
      });

      it('should revert when non-tagAuthority signer sends transaction', async function () {
        await expect(this.contract.connect(this.signer).claimTag(
          this.owner,      // address recipient,
          this.tagUid_4907, // uint256 uid,
          this.owner,      // address bakeryAddress,
          true,            // bool isNotErc1155,
          0,               // uint256 newTokenId
          KEY_HASH,   // bytes32 keyHash
          { from: this.owner }
        )).to.be.reverted;
      });

      it('should claim tag', async function () {
        expect(await this.exampleERC4907.userOf(1)).to.be.equal(NULL_ADDR);
        await expect(this.contract.connect(this.signer2).claimTag(
          this.owner,      // address recipient,
          this.tagUid_4907, // uint256 uid,
          this.owner,      // address bakeryAddress,
          true,            // bool isNotErc1155,
          0,               // uint256 newTokenId
          KEY_HASH,   // bytes32 keyHash
          { from: this.otherAddr }
        )).to.emit(this.contract, "TagClaim").withArgs(
          this.otherAddr, // address tagAuthority
          this.owner, // address recipient
          this.exampleERC4907.address, // address assetAddress
          1, // uint256 erc721TokenId
          0, // uint256 fungiblePerClaim
          this.tagUid_4907, // uint256 uid
          true // bool isNotErc1155
        );
        const tag = await this.contract.tags(hashUniqueTag(this.owner, this.tagUid_4907));
        expect(tag.numClaimed).to.be.equal(1);
        expect(await this.contract.getClaimsMade(this.owner, this.tagUid_4907, this.owner)).to.be.equal(1);
        expect(await this.exampleERC4907.ownerOf(1)).to.be.equal(this.contract.address);
        expect(await this.exampleERC4907.userOf(1)).to.be.equal(this.owner);
      });
    });

    describe('CandyMachineDrop', function () {
      let candyMachine;
      beforeEach(async function () {
        this.tagUid_721 = 1001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            5,                                  // TagType tagType;
            NULL_ADDR, // address assetAddress;
            0,                                  // uint256 erc721TokenId;
            this.otherAddr,                     // address tagAuthority;
            1,                                  // uint256 totalSupply;
            2,                                  // uint256 perUser;
            0,                                  // uint256 fungiblePerClaim;
            this.tagUid_721,                    // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          METADATA_URIS.concat(['https://facebook.com/']),   // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;
        await new Promise(async resolve => {
          this.candyMachineFactory.on("Creation", async newCandyMachineAddr => {
            candyMachine = await ethers.getContractAt('CandyMachine', newCandyMachineAddr);
            await this.hardhatVrfCoordinatorV2Mock.addConsumer(1, newCandyMachineAddr);
            resolve();
          });
        });
      });

      it('should revert when non-tagAuthority signer sends transaction', async function () {
        await expect(this.contract.connect(this.signer).claimTag(
          this.owner,      // address recipient,
          this.tagUid_721, // uint256 uid,
          this.owner,      // address bakeryAddress,
          true,            // bool isNotErc1155,
          0,               // uint256 newTokenId
          KEY_HASH,   // bytes32 keyHash
          { from: this.owner }
        )).to.be.reverted;
      });

      it('should revert if tag has been depleted', async function () {
        let count = 0;
        for (var i = 0; i < 4; i++) {
          await new Promise(async resolve => {
            if (i < 2) {
              await expect(this.contract.connect(this.signer2).claimTag(
                this.otherAddr,  // address recipient,
                this.tagUid_721, // uint256 uid,
                this.owner,      // address bakeryAddress,
                true,            // bool isNotErc1155,
                0,               // uint256 newTokenId
                KEY_HASH,   // bytes32 keyHash
                { from: this.otherAddr }
              )).to.not.be.reverted;
            } else if (i == 2) {
              await expect(this.contract.connect(this.signer2).claimTag(
                this.owner,      // address recipient,
                this.tagUid_721, // uint256 uid,
                this.owner,      // address bakeryAddress,
                true,            // bool isNotErc1155,
                0,               // uint256 newTokenId
                KEY_HASH,   // bytes32 keyHash
                { from: this.otherAddr }
              )).to.not.be.reverted;
            } else {
              await expect(this.contract.connect(this.signer2).claimTag(
                this.owner,      // address recipient,
                this.tagUid_721, // uint256 uid,
                this.owner,      // address bakeryAddress,
                true,            // bool isNotErc1155,
                0,               // uint256 newTokenId
                KEY_HASH,   // bytes32 keyHash
                { from: this.otherAddr }
              )).to.be.reverted;
              const tag = await this.contract.tags(hashUniqueTag(this.owner, this.tagUid_721));
              expect(tag.numClaimed).to.be.equal(3);
              expect(await this.contract.getClaimsMade(this.owner, this.tagUid_721, this.owner)).to.be.equal(1);
              expect(await this.contract.getClaimsMade(this.owner, this.tagUid_721, this.otherAddr)).to.be.equal(2);
              expect(await this.exampleERC721Mintable.ownerOf(0)).to.be.equal(this.owner);
              expect(await candyMachine.balanceOf(this.otherAddr, 0)).to.be.equal(1);
              expect(await candyMachine.balanceOf(this.otherAddr, 1)).to.be.equal(1);
              expect(await candyMachine.balanceOf(this.owner, 2)).to.be.equal(1);
              resolve();
            }
            await candyMachine.once("RandomWordsRequested", async reqId => {
              expect(
                await this.hardhatVrfCoordinatorV2Mock.fulfillRandomWords(reqId, candyMachine.address)
              ).to.emit(this.candyMachine, "RandomWordsFulfilled");
              resolve();
            });
          });
        }
      });

      it('should claim tag', async function () {
        await new Promise(async resolve => {
          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner,      // address recipient,
            this.tagUid_721, // uint256 uid,
            this.owner,      // address bakeryAddress,
            true,            // bool isNotErc1155,
            0,               // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.emit(this.contract, "TagClaim").withArgs(
            this.otherAddr, // address tagAuthority
            this.owner, // address recipient
            candyMachine.address, // address assetAddress
            0, // uint256 erc721TokenId
            0, // uint256 fungiblePerClaim
            this.tagUid_721, // uint256 uid
            true // bool isNotErc1155
          );
          await candyMachine.once("RandomWordsRequested", async reqId => {
            expect(
              await this.hardhatVrfCoordinatorV2Mock.fulfillRandomWords(reqId, candyMachine.address)
            ).to.emit(this.candyMachine, "RandomWordsFulfilled");
            const tag = await this.contract.tags(hashUniqueTag(this.owner, this.tagUid_721));
            expect(tag.numClaimed).to.be.equal(1);
            expect(await this.contract.getClaimsMade(this.owner, this.tagUid_721, this.owner)).to.be.equal(1);
            expect(await candyMachine.balanceOf(this.owner, 0)).to.be.equal(1);
            resolve();
          });
        });
      });
    });
  });

  describe('cancelAndEmpty', function () {
    beforeEach(async function () {
      this.candyMachineFactory = await upgrades.deployProxy(this.CandyMachineFactory, [], {
        initializer: "initialize",
        kind: "uups",
      });
      await this.candyMachineFactory.deployed();
      this.contract = await upgrades.deployProxy(this.Contract, [this.candyMachineFactory.address], {
        initializer: "initialize",
        kind: "uups",
      });

      this.exampleERC721Mintable = await upgrades.deployProxy(this.ExampleERC721Mintable, ['Wrapped Asset', 'TST']);
      await this.exampleERC721Mintable.deployed();
      await this.exampleERC721Mintable.mint(this.owner, 0, { from: this.owner });
      await this.exampleERC721Mintable.approve(this.contract.address, 0, { from: this.owner });

      this.exampleERC721Copyable = await upgrades.deployProxy(this.ExampleERC721Copyable, []);
      await this.exampleERC721Copyable.deployed();
      await this.exampleERC721Copyable.mint(this.owner, 0, { from: this.owner });
      await this.exampleERC721Copyable.approve(this.contract.address, 0, { from: this.owner });

      this.exampleERC1155Copyable = await upgrades.deployProxy(this.ExampleERC1155Copyable, []);
      await this.exampleERC1155Copyable.deployed();
      await this.exampleERC1155Copyable.mint(this.owner, 0, { from: this.owner });
      await this.exampleERC1155Copyable.setApprovalForAll(this.contract.address, true, { from: this.owner });

      this.exampleERC1155Mintable = await upgrades.deployProxy(this.ExampleERC1155Mintable, ['https://google.com/']);
      await this.exampleERC1155Mintable.deployed();
      await this.exampleERC1155Mintable.mint(this.owner, 0, 1, '0x00', { from: this.owner });
      await this.exampleERC1155Mintable.setApprovalForAll(this.contract.address, true, { from: this.owner });

      this.exampleERC20Mintable = await upgrades.deployProxy(this.ExampleERC20Mintable, ['Fungible Asset', 'FNA']);
      await this.exampleERC20Mintable.deployed();
      await this.exampleERC20Mintable.mint(this.owner, 75000000, { from: this.owner });
      await this.exampleERC20Mintable.approve(this.contract.address, 75000000, { from: this.owner });

      this.exampleERC4907 = await upgrades.deployProxy(this.ExampleERC4907, []);
      await this.exampleERC4907.deployed();
      await this.exampleERC4907.nftMint({ from: this.owner });
      await this.exampleERC4907.approve(this.contract.address, 1, { from: this.owner });
    });

    describe('LimitedOrOpenEdition', function () {
      beforeEach(async function () {
        this.tagUid_721 = 1001;
        this.tagUid_1155 = 2001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            0,                                  // TagType tagType;
            this.exampleERC721Copyable.address, // address assetAddress;
            0,                                  // uint256 erc721TokenId;
            this.otherAddr,                     // address tagAuthority;
            3,                                  // uint256 totalSupply;
            2,                                  // uint256 perUser;
            0,                                  // uint256 fungiblePerClaim;
            this.tagUid_721,                    // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;
        await expect(this.contract.addOrRefillTag(
          [      // TagPassed passedTag
            0,                                   // TagType tagType;
            this.exampleERC1155Copyable.address, // address assetAddress;
            0,                                   // uint256 erc721TokenId;
            this.otherAddr,                      // address tagAuthority;
            3,                                   // uint256 totalSupply;
            2,                                   // uint256 perUser;
            0,                                   // uint256 fungiblePerClaim;
            this.tagUid_1155,                    // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          false, // bool isNotErc1155
          [],    // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;
      });

      it('should revert when totalSupply is zero', async function () {
        await expect(this.contract.connect(this.signer).cancelAndEmpty(
          this.tagUid_721, // uint256 uid
          true,   // bool isNotErc1155
          { from: this.owner }
        )).to.be.not.reverted;
        await expect(this.contract.connect(this.signer).cancelAndEmpty(
          this.tagUid_721, // uint256 uid
          true,   // bool isNotErc1155
          { from: this.owner }
        )).to.be.reverted;
      });

      it('should reset claimsMade for the tag', async function () {
        await expect(this.contract.connect(this.signer2).claimTag(
          this.owner,  // address recipient,
          this.tagUid_721,     // uint256 uid,
          this.owner,      // address bakeryAddress,
          true,            // bool isNotErc1155,
          1, // uint256 newTokenId
          KEY_HASH,   // bytes32 keyHash
          { from: this.otherAddr }
        )).to.be.not.reverted;
        await expect(this.contract.connect(this.signer).cancelAndEmpty(
          this.tagUid_721, // uint256 uid
          true,   // bool isNotErc1155
          { from: this.owner }
        )).to.not.be.reverted;
        expect(await this.contract.getClaimsMade(this.owner, this.tagUid_721, this.owner)).to.be.equal(0);
      });

      describe('ERC-721', function () {
        it('should cancel and empty tag', async function () {
          await expect(this.contract.connect(this.signer).cancelAndEmpty(
            this.tagUid_721, // uint256 uid
            true,   // bool isNotErc1155
            { from: this.owner }
          )).to.emit(this.contract, "Cancellation").withArgs(
            this.owner, // address bakery
            this.tagUid_721, // uint256 uid
            true, // bool isNotErc1155
            0 // uint256 numClaimed
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, this.tagUid_721));
          expect(tag.numClaimed).to.be.equal(0);
          expect(await this.contract.getClaimsMade(this.owner, this.tagUid_721, this.owner)).to.be.equal(0);
          expect(await this.exampleERC721Copyable.ownerOf(0)).to.be.equal(this.owner);
        });
      });

      describe('ERC-1155', function () {
        it('should cancel and empty tag', async function () {
          await expect(this.contract.connect(this.signer).cancelAndEmpty(
            this.tagUid_1155, // uint256 uid
            false,   // bool isNotErc1155
            { from: this.owner }
          )).to.emit(this.contract, "Cancellation").withArgs(
            this.owner, // address bakery
            this.tagUid_1155, // uint256 uid
            false, // bool isNotErc1155
            0 // uint256 numClaimed
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, this.tagUid_1155));
          expect(tag.numClaimed).to.be.equal(0);
          expect(await this.contract.getClaimsMade(this.owner, this.tagUid_1155, this.owner)).to.be.equal(0);
          expect(await this.exampleERC1155Copyable.balanceOf(this.owner, 0)).to.be.equal(1);
        });
      });
    });
    
    describe('SingleUse1Of1', function () {
      beforeEach(async function () {
        this.tagUid_721 = 1001;
        this.tagUid_1155 = 2001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            1,                                  // TagType tagType;
            this.exampleERC721Mintable.address, // address assetAddress;
            0,                                  // uint256 erc721TokenId;
            this.otherAddr,                     // address tagAuthority;
            1,                                  // uint256 totalSupply;
            1,                                  // uint256 perUser;
            0,                                  // uint256 fungiblePerClaim;
            this.tagUid_721,                    // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;
        await expect(this.contract.addOrRefillTag(
          [      // TagPassed passedTag
            1,                                   // TagType tagType;
            this.exampleERC1155Mintable.address, // address assetAddress;
            0,                                   // uint256 erc721TokenId;
            this.otherAddr,                      // address tagAuthority;
            1,                                   // uint256 totalSupply;
            1,                                   // uint256 perUser;
            0,                                   // uint256 fungiblePerClaim;
            this.tagUid_1155,                    // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          false, // bool isNotErc1155
          [],    // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;
      });

      it('should revert when totalSupply is zero', async function () {
        await expect(this.contract.connect(this.signer).cancelAndEmpty(
          this.tagUid_721, // uint256 uid
          true,   // bool isNotErc1155
          { from: this.owner }
        )).to.be.not.reverted;
        await expect(this.contract.connect(this.signer).cancelAndEmpty(
          this.tagUid_721, // uint256 uid
          true,   // bool isNotErc1155
          { from: this.owner }
        )).to.be.reverted;
      });

      it('should revert when the numClaimed equals totalSupply', async function () {
        await expect(this.contract.connect(this.signer2).claimTag(
          this.otherAddr,  // address recipient,
          this.tagUid_721,     // uint256 uid,
          this.owner,      // address bakeryAddress,
          true,            // bool isNotErc1155,
          0, // uint256 newTokenId
          KEY_HASH,   // bytes32 keyHash
          { from: this.otherAddr }
        )).to.be.not.reverted;
        await expect(this.contract.connect(this.signer).cancelAndEmpty(
          this.tagUid_721, // uint256 uid
          true,   // bool isNotErc1155
          { from: this.owner }
        )).to.be.reverted;
      });

      describe('ERC-721', function () {
        it('should cancel and empty tag', async function () {
          await expect(this.contract.connect(this.signer).cancelAndEmpty(
            this.tagUid_721, // uint256 uid
            true,   // bool isNotErc1155
            { from: this.owner }
          )).to.emit(this.contract, "Cancellation").withArgs(
            this.owner, // address bakery
            this.tagUid_721, // uint256 uid
            true, // bool isNotErc1155
            0 // uint256 numClaimed
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, this.tagUid_721));
          expect(tag.numClaimed).to.be.equal(0);
          expect(await this.contract.getClaimsMade(this.owner, this.tagUid_721, this.owner)).to.be.equal(0);
          expect(await this.exampleERC721Mintable.ownerOf(0)).to.be.equal(this.owner);
        });
      });

      describe('ERC-1155', function () {
        it('should cancel and empty tag', async function () {
          await expect(this.contract.connect(this.signer).cancelAndEmpty(
            this.tagUid_1155, // uint256 uid
            false,   // bool isNotErc1155
            { from: this.owner }
          )).to.emit(this.contract, "Cancellation").withArgs(
            this.owner, // address bakery
            this.tagUid_1155, // uint256 uid
            false, // bool isNotErc1155
            0 // uint256 numClaimed
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, this.tagUid_1155));
          expect(tag.numClaimed).to.be.equal(0);
          expect(await this.contract.getClaimsMade(this.owner, this.tagUid_1155, this.owner)).to.be.equal(0);
          expect(await this.exampleERC1155Mintable.balanceOf(this.owner, 0)).to.be.equal(1);
        });
      });
    });
    
    describe('Refillable1Of1', function () {
      beforeEach(async function () {
        this.tagUid_721 = 1001;
        this.tagUid_1155 = 2001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            2,                                  // TagType tagType;
            this.exampleERC721Mintable.address, // address assetAddress;
            0,                                  // uint256 erc721TokenId;
            this.otherAddr,                     // address tagAuthority;
            1,                                  // uint256 totalSupply;
            1,                                  // uint256 perUser;
            0,                                  // uint256 fungiblePerClaim;
            this.tagUid_721,                    // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;
        await expect(this.contract.addOrRefillTag(
          [      // TagPassed passedTag
            2,                                   // TagType tagType;
            this.exampleERC1155Mintable.address, // address assetAddress;
            0,                                   // uint256 erc721TokenId;
            this.otherAddr,                      // address tagAuthority;
            1,                                   // uint256 totalSupply;
            1,                                   // uint256 perUser;
            0,                                   // uint256 fungiblePerClaim;
            this.tagUid_1155,                    // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          false, // bool isNotErc1155
          [],    // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;
      });

      it('should revert when totalSupply is zero', async function () {
        await expect(this.contract.connect(this.signer).cancelAndEmpty(
          this.tagUid_721, // uint256 uid
          true,   // bool isNotErc1155
          { from: this.owner }
        )).to.be.not.reverted;
        await expect(this.contract.connect(this.signer).cancelAndEmpty(
          this.tagUid_721, // uint256 uid
          true,   // bool isNotErc1155
          { from: this.owner }
        )).to.be.reverted;
      });

      it('should revert when the numClaimed equals totalSupply', async function () {
        await expect(this.contract.connect(this.signer2).claimTag(
          this.otherAddr,  // address recipient,
          this.tagUid_721,     // uint256 uid,
          this.owner,      // address bakeryAddress,
          true,            // bool isNotErc1155,
          0, // uint256 newTokenId
          KEY_HASH,   // bytes32 keyHash
          { from: this.otherAddr }
        )).to.be.not.reverted;
        await expect(this.contract.connect(this.signer).cancelAndEmpty(
          this.tagUid_721, // uint256 uid
          true,   // bool isNotErc1155
          { from: this.owner }
        )).to.be.reverted;
      });

      it('should reset claimsMade for the tag', async function () {
        await expect(this.contract.connect(this.signer2).claimTag(
          this.owner,  // address recipient,
          this.tagUid_721,     // uint256 uid,
          this.owner,      // address bakeryAddress,
          true,            // bool isNotErc1155,
          0, // uint256 newTokenId
          KEY_HASH,   // bytes32 keyHash
          { from: this.otherAddr }
        )).to.be.not.reverted;
        await this.exampleERC721Mintable.approve(this.contract.address, 0, { from: this.owner });
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            2,                                  // TagType tagType;
            this.exampleERC721Mintable.address, // address assetAddress;
            0,                                  // uint256 erc721TokenId;
            this.otherAddr,                     // address tagAuthority;
            1,                                  // uint256 totalSupply;
            1,                                  // uint256 perUser;
            0,                                  // uint256 fungiblePerClaim;
            this.tagUid_721,                    // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;
        await expect(this.contract.connect(this.signer).cancelAndEmpty(
          this.tagUid_721, // uint256 uid
          true,   // bool isNotErc1155
          { from: this.owner }
        )).to.not.be.reverted;
        expect(await this.contract.getClaimsMade(this.owner, this.tagUid_721, this.owner)).to.be.equal(0);
      });

      describe('ERC-721', function () {
        it('should cancel and empty tag', async function () {
          await expect(this.contract.connect(this.signer).cancelAndEmpty(
            this.tagUid_721, // uint256 uid
            true,   // bool isNotErc1155
            { from: this.owner }
          )).to.emit(this.contract, "Cancellation").withArgs(
            this.owner, // address bakery
            this.tagUid_721, // uint256 uid
            true, // bool isNotErc1155
            0 // uint256 numClaimed
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, this.tagUid_721));
          expect(tag.numClaimed).to.be.equal(0);
          expect(await this.contract.getClaimsMade(this.owner, this.tagUid_721, this.owner)).to.be.equal(0);
          expect(await this.exampleERC721Mintable.ownerOf(0)).to.be.equal(this.owner);
        });
      });

      describe('ERC-1155', function () {
        it('should cancel and empty tag', async function () {
          await expect(this.contract.connect(this.signer).cancelAndEmpty(
            this.tagUid_1155, // uint256 uid
            false,   // bool isNotErc1155
            { from: this.owner }
          )).to.emit(this.contract, "Cancellation").withArgs(
            this.owner, // address bakery
            this.tagUid_1155, // uint256 uid
            false, // bool isNotErc1155
            0 // uint256 numClaimed
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, this.tagUid_1155));
          expect(tag.numClaimed).to.be.equal(0);
          expect(await this.contract.getClaimsMade(this.owner, this.tagUid_1155, this.owner)).to.be.equal(0);
          expect(await this.exampleERC1155Mintable.balanceOf(this.owner, 0)).to.be.equal(1);
        });
      });
    });

    describe('WalletRestrictedFungible', function () {
      beforeEach(async function () {
        this.tagUid_20 = 1001;
        this.tagUid_1155 = 2001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            3,                                  // TagType tagType;
            this.exampleERC20Mintable.address,  // address assetAddress;
            0,                                  // uint256 erc721TokenId;
            this.otherAddr,                     // address tagAuthority;
            75000000,                           // uint256 totalSupply;
            50000000,                           // uint256 perUser;
            25000000,                           // uint256 fungiblePerClaim;
            this.tagUid_20,                     // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;
        await this.exampleERC1155Mintable.mint(this.owner, 0, 74999999, '0x00', { from: this.owner });
        await this.exampleERC1155Mintable.setApprovalForAll(this.contract.address, true, { from: this.owner });
        await expect(this.contract.addOrRefillTag(
          [      // TagPassed passedTag
            3,                                   // TagType tagType;
            this.exampleERC1155Mintable.address, // address assetAddress;
            0,                                   // uint256 erc721TokenId;
            this.otherAddr,                      // address tagAuthority;
            75000000,                            // uint256 totalSupply;
            50000000,                            // uint256 perUser;
            25000000,                            // uint256 fungiblePerClaim;
            this.tagUid_1155,                    // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          false, // bool isNotErc1155
          [],    // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;
      });

      it('should revert when totalSupply is zero', async function () {
        await expect(this.contract.connect(this.signer).cancelAndEmpty(
          this.tagUid_20, // uint256 uid
          true,   // bool isNotErc1155
          { from: this.owner }
        )).to.be.not.reverted;
        await expect(this.contract.connect(this.signer).cancelAndEmpty(
          this.tagUid_20, // uint256 uid
          true,   // bool isNotErc1155
          { from: this.owner }
        )).to.be.reverted;
      });

      it('should revert when the numClaimed equals totalSupply', async function () {
        for (let i = 0; i < 2; i++) {
          await expect(this.contract.connect(this.signer2).claimTag(
            this.owner,      // address recipient,
            this.tagUid_20, // uint256 uid,
            this.owner,      // address bakeryAddress,
            true,            // bool isNotErc1155,
            0,               // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.be.not.reverted;
        }
        await expect(this.contract.connect(this.signer2).claimTag(
          this.otherAddr,  // address recipient,
          this.tagUid_20, // uint256 uid,
          this.owner,      // address bakeryAddress,
          true,            // bool isNotErc1155,
          0,               // uint256 newTokenId
          KEY_HASH,   // bytes32 keyHash
          { from: this.otherAddr }
        )).to.be.not.reverted;
        await expect(this.contract.connect(this.signer).cancelAndEmpty(
          this.tagUid_20, // uint256 uid
          true,            // bool isNotErc1155
          { from: this.owner }
        )).to.be.reverted;
      });

      it('should reset claimsMade for the tag', async function () {
        await expect(this.contract.connect(this.signer2).claimTag(
          this.owner,  // address recipient,
          this.tagUid_20,     // uint256 uid,
          this.owner,      // address bakeryAddress,
          true,            // bool isNotErc1155,
          0, // uint256 newTokenId
          KEY_HASH,   // bytes32 keyHash
          { from: this.otherAddr }
        )).to.be.not.reverted;
        await expect(this.contract.connect(this.signer).cancelAndEmpty(
          this.tagUid_20, // uint256 uid
          true,   // bool isNotErc1155
          { from: this.owner }
        )).to.not.be.reverted;
        expect(await this.contract.getClaimsMade(this.owner, this.tagUid_20, this.owner)).to.be.equal(0);
      });

      describe('ERC-20', function () {
        it('should cancel and empty tag', async function () {
          await expect(this.contract.connect(this.signer).cancelAndEmpty(
            this.tagUid_20, // uint256 uid
            true,   // bool isNotErc1155
            { from: this.owner }
          )).to.emit(this.contract, "Cancellation").withArgs(
            this.owner, // address bakery
            this.tagUid_20, // uint256 uid
            true, // bool isNotErc1155
            0 // uint256 numClaimed
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, this.tagUid_20));
          expect(tag.numClaimed).to.be.equal(0);
          expect(await this.contract.getClaimsMade(this.owner, this.tagUid_20, this.owner)).to.be.equal(0);
          expect(await this.exampleERC721Mintable.ownerOf(0)).to.be.equal(this.owner);
        });
      });

      describe('ERC-1155', function () {
        it('should cancel and empty tag', async function () {
          await expect(this.contract.connect(this.signer).cancelAndEmpty(
            this.tagUid_1155, // uint256 uid
            false,   // bool isNotErc1155
            { from: this.owner }
          )).to.emit(this.contract, "Cancellation").withArgs(
            this.owner, // address bakery
            this.tagUid_1155, // uint256 uid
            false, // bool isNotErc1155
            0 // uint256 numClaimed
          );
          const tag = await this.contract.tags(hashUniqueTag(this.owner, this.tagUid_1155));
          expect(tag.numClaimed).to.be.equal(0);
          expect(await this.contract.getClaimsMade(this.owner, this.tagUid_1155, this.owner)).to.be.equal(0);
          expect(await this.exampleERC1155Mintable.balanceOf(this.owner, 0)).to.be.equal(75000000);
        });
      });
    });

    describe('HotPotato', function () {
      beforeEach(async function () {
        this.tagUid_4907 = 1001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            4,                                  // TagType tagType;
            this.exampleERC4907.address,        // address assetAddress;
            1,                                  // uint256 erc721TokenId;
            this.otherAddr,                     // address tagAuthority;
            1,                                  // uint256 totalSupply;
            1,                                  // uint256 perUser;
            0,                                  // uint256 fungiblePerClaim;
            this.tagUid_4907,                  // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          [],   // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;
      });

      it('should revert when totalSupply is zero', async function () {
        await expect(this.contract.connect(this.signer).cancelAndEmpty(
          this.tagUid_4907, // uint256 uid
          true,   // bool isNotErc1155
          { from: this.owner }
        )).to.be.not.reverted;
        await expect(this.contract.connect(this.signer).cancelAndEmpty(
          this.tagUid_4907, // uint256 uid
          true,   // bool isNotErc1155
          { from: this.owner }
        )).to.be.reverted;
      });

      it('should reset claimsMade for the tag', async function () {
        await expect(this.contract.connect(this.signer2).claimTag(
          this.owner,       // address recipient,
          this.tagUid_4907, // uint256 uid,
          this.owner,       // address bakeryAddress,
          true,             // bool isNotErc1155,
          0,                // uint256 newTokenId
          KEY_HASH,   // bytes32 keyHash
          { from: this.otherAddr }
        )).to.be.not.reverted;
        await expect(this.contract.connect(this.signer).cancelAndEmpty(
          this.tagUid_4907, // uint256 uid
          true,             // bool isNotErc1155
          { from: this.owner }
        )).to.not.be.reverted;
        expect(await this.contract.getClaimsMade(this.owner, this.tagUid_4907, this.owner)).to.be.equal(0);
      });

      it('should revert when bakery is not current user', async function () {
        await expect(this.contract.connect(this.signer2).claimTag(
          this.otherAddr,   // address recipient,
          this.tagUid_4907, // uint256 uid,
          this.owner,       // address bakeryAddress,
          true,             // bool isNotErc1155,
          0,                // uint256 newTokenId
          KEY_HASH,   // bytes32 keyHash
          { from: this.otherAddr }
        )).to.be.not.reverted;
        await expect(this.contract.connect(this.signer).cancelAndEmpty(
          this.tagUid_4907, // uint256 uid
          true,   // bool isNotErc1155
          { from: this.owner }
        )).to.be.reverted;
        const tag = await this.contract.tags(hashUniqueTag(this.owner, this.tagUid_4907));
        expect(tag.numClaimed).to.be.equal(1);
        expect(await this.contract.getClaimsMade(this.owner, this.tagUid_4907, this.otherAddr)).to.be.equal(1);
        expect(await this.exampleERC4907.ownerOf(1)).to.be.equal(this.contract.address);
        expect(await this.exampleERC4907.userOf(1)).to.be.equal(this.otherAddr);
      });

      it('should cancel and empty tag', async function () {
        await expect(this.contract.connect(this.signer).cancelAndEmpty(
          this.tagUid_4907, // uint256 uid
          true,   // bool isNotErc1155
          { from: this.owner }
        )).to.emit(this.contract, "Cancellation").withArgs(
          this.owner, // address bakery
          this.tagUid_4907, // uint256 uid
          true, // bool isNotErc1155
          0 // uint256 numClaimed
        );
        const tag = await this.contract.tags(hashUniqueTag(this.owner, this.tagUid_4907));
        expect(tag.numClaimed).to.be.equal(0);
        expect(await this.contract.getClaimsMade(this.owner, this.tagUid_4907, this.owner)).to.be.equal(0);
        expect(await this.exampleERC4907.ownerOf(1)).to.be.equal(this.owner);
      });
    });

    describe('CandyMachineDrop', function () {
      let candyMachine;
      beforeEach(async function () {
        this.tagUid_721 = 1001;
        await expect(this.contract.addOrRefillTag(
          [     // TagPassed passedTag
            5,                                  // TagType tagType;
            NULL_ADDR,                          // address assetAddress;
            0,                                  // uint256 erc721TokenId;
            this.otherAddr,                     // address tagAuthority;
            3,                                  // uint256 totalSupply;
            3,                                  // uint256 perUser;
            0,                                  // uint256 fungiblePerClaim;
            this.tagUid_721,                    // uint256 uid;
            1,                                  // uint64 subscriptionId;
            this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
          ],
          true, // bool isNotErc1155
          METADATA_URIS,   // string[] metadataURIs
          { from: this.owner }
        )).to.be.not.reverted;

        await new Promise(async resolve => {
          this.candyMachineFactory.on("Creation", async newCandyMachineAddr => {
            candyMachine = await ethers.getContractAt('CandyMachine', newCandyMachineAddr);
            await this.hardhatVrfCoordinatorV2Mock.addConsumer(1, newCandyMachineAddr);
            resolve();
          });
        });
      });

      it('should revert when totalSupply is zero', async function () {
        await expect(this.contract.connect(this.signer).cancelAndEmpty(
          this.tagUid_721, // uint256 uid
          true,   // bool isNotErc1155
          { from: this.owner }
        )).to.be.not.reverted;
        await expect(this.contract.connect(this.signer).cancelAndEmpty(
          this.tagUid_721, // uint256 uid
          true,   // bool isNotErc1155
          { from: this.owner }
        )).to.be.reverted;
      });

      it('should revert when the numClaimed equals totalSupply', async function () {
        for (let i = 0; i < METADATA_URIS.length; i++) {
          await new Promise(async resolve => {
            await expect(this.contract.connect(this.signer2).claimTag(
              this.otherAddr,  // address recipient,
              this.tagUid_721,     // uint256 uid,
              this.owner,      // address bakeryAddress,
              true,            // bool isNotErc1155,
              0, // uint256 newTokenId
              KEY_HASH,   // bytes32 keyHash
              { from: this.otherAddr }
            )).to.be.not.reverted;
            await candyMachine.once("RandomWordsRequested", async reqId => {
              expect(
                await this.hardhatVrfCoordinatorV2Mock.fulfillRandomWords(reqId, candyMachine.address)
              ).to.emit(this.candyMachine, "RandomWordsFulfilled");
              resolve();
            });
          });
        }
        await expect(this.contract.connect(this.signer).cancelAndEmpty(
          this.tagUid_721, // uint256 uid
          true,   // bool isNotErc1155
          { from: this.owner }
        )).to.be.reverted;
      });

      it('should reset claimsMade for the tag', async function () {
        await new Promise(async resolve => {
          await expect(this.contract.connect(this.signer2).claimTag(
            this.otherAddr,  // address recipient,
            this.tagUid_721,     // uint256 uid,
            this.owner,      // address bakeryAddress,
            true,            // bool isNotErc1155,
            0, // uint256 newTokenId
            KEY_HASH,   // bytes32 keyHash
            { from: this.otherAddr }
          )).to.be.not.reverted;
          await candyMachine.once("RandomWordsRequested", async reqId => {
            expect(
              await this.hardhatVrfCoordinatorV2Mock.fulfillRandomWords(reqId, candyMachine.address)
            ).to.emit(this.candyMachine, "RandomWordsFulfilled");
            resolve();
          });
        });
        await expect(this.contract.connect(this.signer).cancelAndEmpty(
          this.tagUid_721, // uint256 uid
          true,   // bool isNotErc1155
          { from: this.owner }
        )).to.not.be.reverted;
        expect(await this.contract.getClaimsMade(this.owner, this.tagUid_721, this.owner)).to.be.equal(0);
      });

      it('should cancel and empty tag', async function () {
        await expect(this.contract.connect(this.signer).cancelAndEmpty(
          this.tagUid_721, // uint256 uid
          true,   // bool isNotErc1155
          { from: this.owner }
        )).to.emit(this.contract, "Cancellation").withArgs(
          this.owner, // address bakery
          this.tagUid_721, // uint256 uid
          true, // bool isNotErc1155
          0 // uint256 numClaimed
        );
        const tag = await this.contract.tags(hashUniqueTag(this.owner, this.tagUid_721));
        expect(tag.numClaimed).to.be.equal(0);
        expect(await this.contract.getClaimsMade(this.owner, this.tagUid_721, this.owner)).to.be.equal(0);
      });
    });
  });

  describe('getClaimsMade', function () {
    beforeEach(async function () {
      this.candyMachineFactory = await upgrades.deployProxy(this.CandyMachineFactory, [], {
        initializer: "initialize",
        kind: "uups",
      });
      await this.candyMachineFactory.deployed();
      this.contract = await upgrades.deployProxy(this.Contract, [this.candyMachineFactory.address], {
        initializer: "initialize",
        kind: "uups",
      });

      this.exampleERC721Mintable = await upgrades.deployProxy(this.ExampleERC721Mintable, ['Wrapped Asset', 'TST']);
      await this.exampleERC721Mintable.deployed();
      await this.exampleERC721Mintable.mint(this.owner, 0, { from: this.owner });
      await this.exampleERC721Mintable.approve(this.contract.address, 0, { from: this.owner });
    });

    beforeEach(async function () {
      this.tagUid_721 = 1001;
      await expect(this.contract.addOrRefillTag(
        [     // TagPassed passedTag
          2,                                  // TagType tagType;
          this.exampleERC721Mintable.address, // address assetAddress;
          0,                                  // uint256 erc721TokenId;
          this.otherAddr,                     // address tagAuthority;
          1,                                  // uint256 totalSupply;
          1,                                  // uint256 perUser;
          0,                                  // uint256 fungiblePerClaim;
          this.tagUid_721,                    // uint256 uid;
          1,                                  // uint64 subscriptionId;
          this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
        ],
        true, // bool isNotErc1155
        [],   // string[] metadataURIs
        { from: this.owner }
      )).to.be.not.reverted;
    });

    it('should return claimsMade properly based on invalidation mechanism', async function () {
      expect(await this.contract.getClaimsMade(this.owner, this.tagUid_721, this.owner)).to.be.equal(0);
      await expect(this.contract.connect(this.signer2).claimTag(
        this.owner,  // address recipient,
        this.tagUid_721,     // uint256 uid,
        this.owner,      // address bakeryAddress,
        true,            // bool isNotErc1155,
        0, // uint256 newTokenId
        KEY_HASH,   // bytes32 keyHash
        { from: this.otherAddr }
      )).to.be.not.reverted;
      expect(await this.contract.getClaimsMade(this.owner, this.tagUid_721, this.owner)).to.be.equal(1);
      await this.exampleERC721Mintable.approve(this.contract.address, 0, { from: this.owner });
      await expect(this.contract.addOrRefillTag(
        [     // TagPassed passedTag
          2,                                  // TagType tagType;
          this.exampleERC721Mintable.address, // address assetAddress;
          0,                                  // uint256 erc721TokenId;
          this.otherAddr,                     // address tagAuthority;
          1,                                  // uint256 totalSupply;
          1,                                  // uint256 perUser;
          0,                                  // uint256 fungiblePerClaim;
          this.tagUid_721,                    // uint256 uid;
          1,                                  // uint64 subscriptionId;
          this.hardhatVrfCoordinatorV2Mock.address // address vrfConsumerBaseV2;
        ],
        true, // bool isNotErc1155
        [],   // string[] metadataURIs
        { from: this.owner }
      )).to.be.not.reverted;
      expect(await this.contract.getClaimsMade(this.owner, this.tagUid_721, this.owner)).to.be.equal(1);
      await expect(this.contract.connect(this.signer).cancelAndEmpty(
        this.tagUid_721, // uint256 uid
        true,   // bool isNotErc1155
        { from: this.owner }
      )).to.not.be.reverted;
      expect(await this.contract.getClaimsMade(this.owner, this.tagUid_721, this.owner)).to.be.equal(0);
    });
  });
});
