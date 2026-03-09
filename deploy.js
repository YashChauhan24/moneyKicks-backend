const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function main() {
  // Ensure you have a PRIVATE_KEY and RPC_URL in your .env
  const privateKey = process.env.PRIVATE_KEY;
  const rpcUrl =
    process.env.RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc"; // Fuji Testnet default

  if (!privateKey) {
    console.error("Please set PRIVATE_KEY in your .env file.");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log(`Deploying smart contract from account: ${wallet.address}`);

  // Load ABI and Bytecode for BettingFactory
  const contractJsonPath = path.resolve(
    __dirname,
    "./contracts/BettingFactory.json",
  );
  const contractJson = JSON.parse(fs.readFileSync(contractJsonPath, "utf8"));

  const abi = contractJson.abi;
  const bytecode = contractJson.bytecode;

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);

  // Deploy the contract
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("=========================================");
  console.log("BettingFactory Contract deployed to:", address);
  console.log("=========================================");

  console.log("\nNext steps:");
  console.log(
    "1. Add this address to your backend .env file: BETTING_FACTORY_ADDRESS=" +
      address,
  );
  console.log(
    "2. Copy this address into the BETTING_FACTORY_ADDRESS constant in moneyKicks-frontend/src/config/bettingContract.ts as well.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
