# 🧁 Cupcake

NPM module is "cupcake-cli", represents what is in the CLI folder

## Ethereum Contract Architecture

### Internal Storage Structure

```
enum TagType {
  //
  // Each claimable NFT is a copy of the master NFT, up to the preset total supply
  // NOTE: This is implemented via a modified version of the ERC-1155 standard (see IERC1155CopyableUpgradeable)
  //
  LimitedOrOpenEdition,
  //
  // Only one claimable NFT, always with a supply of 1 (a tag can never be refilled or reused)
  //
  SingleUse1Of1,
  //
  // One claimable NFT, that can be continually refilled
  //
  Refillable1Of1,
  //
  // Claimable fungible tokens (claimed based on an amount per user), up to the preset total supply
  //
  WalletRestrictedFungible,
  //
  // Only one NFT that is temporarily held by the claimer, "renter" status is transferred after each claim
  // NOTE: This is implemented via the ERC-4907 "Rentable" standard
  //
  HotPotato,
  //
  // Each claimable NFT is randomly selected from a predefined set of metadata URIs.
  // NOTE: This is implemented via a contract factory pattern (see CandyMachine and CandyMachineFactory)
  //
  CandyMachineDrop
}

struct Tag {
  //
  // The enum type of the tag (from the above)
  //
  TagType tagType;
  //
  // The address of the ERC-1155, ERC-721 or ERC-20 compliant claimable token, or the CandyMachine contract address
  //
  address assetAddress;
  //
  // The token ID of the NFT claimable token (only used for non-fungible claims)
  //
  uint256 erc721TokenId;
  //
  // The address that must have signed the transaction for a claim transaction to be valid
  //
  address tagAuthority;
  //
  // Indicates the total claimable supply of the token available
  //
  uint256 totalSupply;
  //
  // Indicates the total claimable supply of the token available per user
  //
  uint256 perUser;
  //
  // Indicates the amount of fungible token to make claimable per claim (only for fungible claims)
  //
  uint256 fungiblePerClaim;
  //
  // The unique uid from the NFC tag
  //
  uint256 uid;
  //
  // Indicates the total number of token claims made so far
  //
  uint256 numClaimed;
  //
  // Indicates the number of token claims made by address so far
  //
  mapping (
    address => uint256
  ) claimsMade;
}

mapping (
  // tag's unique identifier, see the hashUniqueTag() function to understand how the bytes32 is generated.
  bytes32 => Tag
) public tags;

// The following is used pass this data into addOrRefillTag function without exceeding the parameter limit
struct TagPassed {
  TagType tagType;
  address assetAddress;
  uint256 erc721TokenId;
  address tagAuthority;
  uint256 totalSupply;
  uint256 perUser;
  uint256 fungiblePerClaim;
  uint256 uid;
}
```

### Interface

```
interface Contract {
  /*
   * @notice Add or refill assets that can be claimed for a specified tag
   */
  function addOrRefillTag(
    TagPassed calldata passedTag,
    // Indicates if the claimable asset is an NFT that does not support the ERC-1155 standard
    // NOTE: Relevent when `tagType` is not HotPotato or CandyMachineDrop
    bool isNotErc1155,
    // Indicates the metadata URIs to use for the new NFT assets in CandyMachine
    // NOTE: Relevent only when `tagType` is CandyMachineDrop
    string[] calldata metadataURIs
  ) external onlyOwner;

  /*
   * @notice Claim an asset for a specified tag
   * @returns address representing the address of the newly claimed token
   * @returns uint256 representing the tokenId of the newly claimed token (if non-fungible)
   * @returns uint256 representing the amount of the newly claimed token (if fungible)
   */
  function claimTag(
    address recipient,
    uint256 uid,
    // Indicates if the claimable asset is an NFT that does not support the ERC-1155 standard
    // NOTE: Relevent when `tagType` is not HotPotato
    bool isNotErc1155,
    // Indicates the new (copied) asset's token
    // NOTE: Relevent when `tagType` is LimitedOrOpenEdition; this value must not already exist in the collection.
    uint256 newTokenId
  ) external onlyOwner returns(address, uint256, uint256);

  /*
   * @notice Cancel and empty a specified tag
   */
  function cancelAndEmpty(
    uint256 uid,
    // Indicates if the claimable asset is an NFT that does not support the ERC-1155 standard
    // NOTE: Relevent when `tagType` is not HotPotato
    bool isNotErc1155
  ) external onlyOwner;  
}
```

