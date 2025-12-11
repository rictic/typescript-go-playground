#!/usr/bin/env bash
set -euo pipefail

# Build tsgo.wasm from the typescript-go submodule

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
TSGO_DIR="$ROOT_DIR/typescript-go"
OUTPUT_DIR="$ROOT_DIR/public"

echo "Building tsgo.wasm from $TSGO_DIR..."

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Build the WASM binary
cd "$TSGO_DIR"
GOOS=js GOARCH=wasm go build -o "$OUTPUT_DIR/tsgo.wasm" ./cmd/tsgo

echo "Built: $OUTPUT_DIR/tsgo.wasm"
ls -lh "$OUTPUT_DIR/tsgo.wasm"

# Copy wasm_exec.js from Go installation if it's different
WASM_EXEC_SRC="$(go env GOROOT)/misc/wasm/wasm_exec.js"
WASM_EXEC_DEST="$ROOT_DIR/src/wasm-exec.js"

if [ -f "$WASM_EXEC_SRC" ]; then
  if ! cmp -s "$WASM_EXEC_SRC" "$WASM_EXEC_DEST" 2>/dev/null; then
    echo "Updating wasm_exec.js from Go installation..."
    cp "$WASM_EXEC_SRC" "$WASM_EXEC_DEST"
    echo "Updated: $WASM_EXEC_DEST"
  else
    echo "wasm_exec.js is already up to date"
  fi
else
  echo "Warning: Could not find wasm_exec.js at $WASM_EXEC_SRC"
fi

echo "Done!"
