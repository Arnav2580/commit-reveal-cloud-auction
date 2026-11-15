const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const price = (value) => ethers.parseEther(value.toString());
const commitmentFor = (bid, nonce) =>
  ethers.solidityPackedKeccak256(["uint256", "bytes32"], [bid, nonce]);
const testNonce = (label) => ethers.keccak256(ethers.toUtf8Bytes(label));

async function moveTo(timestamp) {
  await network.provider.send("evm_setNextBlockTimestamp", [Number(timestamp)]);
  await network.provider.send("evm_mine");
}

describe("CloudAuction", function () {
  async function deployAuction() {
    const [auctioneer, bidderA, bidderB, bidderC, attacker] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("CloudAuction");
    const auction = await Factory.deploy(
      1,
      "VM-001 | 4 CPU | 16 GB RAM | 100 GB storage | 2 hours",
      60,
      60,
      price(100)
    );
    await auction.waitForDeployment();
    return { auction, auctioneer, bidderA, bidderB, bidderC, attacker };
  }

  it("defers winner selection until the reveal window is closed", async function () {
    const { auction, auctioneer, bidderA, bidderB, bidderC } = await deployAuction();
    const bids = [price(5), price(8), price(6)];
    // Fixed 32-byte values make the test repeatable. Runtime scripts use randomBytes(32).
    const nonces = [testNonce("bidder-a"), testNonce("bidder-b"), testNonce("bidder-c")];
    const bidders = [bidderA, bidderB, bidderC];

    for (let i = 0; i < bidders.length; i++) {
      await auction.connect(bidders[i]).commitBid(commitmentFor(bids[i], nonces[i]));
    }
    expect(await auction.committedBidderCount()).to.equal(3);

    await moveTo(await auction.commitEnd());
    await auction.connect(auctioneer).startReveal();
    for (let i = 0; i < bidders.length; i++) {
      await auction.connect(bidders[i]).revealBid(bids[i], nonces[i]);
    }

    // This proves reveal order cannot create an authoritative running winner.
    expect(await auction.highestBid()).to.equal(0n);
    expect(await auction.winner()).to.equal(ethers.ZeroAddress);
    await expect(auction.finalizeAuction()).to.be.revertedWith("Reveal window is still open");

    await moveTo(await auction.revealEnd());
    await expect(auction.finalizeAuction())
      .to.emit(auction, "AuctionFinalized")
      .withArgs(bidderB.address, price(8), 1);

    expect(await auction.highestBid()).to.equal(price(8));
    expect(await auction.winner()).to.equal(bidderB.address);
    const resource = await auction.getResource();
    expect(resource.allocated).to.equal(true);
    expect(resource.allocatedTo).to.equal(bidderB.address);
  });

  it("rejects an altered bid or nonce during reveal", async function () {
    const { auction, auctioneer, bidderA } = await deployAuction();
    const bid = price(5);
    const nonce = testNonce("bidder-a");
    await auction.connect(bidderA).commitBid(commitmentFor(bid, nonce));

    await moveTo(await auction.commitEnd());
    await auction.connect(auctioneer).startReveal();
    await expect(auction.connect(bidderA).revealBid(price(6), nonce)).to.be.revertedWith("Invalid reveal");
    await expect(auction.connect(bidderA).revealBid(bid, testNonce("wrong-nonce"))).to.be.revertedWith("Invalid reveal");
  });

  it("rejects a revealed bid above the auction's configured limit", async function () {
    const { auction, auctioneer, bidderA } = await deployAuction();
    const bid = price(101);
    const nonce = testNonce("above-limit");
    await auction.connect(bidderA).commitBid(commitmentFor(bid, nonce));
    await moveTo(await auction.commitEnd());
    await auction.connect(auctioneer).startReveal();
    await expect(auction.connect(bidderA).revealBid(bid, nonce))
      .to.be.revertedWith("Bid exceeds classroom limit");
  });
});

describe("OpenBidBaseline", function () {
  it("shows why a visible bid can be immediately outbid", async function () {
    const [, bidderA, attacker] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("OpenBidBaseline");
    const baseline = await Factory.deploy();
    await baseline.waitForDeployment();

    await baseline.connect(bidderA).placeBid(price(5));
    await baseline.connect(attacker).placeBid(price(6));
    expect(await baseline.winner()).to.equal(attacker.address);
    expect(await baseline.highestBid()).to.equal(price(6));
  });
});
