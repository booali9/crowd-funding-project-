const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("\nDeploying with account:", deployer.address);

  // Get balance (modern ethers v6 syntax)
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  console.log("\nDeploying CrowdfundingPlatform...");
  const Contract = await hre.ethers.getContractFactory("CrowdfundingPlatform");
  const contract = await Contract.deploy();
  
  console.log("Waiting for deployment confirmation...");
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log("\n✅ Contract deployed to:", contractAddress);
  
  // Verification (wait for blockchain propagation)
  console.log("\nWaiting 30 seconds before verification...");
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  try {
    console.log("Verifying contract on Etherscan...");
    await hre.run("verify:verify", {
      address: contractAddress,
      constructorArguments: [],
    });
    console.log("✅ Contract verified successfully");
  } catch (e) {
    console.log("⚠️ Verification failed:", e.message);
    console.log("You can verify manually with:");
    console.log(`npx hardhat verify --network sepolia ${contractAddress}`);
  }
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exitCode = 1;
});