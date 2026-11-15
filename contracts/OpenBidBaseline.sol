// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Intentionally insecure comparison contract for the front-running demo.
contract OpenBidBaseline {
    uint256 public highestBid;
    address public winner;

    event OpenBidPlaced(address indexed bidder, uint256 bid);

    function placeBid(uint256 bid) external {
        require(bid > highestBid, "Bid must beat the current highest bid");
        highestBid = bid;
        winner = msg.sender;
        emit OpenBidPlaced(msg.sender, bid);
    }
}
