const fs = require('node:fs');
const path = require('node:path');
const { ethers } = require('hardhat');

async function main() {
  const out = path.join(__dirname, '..', 'paper', 'measurements.json');
  const factory = await ethers.getContractFactory('CloudAuction');
  const auction = await factory.deploy(1, 'Benchmark resource', 60, 60, ethers.parseEther('100'));
  await auction.waitForDeployment();
  const estimates = {};
  estimates.deploy = (await auction.deploymentTransaction().wait()).gasUsed.toString();
  const signers = await ethers.getSigners();
  const n = Number(process.env.BENCHMARK_BIDDERS || 10);
  if (!Number.isInteger(n) || n < 1 || n > signers.length - 1) throw new Error(`BENCHMARK_BIDDERS must be 1-${signers.length - 1}`);
  const secrets = [];
  for (let i = 0; i < n; i++) {
    const bid = BigInt(i + 1);
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const hash = ethers.solidityPackedKeccak256(['uint256', 'bytes32'], [bid, nonce]);
    const tx = await auction.connect(signers[i + 1]).commitBid(hash);
    estimates.commit = (await tx.wait()).gasUsed.toString();
    secrets.push({ bid, nonce });
  }
  await network.provider.send('evm_setNextBlockTimestamp', [Number(await auction.commitEnd())]);
  await network.provider.send('evm_mine');
  await (await auction.startReveal()).wait();
  for (let i = 0; i < n; i++) {
    const tx = await auction.connect(signers[i + 1]).revealBid(secrets[i].bid, secrets[i].nonce);
    estimates.reveal = (await tx.wait()).gasUsed.toString();
  }
  await network.provider.send('evm_setNextBlockTimestamp', [Number(await auction.revealEnd())]);
  await network.provider.send('evm_mine');
  estimates.finalize = (await (await auction.finalizeAuction()).wait()).gasUsed.toString();
  const data = { generatedAt: new Date().toISOString(), chain: 'Hardhat local in-process network', bidders: n, units: 'gas', gasUsed: estimates, note: 'Execution gas used is a local EVM measurement; it is not a Sepolia latency or production scalability benchmark.' };
  fs.writeFileSync(out, JSON.stringify(data, null, 2) + '\n');
  console.log(JSON.stringify(data, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
