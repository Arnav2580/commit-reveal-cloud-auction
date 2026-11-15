const { ethers } = require("hardhat");

async function main() {
  const [auctionAddress] = process.argv.slice(2);
  if (!auctionAddress) {
    throw new Error("Usage: npx hardhat run scripts/startReveal.js --network localhost -- <auction-address>");
  }

  const [auctioneer] = await ethers.getSigners();
  const auction = await ethers.getContractAt("CloudAuction", auctionAddress, auctioneer);
  const tx = await auction.startReveal();
  await tx.wait();
  console.log("Reveal phase started. Reveal deadline:", (await auction.revealEnd()).toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
