// Agent Passport — REAL ABI (AgentPassport, ERC-721 APASS)
// Source of truth: contracts/out/AgentPassport.sol/AgentPassport.json
// (Foundry build of contracts/src/AgentPassport.sol). Human-readable
// fragments, ethers v6. Only the functions/events the frontend uses are
// listed; the full compiled ABI has the standard ERC-721 surface too.
//
// Behaviour that differs from the original placeholder spec:
// - There is NO getStreak(), canCheckIn(), nextCheckInAt(), hasBadge(),
//   totalSupply(), totalCheckIns() or tokenOfOwnerByIndex() on-chain.
//   The frontend derives those client-side from getCheckInStats() (see
//   app.js) and from PassportMinted / CheckedIn event logs.
// - getCheckInStats(address) returns one struct:
//   (lastCheckInDay uint64 = UTC day number, streak uint32 = current
//   streak, totalCheckIns uint32, bestStreak uint32).
// - claimBadge() requires bestStreak >= milestone (NOT the current
//   streak) — it reverts StreakTooLow(bestStreak, required) otherwise.
// - passportOf(address) returns the holder's token id, or 0 if none.

export const PASSPORT_ABI = [
  // --- writes (user confirms each one in their own wallet) ---
  "function mint() returns (uint256 tokenId)",
  "function checkIn()",
  "function claimBadge(uint256 milestone) returns (uint256 badgeTokenId)",

  // --- reads ---
  "function getCheckInStats(address holder) view returns (tuple(uint64 lastCheckInDay, uint32 streak, uint32 totalCheckIns, uint32 bestStreak))",
  "function hasClaimedBadge(address holder, uint256 milestone) view returns (bool)",
  "function passportOf(address holder) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function milestones() view returns (uint256[4])",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function owner() view returns (address)",

  // --- events (used for the public totals — the contract has no
  // --- totalSupply()/totalCheckIns()) ---
  "event PassportMinted(address indexed holder, uint256 indexed tokenId)",
  "event CheckedIn(address indexed holder, uint256 indexed tokenId, uint64 indexed day, uint32 streak)",
  "event BadgeClaimed(address indexed holder, uint256 indexed tokenId, uint256 milestone, uint256 badgeTokenId)",
];

// Minimal ERC-721 read used only for the Agent ID eligibility check
// (balanceOf > 0 on the Agent ID contract).
export const AGENT_ID_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
];
