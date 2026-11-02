#!/usr/bin/env python3
"""Detach adapter-node server for Lab Notes Aphex eval (SPR-071)."""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOG = Path("/tmp/lab-notes-aphex-server.log")
ENV_FILE = ROOT / ".env.lab-notes"

def main() -> int:
    if not ENV_FILE.exists():
        print("Missing .env.lab-notes — copy from .env.lab-notes.example", file=sys.stderr)
        return 1
    build_index = ROOT / "build" / "index.js"
    if not build_index.exists():
        print("Missing build/index.js — run: pnpm lab-notes:build with .env.lab-notes", file=sys.stderr)
        return 1
    env = os.environ.copy()
    with ENV_FILE.open() as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    env.setdefault("HOST", "127.0.0.1")
    env.setdefault("PORT", "5192")
    env.setdefault("ORIGIN", "http://127.0.0.1:5192")
    log = LOG.open("a")
    proc = subprocess.Popen(
        ["node", str(build_index)],
        cwd=str(ROOT),
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    print(proc.pid)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
