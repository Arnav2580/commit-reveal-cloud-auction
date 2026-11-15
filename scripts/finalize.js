const { ethers } = require("hardhat");

async function main() {
  const [auctionAddress] = process.argv.slice(2);
  if (!auctionAddress) {
    throw new Error("Usage: npx hardhat run scripts/finalize.js --network localhost -- <auction-address>");
  }

  const auction = await ethers.getContractAt("CloudAuction", auctionAddress);
  const tx = await auction.finalizeAuction();
  await tx.wait();

  const [, winner, winningBid, allocated] = await auction.getAuctionResult();
  console.log({ winner, winningBid: winningBid.toString(), allocated });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
