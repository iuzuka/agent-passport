// Agent Passport — frontend logic (vanilla JS + ethers v6 via CDN).
//
// Flow:
//  1. Read-only public stats load immediately from the public RPC.
//  2. User connects an injected wallet (MetaMask / wallet app). The site
//     NEVER signs anything on its own: every state-changing call (mint,
//     checkIn, claimBadge) opens the wallet's own confirmation prompt and
//     only broadcasts after the user approves.
//  3. Eligibility is checked ONLY for the connected wallet — there is no
//     lookup for other people's addresses.
//  4. Until the Passport contract is deployed, all contract reads fail and
//     the UI shows a clear "not deployed yet" notice instead of fake data.

import { CONFIG } from "./config.js";
import { PASSPORT_ABI, AGENT_ID_ABI } from "./abi.js";

const $ = (id) => document.getElementById(id);

// ---- state ---------------------------------------------------------------
let provider = null;        // ethers BrowserProvider (connected wallet)
let signer = null;
let account = null;
let onCorrectChain = false;
let contractLive = false;   // true once a read against the Passport contract succeeds
let status = {
  hasAgentId: false,
  hasPassport: false,
  streak: null,             // { current, best, total, lastCheckIn }
  canCheckIn: false,
  nextCheckInAt: 0n,
  badges: {},               // milestone -> claimed bool
};

// ---- helpers -------------------------------------------------------------
function shortAddr(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";
}

function fmtDate(ts) {
  if (!ts || ts === 0n) return "Never";
  return new Date(Number(ts) * 1000).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function setTx(text, kind = "", txHash = null) {
  const card = $("txCard");
  const el = $("txStatus");
  card.classList.remove("hidden");
  el.textContent = text;
  el.className = `tx-status ${kind}`;
  const wrap = $("txLinkWrap");
  if (txHash) {
    wrap.classList.remove("hidden");
    const link = $("txLink");
    link.textContent = txHash;
    link.href = CONFIG.explorerTx + txHash;
  } else {
    wrap.classList.add("hidden");
  }
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function showDeployNotice() {
  const n = $("deployNotice");
  n.classList.remove("hidden");
  n.textContent =
    "The Passport contract is not deployed yet — minting, check-in and badges are disabled. " +
    "Public stats and wallet connection still work. Check back after the contract goes live.";
}

// ---- read-only public provider -------------------------------------------
const readProvider = new ethers.JsonRpcProvider(CONFIG.publicRpc);

function passportRead() {
  return new ethers.Contract(CONFIG.passportAddress, PASSPORT_ABI, readProvider);
}

async function loadPublicStats() {
  const setDashes = () => {
    $("totalMinted").textContent = "—";
    $("totalCheckIns").textContent = "—";
  };

  // No address configured yet: nothing to read.
  if (CONFIG.passportAddress === "0x0000000000000000000000000000000000000000") {
    setDashes();
    contractLive = false;
    showDeployNotice();
    return;
  }

  try {
    // Contract liveness = code present at the address. The contract has
    // no totalSupply()/totalCheckIns(), so totals come from event logs.
    const code = await readProvider.getCode(CONFIG.passportAddress);
    if (code === "0x") {
      setDashes();
      contractLive = false;
      showDeployNotice();
      console.warn("No code at the Passport address — contract not deployed yet.");
      return;
    }
    contractLive = true;

    if (CONFIG.deployBlock > 0) {
      try {
        const c = passportRead();
        const [minted, checkIns] = await Promise.all([
          c.queryFilter(c.filters.PassportMinted, CONFIG.deployBlock),
          c.queryFilter(c.filters.CheckedIn, CONFIG.deployBlock),
        ]);
        $("totalMinted").textContent = minted.length.toString();
        $("totalCheckIns").textContent = checkIns.length.toString();
      } catch (e) {
        // RPC refused the log range (or another read error): show dashes,
        // never an invented number.
        setDashes();
        console.warn("Public stats log query failed (deployBlock may be wrong or the RPC refused the range):", e);
      }
    } else {
      // Deployment block unknown: no unbounded log query, just dashes.
      setDashes();
    }
  } catch (e) {
    // RPC hiccup: show dashes, not invented numbers.
    setDashes();
    contractLive = false;
    showDeployNotice();
    console.warn("Public stats unavailable:", e);
  }
}

// ---- wallet connection ----------------------------------------------------
async function connectWallet() {
  if (!window.ethereum) {
    alert("No injected wallet found. Install a wallet app/extension (e.g. MetaMask) and try again.");
    return;
  }
  try {
    provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    account = accounts[0];
    signer = await provider.getSigner();
    await refreshWalletUI();
  } catch (e) {
    console.error("Wallet connection failed:", e);
    alert("Wallet connection was cancelled or failed.");
  }
}

async function refreshWalletUI() {
  $("notConnected").classList.add("hidden");
  $("connected").classList.remove("hidden");
  $("walletAddr").textContent = shortAddr(account);

  const network = await provider.getNetwork();
  onCorrectChain = Number(network.chainId) === CONFIG.chainId;
  $("networkName").textContent = onCorrectChain
    ? `Chain ID ${CONFIG.chainId} ✓`
    : `Chain ID ${Number(network.chainId)} (wrong network)`;
  $("chainWarning").classList.toggle("hidden", onCorrectChain);

  await refreshEligibility();
}

async function switchChain() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CONFIG.chainIdHex }],
    });
    await refreshWalletUI();
  } catch (e) {
    alert("Could not switch network automatically — please switch to Chain ID 56 in your wallet.");
    console.error("Chain switch failed:", e);
  }
}

