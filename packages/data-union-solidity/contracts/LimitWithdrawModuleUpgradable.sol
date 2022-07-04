// SPDX-License-Identifier: MIT
/* solhint-disable not-rely-on-time */

pragma solidity 0.8.6;

import "./IERC677.sol";
import "./IWithdrawModule.sol";
import "./IJoinListener.sol";
import "./IPartListener.sol";
import "./DataUnionModuleUpgradable.sol";

interface ILimitWithdrawModule{
    function memberJoinTimestamp(address) external view returns(uint);
    function lastWithdrawTimestamp(address) external view returns(uint);
    function withdrawnDuringPeriod(address) external view returns(uint);
}

/**
 * @title Data Union module that limits per-user withdraws to given amount per period
 * @dev Setup: dataUnion.setWithdrawModule(this); dataUnion.addJoinListener(this); dataUnion.addPartListener(this)
 */
contract LimitWithdrawModuleUpgradable is DataUnionModuleUpgradable, IWithdrawModule, IJoinListener, IPartListener {
    uint public requiredMemberAgeSeconds;
    uint public withdrawLimitPeriodSeconds;
    uint public withdrawLimitDuringPeriod;
    uint public minimumWithdrawTokenWei;
    address public oldContractAddress;

    address[] public whiteList;
    address[] public joinedMemberList;

    mapping (address => uint) public memberJoinTimestamp;
    mapping (address => uint) public lastWithdrawTimestamp;
    mapping (address => uint) public withdrawnDuringPeriod;
    mapping (address => bool) public blackListed;
    mapping (address => bool) public whiteListMap;

    event ModuleReset(address newDataUnion, uint newRequiredMemberAgeSeconds, uint newWithdrawLimitPeriodSeconds, uint newWithdrawLimitDuringPeriod, uint newMinimumWithdrawTokenWei);

    constructor(){}

    function initialize(
        address dataUnionAddress,
        uint newRequiredMemberAgeSeconds,
        uint newWithdrawLimitPeriodSeconds,
        uint newWithdrawLimitDuringPeriod,
        uint newMinimumWithdrawTokenWei,
        address _oldContractAddress
    ) public initializer  {

        DataUnionModuleUpgradable.initializerMethod(dataUnionAddress);

        requiredMemberAgeSeconds = newRequiredMemberAgeSeconds;
        withdrawLimitPeriodSeconds = newWithdrawLimitPeriodSeconds;
        withdrawLimitDuringPeriod = newWithdrawLimitDuringPeriod;
        minimumWithdrawTokenWei = newMinimumWithdrawTokenWei;
        oldContractAddress = _oldContractAddress;
    }

    function setParameters(
        address dataUnionAddress,
        uint newRequiredMemberAgeSeconds,
        uint newWithdrawLimitPeriodSeconds,
        uint newWithdrawLimitDuringPeriod,
        uint newMinimumWithdrawTokenWei
    ) external onlyOwner {
        dataUnion = dataUnionAddress;
        requiredMemberAgeSeconds = newRequiredMemberAgeSeconds;
        withdrawLimitPeriodSeconds = newWithdrawLimitPeriodSeconds;
        withdrawLimitDuringPeriod = newWithdrawLimitDuringPeriod;
        minimumWithdrawTokenWei = newMinimumWithdrawTokenWei;
        emit ModuleReset(dataUnion, requiredMemberAgeSeconds, withdrawLimitPeriodSeconds, withdrawLimitDuringPeriod, minimumWithdrawTokenWei);
    }

    /**
     * (Re-)start the "age counter" for new members
     * Design choice: restart it also for those who have been members before (and thus maybe already previously waited the cooldown period).
     * Reasoning: after re-joining, the member has accumulated new earnings, and those new earnings should have the limitation period.
     *   Anyway, the member has the chance to withdraw BEFORE joining again, so restarting the "age counter" doesn't prevent withdrawing the old earnings (before re-join).
     */
    function onJoin(address newMember) override external onlyDataUnion {
        //User is not in the list
        if(memberJoinTimestamp[newMember] == 0){
            joinedMemberList.push(newMember);
        }
        memberJoinTimestamp[newMember] = block.timestamp;

        // undo a previously banned member's withdraw limitation, see onPart
        delete blackListed[newMember];
    }

    /**
     * Design choice: banned members will not be able to withdraw until they re-join.
     *   Just removing the ban isn't enough because this module won't knoظw about it.
     *   However, BanModule.restore causes a re-join, so it works fine.
     */
    function onPart(address leavingMember, LeaveConditionCode leaveConditionCode) override external onlyDataUnion {
        if (leaveConditionCode == LeaveConditionCode.BANNED) {
            blackListed[leavingMember] = true;
        }
    }

    function getWithdrawLimit(address member, uint maxWithdrawable) override external view returns (uint256) {
        return blackListed[member] ? 0 : maxWithdrawable;
    }

    /** Admin function to set join timestamp, e.g. for migrating old users */
    function setJoinTimestamp(address member, uint timestamp) external onlyOwner {
        updateUser(member);
        memberJoinTimestamp[member] = timestamp;
    }

    /** Admin function to set withdraw timestamp, e.g. for migrating old users */
    function setLastWithdrawTimestamp(address member, uint timestamp) external onlyOwner {
        updateUser(member);
        lastWithdrawTimestamp[member] = timestamp;
    }

    /** Admin function to set withdrawnDuringPeriod, e.g. for migrating old users */
    function setWithdrawnDuringPeriod(address member, uint amount) external onlyOwner {
        updateUser(member);
        withdrawnDuringPeriod[member] = amount;
    }

    /** Admin function to set joined user information, e.g. for migrating old users */
    function setUserJoinInfo(address member, uint joinTime, uint withdrawTime, uint WithdrawDuringPeriod) public onlyOwner {
        joinedMemberList.push(member);
        memberJoinTimestamp[member] = joinTime;
        lastWithdrawTimestamp[member] = withdrawTime;
        withdrawnDuringPeriod[member] = WithdrawDuringPeriod;
    }

    function updateUser(address member) public {
        if(memberJoinTimestamp[member] > 0){
            return;
        }
        uint joinTime = ILimitWithdrawModule(oldContractAddress).memberJoinTimestamp(member);
        uint withdrawTime = ILimitWithdrawModule(oldContractAddress).lastWithdrawTimestamp(member);
        uint WithdrawDuringPeriod = ILimitWithdrawModule(oldContractAddress).withdrawnDuringPeriod(member);

        setUserJoinInfo(member, joinTime, withdrawTime, WithdrawDuringPeriod);

    }

    /** Admin function to set blacklist, e.g. for migrating old users */
    function setBlackListed(address member) external onlyOwner {
        blackListed[member] = true;
    }

    /** Admin function to set batch blacklist, e.g. for migrating old users */
    function setBlackListedBatched(address[] memory members) external onlyOwner {
        for(uint idx = 0; idx < members.length; idx++){
            blackListed[members[idx]] = true;
        }
    }

    function addToWhiteList(address member) public onlyOwner{
        whiteListMap[member] = true;
        whiteList.push(member);
    }

    function addToWhiteListBatch(address[] memory members) external onlyOwner{

        for(uint idx = 0; idx < members.length; idx++){
            addToWhiteList(members[idx]);
        }
    }

    function removeFromWhiteList(address member) external onlyOwner{
        whiteListMap[member] = false;
        uint idx = 0;
        for(; idx < whiteList.length - 1; idx++){
            if(whiteList[idx] == member){
                break;
            }
        }
        require(whiteList[idx] == member, 'Not found');
        whiteList[idx] = whiteList[whiteList.length-1];
        whiteList.pop();

    }

    function getWhiteList() view public returns (address[] memory){
        return whiteList;
    }

    function isWhiteListed(address member) view public returns (bool){
        return whiteListMap[member];
    }

    /**
     * When a withdraw happens in the DU, tokens are transferred to the withdrawModule, then this function is called.
     * When we revert here, the whole withdraw transaction is reverted.
     */
    function onWithdraw(address member, address to, IERC677 token, uint amountWei) override external onlyDataUnion {
        updateUser(member);
        require(amountWei >= minimumWithdrawTokenWei, "error_withdrawAmountBelowMinimum");
        require(memberJoinTimestamp[member] > 0, "error_mustJoinBeforeWithdraw");
        bool whiteListed = isWhiteListed(to);
        require(whiteListed || block.timestamp >= memberJoinTimestamp[member] + requiredMemberAgeSeconds, "error_memberTooNew");

        // if the withdraw period is over, we reset the counters
        if (block.timestamp > lastWithdrawTimestamp[member] + withdrawLimitPeriodSeconds) {
            lastWithdrawTimestamp[member] = block.timestamp;
            withdrawnDuringPeriod[member] = 0;
        }
        withdrawnDuringPeriod[member] += amountWei;
        require(whiteListed || withdrawnDuringPeriod[member] <= withdrawLimitDuringPeriod, "error_withdrawLimit");

        // transferAndCall also enables transfers over another token bridge
        //   in this case to=another bridge's tokenMediator, and from=recipient on the other chain
        // this follows the tokenMediator API: data will contain the recipient address, which is the same as sender but on the other chain
        // in case transferAndCall recipient is not a tokenMediator, the data can be ignored (it contains the DU member's address)
        require(token.transferAndCall(to, amountWei, abi.encodePacked(member)), "error_transfer");
    }
}