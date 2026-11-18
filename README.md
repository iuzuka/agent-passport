# Agent Passport — Frontend

Static single-page dApp for the Agent Passport hackathon project.
Vanilla JS + ethers.js v6 via CDN. No build step, no backend, no cost to host.

## What it is

A free, non-transferable **Passport NFT** for Agent ID holders:

- **Mint** — free (gas only), only if the connected wallet holds an Agent ID
  and has not minted a Passport yet.
- **Check-in** — once per day (UTC), builds an on-chain streak.
- **Badges** — soulbound milestone badges at streaks of **3 / 7 / 14 / 21 days**.

No value, return, airdrop or reward is promised anywhere in the UI or copy.
Every transaction is confirmed by the user in their own wallet — the site
never auto-signs, never signs in the background, and never asks for a seed
phrase or private key. Eligibility is checked **only for the connected
wallet**; there is no lookup for other people's addresses.

## Run locally

```bash
cd frontend
python3 -m http.server 8000
# open http://localhost:8000
```

(Any static server works — `npx serve`, `python -m http.server`, etc. Do not
open `index.html` via `file://`: ES modules are blocked there.)

## Deploy to GitHub Pages (free)

1. Create a public repo, e.g. `agent-passport`.
2. Copy the contents of this folder (`index.html`, `app.js`, `config.js`,
   `abi.js`, `styles.css`, `README.md`) to the repo root (or `docs/`).
3. GitHub repo → **Settings → Pages → Build and deployment → Deploy from
   a branch** → branch `main`, folder `/ (root)` (or `/docs`).
4. The site is live at `https://<username>.github.io/agent-passport/`.

No secrets, no build, no environment variables.

## Contract interface (real ABI — verified against the compiled contract)

Source of truth: `contracts/out/AgentPassport.sol/AgentPassport.json`.
`abi.js` holds the same interface as human-readable ethers v6 fragments;
every selector and event topic was checked byte-for-byte against the
compiled artifact (2026-11-18). The contract is **AgentPassport (APASS)**,
a soulbound ERC-721.

| Function | Type | Notes |
|---|---|---|
| `mint()` → `tokenId` | tx | Free (gas only). Only for Agent ID holders. Reverts if already minted. |
| `checkIn()` | tx | Once per UTC day. Reverts if no Passport, no Agent ID, or already checked in today. |
| `claimBadge(uint256 milestone)` → `badgeTokenId` | tx | Milestone ∈ {3, 7, 14, 21}. Reverts unless **bestStreak ≥ milestone** (not the current streak) or the badge was already claimed. |
| `getCheckInStats(address)` → `(lastCheckInDay, streak, totalCheckIns, bestStreak)` | view | One struct. `lastCheckInDay` is a **UTC day number** (`floor(unix / 86400)`), not a timestamp; the frontend shows `lastCheckInDay × 86400` (0 if never). `streak` = current streak. |
| `hasClaimedBadge(address, uint256)` → `bool` | view | |
| `passportOf(address)` → `uint256` | view | Holder's token id, or 0 if none. |
| `balanceOf(address)` → `uint256` | view | Passport: > 0 means the address holds one. |
| `milestones()` → `uint256[4]` | view | Returns `[3, 7, 14, 21]`. |
| `tokenURI(uint256)` / `name()` / `symbol()` / `owner()` | view | Standard reads. |
| Agent ID contract: `balanceOf(address)` → `uint256` | view | Eligibility: > 0. |

**Derived client-side (these functions do NOT exist on-chain):**

| Value | How the frontend computes it |
|---|---|
| `canCheckIn` | Holder AND `lastCheckInDay <` today's UTC day number (`floor(Date.now()/1000/86400)`). |
| `nextCheckInAt` | `(lastCheckInDay + 1) × 86400` if already checked in today, else `0` ("can check in now"). |
| `totalMinted` / `totalCheckIns` | Counted from `PassportMinted` / `CheckedIn` event logs via `queryFilter` starting at `config.js` → `deployBlock`. While `deployBlock` is `0` (unknown) no log query is sent and the UI shows "—"; if the RPC refuses the range, it also shows "—" instead of an invented number. |

**Do NOT call:** `getStreak()`, `canCheckIn()`, `nextCheckInAt()`,
`hasBadge()`, `totalSupply()`, `totalCheckIns()`, `tokenOfOwnerByIndex()`
— none of these exist in the compiled contract.

## Addresses (deployed on mainnet — Chain ID 56)

| Item | Address | Status |
|---|---|---|
| Passport contract | `0x199474bD345b87373f81F902ff5a957Bd02BaFEE` | **Deployed 2026-11-18, block 134313385** — deploy tx `0xcdb0c21f1bfe520cbf1c2d3e5d56226dc1b04d1ff5fb0aed329972c893558ba5` (via deterministic deployment proxy, CREATE2) |
| Agent ID contract | `0x60b9262456de011f7d15a54cdd8c48baaa8b022f` | **Live, verified 2026-11-18** via public RPC: name `SPACE ID Agent ID`, symbol `AI`. Note: the spec originally listed this address as the Passport contract — on-chain readback (`name()`/`symbol()`/`balanceOf`) proves it is the Agent ID contract itself. |

