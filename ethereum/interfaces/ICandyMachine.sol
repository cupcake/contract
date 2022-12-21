//SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC1155/extensions/IERC1155MetadataURI.sol";

interface ICandyMachineStorage {
  event Cancellation();  
}

interface ICandyMachine is ICandyMachineStorage, IERC1155MetadataURI {

  ////////////////////////////////////////////////
  //////// F U N C T I O N S

  /*
   * @notice Mint an ERC-1155 asset with a pseudo-randomly selected metadata URI.
   * @dev Emits a {TransferSingle} event.
   */
  function mint(address recipient, bytes32 keyHash) external;

  /*
   * @notice Cancel the CandyMachine. This means that no further NFTs can be minted.
   */
  function cancel() external;
}
