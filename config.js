// Agent Passport — configuration
// All values here are placeholders until the real contracts are deployed.
// Update CONTRACTS after deployment; the UI reads everything from this file.

export const CONFIG = {
  // Chain ID 56 (BNB Smart Chain mainnet). Shown to the user only as
  // "Chain ID 56" / network name from their wallet; no brand assets used.
  chainId: 56,
  chainIdHex: "0x38",

  // Public read-only RPC (no wallet needed for reads).
  publicRpc: "https://bsc-dataseed.binance.org/",

  // BscScan base for transaction links.
  explorerTx: "https://bscscan.com/tx/",

  // Passport contract — DEPLOYED on BSC mainnet 2026-11-18, block 134313385.
  // Tx 0xcdb0c21f1bfe520cbf1c2d3e5d56226dc1b04d1ff5fb0aed329972c893558ba5
  // (via deterministic deployment proxy CREATE2).
  passportAddress: "0x199474bD345b87373f81F902ff5a957Bd02BaFEE",

  // Block the Passport contract was deployed in: 134313385 (2026-11-18).
  // Public totals (passports minted / total check-ins) are counted from
  // PassportMinted / CheckedIn event logs starting at this block.
  deployBlock: 134313385,

  // Agent ID (ERC-721) contract — VERIFIED live on BSC mainnet 2026-11-18:
  // name "SPACE ID Agent ID", symbol "AI". Eligibility = balanceOf > 0.
  // (The spec originally listed this address as the Passport contract;
  // on-chain readback shows it is the Agent ID contract itself.)
  agentIdAddress: "0x60b9262456de011f7d15a54cdd8c48baaa8b022f",

  // Streak badge milestones (days).
  milestones: [3, 7, 14, 21],

  // Seconds in a day, used for the "next check-in" countdown.
  daySeconds: 86400,
};
