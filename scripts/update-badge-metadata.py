#!/usr/bin/env python3
"""Write Badge metadata files for newly minted badges.

Why this script exists
-----------------------
Badge token IDs are a GLOBAL sequential counter shared by ALL milestones
(AgentPassportBadge.sol: `_nextTokenId`, starting at 1). A badge token id
does NOT by itself say which milestone it is. The milestone lives on-chain
in `badgeMilestone(tokenId)` (3, 7, 14 or 21) and the source passport in
`badgePassportId(tokenId)`.

So a badge JSON file can only be written AFTER that badge is minted, once its
milestone is known. This script probes the Badge contract for token ids
sequentially, reads each new badge's milestone, and writes
`metadata/badge/{tokenId}` with the matching art and attributes.

Usage:
    python3 scripts/update-badge-metadata.py [--rpc https://bsc-dataseed.binance.org]

After it writes new files, commit + push so GitHub Pages serves them:
    git add metadata/badge && git commit -m "Badge metadata: add #N ..." && git push

Requires: python3 (standard library only).
"""
import argparse
import json
import os
import urllib.request

BADGE = "0x5D6AECD4a81161559348DA825b95a7c3cCf60F12"
BASE = "https://iuzuka.github.io/agent-passport"
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MILESTONE_LABEL = {3: "3-day streak", 7: "7-day streak", 14: "14-day streak", 21: "21-day streak"}


def rpc(url, method, params):
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def eth_call(url, to, data):
    r = rpc(url, "eth_call", [{"to": to, "data": data}, "latest"])
    if "error" in r:
        raise RuntimeError(r["error"])
    return r["result"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rpc", default="https://bsc-dataseed.binance.org")
    args = ap.parse_args()

    # Function selectors, precomputed with `cast sig` (keccak256 of the
    # canonical signature, first 4 bytes):
    #   ownerOf(uint256)         -> 0x6352211e
    #   badgeMilestone(uint256)  -> 0x1895c9a1
    #   badgePassportId(uint256) -> 0xb78266c8
    sel_owner = "0x6352211e"
    sel_milestone = "0x1895c9a1"
    sel_passport = "0xb78266c8"

    outdir = os.path.join(REPO, "metadata", "badge")
    os.makedirs(outdir, exist_ok=True)
    existing = [int(f) for f in os.listdir(outdir) if f.isdigit()]
    n = max(existing, default=0) + 1

    wrote = []
    while True:
        arg = "0x" + n.to_bytes(32, "big").hex()
        try:
            eth_call(args.rpc, BADGE, sel_owner + arg[2:])
        except RuntimeError:
            break  # ownerOf reverts -> token id does not exist yet
        # ownerOf succeeded: token exists. Read milestone + passport id.
        ms_raw = eth_call(args.rpc, BADGE, sel_milestone + arg[2:])
        pp_raw = eth_call(args.rpc, BADGE, sel_passport + arg[2:])
        milestone = int(ms_raw, 16)
        passport_id = int(pp_raw, 16)
        label = MILESTONE_LABEL.get(milestone, f"{milestone}-day streak")
        meta = {
            "name": f"Agent Passport Badge \u2014 {label}",
            "description": (
                f"A soulbound badge awarded for a {label} check-in streak on an Agent Passport. "
                "Non-transferable. This is a collectible record of participation only \u2014 "
                "it carries no monetary value, promises no airdrop and no token."
            ),
            "image": f"{BASE}/images/badge-{milestone}.png",
            "attributes": [
                {"trait_type": "Type", "value": "Milestone Badge"},
                {"trait_type": "Milestone", "value": label},
                {"trait_type": "Passport Token", "value": passport_id},
                {"trait_type": "Transferable", "value": "No"},
            ],
        }
        with open(os.path.join(outdir, str(n)), "w") as f:
            json.dump(meta, f, indent=2)
            f.write("\n")
        wrote.append((n, milestone, passport_id))
        n += 1

    if wrote:
        for token_id, milestone, passport_id in wrote:
            print(f"badge #{token_id}: {milestone}-day streak, from passport #{passport_id}")
    else:
        print("no new badges minted")


if __name__ == "__main__":
    main()
