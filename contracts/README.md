# Agent Passport — Contracts

Solidity source for the Agent Passport project (Chain ID 56, mainnet).

| Contract | Address | Deploy block |
|---|---|---|
| AgentPassport (APASS) | `0x199474bD345b87373f81F902ff5a957Bd02BaFEE` | 134313385 |

- `src/AgentPassport.sol` — soulbound ERC-721 Passport: free `mint()` for
  Agent ID holders, once-per-day `checkIn()` streaks, `claimBadge()` at
  streak milestones 3 / 7 / 14 / 21.
- `src/AgentPassportBadge.sol` — soulbound ERC-721 milestone badges, mintable
  only by the Passport contract.

Build: Foundry (`forge build`). No secrets, no deploy keys in this repo.
