// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import "./IERC677.sol";
import "./LeaveConditionCode.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

interface IDataUnion {
    function owner() external returns (address);
    function removeMember(address member, LeaveConditionCode leaveCondition) external;
    function addMember(address newMember) external;
    function isMember(address member) external view returns (bool);
    function isJoinPartAgent(address agent) external view returns (bool) ;
}

contract DataUnionModuleUpgradable is Initializable {
    address public dataUnion;

    modifier onlyOwner() {
        require(msg.sender == IDataUnion(dataUnion).owner(), "error_onlyOwner");
        _;
    }

    modifier onlyJoinPartAgent() {
        require(IDataUnion(dataUnion).isJoinPartAgent(msg.sender), "error_onlyJoinPartAgent");
        _;
    }

    modifier onlyDataUnion() {
        require(msg.sender == dataUnion, "error_onlyDataUnionContract");
        _;
    }

    constructor() {
    }

    function initializerMethod(address dataUnionAddress) public initializer{
        dataUnion = dataUnionAddress;
    }
}
