#!/bin/bash
# Slither security analysis script wrapper
# Uses Slither 0.11.5+ with full custom error support

cd "$(dirname "$0")/.."
exec ./scripts/tools/slither-analysis.sh
