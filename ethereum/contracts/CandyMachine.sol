//SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155URIStorage.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/LinkTokenInterface.sol";

contract CandyMachine is ERC1155URIStorage, VRFConsumerBaseV2 {

  event RandomWordsRequested(uint256 indexed requestId);
  event RandomWordsFulfilled(uint256 indexed requestId, uint256 outputWord);
  event Cancellation();

  uint256 internal numURIsExisting;
  uint256 internal nonce;
  uint256 internal numMintsInProcess;
  address internal owner;

  mapping(uint256 => address) public requests;


  uint32 constant callbackGasLimit = 300000;
  uint16 constant requestConfirmations = 3;
  uint32 constant numWords = 1;
  VRFCoordinatorV2Interface COORDINATOR;
  uint64 subscriptionId;

  ////////////////////////////////////////////////
  //////// C O N S T R U C T O R

  /*
   * Initalizes the state variables.
   */
  constructor(string[] memory metadataURIs, address ownerArg, uint64 subscriptionIdArg, address vrfConsumerBaseV2)
    ERC1155('')
    VRFConsumerBaseV2(vrfConsumerBaseV2)
  {
    require(metadataURIs.length > 0 && ownerArg != address(0), 'empty metadataURIs or zero owner');

    for (uint256 i = 0; i < metadataURIs.length; i++) {
      _setURI(i, metadataURIs[i]);
    }
    numURIsExisting = metadataURIs.length;
    owner = ownerArg;
    COORDINATOR = VRFCoordinatorV2Interface(
      vrfConsumerBaseV2
    );
    subscriptionId = subscriptionIdArg;
  }

  /*
   * Modifier to ensure that only the designated "owner" can access the associated function.
   * NOTE: This modifier should NOT be confused with OwnableUpgradeable's modifier by the same name.
   */
  modifier onlyOwner {
    require(msg.sender == owner, 'caller not owner');
    _;
  }

  ////////////////////////////////////////////////
  //////// F U N C T I O N S

  /*
   * @notice Begin process of minting an ERC-1155 asset by requesting a random number from Chainlink.
   * @dev Emits a {RandomWordsRequested} event.
   */
  function mint(address recipient, bytes32 keyHash)
    external
    onlyOwner
    returns (uint256 requestId)
  {
    require((nonce + numMintsInProcess) < numURIsExisting, "CandyMachine empty");
    // Will revert if subscription is not set and funded.
    requestId = COORDINATOR.requestRandomWords(
        keyHash,
        subscriptionId,
        requestConfirmations,
        callbackGasLimit,
        numWords
    );
    emit RandomWordsRequested(requestId);
    numMintsInProcess += 1;
    requests[requestId] = recipient;
    return requestId;
  }

  /*
   * @notice Receives the requested random number and mints an ERC-1155 asset using the randomness.
   * @dev Emits a {RandomWordsFulfilled} event and a {TransferSingle} event.
   */
  function fulfillRandomWords(
    uint256 _requestId,
    uint256[] memory _randomWords
  ) internal override {
    require(requests[_requestId] != address(0) && nonce < numURIsExisting, "no request or CM empty");

    uint256 randomNum = _randomWords[0] % (numURIsExisting - nonce);

    emit RandomWordsFulfilled(_requestId, randomNum);

    string memory temp = uri(nonce + randomNum);
    _setURI(nonce + randomNum, uri(nonce));
    _setURI(nonce, temp);

    _mint(requests[_requestId], nonce, 1, "0x00");

    nonce += 1;
    numMintsInProcess -= 1;
  }

  /*
   * @notice Cancel the CandyMachine. This means that no further NFTs can be minted.
   * @dev Emits a {Cancellation} event.
   */
  function cancel() external onlyOwner {
    emit Cancellation();
    for (uint256 i = nonce; i < numURIsExisting; i++) {
      _setURI(i, "");
    }
    nonce = numURIsExisting;
  }
}
