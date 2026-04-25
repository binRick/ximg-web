#!/usr/bin/env bash
# Summarize new SSH honeypot session logs using Claude Code CLI.
# Finds .log files in ssh-logs/ that don't yet have a .summary companion,
# extracts commands, and asks Claude to write a brief analysis.
#
# Intended to run via cron every few minutes on the host (not in Docker).

LOG_DIR="/root/ximg-web/ssh-logs"
LOCK="/tmp/ssh-summarize.lock"

# Prevent overlapping runs
exec 9>"$LOCK"
flock -n 9 || exit 0

# Only match session logs (YYYYMMDD-HHMMSS-IP-PID.log), not summarize.log etc.
for logfile in "$LOG_DIR"/20[0-9][0-9]*.log; do
  [ -f "$logfile" ] || continue

  summary="${logfile%.log}.summary"
  [ -f "$summary" ] && continue

  # Skip files still being written (modified in the last 60 seconds)
  if [ "$(find "$logfile" -mmin -1 2>/dev/null)" ]; then
    continue
  fi

  # Skip tiny sessions (just the header, no real activity)
  size=$(stat -c%s "$logfile" 2>/dev/null || echo 0)
  if [ "$size" -lt 500 ]; then
    echo "No meaningful activity — session ended before any commands were executed." > "$summary"
    continue
  fi

  # Extract printable commands from the raw PTY log
  commands=$(strings "$logfile" | grep -aE '(curl |wget |chmod |sh |bash |python|perl|cat /|echo |uname|whoami|passwd|/tmp/|/dev/shm|crontab|nmap|nc |apt |yum |dnf |pip |rm -|mkdir|history|export |eval |base64|exec |kill|pkill|ps |netstat|ss |ifconfig|ip addr|hostname|nohup|cd |ls$|ls /|ls -|find |scp |tar |zip |unzip|gcc |make |/var/|/etc/|/root|/home|mount|chown|useradd|adduser|iptab|systemctl|service |docker|kube|\.sh|\.py|pwd|w$|id$|uptime|free |df |cat |head |tail |vi |nano )' | head -60 || true)

  # Extract the header for context
  header=$(head -7 "$logfile" 2>/dev/null | strings || true)

  if [ -z "$commands" ]; then
    echo "Session contained no recognizable shell commands — likely a port scan, protocol probe, or immediate disconnect." > "$summary"
    continue
  fi

  # Write prompt to a temp file using printf to avoid shell expansion issues
  tmpfile=$(mktemp)
  printf '%s\n\n%s\n%s\n\n%s\n%s\n' \
    "Analyze this SSH honeypot session. Write a concise summary (3-8 sentences) of what the attacker tried to do, their likely intent, and any IOCs (IPs, URLs, filenames, C2 servers). Be specific about the techniques used." \
    "SESSION HEADER:" \
    "$header" \
    "EXTRACTED COMMANDS:" \
    "$commands" \
    > "$tmpfile"

  /root/.local/bin/claude --print --model "haiku" --permission-mode acceptEdits < "$tmpfile" > "$summary" 9>&- 2>/dev/null || rm -f "$summary"
  rm -f "$tmpfile"

done
