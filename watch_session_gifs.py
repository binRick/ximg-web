#!/usr/bin/env python3
"""Watch ssh-logs/ for new session logs and auto-generate GIFs using VHS."""

import os
import subprocess
import sys
import time

SSH_LOGS_DIR = "/root/ximg-web/ssh-logs"
GEN_SCRIPT   = "/root/ximg-web/gen-session-gif.sh"
POLL_SECS    = 5
SETTLE_SECS  = 3   # wait after a new .log appears before generating (let it finish writing)


def log_files():
    try:
        return {f for f in os.listdir(SSH_LOGS_DIR) if f.endswith(".log")}
    except OSError:
        return set()


def gif_stems():
    """Return the set of base names (without ext) that already have a .gif."""
    try:
        return {os.path.splitext(f)[0] for f in os.listdir(SSH_LOGS_DIR) if f.endswith(".gif")}
    except OSError:
        return set()


def generate(logfile):
    print(f"[gif] generating {logfile} …", flush=True)
    r = subprocess.run([GEN_SCRIPT, logfile], capture_output=True, text=True)
    if r.returncode == 0:
        print(f"[gif] ok  → {logfile[:-4]}.gif", flush=True)
    else:
        print(f"[gif] FAIL {logfile}\n{r.stdout}{r.stderr}", flush=True)


def main():
    print(f"[gif] watching {SSH_LOGS_DIR}", flush=True)

    # First pass — generate for any existing logs that lack a GIF
    missing = {f for f in log_files() if os.path.splitext(f)[0] not in gif_stems()}
    if missing:
        print(f"[gif] back-filling {len(missing)} session(s) …", flush=True)
        for f in sorted(missing):
            generate(f)

    known = log_files()
    while True:
        time.sleep(POLL_SECS)
        current = log_files()
        new = current - known
        for f in sorted(new):
            time.sleep(SETTLE_SECS)   # let honeypot finish writing the log
            generate(f)
        known = current


if __name__ == "__main__":
    main()
