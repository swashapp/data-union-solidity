import { expect, use } from "chai"
import { waffle } from "hardhat"
import { BigNumber, utils } from "ethers"

const {ethers, upgrades} = require("hardhat");
require ('@openzeppelin/hardhat-upgrades');

import Debug from "debug"
const log = Debug("Streamr:du:test:DataUnionSidechain")

import LimitWithdrawModuleJson from "../../artifacts/contracts/LimitWithdrawModule.sol/LimitWithdrawModule.json"

import TestTokenJson from "../../artifacts/contracts/test/TestToken.sol/TestToken.json"
import MockTokenMediatorJson from "../../artifacts/contracts/test/MockTokenMediator.sol/MockTokenMediator.json"
import MockAMBJson from "../../artifacts/contracts/test/MockAMB.sol/MockAMB.json"

import type { LimitWithdrawModule, LimitWithdrawModuleUpgradable, DataUnionSidechain, MockTokenMediator, TestToken, MockAMB } from "../../typechain"
import DataUnionSidechainJson from "../../artifacts/contracts/DataUnionSidechain.sol/DataUnionSidechain.json";

// type EthereumAddress = string

use(waffle.solidity)
const { deployContract, provider } = waffle
const { parseEther, formatEther } = utils

const initialAdminFeeFraction = parseEther("0.1");
const initialDataUnionFeeFraction = parseEther("0.1");

describe("LimitWithdrawModule", () => {
    const [creator, member0, ...others] = provider.getWallets()

    let testToken: TestToken
    let mockAMB: MockAMB
    let mockTokenMediator: MockTokenMediator
    let dataUnionSidechain: DataUnionSidechain

    let limitWithdrawModule: LimitWithdrawModule
    let limitWithdrawModuleUpgradable: LimitWithdrawModuleUpgradable
    let limitWithdrawModuleArgs: [string, number, number, BigNumber, BigNumber]
    let limitWithdrawModuleUpgradableArgs: [string, number, number, BigNumber, BigNumber, string]

    beforeEach(async () => {
        testToken = await deployContract(creator, TestTokenJson, ["name", "symbol"]) as TestToken
        await testToken.mint(creator.address, parseEther("10000"))

        dataUnionSidechain = await deployContract(creator, DataUnionSidechainJson, []) as DataUnionSidechain
        mockAMB = await deployContract(creator, MockAMBJson, []) as MockAMB
        mockTokenMediator = await deployContract(creator, MockTokenMediatorJson, [testToken.address, mockAMB.address]) as MockTokenMediator

        await dataUnionSidechain.initialize(
            creator.address,
            testToken.address,
            mockTokenMediator.address,
            [],
            creator.address,  // dummy
            "1",
            initialAdminFeeFraction,
            initialDataUnionFeeFraction,
            creator.address
        )
        await dataUnionSidechain.addJoinPartAgent(creator.address)
        let DuAddress = dataUnionSidechain.address;
        limitWithdrawModuleArgs = [
            DuAddress,
            60 * 60 * 24,
            60 * 60,
            parseEther("100"),
            parseEther("1")
        ]
        limitWithdrawModule = await deployContract(creator, LimitWithdrawModuleJson, limitWithdrawModuleArgs) as LimitWithdrawModule
        limitWithdrawModule.deployed()
        await dataUnionSidechain.setWithdrawModule(limitWithdrawModule.address)
        await dataUnionSidechain.addJoinListener(limitWithdrawModule.address)
        await dataUnionSidechain.addPartListener(limitWithdrawModule.address)

        log("LimitWithdrawModule %s set up successfully", limitWithdrawModule.address)

        const limitWithdrawModuleUpgradableContract = await ethers.getContractFactory("LimitWithdrawModuleUpgradable");

        limitWithdrawModuleUpgradable = await upgrades.deployProxy(limitWithdrawModuleUpgradableContract,[
            DuAddress,
            60 * 60 * 24,
            60 * 60,
            parseEther("100"),
            parseEther("1"),
            limitWithdrawModule.address
        ]);
        limitWithdrawModuleUpgradable.deployed()
        log("limitWithdrawModuleUpgradable %s set up successfully", limitWithdrawModuleUpgradable.address)
    })

    it("JoinTimestamp", async () => {
        let joinTime = Date.now();

        let tr = await limitWithdrawModule.connect(creator).setJoinTimestamp(member0.address, joinTime)
        await tr.wait()

        tr = await limitWithdrawModuleUpgradable.setWithdrawnDuringPeriod(member0.address, joinTime)
        await tr.wait()

        let timeFormContract = await limitWithdrawModuleUpgradable.memberJoinTimestamp(member0.address)
        expect(joinTime).to.eq(timeFormContract)

    })

    it("WithdrawnDuringPeriod and lastWithdrawTimestamp ", async () => {
        let amount = parseEther("10");

        await dataUnionSidechain.addMember(member0.address)

        await expect(testToken.transferAndCall(dataUnionSidechain.address, amount, "0x")).to.emit(dataUnionSidechain, "RevenueReceived")

        await provider.send("evm_increaseTime", [+await limitWithdrawModule.requiredMemberAgeSeconds()])
        await provider.send("evm_mine", [])

        await expect(dataUnionSidechain.withdrawAll(member0.address, false)).to.emit(dataUnionSidechain, "EarningsWithdrawn")
        let balance = await testToken.balanceOf(member0.address);

        await dataUnionSidechain.setWithdrawModule(limitWithdrawModuleUpgradable.address)
        await dataUnionSidechain.addJoinListener(limitWithdrawModuleUpgradable.address)
        await dataUnionSidechain.addPartListener(limitWithdrawModuleUpgradable.address)

        //only call for updating information
        let tr = await limitWithdrawModuleUpgradable.setJoinTimestamp(member0.address, 123)

        await tr.wait()


        let withdrawn = await limitWithdrawModuleUpgradable.withdrawnDuringPeriod(member0.address)
        let withdrawnTime = await limitWithdrawModuleUpgradable.lastWithdrawTimestamp(member0.address)
        let withdrawnOld = await limitWithdrawModule.withdrawnDuringPeriod(member0.address)
        let withdrawnTimeOld = await limitWithdrawModule.lastWithdrawTimestamp(member0.address)

        let withoutFee = parseEther("1").sub(initialAdminFeeFraction.add(initialDataUnionFeeFraction));
        let val = formatEther(amount.mul(withoutFee));
        let indexOfDot = val.indexOf('.');
        if(indexOfDot > -1)val = val.substring(0, indexOfDot)

        expect(val).to.eq(withdrawn.toString())
        expect(withdrawn).to.eq(withdrawnOld)
        expect(withdrawnTime).to.eq(withdrawnTimeOld)

    })
})
