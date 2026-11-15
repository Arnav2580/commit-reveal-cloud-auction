const fs=require('node:fs');
const path=require('node:path');
const artifactPath=path.join(__dirname,'..','artifacts','contracts','CloudAuction.sol','CloudAuction.json');
const outputPath=path.join(__dirname,'..','web','auction-abi.json');
const artifact=JSON.parse(fs.readFileSync(artifactPath,'utf8'));
fs.writeFileSync(outputPath,JSON.stringify(artifact.abi,null,2)+'\n');
console.log(`Exported CloudAuction ABI to ${path.relative(process.cwd(),outputPath)}`);
