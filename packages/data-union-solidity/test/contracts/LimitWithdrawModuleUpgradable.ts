import { expect, use } from "chai"
import { waffle } from "hardhat"
import { BigNumber, utils } from "ethers"
const {ethers, upgrades} = require("hardhat");
import Debug from "debug"
const log = Debug("Streamr:du:test:DataUnionSidechain")

import DataUnionSidechainJson from "../../artifacts/contracts/DataUnionSidechain.sol/DataUnionSidechain.json"

import TestTokenJson from "../../artifacts/contracts/test/TestToken.sol/TestToken.json"
import MockTokenMediatorJson from "../../artifacts/contracts/test/MockTokenMediator.sol/MockTokenMediator.json"
import MockAMBJson from "../../artifacts/contracts/test/MockAMB.sol/MockAMB.json"

import type { LimitWithdrawModuleUpgradable, DataUnionSidechain, MockTokenMediator, TestToken, MockAMB } from "../../typechain"

// type EthereumAddress = string

use(waffle.solidity)
const { deployContract, provider } = waffle
const { parseEther } = utils

describe("LimitWithdrawModuleUpgradable", () => {
    const [creator, member0, ...others] = provider.getWallets()

    let testToken: TestToken
    let dataUnionSidechain: DataUnionSidechain
    let mockAMB: MockAMB
    let mockTokenMediator: MockTokenMediator

    let limitWithdrawModuleUpgradable: LimitWithdrawModuleUpgradable
    let limitWithdrawModuleUpgradableArgs: [string, number, number, BigNumber, BigNumber]

    before(async () => {
        testToken = await deployContract(creator, TestTokenJson, ["name", "symbol"]) as TestToken
        await testToken.mint(creator.address, parseEther("10000"))

        mockAMB = await deployContract(creator, MockAMBJson, []) as MockAMB
        mockTokenMediator = await deployContract(creator, MockTokenMediatorJson, [testToken.address, mockAMB.address]) as MockTokenMediator

        dataUnionSidechain = await deployContract(creator, DataUnionSidechainJson, []) as DataUnionSidechain

        // function initialize(
        //     address initialOwner,
        //     address tokenAddress,
        //     address tokenMediatorAddress,
        //     address[] memory initialJoinPartAgents,
        //     address mainnetDataUnionAddress,
        //     uint256 defaultNewMemberEth,
        //     uint256 initialAdminFeeFraction,
        //     uint256 initialDataUnionFeeFraction,
        //     address initialDataUnionBeneficiary
        // )
        await dataUnionSidechain.initialize(
            creator.address,
            testToken.address,
            mockTokenMediator.address,
            [],
            creator.address,  // dummy
            "1",
            parseEther("0.1"),
            parseEther("0.1"),
            creator.address
        )
        log("DataUnionSidechain %s initialized", dataUnionSidechain.address)

        // constructor(
        //     DataUnionSidechain dataUnionAddress,
        //     uint newRequiredMemberAgeSeconds,
        //     uint newWithdrawLimitPeriodSeconds,
        //     uint newWithdrawLimitDuringPeriod,
        //     uint newMinimumWithdrawTokenWei
        // )
        const limitWithdrawModuleUpgradableContract = await ethers.getContractFactory("LimitWithdrawModuleUpgradable");

        let DuAddress = dataUnionSidechain.address;

        limitWithdrawModuleUpgradable = await upgrades.deployProxy(limitWithdrawModuleUpgradableContract,[
            DuAddress,
            60 * 60 * 24,
            60 * 60,
            parseEther("100"),
            parseEther("1"),
            DuAddress,//this is fake address
        ]);
        limitWithdrawModuleUpgradable.deployed()
        log("limitWithdrawModuleUpgradable %s set up successfully", limitWithdrawModuleUpgradable.address)
        await dataUnionSidechain.setWithdrawModule(limitWithdrawModuleUpgradable.address)
        await dataUnionSidechain.addJoinListener(limitWithdrawModuleUpgradable.address)
        await dataUnionSidechain.addPartListener(limitWithdrawModuleUpgradable.address)
        log("LimitWithdrawModule %s set up successfully", limitWithdrawModuleUpgradable.address)

        await dataUnionSidechain.addJoinPartAgent(creator.address)
        await dataUnionSidechain.addMember(member0.address)
        await provider.send("evm_increaseTime", [+await limitWithdrawModuleUpgradable.requiredMemberAgeSeconds()])
        await provider.send("evm_mine", [])
        log("Member %s was added to data union and is now 'old' enough to withdraw", member0.address)
    })

    it("add to WhiteList", async () => {
        expect(await limitWithdrawModuleUpgradable.isWhiteListed(others[5].address)).to.eq(false)

        await limitWithdrawModuleUpgradable.addToWhiteList(others[5].address)
        expect(await limitWithdrawModuleUpgradable.isWhiteListed(others[5].address)).to.eq(true)
        expect((await limitWithdrawModuleUpgradable.getWhiteList()).length).to.eq(1)

        await limitWithdrawModuleUpgradable.removeFromWhiteList(others[5].address)
        expect(await limitWithdrawModuleUpgradable.isWhiteListed(others[5].address)).to.eq(false)
        let strings = await limitWithdrawModuleUpgradable.getWhiteList();
        expect(strings.length).to.eq(0)
    })

    it("withdraw to whiteListed should withdraws within withdrawLimitPeriodSeconds", async () => {
        await limitWithdrawModuleUpgradable.addToWhiteList(member0.address)
        await expect(testToken.transferAndCall(dataUnionSidechain.address, parseEther("1000"), "0x")).to.emit(dataUnionSidechain, "RevenueReceived")
        await dataUnionSidechain.withdraw(member0.address, parseEther("200"), false)

        await expect(dataUnionSidechain.withdraw(member0.address, parseEther("50"), false)).to.emit(dataUnionSidechain, "EarningsWithdrawn")
        await expect(dataUnionSidechain.connect(member0).withdrawTo(others[2].address, parseEther("50"), false)).to.revertedWith("error_withdrawLimit")
        await expect(dataUnionSidechain.withdraw(member0.address, parseEther("1"), false)).to.emit(dataUnionSidechain, "EarningsWithdrawn")

        // can not yet withdraw again
        await provider.send("evm_increaseTime", [60])
        await provider.send("evm_mine", [])
        await dataUnionSidechain.withdraw(member0.address, parseEther("1"), false)

    })

})
