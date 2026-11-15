const { ethers } = require("hardhat");
const fs = require("node:fs/promises");
const path = require("node:path");

const secretsPath = path.join(process.cwd(), "data", "bid-secrets.json");

async function main() {
  const [auctionAddress, accountIndex = "0"] = process.argv.slice(2);
  if (!auctionAddress) {
    throw new Error("Usage: npx hardhat run scripts/reveal.js --network localhost -- <auction-address> [account-index]");
  }

  const signers = await ethers.getSigners();
  const bidder = signers[Number(accountIndex)];
  if (!bidder) throw new Error("Unknown local account index");
  const secrets = JSON.parse(await fs.readFile(secretsPath, "utf8"));
  const secretKey = `${auctionAddress.toLowerCase()}:${bidder.address.toLowerCase()}`;
  const secret = secrets[secretKey];
  if (!secret) {
    throw new Error("No saved bid secret for this auction and account. Commit first with scripts/commit.js.");
  }
  const auction = await ethers.getContractAt("CloudAuction", auctionAddress, bidder);
  const tx = await auction.revealBid(BigInt(secret.bid), secret.nonce);
  await tx.wait();
  console.log("Reveal accepted for:", bidder.address);
  console.log("No winner is calculated until the reveal window closes and finalizeAuction runs.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
