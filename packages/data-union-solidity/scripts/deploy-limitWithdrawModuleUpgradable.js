const {ethers, network, upgrades} = require("hardhat");
require('dotenv').config()

// Deploy function
async function deploy() {

    const dataUnionAddress =process.env.dataUnionAddress
    const newRequiredMemberAgeSeconds =process.env.newRequiredMemberAgeSeconds
    const newWithdrawLimitPeriodSeconds =process.env.newWithdrawLimitPeriodSeconds
    const newWithdrawLimitDuringPeriod =process.env.newWithdrawLimitDuringPeriod
    const newMinimumWithdrawTokenWei =process.env.newMinimumWithdrawTokenWei
    const _oldContractAddress = process.env._oldContractAddress

    let LimitWithdrawModuleUpgradable = await ethers.getContractFactory("LimitWithdrawModuleUpgradable");

    let limitWithdrawModuleUpgradable = await upgrades.deployProxy(LimitWithdrawModuleUpgradable,
        [dataUnionAddress, newRequiredMemberAgeSeconds, newWithdrawLimitPeriodSeconds, newWithdrawLimitDuringPeriod,
            newMinimumWithdrawTokenWei,_oldContractAddress],{gasPrice:5000000000, gas:5000000000, gasLimit:5000000});
    await limitWithdrawModuleUpgradable.deployed()
    console.log("deployed limitWithdrawModuleUpgradable: " + limitWithdrawModuleUpgradable.address);
}

deploy()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
