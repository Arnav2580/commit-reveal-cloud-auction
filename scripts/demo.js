const { ethers, network } = require("hardhat");

const units = (value) => ethers.parseEther(value.toString());
const commitmentFor = (bid, nonce) =>
  ethers.solidityPackedKeccak256(["uint256", "bytes32"], [bid, nonce]);

async function moveTo(timestamp) {
  await network.provider.send("evm_setNextBlockTimestamp", [Number(timestamp)]);
  await network.provider.send("evm_mine");
}

async function main() {
  const [provider, bidderA, bidderB, bidderC, attacker] = await ethers.getSigners();

  console.log("\n--- Open-bid baseline: visible bids can be immediately beaten ---");
  const OpenBidBaseline = await ethers.getContractFactory("OpenBidBaseline");
  const baseline = await OpenBidBaseline.deploy();
  await baseline.waitForDeployment();
  await (await baseline.connect(bidderA).placeBid(units(5))).wait();
  console.log("Bidder A openly bids 5 ETH-equivalent price units.");
  await (await baseline.connect(attacker).placeBid(units(6))).wait();
  console.log("Attacker observes it and bids 6. Baseline winner:", await baseline.winner());

  console.log("\n--- Ordering-safe commit-reveal auction ---");
  const CloudAuction = await ethers.getContractFactory("CloudAuction");
  const auction = await CloudAuction.connect(provider).deploy(
    1,
    "VM-001 | 4 CPU | 16 GB RAM | 100 GB storage | 2 hours",
    60,
    60,
    units(100)
  );
  await auction.waitForDeployment();

  const bids = [units(5), units(8), units(6)];
  const bidders = [bidderA, bidderB, bidderC];
  const nonces = bidders.map(() => ethers.hexlify(ethers.randomBytes(32)));
  for (let i = 0; i < bidders.length; i++) {
    const commitment = commitmentFor(bids[i], nonces[i]);
    await (await auction.connect(bidders[i]).commitBid(commitment)).wait();
    console.log(`Bidder ${String.fromCharCode(65 + i)} commits ${commitment} (using a fresh private 32-byte nonce).`);
  }

  console.log("The chain has commitments, not bid values, during the commit phase.");
  await moveTo(await auction.commitEnd());
  await (await auction.startReveal()).wait();

  for (let i = 0; i < bidders.length; i++) {
    await (await auction.connect(bidders[i]).revealBid(bids[i], nonces[i])).wait();
    console.log(`Bidder ${String.fromCharCode(65 + i)} reveals ${ethers.formatEther(bids[i])}.`);
  }

  console.log("Before finalization:", {
    highestBid: (await auction.highestBid()).toString(),
    winner: await auction.winner()
  });

  await moveTo(await auction.revealEnd());
  await (await auction.finalizeAuction()).wait();
  const resource = await auction.getResource();
  console.log("After finalization:", {
    winner: await auction.winner(),
    winningBid: ethers.formatEther(await auction.highestBid()),
    resource: resource.description,
    allocated: resource.allocated
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
