#!/usr/bin/env bash
# Read and back up the current firmware from the ESP32-S3-LCD board
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGE="$SCRIPT_DIR/backup/flash_backup_default.bin"
FLASH_SIZE="16MB"

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
echo "Backing up firmware to: $IMAGE"

mkdir -p "$SCRIPT_DIR/backup"

esptool.py \
  --port "$PORT" \
  --baud 460800 \
  read_flash \
  0x0 0x1000000 \
  "$IMAGE"

echo "Done. Firmware backed up to $IMAGE"
