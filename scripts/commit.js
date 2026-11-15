const { ethers } = require("hardhat");
const fs = require("node:fs/promises");
const path = require("node:path");

const secretsPath = path.join(process.cwd(), "data", "bid-secrets.json");

async function loadSecrets() {
  try {
    return JSON.parse(await fs.readFile(secretsPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function main() {
  const [auctionAddress, bid, accountIndex = "0"] = process.argv.slice(2);
  if (!auctionAddress || !bid) {
    throw new Error("Usage: npx hardhat run scripts/commit.js --network localhost -- <auction-address> <bid-in-wei> [account-index]");
  }

  const signers = await ethers.getSigners();
  const bidder = signers[Number(accountIndex)];
  if (!bidder) throw new Error("Unknown local account index");
  const nonce = ethers.hexlify(ethers.randomBytes(32));
  const auction = await ethers.getContractAt("CloudAuction", auctionAddress, bidder);
  const commitment = ethers.solidityPackedKeccak256(
    ["uint256", "bytes32"],
    [BigInt(bid), nonce]
  );

  const tx = await auction.commitBid(commitment);
  await tx.wait();

  const secrets = await loadSecrets();
  const secretKey = `${auctionAddress.toLowerCase()}:${bidder.address.toLowerCase()}`;
  secrets[secretKey] = {
    bid,
    nonce,
    commitment,
    accountIndex: Number(accountIndex),
    createdAt: new Date().toISOString()
  };
  await fs.mkdir(path.dirname(secretsPath), { recursive: true });
  await fs.writeFile(secretsPath, `${JSON.stringify(secrets, null, 2)}\n`, "utf8");

  console.log("Committed by:", bidder.address);
  console.log("Commitment:", commitment);
  console.log(`A cryptographically random 32-byte nonce was saved locally in ${secretsPath}.`);
  console.log("Keep that file private; reveal.js will use it during the reveal phase.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
