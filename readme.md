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

The Node service serves both the web UI and a shared room API at `http://localhost:4173`. A public hosted instance is required for people on different networks to join the same room; a local instance is suitable for development only.

An organizer creates a room, shares its QR invite, registers the class, and opens bidding. Each attendee enters their name and class/roll ID and submits one sealed bid. The server checks bids against a private randomized ceiling per person and reveals eligible bids after the organizer closes the round. Names and class/roll IDs are visible to the organizer and are stored in the service's room file; avoid collecting sensitive personal information. The public room view does not disclose the private ceiling or opponents' bids while bidding is open. This is a classroom simulation, not a payment product or identity-verification system.

### Random private bid ceilings

Every room receives a cryptographically generated hidden reference between 70 and 130 demo points. At registration, each attendee receives an independent private ceiling within ±30 points of that room reference (bounded to 40–160). Neither the center nor an attendee's ceiling is returned by the room API. The UI does not expose those values. Bids are kept from other participants until reveal; a bid above its private ceiling is marked ineligible only at finalization. This prevents a participant from probing the exact cap through repeated validation attempts.

Each room permits one entry per class/roll ID (case-insensitive) and one bid per entry. The organizer token and participant token are high-entropy browser-held values. The simulation service stores room records, participant details, hidden ceilings, and bids in `data/rooms.json`; this file is ignored by Git. For production use, replace the local JSON store with a managed database, define retention/access policy, use HTTPS, add rate limits and instructor authentication, and deploy multiple-instance-safe atomic writes.

### Host the full simulation service

The `render.yaml` blueprint configures a Node web service that serves the UI and API from the same origin. Use a persistent mounted disk for `data/rooms.json` if room records must survive instance restarts. The free ephemeral filesystem may be cleared on restart, so it is suitable only for a short classroom demo. Vercel's static deployment serves the earlier wallet interface and cannot host this shared in-memory/file-backed room service as a static site.

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
