#!/usr/bin/env python3
"""Generate Passport metadata files 1..N (static JSON, no extension).

Passport token IDs are sequential from 1 and every Passport shares the same
art, so files can be pre-generated as a buffer. Run again with a higher --to
when minting approaches the current range.

Usage:
    python3 scripts/generate-passport-metadata.py [--to 200]
"""
import argparse
import json
import os

BASE = "https://iuzuka.github.io/agent-passport"
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DESCRIPTION = (
    "A soulbound passport for Agent ID holders. Minted free (gas only), one per wallet, "
    "non-transferable. Holders can check in once per day (UTC) to build an on-chain streak, and streak "
    "milestones (3 / 7 / 14 / 21 days) unlock free soulbound milestone badges. This is a participation "
    "collectible only \u2014 it carries no monetary value, promises no airdrop and no token."
)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--to", type=int, default=100)
    args = ap.parse_args()

    outdir = os.path.join(REPO, "metadata", "passport")
    os.makedirs(outdir, exist_ok=True)
    for n in range(1, args.to + 1):
        meta = {
            "name": f"Agent Passport #{n}",
            "description": DESCRIPTION,
            "image": f"{BASE}/images/passport.png",
            "attributes": [
                {"trait_type": "Type", "value": "Passport"},
                {"trait_type": "Transferable", "value": "No"},
            ],
        }
        with open(os.path.join(outdir, str(n)), "w") as f:
            json.dump(meta, f, indent=2)
            f.write("\n")
    print(f"wrote passport metadata 1..{args.to}")


if __name__ == "__main__":
    main()
