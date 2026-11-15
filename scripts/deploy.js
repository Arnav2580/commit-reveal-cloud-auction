const { ethers, network } = require('hardhat');
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  if (network.name === 'sepolia' && !process.env.SEPOLIA_RPC_URL) {
    throw new Error('Set SEPOLIA_RPC_URL before deploying to Sepolia.');
  }
  const resourceId=process.env.RESOURCE_ID || '1';
  const description=process.env.RESOURCE_DESCRIPTION || 'VM-001 | 4 CPU | 16 GB RAM | 100 GB storage | 2 hours';
  const commitDuration=Number(process.env.COMMIT_DURATION_SECONDS || 300);
  const revealDuration=Number(process.env.REVEAL_DURATION_SECONDS || 300);
  const maxBid=process.env.MAX_BID || '100';
  if(!Number.isSafeInteger(commitDuration)||commitDuration<60||!Number.isSafeInteger(revealDuration)||revealDuration<60) throw new Error('Use commit/reveal durations of at least 60 seconds.');
  const Factory=await ethers.getContractFactory('CloudAuction');
  const auction=await Factory.deploy(resourceId,description,commitDuration,revealDuration,ethers.parseEther(maxBid));
  await auction.waitForDeployment();
  const address=await auction.getAddress();
  const chain=await ethers.provider.getNetwork();
  const entry={ address, chainId:Number(chain.chainId), network:network.name, resourceId:String(resourceId), description, maxBid, commitDuration, revealDuration, deployedAt:new Date().toISOString() };
  const deploymentPath=path.join(__dirname,'..','web','deployments.json');
  let deployments={}; try { deployments=JSON.parse(await fs.readFile(deploymentPath,'utf8')); } catch {}
  deployments[network.name]=entry;
  await fs.writeFile(deploymentPath,JSON.stringify(deployments,null,2)+'\n');
  const artifact=require('../artifacts/contracts/CloudAuction.sol/CloudAuction.json');
  await fs.writeFile(path.join(__dirname,'..','web','auction-abi.json'),JSON.stringify(artifact.abi,null,2)+'\n');
  console.log('CloudAuction deployed:',address);
  console.log('Network:',network.name,'chain',Number(chain.chainId));
  console.log('Resource:',description);
  console.log('Commit/reveal seconds:',commitDuration,revealDuration,'maximum demo units:',maxBid);
  console.log(`Open the UI at http://localhost:${process.env.PORT||4173}/?network=${network.name==='sepolia'?'sepolia':'localhost'}&address=${address}`);
  console.log('The contract records allocation only. It accepts no ETH and does not provision a VM.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
