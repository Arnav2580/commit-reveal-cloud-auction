const { spawn } = require('node:child_process');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const root = path.resolve(__dirname,'..');
const cli = path.join(root,'node_modules','hardhat','internal','cli','cli.js');
const children=[];
let stopping=false;
function launch(label,args,env=process.env) {
  const child=spawn(process.execPath,args,{cwd:root,env,stdio:'inherit',windowsHide:true});
  child.on('exit',(code)=>{if(!stopping){console.error(`${label} exited with code ${code}`);shutdown(code||1);}});
  children.push(child); return child;
}
async function run(label,args,env=process.env) {
  await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,args,{cwd:root,env,stdio:'inherit',windowsHide:true});
    child.on('error',reject); child.on('exit',code=>code===0?resolve():reject(new Error(`${label} failed (${code})`)));
  });
}
async function waitForRpc(child) {
  for(let i=0;i<100;i++) {
    if(child.exitCode!==null) throw new Error('Hardhat local node exited before becoming ready.');
    try {
      const r=await fetch('http://127.0.0.1:8545',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]})});
      const data=await r.json(); if(data.result==='0x7a69') return;
    } catch {}
    await delay(300);
  }
  throw new Error('Timed out waiting for Hardhat RPC on port 8545.');
}
function shutdown(code=0) {
  if(stopping) return; stopping=true;
  for(const child of children) { try { child.kill(); } catch {} }
  process.exitCode=code;
}
process.on('SIGINT',()=>shutdown(0)); process.on('SIGTERM',()=>shutdown(0));
(async()=>{
  try {
    await run('Compile',[cli,'compile']);
    const node=launch('Hardhat node',[cli,'node','--hostname','0.0.0.0','--port','8545']);
    await waitForRpc(node);
    await run('Deploy local classroom auction',[cli,'run','scripts/deploy.js','--network','localhost'],{
      ...process.env,COMMIT_DURATION_SECONDS:process.env.COMMIT_DURATION_SECONDS||'300',REVEAL_DURATION_SECONDS:process.env.REVEAL_DURATION_SECONDS||'300',MAX_BID:process.env.MAX_BID||'100'
    });
    launch('Classroom UI',[path.join(root,'scripts','serve.js')]);
    console.log('\nLocal demo is ready. Use the localhost address on this computer; use the printed LAN URL for devices on the same trusted network.');
    console.log('Local Hardhat accounts and test ETH have no real value. The local node is not a public testnet.');
  } catch(error) { console.error(error); shutdown(1); }
})();
