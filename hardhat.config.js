require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
const fs = require("node:fs");
const path = require("node:path");

// Load ignored local .env values without adding a runtime dependency.
try {
  const envFile = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
  for (const rawLine of envFile.split(/\r?\n/)) {
    const line = rawLine.replace(/^\uFEFF/, "");
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
} catch {}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      chainId: 11155111,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : []
    }
  },
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 }
    }
  }
};
