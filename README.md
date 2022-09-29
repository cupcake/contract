# 🧁 Cupcake

NPM module is "cupcake-cli", represents what is in the CLI folder

## Usage

### Testnet

#### NFT Tag

1) Get some test ETH for the Goerli testnet by clicking [here](https://goerlifaucet.com/).
2) Mint a test NFT by clicking [here](https://goerli.etherscan.io/address/0x39ec448b891c476e166b3c3242a90830db556661#writeContract#F2) then clicking "Connect to Web3" and inputting the following:
    - _to: (your wallet address)
    - _tokenId: (any random / unique number - it must not have been used before by someone else)
    - _uri: (any url, for example: https://google.com)
3) Approve the NFT token to be used by the Cupcake Contract by clicking [here](https://goerli.etherscan.io/address/0x39ec448b891c476e166b3c3242a90830db556661#writeContract#F1) then clicking "Connect to Web3" and inputting the following:
    - _approved: 0x32b78F7269C9fd7F65C8dCD0bD0721B0B522F31C
    - _tokenId: (the same _tokenId that you entered in the last step)
4) Add a new Cupcake tag by running the `addOrRefillTag` function and staking the NFT (that we created in the last step) by clicking [here](https://goerli.etherscan.io/address/0x32b78f7269c9fd7f65c8dcd0bd0721b0b522f31c#writeProxyContract#F1) then clicking "Connect to Web3" and inputting the following:
    - tagType: (one of the following: "1" for SingleUse1Of1 or "2" for Refillable1Of1)
    - tokenAddress: 0x39ec448b891c476e166b3c3242a90830db556661
    - erc721TokenId: (the same _tokenId that you entered in the last two steps)
    - tagAuthority: (your wallet address, this address must send the claim transaction in the next step)
    - totalSupply: (the maximum number of claims for this tag that you want to permit in total for all users)
    - perUser: (the maximum number of claims for this tag that you want to permit for each user)
    - fungiblePerClaim: 0
    - uid: (any unique number, this must be a number that hasn't been used before by someone else)
    - isNotErc1155: true
4) Claim the new Cupcake tag (that you created in the last step) by running the `claimTag` function by clicking [here](https://goerli.etherscan.io/address/0x32b78f7269c9fd7f65c8dcd0bd0721b0b522f31c#writeProxyContract#F2) then clicking "Connect to Web3" and inputting the following:
    - receiver: (the wallet address that you would like to receive the claimed NFT)
    - uid: (this must be the same "uid" that you provided in the previous step)
    - isNotErc1155: true

#### Fungible Tag

1) Get some test ETH for the Goerli testnet by clicking [here](https://goerlifaucet.com/).
2) Mint a some test ERC-20 token by clicking [here](https://goerli.etherscan.io/address/0xaFF4481D10270F50f203E0763e2597776068CBc5#writeContract#F4) then clicking "Connect to Web3" running the `drip` function.
3) Approve the ERC-20 token to be used by the Cupcake Contract by clicking [here](https://goerli.etherscan.io/address/0xaFF4481D10270F50f203E0763e2597776068CBc5#writeContract#F1) then clicking "Connect to Web3" and inputting the following:
    - spender: 0x32b78F7269C9fd7F65C8dCD0bD0721B0B522F31C
    - tokens: (a number that is more than the "totalSupply" of the token you want to make claimable in the next step)
4) Add a new Cupcake tag by running the `addOrRefillTag` function and staking the ERC-20 tokens (that we minted in the last step) by clicking [here](https://goerli.etherscan.io/address/0x32b78f7269c9fd7f65c8dcd0bd0721b0b522f31c#writeProxyContract#F1) then clicking "Connect to Web3" and inputting the following:
    - tagType: 3
    - tokenAddress: 0xaFF4481D10270F50f203E0763e2597776068CBc5
    - erc721TokenId: 0
    - tagAuthority: (your wallet address, this address must send the claim transaction in the next step)
    - totalSupply: (the maximum number of claims for this tag that you want to permit in total for all users)
    - perUser: (the maximum number of claims for this tag that you want to permit for each user)
    - fungiblePerClaim: (the amount of the ERC-20 that you want to giveaway to the user per claim, this must be less than the perUser amount above)
    - uid: (any unique number, this must be a number that hasn't been used before by someone else)
    - isNotErc1155: true
4) Claim the new Cupcake tag (that you created in the last step) by running the `claimTag` function by clicking [here](https://goerli.etherscan.io/address/0x32b78f7269c9fd7f65c8dcd0bd0721b0b522f31c#writeProxyContract#F2) then clicking "Connect to Web3" and inputting the following:
    - receiver: (the wallet address that you would like to receive the claimed ERC-20 tokens)
    - uid: (this must be the same "uid" that you provided in the previous step)
    - isNotErc1155: true

### Compile, Deploy and Upgrade

First, ensure that you have implemented the `.env` file following the format of the [`.env.example`](/.env.example) file.

To deploy:

```
env $(cat .env) npx hardhat run --network goerli ethereum/scripts/deploy_contract.js
```

Ensure that the `PROXY_ADDR_CONTRACT` env variable is set properly based on the newly deployed contract.

To upgrade:

```
env $(cat .env) npx hardhat run --network goerli ethereum/scripts/upgrade_contract.js
```

## Ethereum Contract Architecture

### Internal Storage Structure

```
enum TagType {
  //
  // Each claimable NFT is a copy of the master NFT, up to the preset total supply
  //
  LimitedOrOpenEdition,
  //
  // Only one claimable NFT, always with a supply of 1
  //
  SingleUse1Of1,
  //
  // One claimable NFT, that can be continually refilled (unrestricted by the preset total supply)
  //
  Refillable1Of1,
  //
  // Claimable fungible tokens (claimed based on an amount per user), up to the preset total supply
  //
  WalletRestrictedFungible,
  //
  // Only one NFT that is temporarily held by the claimer, possession is transferred after each subsequent claim
  //
  HotPotato,
  //
  // Each claimable NFT is randomly selected from a predefined set (NFTs may be from multiple collections),
  // up to the preset total supply
  // TODO: Architect using contract factory
  //
  CandyMachineDrop
}

struct Tag {
  //
  // The enum type of the tag
  //
  TagType tagType;
  //
  // The address of the ERC-1155 compliant claimable token (ERC-721 or ERC-20)
  //
  address tokenAddress;
  //
  // The token ID of the ERC-721 claimable token (Only used for ERC-721 token claims)
  //
  uint256 erc721TokenId;
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
  // the uid string from the NFC tag
  //
  uint64 uid;
  //
  // the address that must have signed for a claim transaction to be valid
  //
  address tagAuthority;
}

mapping (
  // tag author address (NOTE: only one tag may be authored per address)
  address => Tag
) public authoredTags;
```

### Interface

```
interface Contract {
  /*
   * @notice Add or refill ERC-1155 assets that can be claimed for a specified tag
   * @returns uint256 representing the total claimable supply now available for this tag
   */
  function addOrRefillTag(
    TagType tagType,
    address tokenAddress,
    uint256 erc721TokenId,
    uint256 totalSupply,
    uint256 perUser,
    // Indicates if the claimable asset is an NFT that does not support the ERC-1155 standard
    // NOTE: Only relevent when `tagType` is one of the following: LimitedOrOpenEdition, SingleUse1Of1, Refillable1Of1
    bool isNotErc1155
  ) external view returns(uint256);

  /*
   * @notice Claim an ERC-1155 asset for a specified tag
   * @returns address representing the address of the newly claimed token
   * @returns uint256 representing the tokenId of the newly claimed token
   */
  function claimTag(
    address authorAddress,
    address receiver,
    // Indicates if the claimable asset is an NFT that does not support the ERC-1155 standard
    // NOTE: Only relevent when `tagType` is one of the following: LimitedOrOpenEdition, SingleUse1Of1, Refillable1Of1
    bool isNotErc1155
  ) external view returns(address, uint256);
}
```

### Token Support

Below are the tag claim distribution schemes along with their associated lowest permitted claimable-token requirements:

- **SingleUse1Of1**, **Refillable1Of1**, **WalletRestrictedFungible**, **CandyMachineDrop**: ERC-1155 (or ERC-721 via the `isNotErc1155` parameter.)
- **HotPotato**: ERC-4907
- **LimitedOrOpenEdition**: The following interface which extends ERC-1155:

```
interface CopyableNFT /* is ERC1155 */ {
    // @dev This emits when the an NFT has been copied.
    event Copy(address indexed _to, uint256 indexed _tokenId);

    // @notice Mint a new NFT with exactly the same associated metadata (same return value for the `tokenURI()` function) of an existing NFT in this same collection
    // @param _to An address to send the duplicated token to
    // @param _copyTokenId A token ID that we would like to duplicate the metadata of
    // @return uint256 representing the token ID of the newly minted NFT (via this duplication process)
    function mintMetadataCopy(address indexed _to, uint256 _copyTokenId) external view returns (uint256);
}
```

### Further Expansions

- The ability to define a non-sender as the payer for a claim (`minter_pays = true` from the Solana contract).
