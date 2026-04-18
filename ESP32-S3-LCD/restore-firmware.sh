#!/usr/bin/env bash
# Restore the backed-up firmware to the ESP32-S3-LCD board
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGE="$SCRIPT_DIR/backup/flash_backup_default.bin"

if [ ! -f "$IMAGE" ]; then
  echo "Error: backup image not found at $IMAGE"
  echo "Run backup-firmware.sh first."
  exit 1
fi

# Auto-detect port, or accept as first argument
if [ -n "$1" ]; then
  PORT="$1"
else
  PORT=$(ls /dev/cu.wchusbserial* /dev/cu.usbserial* /dev/ttyUSB* /dev/ttyACM* 2>/dev/null | head -1)
  if [ -z "$PORT" ]; then
    echo "Error: no serial port found. Connect the board or pass the port as an argument:"
    echo "  $0 /dev/ttyUSB0"
    exit 1
  fi
fi

echo "Using port: $PORT"
echo "Restoring firmware from: $IMAGE"

esptool.py \
  --port "$PORT" \
  --baud 460800 \
  write_flash \
  --flash_mode dio \
  --flash_freq 80m \
  --flash_size 16MB \
  0x0 "$IMAGE"

echo "Done. Board restored to backed-up firmware."
