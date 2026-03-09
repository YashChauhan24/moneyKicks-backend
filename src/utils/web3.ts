import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

dotenv.config();

const privateKey = process.env.PRIVATE_KEY || "";
const rpcUrl =
  process.env.RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
export const BETTING_FACTORY_ADDRESS =
  process.env.BETTING_FACTORY_ADDRESS || "";

if (!privateKey) {
  console.warn("WARNING: PRIVATE_KEY is missing in backend .env");
}

export const provider = new ethers.JsonRpcProvider(rpcUrl);
export const wallet = new ethers.Wallet(
  privateKey ||
    "0x0000000000000000000000000000000000000000000000000000000000000001",
  provider,
);

// Load the ABI from compiled JSON
const factoryPath = path.resolve(
  __dirname,
  "../../contracts/BettingFactory.json",
);
let bettingFactoryAbi = [];
try {
  const factoryJson = JSON.parse(fs.readFileSync(factoryPath, "utf-8"));
  bettingFactoryAbi = factoryJson.abi;
} catch (error) {
  console.error(
    "Failed to load BettingFactory.json. Make sure contracts are compiled.",
    error,
  );
}

export const bettingFactoryContract = new ethers.Contract(
  BETTING_FACTORY_ADDRESS,
  bettingFactoryAbi,
  wallet,
);