// ---- eligibility + streak (connected wallet only) -------------------------
async function refreshEligibility() {
  // Reset to "unknown" while loading; never show stale data as current.
  $("agentIdStatus").textContent = "Checking…";
  $("passportStatus").textContent = "Checking…";
  $("mintBtn").disabled = true;
  $("checkInBtn").disabled = true;
  $("actionHint").textContent = "";

  if (!contractLive) {
    // Passport not deployed yet: Agent ID status can still be read live.
    try {
      const agentId = new ethers.Contract(CONFIG.agentIdAddress, AGENT_ID_ABI, readProvider);
      const agentBal = await agentId.balanceOf(account);
      status.hasAgentId = agentBal > 0n;
      $("agentIdStatus").textContent = status.hasAgentId ? `Yes (${agentBal})` : "No";
    } catch (e) {
      $("agentIdStatus").textContent = "Check failed";
    }
    $("passportStatus").textContent = "Contract not live yet";
    $("actionHint").textContent = "Mint / check-in unlock once the Passport contract is deployed.";
    renderBadges();
    renderStreak();
    return;
  }

  try {
    const agentId = new ethers.Contract(CONFIG.agentIdAddress, AGENT_ID_ABI, readProvider);
    const passport = passportRead();

    const [agentBal, passBal] = await Promise.all([
      agentId.balanceOf(account),
      passport.balanceOf(account),
    ]);
    status.hasAgentId = agentBal > 0n;
    status.hasPassport = passBal > 0n;
    $("agentIdStatus").textContent = status.hasAgentId ? `Yes (${agentBal})` : "No";
    $("passportStatus").textContent = status.hasPassport ? "Minted ✓" : "Not minted";

    if (status.hasPassport) {
      // The contract exposes NO getStreak()/canCheckIn()/nextCheckInAt():
      // one getCheckInStats() call returns the struct
      // (lastCheckInDay, streak, totalCheckIns, bestStreak) and the rest
      // is derived client-side. lastCheckInDay is a UTC day NUMBER
      // (floor(unix/86400)), not a timestamp.
      const stats = await passport.getCheckInStats(account);
      const lastDay = stats.lastCheckInDay ?? stats[0];       // BigInt, 0 = never
      const current = stats.streak ?? stats[1];
      const total = stats.totalCheckIns ?? stats[2];
      const best = stats.bestStreak ?? stats[3];
      const todayUTC = BigInt(Math.floor(Date.now() / 1000 / CONFIG.daySeconds));

      status.streak = {
        current,
        best,
        total,
        lastCheckIn: lastDay === 0n ? 0n : lastDay * BigInt(CONFIG.daySeconds),
      };
      // Can check in today iff the last check-in day is before today (UTC).
      status.canCheckIn = lastDay < todayUTC;
      // Next check-in opens at the start of the day after the last one;
      // 0 means "can check in now".
      status.nextCheckInAt = status.canCheckIn ? 0n : (lastDay + 1n) * BigInt(CONFIG.daySeconds);

      const badgeChecks = await Promise.all(
        CONFIG.milestones.map((m) => passport.hasClaimedBadge(account, m)),
      );
      CONFIG.milestones.forEach((m, i) => { status.badges[m] = badgeChecks[i]; });
    } else {
      status.streak = null;
      status.canCheckIn = false;
      status.badges = {};
    }
  } catch (e) {
    console.error("Eligibility check failed:", e);
    $("agentIdStatus").textContent = "Check failed";
    $("passportStatus").textContent = "Check failed";
    $("actionHint").textContent = "Could not read the contract — it may not be deployed yet, or the network is unreachable. Try again later.";
    renderBadges();
    renderStreak();
    return;
  }

  renderStreak();
  renderBadges();
  updateButtons();
}

