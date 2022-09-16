# 🧁 Cupcake

NPM module is "cupcake-cli", represents what is in the CLI folder

## About

## Ethereum Contract Architecture

### Interface

```
interface Contract {
  /*
   * @returns uint256 represting the total claimable supply now available
   */
  function addOrRefillTag(
    TagType tagType,
    address tokenAddress,
    uint256 erc721TokenId,
    bool minterPays,
    uint256 totalSupply,
    uint256 perUser,
    // TODO: Decide if this is needed.
    // Indicates if the claimable asset is an NFT that does not support the ERC-1155 standard
    // NOTE: Only relevent when `tagType` is one of the following: LimitedOrOpenEdition, SingleUse1Of1, Refillable1Of1
    bool isNotErc1155
  ) external view returns(uint256);

  /*
   * @returns address representing the address of the newly claimed token
   * @returns uint256 representing the tokenId of the newly claimed token
   */
  function claimTag(
    address authorAddress,
    // TODO: Decide if should be able to be explicitly set, or if it should always be msg.sender
    address receiver,
    // TODO: Decide if this is needed.
    // Indicates if the claimable asset is an NFT that does not support the ERC-1155 standard
    // NOTE: Only relevent when `tagType` is one of the following: LimitedOrOpenEdition, SingleUse1Of1, Refillable1Of1
    bool isNotErc1155
  ) external view returns(address, uint256);
}
```

### Internal Storage Structure

```
mapping (
  // tag author address (NOTE: only one tag may be authored per address)
  address => Tag
) public authoredTags;

enum TagType {
  //
  // Def: each claimable NFT is a copy of the master NFT, up to the preset total supply.
  //
  LimitedOrOpenEdition,
  //
  // Def: only one claimable NFT, always with a supply of 1.
  //
  SingleUse1Of1,
  //
  // Def: one claimable NFT, that can be continually refilled (unrestricted by the preset total supply).
  //
  Refillable1Of1,
  //
  // Def: claimable fungible tokens (claimed based on an amount per user), up to the preset total supply
  //
  WalletRestrictedFungible,
  //
  // Def: only one NFT that is temporarily held by the claimer, possession is transferred after each subsequent claim.
  //
  HotPotato,
  //
  // Def: each claimable NFT is randomly selected from a predefined set (NFTs may be from multiple collections),
  //      up to the preset total supply
  // TODO: Architect using contract factory
  //
  CandyMachineDrop
}

struct Tag {
  //
  // The enum type of the tag
  //
  TagType tagType
  //
  // The address of the ERC-1155 compliant claimable token (ERC-721 or ERC-20)
  //
  address tokenAddress;
  //
  // The token ID of the ERC-721 claimable token (Only used for ERC-721 token claims)
  //
  uint256 erc721TokenId;
  //
  // Indicates if the minter should pay for the claim
  //
  bool minterPays;
  //
  // Indicates the total claimable supply of the token available
  //
  uint256 totalSupply;
  //
  // Indicates the total claimable supply of the token available per user
  //
  uint256 perUser;
  //
  // Indicates the total number of token claims made so far
  //
  uint256 numClaimed;
  //
  // Indicates the number of token claims made by address so far
  //
  mapping (
    address => uint8
  ) claimsMade;
  //
  // TODO: Decide if this is needed.
  // Indicates if the claimable asset is an NFT that does not support the ERC-1155 standard
  // NOTE: Only relevent when `tagType` is one of the following: LimitedOrOpenEdition, SingleUse1Of1, Refillable1Of1
  //
  // bool isNotErc1155;
}
```

### Token Support

Below are the tag claim distributions schemes along with their associated lowest permitted token requirements:

- **SingleUse1Of1**, **Refillable1Of1**, **WalletRestrictedFungible**, **CandyMachineDrop**: ERC-1155
- **HotPotato**: ERC-4907
- **LimitedOrOpenEdition**: The following interface which extends ERC-721:

```
interface CopyableNFT /* is ERC721 */ {
    // @dev This emits when the an NFT has been copied.
    event Copy(address indexed _to, uint256 indexed _tokenId);

    // @notice Mint a new NFT with exactly the same associated metadata (properties) of an existing NFT in this same collection
    // @param _to An address to send the duplicated token to
    // @param _copyTokenId A token ID that we would like to duplicate the metadata of
    // @return uint256 representing the token ID of the newly minted NFT (via this duplication process)
    function mintMetadataCopy(address indexed _to, uint256 _copyTokenId) external view returns (uint256);
}
```