### Token Support

Below are the tag claim distribution schemes along with their associated lowest permitted claimable-token requirements:

- **SingleUse1Of1**, **Refillable1Of1**, **CandyMachineDrop**: ERC-1155 (or ERC-721 via the `isNotErc1155` parameter.)
- **WalletRestrictedFungible**: ERC-1155 (or ERC-20 via the `isNotErc1155` parameter.)
- **HotPotato**: ERC-4907
- **LimitedOrOpenEdition**: The following interface which extends ERC-1155:

```
interface IERC1155CopyableUpgradeable is IERC1155MetadataURIUpgradeable {

    /// @notice This emits when the an NFT has been copied.
    event Copy(address indexed _to, uint256 indexed _tokenIdMaster, uint256 indexed _tokenIdCopy);

    // @notice Mint a new NFT with exactly the same associated metadata (same return value for the `tokenURI()` function) of an existing NFT in this same collection
    // @param _to An address to send the duplicated token to
    // @param _tokenIdMaster A token ID that we would like to duplicate the metadata of
    // @param _tokenIdCopy A token ID that we would like to duplicate the metadata to
    // @return uint256 representing the token ID of the newly minted NFT (via this duplication process)
    function mintCopy(address to, uint256 tokenIdMaster, uint256 tokenIdCopy) external;
}
```

## Usage

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

The same pattern above for deployment and upgrading can be applied across all of the contracts.

### Testnet

#### NFT Tag: SingleUse1Of1 or Refillable1Of1

