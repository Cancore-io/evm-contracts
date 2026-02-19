#!/bin/bash
# Slither security analysis script

set -e

echo "Running Slither security analysis..."

# Run Slither using Docker
docker run --rm \
  -v "$(pwd):/tmp" \
  -w /tmp \
  trailofbits/slither:latest \
  slither solidity/HTLC.sol \
  --exclude-dependencies \
  --print human-summary \
  2>&1 | tee slither-report.txt

echo ""
echo "Slither analysis complete. Report saved to slither-report.txt"