function renderStreak() {
  const s = status.streak;
  $("streakCurrent").textContent = s ? s.current.toString() : "—";
  $("streakBest").textContent = s ? s.best.toString() : "—";
  $("streakTotal").textContent = s ? s.total.toString() : "—";
  $("lastCheckIn").textContent = s ? fmtDate(s.lastCheckIn) : "—";
  if (s && !status.canCheckIn && status.nextCheckInAt > 0n) {
    $("nextCheckIn").textContent = `Next check-in opens: ${fmtDate(status.nextCheckInAt)}`;
  } else if (s && status.canCheckIn) {
    $("nextCheckIn").textContent = "You can check in today.";
  } else {
    $("nextCheckIn").textContent = "";
  }
}

function renderBadges() {
  const wrap = $("badges");
  wrap.innerHTML = "";
  for (const m of CONFIG.milestones) {
    const claimed = !!status.badges[m];
    // Claim rule is on BEST streak, not the current streak: claimBadge()
    // reverts StreakTooLow unless bestStreak >= milestone. A broken
    // streak can still claim badges earned by an earlier best run.
    const reachable = status.streak ? status.streak.best >= BigInt(m) : false;
    const div = document.createElement("div");
    div.className = `badge${claimed ? " claimed" : ""}`;
    div.innerHTML = `
      <span class="badge-days">${m}-day</span>
      <span class="badge-state">${claimed ? "Claimed ✓" : reachable ? "Ready to claim" : `Needs best streak of ${m} days`}</span>
    `;
    const btn = document.createElement("button");
    btn.className = "btn btn-small";
    btn.textContent = "Claim Badge";
    btn.disabled = !contractLive || !onCorrectChain || claimed || !reachable;
    btn.addEventListener("click", () => claimBadge(m));
    div.appendChild(btn);
    wrap.appendChild(div);
  }
}

function updateButtons() {
  const mintBtn = $("mintBtn");
  const checkInBtn = $("checkInBtn");
  const hint = $("actionHint");

  mintBtn.disabled = true;
  checkInBtn.disabled = true;

  if (!onCorrectChain) {
    hint.textContent = "Switch to Chain ID 56 to use mint / check-in.";
    return;
  }
  if (!status.hasAgentId) {
    hint.textContent = "You need to hold an Agent ID to mint a Passport.";
    return;
  }
  if (status.hasPassport) {
    hint.textContent = status.canCheckIn
      ? "Passport minted. You can check in today."
      : "Passport minted. Check-in for today already done.";
    checkInBtn.disabled = !status.canCheckIn;
    return;
  }
  hint.textContent = "You are eligible — mint your free Passport (gas only).";
  mintBtn.disabled = false;
}

// ---- transactions (user confirms in their own wallet) --------------------
function passportWrite() {
  return new ethers.Contract(CONFIG.passportAddress, PASSPORT_ABI, signer);
}

async function sendTx(label, fn) {
  setTx(`${label} — waiting for your wallet confirmation…`, "pending");
  try {
    const tx = await fn();
    setTx(`${label} — sent, waiting for confirmation…`, "pending", tx.hash);
    const receipt = await tx.wait();
    if (receipt.status === 1) {
      setTx(`${label} — confirmed ✓`, "success", tx.hash);
    } else {
      setTx(`${label} — transaction failed on-chain.`, "error", tx.hash);
    }
  } catch (e) {
    // Includes user rejecting the prompt in their wallet.
    const msg = e?.info?.error?.message || e?.shortMessage || e?.message || "Unknown error";
    setTx(`${label} — not sent: ${msg}`, "error");
    console.error(`${label} failed:`, e);
    return;
  }
  // Refresh all on-chain state after any confirmed (or failed) attempt.
  await loadPublicStats();
  await refreshEligibility();
}

async function mint() {
  await sendTx("Mint Passport", () => passportWrite().mint());
}

async function checkIn() {
  await sendTx("Daily check-in", () => passportWrite().checkIn());
}

async function claimBadge(milestone) {
  await sendTx(`Claim ${milestone}-day badge`, () =>
    passportWrite().claimBadge(milestone),
  );
}

// ---- wallet events --------------------------------------------------------
if (window.ethereum) {
  window.ethereum.on("accountsChanged", (accounts) => {
    account = accounts[0] || null;
    if (account) refreshWalletUI();
    else location.reload();
  });
  window.ethereum.on("chainChanged", () => location.reload());
}

// ---- wire up + boot -------------------------------------------------------
$("connectBtn").addEventListener("click", connectWallet);
$("connectBtn2").addEventListener("click", connectWallet);
$("switchChainBtn").addEventListener("click", switchChain);
$("mintBtn").addEventListener("click", mint);
$("checkInBtn").addEventListener("click", checkIn);
$("contractAddr").textContent = CONFIG.passportAddress;

renderBadges();
loadPublicStats();
