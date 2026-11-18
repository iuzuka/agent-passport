# Agent Passport — Metadata

Static ERC-721 metadata hosted on GitHub Pages. No Binance/BNB branding anywhere.
All items are participation collectibles only — no monetary value, no airdrop, no token promised.

## Passport — `metadata/passport/{tokenId}`

- Token IDs are sequential from 1 (one per wallet, soulbound).
- Every Passport shares the same art (`images/passport.png`); only the `name` carries the token id.
- Files 1..100 are pre-generated as a buffer; re-run `scripts/generate-passport-metadata.py`
  (or extend the range) if minting approaches 100.
- Live streak / check-in stats are NOT in this static JSON (they would go stale);
  the frontend reads them live from the contract.

## Badge — `metadata/badge/{tokenId}`

- Badge token IDs are a GLOBAL sequential counter shared by ALL milestones
  (see `AgentPassportBadge.sol`: `_nextTokenId`, starting at 1). A badge token
  id does NOT by itself say which milestone it is.
- The milestone of a minted badge is stored on-chain and readable:
  `badgeMilestone(tokenId)` returns 3, 7, 14 or 21, and `badgePassportId(tokenId)`
  returns the Passport token id it was claimed from.
- Therefore badge JSON files can only be written AFTER a badge is minted.
  `scripts/update-badge-metadata.py` does exactly that: it probes the Badge
  contract for new token ids, reads their milestone, and writes
  `metadata/badge/{tokenId}` with the matching art (`images/badge-{3,7,14,21}.png`)
  and attributes (Milestone, Passport Token, Transferable: No).
- No badge has been minted yet, so this folder is intentionally empty until the
  first 3-day streak badge is claimed.

## Base URIs (set via `setBaseURI` on each contract, owner only)

- Passport: `https://iuzuka.github.io/agent-passport/metadata/passport/`
- Badge: `https://iuzuka.github.io/agent-passport/metadata/badge/`

`tokenURI(tokenId)` on each contract returns `baseURI + tokenId` (OpenZeppelin
default; no `tokenURI` override in either contract).
