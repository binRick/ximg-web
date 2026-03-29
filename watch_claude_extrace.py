#!/usr/bin/env python3
"""
Watch for new Claude processes and log extrace output for each one.
Logs are written to ./claude-extrace-logs/pid<PID>_<timestamp>.log
"""

import os
import subprocess
import sys
import signal
import time
from datetime import datetime
from pathlib import Path

LOG_DIR = Path("claude-extrace-logs")
POLL_INTERVAL = 0.5  # seconds between /proc scans
EXTRACE_BIN = "extrace"

# Match any process whose name or cmdline contains these strings (case-insensitive)
MATCH_STRINGS = ["claude"]


def get_proc_field(pid, field):
    try:
        with open(f"/proc/{pid}/{field}", "r") as f:
            return f.read()
    except (OSError, IOError):
        return None


def get_cmdline(pid):
    raw = get_proc_field(pid, "cmdline")
    if raw is None:
        return None
    return raw.replace("\x00", " ").strip()


def get_comm(pid):
    raw = get_proc_field(pid, "comm")
    if raw is None:
        return None
    return raw.strip()


def is_claude_process(pid):
    comm = get_comm(pid) or ""
    cmdline = get_cmdline(pid) or ""
    text = (comm + " " + cmdline).lower()
    return any(m in text for m in MATCH_STRINGS)


def scan_pids():
    pids = set()
    try:
        for entry in os.listdir("/proc"):
            if entry.isdigit():
                pids.add(int(entry))
    except OSError:
        pass
    return pids


def pid_exists(pid):
    return os.path.exists(f"/proc/{pid}")


def main():
    LOG_DIR.mkdir(exist_ok=True)

    seen_pids = set()
    # pid -> (subprocess.Popen, file_handle)
    tracers = {}

    print(f"[*] Watching for Claude processes (poll every {POLL_INTERVAL}s)")
    print(f"[*] Logs -> {LOG_DIR.resolve()}/")
    print(f"[*] Press Ctrl+C to stop\n")

    def cleanup(sig=None, frame=None):
        print("\n[*] Shutting down...")
        for pid, (proc, fh) in list(tracers.items()):
            try:
                proc.terminate()
            except Exception:
                pass
            try:
                fh.close()
            except Exception:
                pass
        sys.exit(0)

    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    while True:
        current_pids = scan_pids()

        # Detect new Claude processes
        for pid in current_pids:
            if pid in seen_pids:
                continue
            if is_claude_process(pid):
                seen_pids.add(pid)
                comm = get_comm(pid) or "unknown"
                cmdline = get_cmdline(pid) or ""
                ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                log_path = LOG_DIR / f"pid{pid}_{ts}.log"

                print(f"[+] New Claude process: PID {pid} ({comm})")
                print(f"    cmd: {cmdline[:120]}")
                print(f"    log: {log_path}")

                try:
                    fh = open(log_path, "w")
                    fh.write(f"# pid:     {pid}\n")
                    fh.write(f"# comm:    {comm}\n")
                    fh.write(f"# started: {ts}\n")
                    fh.write(f"# cmdline: {cmdline}\n")
                    fh.write("#\n")
                    fh.flush()

                    proc = subprocess.Popen(
                        [EXTRACE_BIN, "-p", str(pid)],
                        stdout=fh,
                        stderr=fh,
                    )
                    tracers[pid] = (proc, fh)
                except FileNotFoundError:
                    print(f"    [!] extrace not found at '{EXTRACE_BIN}'")
                except Exception as e:
                    print(f"    [!] Failed to start extrace for PID {pid}: {e}")

        # Reap finished tracers
        for pid in list(tracers):
            proc, fh = tracers[pid]
            if proc.poll() is not None or not pid_exists(pid):
                fh.flush()
                fh.close()
                del tracers[pid]
                print(f"[-] Process ended: PID {pid}")

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
