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
  exposure="${logfile%.log}.exposure"

  # Skip if both summary and exposure already exist
  [ -f "$summary" ] && [ -f "$exposure" ] && continue

  # Skip files still being written (modified in the last 60 seconds)
  if [ "$(find "$logfile" -mmin -1 2>/dev/null)" ]; then
    continue
  fi

  # Skip tiny sessions (just the header, no real activity)
  size=$(stat -c%s "$logfile" 2>/dev/null || echo 0)
  if [ "$size" -lt 500 ]; then
    [ -f "$summary" ]  || echo "No meaningful activity — session ended before any commands were executed." > "$summary"
    [ -f "$exposure" ] || echo "No meaningful activity to analyze." > "$exposure"
    continue
  fi

  # Extract printable commands from the raw PTY log
  commands=$(strings "$logfile" | grep -aE '(curl |wget |chmod |sh |bash |python|perl|cat /|echo |uname|whoami|passwd|/tmp/|/dev/shm|crontab|nmap|nc |apt |yum |dnf |pip |rm -|mkdir|history|export |eval |base64|exec |kill|pkill|ps |netstat|ss |ifconfig|ip addr|hostname|nohup|cd |ls$|ls /|ls -|find |scp |tar |zip |unzip|gcc |make |/var/|/etc/|/root|/home|mount|chown|useradd|adduser|iptab|systemctl|service |docker|kube|\.sh|\.py|pwd|w$|id$|uptime|free |df |cat |head |tail |vi |nano )' | head -60 || true)

  # Extract the header for context
  header=$(head -7 "$logfile" 2>/dev/null | strings || true)

  if [ -z "$commands" ]; then
    [ -f "$summary" ]  || echo "Session contained no recognizable shell commands — likely a port scan, protocol probe, or immediate disconnect." > "$summary"
    [ -f "$exposure" ] || echo "No commands to analyze for exposure." > "$exposure"
    continue
  fi

  # Generate summary if missing
  if [ ! -f "$summary" ]; then
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
  fi

  # Generate exposure analysis if missing
  if [ ! -f "$exposure" ]; then
    tmpfile2=$(mktemp)
    printf '%s\n\n%s\n%s\n\n%s\n%s\n' \
      "Analyze this SSH honeypot session from a counter-intelligence perspective. Focus ONLY on what the ATTACKER inadvertently revealed about themselves. Structure your response with these sections using markdown headers (##):

## Infrastructure
IPs, domains, C2 servers, hosting providers, ports they connected from or downloaded from.

## Credentials & Identities
Usernames, passwords, SSH keys, API tokens, email addresses — anything that identifies them or their other targets.

## Tools & Techniques
What software, scripts, malware, or frameworks they used. Version strings, user-agents, unique command patterns.

## Environment Leaks
OS hints, shell preferences, locale, timezone clues, PATH variables, home directories that reveal their setup.

## Operational Mistakes
Anything that shows poor OPSEC — reused credentials, unencrypted C2, identifiable patterns, mistakes that could be used to track them.

If a section has nothing, write 'None observed.' Keep each section to 2-4 bullet points max. Be specific — quote exact strings from the session." \
      "SESSION HEADER:" \
      "$header" \
      "EXTRACTED COMMANDS:" \
      "$commands" \
      > "$tmpfile2"

    /root/.local/bin/claude --print --model "haiku" --permission-mode acceptEdits < "$tmpfile2" > "$exposure" 9>&- 2>/dev/null || rm -f "$exposure"
    rm -f "$tmpfile2"
  fi

done
