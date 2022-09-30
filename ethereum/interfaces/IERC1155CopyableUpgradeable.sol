// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/IERC1155MetadataURIUpgradeable.sol";

interface IERC1155CopyableUpgradeable is IERC1155MetadataURIUpgradeable {

    /// @notice This emits when the an NFT has been copied.
    event Copy(address indexed _to, uint256 indexed _tokenIdMaster, uint256 indexed _tokenIdCopy);

    // @notice Mint a new NFT with exactly the same associated metadata (same return value for the `tokenURI()` function) of an existing NFT in this same collection
    // @param _to An address to send the duplicated token to
    // @param _tokenIdMaster A token ID that we would like to duplicate the metadata of
    // @param _tokenIdCopy A token ID that we would like to duplicate the metadata to
    // @return uint256 representing the token ID of the newly minted NFT (via this duplication process)
    function mintCopy(address _to, uint256 _tokenIdMaster, uint256 _tokenIdCopy) external;
}
