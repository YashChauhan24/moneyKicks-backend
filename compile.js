const path = require("path");
const fs = require("fs");
const solc = require("solc");

const factoryPath = path.resolve(__dirname, "contracts", "BettingFactory.sol");
const escrowPath = path.resolve(__dirname, "contracts", "BetEscrow.sol");

const factorySource = fs.readFileSync(factoryPath, "utf8");
const escrowSource = fs.readFileSync(escrowPath, "utf8");

const input = {
  language: "Solidity",
  sources: {
    "BettingFactory.sol": {
      content: factorySource,
    },
    "BetEscrow.sol": {
      content: escrowSource,
    },
  },
  settings: {
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object"],
      },
    },
  },
};

const compileWithImports = (input) => {
  return JSON.parse(solc.compile(JSON.stringify(input)));
};

const compiled = compileWithImports(input);

if (compiled.errors) {
  console.error("Compilation errors:", compiled.errors);
  process.exit(1);
}

const factoryContract =
  compiled.contracts["BettingFactory.sol"]["BettingFactory"];
const escrowContract = compiled.contracts["BetEscrow.sol"]["BetEscrow"];

fs.writeFileSync(
  path.resolve(__dirname, "contracts", "BettingFactory.json"),
  JSON.stringify(
    { abi: factoryContract.abi, bytecode: factoryContract.evm.bytecode.object },
    null,
    2,
  ),
);

fs.writeFileSync(
  path.resolve(__dirname, "contracts", "BetEscrow.json"),
  JSON.stringify(
    { abi: escrowContract.abi, bytecode: escrowContract.evm.bytecode.object },
    null,
    2,
  ),
);

console.log(
  "Compiled successfully! Saved to contracts/BettingFactory.json and contracts/BetEscrow.json",
);
