//SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.7;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";

import "../interfaces/IERC4907Upgradeable.sol";
import "../interfaces/IERC721CopyableUpgradeable.sol";
import "../interfaces/IERC1155CopyableUpgradeable.sol";

import "../interfaces/ICandyMachine.sol";
import "../interfaces/ICandyMachineFactory.sol";

/*
 * The ContractStorage contract contains all of the Contract's state variables which are then inherited by Contract.
 * Via this seperation of storage and logic we ensure that Contract's state variables come first in the storage layout
 * and that Contract has the ability to change the list of contracts it inherits from in the future via upgradeability.
 */
contract ContractStorage {
  event TagCreationOrRefill(
    address bakery,
    TagType tagType,
    address indexed assetAddress,
    uint256 erc721TokenId,
    address indexed tagAuthority,
    uint256 totalSupply,
    uint256 perUser,
    uint256 fungiblePerClaim,
    uint256 indexed uid,
    bool isNotErc1155
  );

  event TagClaim(
    address tagAuthority,
    address indexed recipient,
    address indexed assetAddress,
    uint256 erc721TokenId,
    uint256 fungiblePerClaim,
    uint256 indexed uid,
    bool isNotErc1155
  );

  event Cancellation(
    address indexed bakery,
    uint256 indexed uid,
    bool isNotErc1155,
    uint256 indexed numClaimed
  );

  uint64 constant internal MAX_UINT64 = (2 ** 64) - 1; // Represents the largest possible Unix timestamp

  address internal candyMachineFactoryAddr;

  enum TagType {
    // Each claimable NFT is a copy of the master NFT, up to the preset total supply
    LimitedOrOpenEdition,
    // Only one claimable NFT, always with a supply of 1
    SingleUse1Of1,
    // One claimable NFT, that can be continually refilled (unrestricted by the preset total supply)
    Refillable1Of1,
    // Claimable fungible tokens (claimed based on an amount per user), up to the preset total supply
    WalletRestrictedFungible,
    // Only one NFT that is temporarily held by the claimer, possession is transferred after each subsequent claim
    HotPotato,
    // Each claimable NFT is randomly selected from a predefined set up to the preset total supply
    CandyMachineDrop
  }

  struct ClaimMade {
    uint256 numClaims;
    uint256 lastClaimBlock;
  }

  struct Tag {
    // The enum type of the tag
    TagType tagType;
    // The address of the ERC-1155, ERC-721 or ERC-20 compliant claimable token, or the CandyMachine contract address
    address assetAddress;
    // The token ID of the NFT claimable token (Only used for non-fungible claims)
    uint256 erc721TokenId;
    // The address that must have signed for a claim transaction to be valid
    address tagAuthority;
    // Indicates the total claimable supply of the token available
    uint256 totalSupply;
    // Indicates the total claimable supply of the token available per user
    uint256 perUser;
    // Indicates the amount of fungible token to make claimable per claim (only for fungible claims)
    uint256 fungiblePerClaim;
    // The uid string from the NFC tag
    uint256 uid; // uint64 used
    // Indicates the total number of token claims made so far
    uint256 numClaimed;
    // Indicates the block number of when the tag was last deleted
    uint256 lastDeletion;
    // Indicates the number of token claims made by address so far, each accompanied by a block number of the last claim
    mapping (
      address => ClaimMade
    ) claimsMade;
  }


  /*
   * This struct is used to pass arguments to the addOrRefillTag() function to avoid "Stack too deep" errors (resulting
   * from exceeding the local variables quota for addOrRefillTag() function calls).
   */
  struct TagPassed {
    TagType tagType;
    address assetAddress;
    uint256 erc721TokenId;
    address tagAuthority;
    uint256 totalSupply;
    uint256 perUser;
    uint256 fungiblePerClaim;
    uint256 uid;
    uint64 subscriptionId;
    address vrfConsumerBaseV2;
  }

  mapping (
    // tag's unique identifier, see the hashUniqueTag() function below to see how the bytes32 is generated.
    bytes32 => Tag
  ) public tags;
}

