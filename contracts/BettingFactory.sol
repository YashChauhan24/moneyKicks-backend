// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BetEscrow.sol";

contract BettingFactory {
    event BetCreated(address indexed betAddress, string title, string competitorA, string competitorB, uint256 stakeAmount, uint256 endTime);

    function createBet(
        string memory title,
        string memory competitorA,
        string memory competitorB,
        uint256 stakeAmount,
        uint256 endTime
    ) external returns (address) {
        BetEscrow newBet = new BetEscrow(title, competitorA, competitorB, stakeAmount, endTime, msg.sender);
        
        emit BetCreated(address(newBet), title, competitorA, competitorB, stakeAmount, endTime);
        
        return address(newBet);
    }
}
