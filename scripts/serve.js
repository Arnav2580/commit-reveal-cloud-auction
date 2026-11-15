const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'web');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';
const TYPES = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.pdf':'application/pdf', '.md':'text/markdown; charset=utf-8' };

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'strict-origin-when-cross-origin', ...headers }); res.end(body);
}
function serveFile(res, absolute) {
  fs.readFile(absolute, (err, body) => {
    if (err) return send(res, 404, 'Not found');
    send(res, 200, body, { 'Content-Type':TYPES[path.extname(absolute).toLowerCase()] || 'application/octet-stream' });
  });
}
const server = http.createServer((req,res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', { Allow:'GET, HEAD' });
  if (url.pathname === '/api/abi') {
    const artifactPath = path.join(ROOT,'artifacts','contracts','CloudAuction.sol','CloudAuction.json');
    try { const artifact=JSON.parse(fs.readFileSync(artifactPath,'utf8')); return send(res,200,JSON.stringify({abi:artifact.abi}),{'Content-Type':TYPES['.json']}); }
    catch { return send(res,503,'Contract artifact missing. Run npm run compile first.'); }
  }
  if (url.pathname === '/api/deployments') return serveFile(res,path.join(WEB,'deployments.json'));
  if (url.pathname.startsWith('/paper/')) {
    const rel = path.normalize(url.pathname.slice('/paper/'.length)); const file = path.resolve(ROOT,'paper',rel);
    if (!file.startsWith(path.resolve(ROOT,'paper') + path.sep)) return send(res,403,'Forbidden');
    return serveFile(res,file);
  }
  if (url.pathname === '/readme.md') return serveFile(res,path.join(ROOT,'readme.md'));
  const pathname = decodeURIComponent(url.pathname);
  const rel = pathname === '/' ? 'index.html' : path.normalize(pathname.replace(/^\/+/,''));
  const file = path.resolve(WEB,rel);
  if (!file.startsWith(path.resolve(WEB) + path.sep)) return send(res,403,'Forbidden');
  serveFile(res,file);
});
server.listen(PORT,HOST,() => {
  const addresses=Object.values(os.networkInterfaces()).flat().filter(x=>x && x.family==='IPv4' && !x.internal).map(x=>`http://${x.address}:${PORT}`);
  console.log(`CloudAuction classroom UI: http://localhost:${PORT}`);
  for(const address of addresses) console.log(`LAN preview: ${address}`);
  console.log('For phone QR joining over Sepolia, host the web/ folder on HTTPS and deploy a Sepolia contract first.');
  console.log('This server exposes only the UI, public contract ABI, README, and paper. It does not receive or store bids or secrets.');
});