contract Contract is ContractStorage, UUPSUpgradeable, OwnableUpgradeable, ERC721HolderUpgradeable, ERC1155HolderUpgradeable {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  ////////////////////////////////////////////////
  //////// I N I T I A L I Z E R

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /*
   * Initalizes the state variables.
   */
  function initialize(address candyMachineFactoryAddrArg) external initializer {
    require(candyMachineFactoryAddrArg != address(0), 'factoryAddr cannot be 0-addr');
    __Ownable_init();
    candyMachineFactoryAddr = candyMachineFactoryAddrArg;
  }

  ////////////////////////////////////////////////
  //////// F U N C T I O N S

  /*
   * @notice Authorizes contract upgrades only for the contract owner (contract deployer) via the onlyOwner modifier.
   */
  function _authorizeUpgrade(address) internal override onlyOwner {}

  /*
   * @notice The hash function used to identify unique tags
   */
  function hashUniqueTag(address bakeryPubkey, uint256 tagUid) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(bakeryPubkey, tagUid));
  }

  /*
   * @notice Add or refill ERC-1155 assets that can be claimed for a specified tag
   */
  function addOrRefillTag(
    TagPassed calldata passedTag,
    // Indicates if the claimable asset is an NFT that does not support the ERC-1155 standard
    // NOTE: Relevent when `tagType` is not HotPotato
    bool isNotErc1155,
    // Indicates the metadata URIs to use for the new NFT assets in CandyMachine
    // NOTE: Relevent when `tagType` is CandyMachineDrop
    string[] calldata metadataURIs
  ) external {
    // The following checks are only required when the tagType is not HotPotato, SingleUse1Of1, Refillable1Of1
    require (passedTag.tagType == TagType.HotPotato || passedTag.tagType == TagType.SingleUse1Of1 || passedTag.tagType == TagType.Refillable1Of1 || passedTag.tagType == TagType.CandyMachineDrop || passedTag.totalSupply > 0, 'zero totalSupply');
    require (passedTag.tagType == TagType.HotPotato || passedTag.tagType == TagType.SingleUse1Of1 || passedTag.tagType == TagType.Refillable1Of1 || passedTag.perUser > 0, 'zero perUser');
    require (passedTag.tagType == TagType.HotPotato || passedTag.tagType == TagType.SingleUse1Of1 || passedTag.tagType == TagType.Refillable1Of1 || passedTag.perUser <= passedTag.totalSupply || (passedTag.tagType == TagType.CandyMachineDrop && passedTag.perUser <= metadataURIs.length), 'perUser > totalSupply');

    bytes32 tagHash = hashUniqueTag(msg.sender, passedTag.uid);

    bool isCleanTag = tags[tagHash].totalSupply == 0;

    Tag storage tag = tags[tagHash];
    tag.tagType = passedTag.tagType;
    tag.uid = passedTag.uid;
    tag.tagAuthority = passedTag.tagAuthority;

    if (passedTag.tagType == TagType.LimitedOrOpenEdition) {
      // Verify that either this tag has never existed before or the supply has been completely drained
      require (isCleanTag || tag.numClaimed >= tag.totalSupply, 'existing tag undrained');

      tag.assetAddress = passedTag.assetAddress;
      tag.erc721TokenId = passedTag.erc721TokenId;
      tag.totalSupply = passedTag.totalSupply;
      tag.perUser = passedTag.perUser;
      tag.fungiblePerClaim = 0;
      tag.numClaimed = 0;
    } else if (passedTag.tagType == TagType.SingleUse1Of1 || passedTag.tagType == TagType.Refillable1Of1) {
      // Verify that either this tag has never existed before or (if passedTag.tagType is Refillable1Of1) the (fixed) supply of 1 has been completely depleted
      require (isCleanTag || (passedTag.tagType == TagType.Refillable1Of1 && tag.numClaimed >= 1), 'existing tag either not a Refillable1Of1 or undrained');

      tag.assetAddress = passedTag.assetAddress;
      tag.erc721TokenId = passedTag.erc721TokenId;
      tag.totalSupply = 1;
      tag.perUser = 1;
      tag.fungiblePerClaim = 0;
      tag.numClaimed = 0;
    } else if (passedTag.tagType == TagType.WalletRestrictedFungible) {
      // Verify that either this tag has never existed before or the supply has been completely drained
      require ((isCleanTag || tag.numClaimed >= tag.totalSupply) && (passedTag.fungiblePerClaim <= passedTag.perUser), 'f-tag undrned or funPerClm>pUser');
      require (passedTag.totalSupply > 0 && passedTag.fungiblePerClaim > 0, 'tSup and funPerClm must be non-0');

      tag.assetAddress = passedTag.assetAddress;
      tag.erc721TokenId = passedTag.erc721TokenId;
      tag.totalSupply = passedTag.totalSupply;
      tag.perUser = passedTag.perUser;
      tag.fungiblePerClaim = passedTag.fungiblePerClaim;
      tag.numClaimed = 0;
      if (isNotErc1155) {
        IERC20Upgradeable tokenERC20 = IERC20Upgradeable(passedTag.assetAddress);        
        tokenERC20.safeTransferFrom(msg.sender, address(this), passedTag.totalSupply);
      }
    } else if (passedTag.tagType == TagType.HotPotato) {
      // Verify that this tag has never existed before
      require (isCleanTag, 'existing tag');

      tag.assetAddress = passedTag.assetAddress;
      tag.erc721TokenId = passedTag.erc721TokenId;
      tag.totalSupply = 1;
      tag.perUser = 0;
      tag.fungiblePerClaim = 0;
      tag.numClaimed = 0;
    } else if (passedTag.tagType == TagType.CandyMachineDrop) {
      // Verify that this tag has never existed before
      require (isCleanTag, 'existing tag');

      tag.erc721TokenId = 0;
      tag.totalSupply = metadataURIs.length;
      tag.perUser = passedTag.perUser;
      tag.fungiblePerClaim = 0;
      tag.numClaimed = 0;
      ICandyMachineFactory candyMachineFactory = ICandyMachineFactory(candyMachineFactoryAddr);
      tag.assetAddress = candyMachineFactory.newCandyMachine(metadataURIs, passedTag.subscriptionId, passedTag.vrfConsumerBaseV2);
    }

    // If this is a ERC-721 or ERC-1155 compatible case, then we do the transfer and check that the 
    // case-specific interface is supported below.
    // NOTE: This code is abstracted into the block below (not integrated above) for contract-size reduction.
    if (
      (passedTag.tagType != TagType.CandyMachineDrop) &&
      (passedTag.tagType != TagType.WalletRestrictedFungible || !isNotErc1155)
    ) {
      bytes4 interfaceId;
      if (isNotErc1155 || passedTag.tagType == TagType.HotPotato) {
        IERC721Upgradeable contract721Type = IERC721Upgradeable(passedTag.assetAddress);
        contract721Type.safeTransferFrom(msg.sender, address(this), passedTag.erc721TokenId);
        if (passedTag.tagType == TagType.LimitedOrOpenEdition) {
          interfaceId = type(IERC721CopyableUpgradeable).interfaceId;
        } else if (passedTag.tagType == TagType.SingleUse1Of1 || passedTag.tagType == TagType.Refillable1Of1) {
          interfaceId = type(IERC721Upgradeable).interfaceId;
        } else {
          interfaceId = type(IERC4907Upgradeable).interfaceId;
        }
        require(contract721Type.supportsInterface(interfaceId), 'ERC721 sub-type not supported');
      } else {
        IERC1155Upgradeable contract1155Type = IERC1155Upgradeable(passedTag.assetAddress);
        contract1155Type.safeTransferFrom(msg.sender, address(this), passedTag.erc721TokenId, (passedTag.tagType == TagType.WalletRestrictedFungible) ? passedTag.totalSupply : 1, "0x00");
        if (passedTag.tagType == TagType.LimitedOrOpenEdition) {
          interfaceId = type(IERC1155CopyableUpgradeable).interfaceId;
        } else {
          interfaceId = type(IERC1155Upgradeable).interfaceId;
        }
        require(contract1155Type.supportsInterface(interfaceId), 'ERC1155 sub-type not supported');
      }
    }

    emit TagCreationOrRefill(
      msg.sender,
      tag.tagType,
      tag.assetAddress,
      tag.erc721TokenId,
      tag.tagAuthority,
      tag.totalSupply,
      tag.perUser,
      tag.fungiblePerClaim,
      tag.uid,
      isNotErc1155
    );
  }

  /*
   * @notice Claim an asset for a specified tag
   * @returns address representing the address of the newly claimed token
   * @returns uint256 representing the tokenId of the newly claimed token (if non-fungible)
   * @returns uint256 representing the amount of the newly claimed token (if fungible)
   */
  function claimTag(
    address recipient,
    uint256 uid,
    // Indicates the address that signed the addOrRefillTag() transaction assocaited with this tag
    address bakeryAddress,
    // Indicates if the claimable asset is an NFT that does not support the ERC-1155 standard
    // NOTE: Relevent when `tagType` is not HotPotato
    bool isNotErc1155,
    // Indicates the new (copied) asset's token
    // NOTE: Relevent when `tagType` is LimitedOrOpenEdition; this value must not already exist in the collection.
    uint256 newTokenId,
    bytes32 keyHash
  ) external returns(address, uint256, uint256) {
    bytes32 tagHash = hashUniqueTag(bakeryAddress, uid);

    Tag storage tag = tags[tagHash];

    require (tag.totalSupply > 0 && msg.sender == tag.tagAuthority, 'non-exist or signer not tagAuth');

    ClaimMade storage claimMade = tag.claimsMade[recipient];

    require (tag.tagType == TagType.HotPotato || tag.tagType == TagType.Refillable1Of1 || tag.numClaimed < tag.totalSupply, 'not HotP or ReF and tot drained');
    require (tag.tagType == TagType.HotPotato || tag.tagType == TagType.Refillable1Of1 || getClaimsMade(bakeryAddress, uid, recipient) < tag.perUser, 'not HotP or ReF and pU drained');

    emit TagClaim(
      msg.sender,
      recipient,
      tag.assetAddress,
      tag.erc721TokenId,
      tag.fungiblePerClaim,
      tag.uid,
      isNotErc1155
    );

    if (tag.tagType == TagType.WalletRestrictedFungible) {
      tag.numClaimed += tag.fungiblePerClaim;
      claimMade.numClaims = getClaimsMade(bakeryAddress, uid, recipient) + tag.fungiblePerClaim;
    } else {
      tag.numClaimed += 1;
      claimMade.numClaims = getClaimsMade(bakeryAddress, uid, recipient) + 1;
    }
    claimMade.lastClaimBlock = block.number;

    if (tag.tagType == TagType.LimitedOrOpenEdition) {
      require(tag.erc721TokenId != newTokenId, 'new tokenId matches existing');
      if (isNotErc1155) {
        IERC721CopyableUpgradeable tokenERC721Copyable = IERC721CopyableUpgradeable(tag.assetAddress);
        tokenERC721Copyable.mintCopy(recipient, tag.erc721TokenId, newTokenId);
      } else {
        IERC1155CopyableUpgradeable tokenERC1155Copyable = IERC1155CopyableUpgradeable(tag.assetAddress);
        tokenERC1155Copyable.mintCopy(recipient, tag.erc721TokenId, newTokenId);
      }
    } else if (tag.tagType == TagType.SingleUse1Of1 || tag.tagType == TagType.Refillable1Of1) {
      if (isNotErc1155) {
        IERC721Upgradeable tokenERC721 = IERC721Upgradeable(tag.assetAddress);
        tokenERC721.safeTransferFrom(address(this), recipient, tag.erc721TokenId);
      } else {
        IERC1155Upgradeable tokenERC1155 = IERC1155Upgradeable(tag.assetAddress);
        tokenERC1155.safeTransferFrom(address(this), recipient, tag.erc721TokenId, 1, "0x00");
      }
    } else if (tag.tagType == TagType.WalletRestrictedFungible) {
      if (isNotErc1155) {
        IERC20Upgradeable tokenERC20 = IERC20Upgradeable(tag.assetAddress);
        tokenERC20.safeTransfer(recipient, tag.fungiblePerClaim);
      } else {
        IERC1155Upgradeable tokenERC1155Fungible = IERC1155Upgradeable(tag.assetAddress);
        tokenERC1155Fungible.safeTransferFrom(address(this), recipient, tag.erc721TokenId, tag.fungiblePerClaim, "0x00");
      }
    } else if (tag.tagType == TagType.HotPotato) {
      IERC4907Upgradeable tokenERC4907 = IERC4907Upgradeable(tag.assetAddress);
      tokenERC4907.setUser(tag.erc721TokenId, recipient, MAX_UINT64);
    } else if (tag.tagType == TagType.CandyMachineDrop) {
      ICandyMachine candyMachine = ICandyMachine(tag.assetAddress);
      candyMachine.mint(recipient, keyHash);
    }

    return (
      tag.assetAddress,
      (tag.tagType == TagType.LimitedOrOpenEdition) ? newTokenId : tag.erc721TokenId,
      tag.fungiblePerClaim
    );
  }

  /*
   * @notice Cancel and empty a specified tag
   */
  function cancelAndEmpty(
    uint256 uid,
    // Indicates if the claimable asset is an NFT that does not support the ERC-1155 standard
    // NOTE: Relevent when `tagType` is not HotPotato
    bool isNotErc1155
  ) external {
    bytes32 tagHash = hashUniqueTag(msg.sender, uid);

    Tag storage tag = tags[tagHash];

    require (tag.totalSupply > 0 && (tag.tagType == TagType.LimitedOrOpenEdition || tag.tagType == TagType.HotPotato || tag.numClaimed < tag.totalSupply), 'no-exists or no HP/LOOE and dpld');

    TagType tagType = tag.tagType;
    address assetAddress = tag.assetAddress;
    uint256 erc721TokenId = tag.erc721TokenId;
    uint256 numClaimed = tag.numClaimed;
    uint256 totalSupply = tag.totalSupply;

    emit Cancellation(
      msg.sender,
      uid,
      isNotErc1155,
      numClaimed
    );

    // Default everything
    delete tags[tagHash];
    tags[tagHash].lastDeletion = block.number;

    if (tagType == TagType.LimitedOrOpenEdition) {
      if (isNotErc1155) {
        IERC721CopyableUpgradeable tokenERC721Copyable = IERC721CopyableUpgradeable(assetAddress);
        tokenERC721Copyable.safeTransferFrom(address(this), msg.sender, erc721TokenId);
      } else {
        IERC1155CopyableUpgradeable tokenERC1155Copyable = IERC1155CopyableUpgradeable(assetAddress);
        tokenERC1155Copyable.safeTransferFrom(address(this), msg.sender, erc721TokenId, 1, "0x00");
      }
    } else if (tagType == TagType.SingleUse1Of1 || tagType == TagType.Refillable1Of1) {
      if (isNotErc1155) {
        IERC721Upgradeable tokenERC721 = IERC721Upgradeable(assetAddress);
        tokenERC721.safeTransferFrom(address(this), msg.sender, erc721TokenId);
      } else {
        IERC1155Upgradeable tokenERC1155 = IERC1155Upgradeable(assetAddress);
        tokenERC1155.safeTransferFrom(address(this), msg.sender, erc721TokenId, 1, "0x00");
      }
    } else if (tagType == TagType.WalletRestrictedFungible) {
      if (isNotErc1155) {
        IERC20Upgradeable tokenERC20 = IERC20Upgradeable(assetAddress);
        tokenERC20.safeTransfer(msg.sender, totalSupply - numClaimed);
      } else {
        IERC1155Upgradeable tokenERC1155Fungible = IERC1155Upgradeable(assetAddress);
        tokenERC1155Fungible.safeTransferFrom(address(this), msg.sender, tag.erc721TokenId, totalSupply - numClaimed, "0x00");
      }
    } else if (tagType == TagType.HotPotato) {
      IERC4907Upgradeable tokenERC4907 = IERC4907Upgradeable(assetAddress);
      require(tokenERC4907.userOf(erc721TokenId) == msg.sender || tokenERC4907.userOf(erc721TokenId) == address(0), 'bakery must be user or no user');
      tokenERC4907.safeTransferFrom(address(this), msg.sender, erc721TokenId);
    } else if (tagType == TagType.CandyMachineDrop) {
      ICandyMachine candyMachine = ICandyMachine(assetAddress);
      candyMachine.cancel();
    }
  }

  /*
   * @notice Determine the number of times (or amount, for fungible) a specific user has claimed from a specific tag
   * @returns uint256 representing the amount of claims (or total value, for fungible) made for this recipient
   */
  function getClaimsMade(
    address bakeryAddress,
    uint256 uid,
    address recipient
  ) public view returns(uint256) {
    Tag storage tag = tags[hashUniqueTag(bakeryAddress, uid)];
    ClaimMade storage claimMade = tag.claimsMade[recipient];
    if (tag.lastDeletion > claimMade.lastClaimBlock) {
      return 0;
    } else {
      return claimMade.numClaims;
    }
  }
}