`config.js` holds the same values (`passportAddress` and `deployBlock`
134313385; `agentIdAddress` as above). Chain: **Chain ID 56** (mainnet).
Public read-only RPC: `https://bsc-dataseed.binance.org/` (used for reads
only).

## End-to-end test (local anvil — tested 2026-11-18)

No mainnet transaction was broadcast for this test. Foundry (`anvil`,
`forge`, `cast`) must be installed; the contracts folder has the deploy
scripts.

```bash
# 1. Start a fresh local chain (keep it running in its own terminal)
anvil --port 8545

# 2. Deploy the mock Agent ID (grants the deployer one mock ID), then the
#    Passport pointing at it. Use anvil account #0 (f39F...):
cd contracts
PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
forge script script/DeployMock.s.sol --rpc-url http://127.0.0.1:8545 \
  --private-key $PK --broadcast
MOCK=$(python3 -c "import json; print(json.load(open('broadcast/DeployMock.s.sol/31337/run-latest.json'))['transactions'][0]['contractAddress'])")
AGENT_ID_ADDRESS=$MOCK forge script script/Deploy.s.sol \
  --rpc-url http://127.0.0.1:8545 --private-key $PK --broadcast
# Note the AgentPassport address and the deployment block number.
```

Result on 2026-11-18 (fresh anvil, deterministic addresses):
`MockAgentId 0x5FbDB2315678afecb367f032d93F642f64180aa3`,
`AgentPassport 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0`,
`deployBlock 2`.

**Headless read/write check (what was actually run):** a node script
using the frontend's own `abi.js` + the exact `app.js` mapping logic
against that anvil deployment verified: `name()`/`symbol()`/`milestones()`,
`passportOf()`/`balanceOf()`, `getCheckInStats()` mapping
(current/best/total/lastCheckIn), client-side `canCheckIn`/`nextCheckInAt`,
`hasClaimedBadge()`, event-log public stats (`queryFilter` from
`deployBlock`), `mint()` → token 1, daily `checkIn()` (streak 1→2→3 over
three simulated UTC days), second check-in same day reverts
(`AlreadyCheckedInToday`), early `claimBadge(3)` reverts, `claimBadge(3)`
succeeds at bestStreak 3 (badge token 1), `claimBadge(7)` still reverts
(`StreakTooLow`), double-claim reverts. Final public stats: 1 minted,
3 check-ins.

**Browser UI check (not yet done — needs a manual step):** point a local
copy of `config.js` at the anvil deployment (`chainId: 31337`,
`chainIdHex: "0x7a69"`, `publicRpc: "http://127.0.0.1:8545"`,
`passportAddress` + `agentIdAddress` + `deployBlock` as above), serve
the folder, import anvil account #0's key into the wallet, connect, and
click through mint → check-in → claim. Do **not** commit the local
`config.js` — mainnet values stay in the committed file.

## What works now / what is still placeholder

**Works now (tested 2026-11-18):**
- Page loads, responsive layout, dark/light via system preference.
- Wallet connect via injected provider; wrong-network warning + switch prompt.
- **Agent ID eligibility read is live and verified:** `balanceOf` on
  `0x60b9…022f` via the public BSC RPC returns `1` for a known Agent ID
  holder wallet — the eligibility path works end-to-end against mainnet.
- Public stats read from the public RPC — counted from `PassportMinted` /
  `CheckedIn` event logs starting at `deployBlock` 134313385.
- All buttons, streak/badge rendering and tx-status UI are wired; they stay
  disabled until the contract is live and the wallet is eligible.
- **Real Passport ABI wired in `abi.js`** (selectors + event topics
  verified against the compiled artifact) and the full
  mint → check-in → badge flow verified against a local anvil deployment
  (see "End-to-end test" above).

**Still to do:**
- End-to-end test against the deployed contract on mainnet — **no mainnet
  transaction has been broadcast from this work** (the deploy itself was a
  separate, approved step).

**Deliberately not implemented:**
- WalletConnect (needs a project ID + extra dependency; injected wallets
  cover the hackathon demo). Can be added later if needed.
- QR / Agentic Wallet web login (forbidden by hackathon rules).
- Any branding, logo, or promise of value/return/airdrop.

## Files

- `index.html` — page structure
- `styles.css` — styling (responsive, dark/light)
- `app.js` — wallet, eligibility, streak, badges, transactions
- `config.js` — chain, RPC, contract addresses, milestones, deployBlock
- `abi.js` — real AgentPassport ABI (human-readable ethers v6 fragments,
  verified against `contracts/out/AgentPassport.sol/AgentPassport.json`)
