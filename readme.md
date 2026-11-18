# Commit-Reveal Cloud Auction Demo

Local Hardhat demo for a cloud-resource auction that resists bid front-running.

`VM-001` is represented on-chain as **4 CPU, 16 GB RAM, 100 GB storage, for 2 hours**. This is an allocation record only: the demo does not provision a real VM or custody ETH.

## Security property demonstrated

1. Bidders commit `keccak256(abi.encodePacked(bid, nonce))`, never their bid, while the commit window is open.
2. A reveal is stored only if its bid and nonce reproduce that commitment.
3. `revealBid` deliberately does not calculate `highestBid` or `winner`.
4. Only after the reveal deadline can `finalizeAuction` determine the highest valid bid and allocate the resource.

The companion `OpenBidBaseline` makes the contrast explicit: its visible 5 ETH-equivalent bid can be immediately beaten by an attacker submitting 6.

## Run locally

```powershell
npm install
npm test
npm run demo
```

`npm run demo` runs the complete deterministic demonstration on Hardhat's in-process local network. Its expected secure-auction result is Bidder B winning at 8 ETH-equivalent price units, with `VM-001` allocated to that address.

For an interactive multi-terminal run:

```powershell
npm run node
npm run deploy
```

Use the printed address with the scripts below. Prices are specified in wei. `commit.js` generates a fresh cryptographically random 32-byte nonce with `ethers.randomBytes(32)`, then stores the matching bid/nonce secret in `data/bid-secrets.json` (which is ignored by Git). Do not share or lose that file before revealing. The final argument selects the local Hardhat account: `1`, `2`, and `3` are the three demo bidders; account `0` is the auctioneer.

```powershell
npx hardhat run scripts/commit.js --network localhost -- <auction-address> 5000000000000000000 1
npx hardhat run scripts/commit.js --network localhost -- <auction-address> 8000000000000000000 2
npx hardhat run scripts/commit.js --network localhost -- <auction-address> 6000000000000000000 3

# After the 60-second commit window expires
npx hardhat run scripts/startReveal.js --network localhost -- <auction-address>

npx hardhat run scripts/reveal.js --network localhost -- <auction-address> 1
npx hardhat run scripts/reveal.js --network localhost -- <auction-address> 2
npx hardhat run scripts/reveal.js --network localhost -- <auction-address> 3

# After the 60-second reveal window expires
npx hardhat run scripts/finalize.js --network localhost -- <auction-address>
```

The auctioneer must call `startReveal()` after the commit deadline. The smart-contract interface is retained as an upcoming blockchain feature; the current live classroom interface is a server-backed simulation that does not require a wallet or testnet account.

## Classroom web app

Run the live-style classroom simulation locally with one command:

```powershell
npm start
```

The Node service serves both the web UI and a shared local room API at `http://localhost:4173`. The deployed Vercel app uses Vercel Functions and a shared Redis store so students on different networks can join the same room. A local instance is suitable for development only.

An organizer creates a room, shares its QR invite, registers the class, and opens bidding. Each attendee enters their name and class/roll ID and submits one sealed bid. The server checks bids against a private randomized ceiling per person and reveals eligible bids after the organizer closes the round. Names and class/roll IDs are visible to the organizer and are stored in the service's room file; avoid collecting sensitive personal information. The public room view does not disclose the private ceiling or opponents' bids while bidding is open. This is a classroom simulation, not a payment product or identity-verification system.

### Random private bid ceilings

Every room receives a cryptographically generated hidden reference between 70 and 130 demo points. At registration, each attendee receives an independent private ceiling within ±30 points of that room reference (bounded to 40–160). Neither the center nor an attendee's ceiling is returned by the room API. The UI does not expose those values. Bids are kept from other participants until reveal; a bid above its private ceiling is marked ineligible only at finalization. This prevents a participant from probing the exact cap through repeated validation attempts.

Each room permits one entry per class/roll ID (case-insensitive) and one bid per entry. The organizer token and participant token are high-entropy browser-held values. The local simulation stores room records in `data/rooms.json`, which is ignored by Git. Vercel stores deployed rooms in Redis with atomic per-room updates and a 48-hour expiry after the last change. Names and class IDs are visible to the organizer; do not enter sensitive information.

### Vercel deployment and shared storage

The Vercel project root is `web/`. Its Functions implement `/api/rooms` and `/api/rooms/:code/*`; Redis credentials are read from `KV_REST_API_URL` and `KV_REST_API_TOKEN`, injected by the Upstash integration. The project is configured for the Mumbai function region to stay close to the Redis store. The connected Upstash resource uses its free plan with automatic upgrades disabled. Vercel's static assets and Functions deploy together from this project root.

Provisioning Upstash requires accepting its marketplace legal terms in the owner's Vercel account. Do not commit Redis credentials or copy them into client-side code. If storage is not connected, the API returns a setup error instead of pretending to create a shared room.

The wallet and Sepolia flow is marked as an upcoming feature in the current UI. Smart-contract tests and the research figures describe the separate on-chain prototype and should not be interpreted as measurements of the live simulation server.

## Research paper and measured figures

The formatted PDF research paper, including a market comparison graph, limitations, six analytical figures, and a complete screenshot from the local demo, is [paper/research-paper.pdf](paper/research-paper.pdf). The editable source remains in [paper/research-paper.md](paper/research-paper.md). Regenerate benchmark data and paper visuals with:

```powershell
npm run benchmark
```

Then rebuild the figures and PDF:

```powershell
python paper/generate_figures.py
python paper/generate_market_chart.py
python paper/photos/make_screenshot.py
python paper/photos/make_contact_sheet.py
python paper/build_pdf.py
```

The benchmark runs on Hardhat's local EVM; it does not measure public testnet latency or classroom capacity. Sepolia deployment requires SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, and optionally MAX_BID in the environment. The current contract records allocation only; it does not receive funds or provision cloud resources.
