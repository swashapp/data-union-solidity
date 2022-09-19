const { ethers, upgrades } = require("hardhat");
require("dotenv").config();

// Deploy function
async function deploy() {
  [owner] = await ethers.getSigners();

  let LimitWithdrawModuleUpgradable = await ethers.getContractFactory(
    "LimitWithdrawModuleUpgradable"
  );

  let limitWithdrawModuleUpgradable = await upgrades.upgradeProxy(
    process.env.limitWithdrawModuleUpgradableDeployedContractAddress,
      LimitWithdrawModuleUpgradable
  );
  await limitWithdrawModuleUpgradable.deployed();
  console.log(
    "Updated LimitWithdrawModuleUpgradable: " + limitWithdrawModuleUpgradable.address
  );
}

deploy()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
