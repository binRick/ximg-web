#!/bin/bash
# Generate a VHS animated GIF from an SSH honeypot session log.
# Usage: gen-session-gif.sh <logfilename>
# e.g.   gen-session-gif.sh 20260329-124946-23.92.216.26-1.log

SSH_LOGS_DIR="/root/ximg-web/ssh-logs"
LOG_FILE="$1"

if [ -z "$LOG_FILE" ]; then
  echo "Usage: $0 <logfilename>" >&2
  exit 1
fi

LOGPATH="$SSH_LOGS_DIR/$LOG_FILE"
GIFPATH="$SSH_LOGS_DIR/${LOG_FILE%.log}.gif"

if [ ! -f "$LOGPATH" ]; then
  echo "Error: $LOGPATH not found" >&2
  exit 1
fi

# --- scratch space ---------------------------------------------------------
TMPD=$(mktemp -d)
trap 'rm -rf "$TMPD"' EXIT

RAW="$TMPD/session.raw"
TAPE="$TMPD/session.tape"

# --- extract session body (strip header and footer) -----------------------
python3 - "$LOGPATH" "$RAW" <<'PY'
import sys, re
logpath, rawpath = sys.argv[1], sys.argv[2]
with open(logpath, 'rb') as f:
    data = f.read()
text = data.decode('utf-8', errors='replace')
# Remove header block through the blank line that follows ====
text = re.sub(r'^=== SSH Honeypot Session ===.*?={4,}\n\n?', '', text, flags=re.DOTALL)
# Remove footer
text = re.sub(r'\n?=== Session ended ===\n?$', '', text)
with open(rawpath, 'w', errors='replace') as f:
    f.write(text)
PY

# --- build VHS tape -------------------------------------------------------
cat > "$TAPE" <<TAPE
Output session.gif
Set Width 1200
Set Height 400
Set FontSize 14
Set Theme "Dracula"
Set Padding 20
Set WindowBar Rings
Set BorderRadius 8

Sleep 300ms
Type "cat $RAW"
Enter
Sleep 2s
TAPE

# --- render ---------------------------------------------------------------
cd "$TMPD"
VHS_NO_SANDBOX=1 vhs "$TAPE" 2>&1

if [ -f "$TMPD/session.gif" ]; then
  mv "$TMPD/session.gif" "$GIFPATH"
  echo "Generated: $GIFPATH"
else
  echo "Error: GIF generation failed for $LOG_FILE" >&2
  exit 1
fi
