const hre = require("hardhat");

// Change this to the contract you actually want to deploy.
const CONTRACT_NAME = "CertificateRegistry";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log(`Network:  ${hre.network.name}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${hre.ethers.formatEther(balance)} ETH`);

  const factory = await hre.ethers.getContractFactory(CONTRACT_NAME);
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  console.log(`${CONTRACT_NAME} deployed to: ${await contract.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
