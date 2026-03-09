// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BetEscrow {
    string public title;
    string public competitorA;
    string public competitorB;
    uint256 public stakeAmount;
    uint256 public endTime;
    address public creator;

    uint256 public totalA;
    uint256 public totalB;
    bool public resolved;
    uint8 public winningSide; // 0 for pending, 1 for A, 2 for B

    mapping(address => uint256) public betsOnA;
    mapping(address => uint256) public betsOnB;
    mapping(address => bool) public hasClaimed;

    event BetPlaced(address indexed user, uint8 side, uint256 amount);
    event BetResolved(uint8 winningSide);
    event RewardClaimed(address indexed user, uint256 amount);

    constructor(
        string memory _title,
        string memory _competitorA,
        string memory _competitorB,
        uint256 _stakeAmount,
        uint256 _endTime,
        address _creator
    ) {
        title = _title;
        competitorA = _competitorA;
        competitorB = _competitorB;
        stakeAmount = _stakeAmount;
        endTime = _endTime;
        creator = _creator;
    }

    function placeBet(uint8 side) external payable {
        require(msg.value == stakeAmount, "Must deposit exact stake amount");
        require(side == 1 || side == 2, "Invalid side");
        require(!resolved, "Bet is already resolved");
        require(block.timestamp <= endTime || endTime == 0, "Betting period has ended");

        if (side == 1) {
            betsOnA[msg.sender] += msg.value;
            totalA += msg.value;
        } else {
            betsOnB[msg.sender] += msg.value;
            totalB += msg.value;
        }

        emit BetPlaced(msg.sender, side, msg.value);
    }

    function resolveBet(uint8 _winningSide) external {
        // In a real application, restrict this to an oracle or admin
        require(!resolved, "Bet already resolved");
        require(_winningSide == 1 || _winningSide == 2, "Invalid winning side");

        resolved = true;
        winningSide = _winningSide;

        emit BetResolved(_winningSide);
    }

    function claimReward() external {
        require(resolved, "Bet not resolved yet");
        require(!hasClaimed[msg.sender], "Reward already claimed");

        uint256 userBet = winningSide == 1 ? betsOnA[msg.sender] : betsOnB[msg.sender];
        require(userBet > 0, "No winning stake found for user");

        uint256 totalPool = totalA + totalB;
        uint256 totalWinningSide = winningSide == 1 ? totalA : totalB;

        uint256 reward = (userBet * totalPool) / totalWinningSide;

        hasClaimed[msg.sender] = true;

        (bool success, ) = payable(msg.sender).call{value: reward}("");
        require(success, "Transfer failed");

        emit RewardClaimed(msg.sender, reward);
    }
}
