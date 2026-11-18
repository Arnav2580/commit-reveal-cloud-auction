# CloudAuction classroom simulation

The public web demo is a no-wallet, no-testnet classroom simulation. An organizer creates a room and shares its QR invite; attendees enter their name and class/roll ID and submit one sealed bid while the room is open.

Vercel Functions serve `/api/rooms` and use the project's Upstash Redis store for shared room state. Redis updates are serialized per room. Room data expires 48 hours after the last update.

Each room gets a hidden random reference (70–130 points); each participant receives an individual hidden ceiling within ±30 points of that reference. The app never returns the cap. Bid eligibility is checked only after bidding closes. Names and class/roll IDs are visible to the organizer. This is a demo, not identity verification or a payment system.

Wallet and Sepolia bidding remain an upcoming feature.