1) Get some test ETH for the Goerli testnet by clicking [here](https://goerlifaucet.com/).
2) Mint a test NFT by clicking [here](https://goerli.etherscan.io/address/0x39ec448b891c476e166b3c3242a90830db556661#writeContract#F2) then clicking "Connect to Web3" and inputting the following:
    - _to: (your wallet address)
    - _tokenId: (any random / unique number - it must not have been used before by someone else)
    - _uri: (any url, for example: https://google.com)
3) Approve the NFT token to be taken by the Cupcake Contract by clicking [here](https://goerli.etherscan.io/address/0x39ec448b891c476e166b3c3242a90830db556661#writeContract#F1) then clicking "Connect to Web3" and inputting the following:
    - _approved: 0x0285d1f1a27CD6fE7c8e9DbAA3Fb551EBAc88000
    - _tokenId: (the same _tokenId that you entered in the last step)
4) Add a new Cupcake tag by running the `addOrRefillTag` function and staking the NFT (that we created in the last step) by clicking [here](https://goerli.etherscan.io/address/0x0285d1f1a27CD6fE7c8e9DbAA3Fb551EBAc88000#writeProxyContract#F1) then clicking "Connect to Web3" and inputting the following:
    - tagType: (one of the following: "1" for SingleUse1Of1 or "2" for Refillable1Of1)
    - tokenAddress: 0x39ec448b891c476e166b3c3242a90830db556661
    - erc721TokenId: (the same _tokenId that you entered in the last two steps)
    - tagAuthority: (your wallet address, this address must send the claim transaction in the next step)
    - totalSupply: (the maximum number of claims for this tag that you want to permit in total for all users)
    - perUser: (the maximum number of claims for this tag that you want to permit for each user)
    - fungiblePerClaim: 0
    - uid: (any unique number, this must be a number that hasn't been used before by someone else)
    - isNotErc1155: true
4) Claim the new Cupcake tag (that you created in the last step) by running the `claimTag` function by clicking [here](https://goerli.etherscan.io/address/0x0285d1f1a27CD6fE7c8e9DbAA3Fb551EBAc88000#writeProxyContract#F2) then clicking "Connect to Web3" and inputting the following:
    - receiver: (the wallet address that you would like to receive the claimed NFT)
    - uid: (this must be the same "uid" that you provided in the previous step)
    - isNotErc1155: true

#### NFT Tag: HotPotato

1) Get some test ETH for the Goerli testnet by clicking [here](https://goerlifaucet.com/).
2) Mint a test **Rentable** NFT by clicking [here](https://goerli.etherscan.io/token/0x68c81B4d8CEA9880a54963E3Ac4133b59C518AaF#writeProxyContract#F3) then clicking "Connect to Web3" and then clicking "Write". Next, while the transaction processes, click the "View your transaction" button.
3) Approve the NFT token to be taken by the Cupcake Contract by clicking [here](https://goerli.etherscan.io/token/0x68c81B4d8CEA9880a54963E3Ac4133b59C518AaF#writeProxyContract#F1) then clicking "Connect to Web3" and inputting the following:
    - to: 0x0285d1f1a27CD6fE7c8e9DbAA3Fb551EBAc88000
    - tokenId: (use the number after the "ERC-721 Token ID" text on the transaction page that you opened at the end of the last step)
4) Add a new Cupcake tag by running the `addOrRefillTag` function and staking the NFT (that we created in the last step) by clicking [here](https://goerli.etherscan.io/address/0x0285d1f1a27CD6fE7c8e9DbAA3Fb551EBAc88000#writeProxyContract#F1) then clicking "Connect to Web3" and inputting the following:
    - tagType: 4
    - tokenAddress: 0x68c81B4d8CEA9880a54963E3Ac4133b59C518AaF
    - erc721TokenId: (the same tokenId that you entered in the last step)
    - tagAuthority: (your wallet address, this address must send the claim transaction in the next step)
    - totalSupply: 1
    - perUser: 1
    - fungiblePerClaim: 0
    - uid: (any unique number, this must be a number that hasn't been used before by someone else)
    - isNotErc1155: true
4) Claim the new Cupcake tag (that you created in the last step) by running the `claimTag` function by clicking [here](https://goerli.etherscan.io/address/0x0285d1f1a27CD6fE7c8e9DbAA3Fb551EBAc88000#writeProxyContract#F2) then clicking "Connect to Web3" and inputting the following:
    - receiver: (the wallet address that you would like to receive the claimed NFT)
    - uid: (this must be the same "uid" that you provided in the previous step)
    - isNotErc1155: true

#### NFT Tag: LimitedOrOpenEdition

1) Get some test ETH for the Goerli testnet by clicking [here](https://goerlifaucet.com/).
2) Mint a test **Copyable** NFT by clicking [here](https://goerli.etherscan.io/address/0x6dC5d9edcdD20543dB4788B26301fB7372c4d4EC#writeProxyContract#F3) then clicking "Connect to Web3" and inputting the following:
    - to: (your wallet address)
    - tokenId: (any random / unique number - it must not have been used before by someone else)
3) Approve the NFT token to be taken by the Cupcake Contract by clicking [here](https://goerli.etherscan.io/address/0x6dC5d9edcdD20543dB4788B26301fB7372c4d4EC#writeProxyContract#F1) then clicking "Connect to Web3" and inputting the following:
    - to: 0x0285d1f1a27CD6fE7c8e9DbAA3Fb551EBAc88000
    - tokenId: (the same tokenId that you entered in the last step)
4) Add a new Cupcake tag by running the `addOrRefillTag` function and staking the NFT (that we created in the last step) by clicking [here](https://goerli.etherscan.io/address/0x0285d1f1a27CD6fE7c8e9DbAA3Fb551EBAc88000#writeProxyContract#F1) then clicking "Connect to Web3" and inputting the following:
    - tagType: 0
    - tokenAddress: 0x6dC5d9edcdD20543dB4788B26301fB7372c4d4EC
    - erc721TokenId: (the same tokenId that you entered in the last step)
    - tagAuthority: (your wallet address, this address must send the claim transaction in the next step)
    - totalSupply: (the maximum number of claims for this tag that you want to permit in total for all users)
    - perUser: (the maximum number of claims for this tag that you want to permit for each user)
    - fungiblePerClaim: 0
    - uid: (any unique number, this must be a number that hasn't been used before by someone else)
    - isNotErc1155: true
4) Claim the new Cupcake tag (that you created in the last step) by running the `claimTag` function by clicking [here](https://goerli.etherscan.io/address/0x0285d1f1a27CD6fE7c8e9DbAA3Fb551EBAc88000#writeProxyContract#F2) then clicking "Connect to Web3" and inputting the following:
    - receiver: (the wallet address that you would like to receive the claimed NFT)
    - uid: (this must be the same "uid" that you provided in the previous step)
    - isNotErc1155: true

#### Fungible Tag: WalletRestrictedFungible

1) Get some test ETH for the Goerli testnet by clicking [here](https://goerlifaucet.com/).
2) Mint a some test ERC-20 token by clicking [here](https://goerli.etherscan.io/address/0xaFF4481D10270F50f203E0763e2597776068CBc5#writeContract#F4) then clicking "Connect to Web3" running the `drip` function.
3) Approve the ERC-20 token to be taken by the Cupcake Contract by clicking [here](https://goerli.etherscan.io/address/0xaFF4481D10270F50f203E0763e2597776068CBc5#writeContract#F1) then clicking "Connect to Web3" and inputting the following:
    - spender: 0x0285d1f1a27CD6fE7c8e9DbAA3Fb551EBAc88000
    - tokens: (a number that is more than the "totalSupply" of the token you want to make claimable in the next step)
4) Add a new Cupcake tag by running the `addOrRefillTag` function and staking the ERC-20 tokens (that we minted in the last step) by clicking [here](https://goerli.etherscan.io/address/0x0285d1f1a27CD6fE7c8e9DbAA3Fb551EBAc88000#writeProxyContract#F1) then clicking "Connect to Web3" and inputting the following:
    - tagType: 3
    - tokenAddress: 0xaFF4481D10270F50f203E0763e2597776068CBc5
    - erc721TokenId: 0
    - tagAuthority: (your wallet address, this address must send the claim transaction in the next step)
    - totalSupply: (the maximum number of claims for this tag that you want to permit in total for all users)
    - perUser: (the maximum number of claims for this tag that you want to permit for each user)
    - fungiblePerClaim: (the amount of the ERC-20 that you want to giveaway to the user per claim, this must be less than the perUser amount above)
    - uid: (any unique number, this must be a number that hasn't been used before by someone else)
    - isNotErc1155: true
4) Claim the new Cupcake tag (that you created in the last step) by running the `claimTag` function by clicking [here](https://goerli.etherscan.io/address/0x0285d1f1a27CD6fE7c8e9DbAA3Fb551EBAc88000#writeProxyContract#F2) then clicking "Connect to Web3" and inputting the following:
    - receiver: (the wallet address that you would like to receive the claimed ERC-20 tokens)
    - uid: (this must be the same "uid" that you provided in the previous step)
    - isNotErc1155: true

## Known Concerns

- Currently the CandyMachine uses a pseudo-random number generator to select assets to distribute. This is acceptable for the time-being since the order of distribution is of negligible financial value currently. (See here for more information on this vulnerability: https://github.com/crytic/slither/wiki/Detector-Documentation#weak-PRNG)
- Currently the `claimsMade` mapping is not cleared when tag deletion occurs. (See here for more information on this vulnerability: https://github.com/crytic/slither/wiki/Detector-Documentation#deletion-on-mapping-containing-a-structure) See the solution below in Further Expansions of how this minor issue can be resolved.

## Further Expansions

- Tracking of `claimsMade` of each tag by changing the value of the mapping to be a tuple that tracks the block number of the last claim and then enable invalidation via a `lastDeleted` varaible containing the block number of the last deleation of that tag (right now `claimsMade` are not cleared when a tag deleation occurs).
- The ability to define a non-sender as the payer for a claim (`minter_pays = true` from the Solana contract).
