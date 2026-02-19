#!/bin/bash
# Setup script for Slither security analysis

set -e

echo "=========================================="
echo "Setting up Slither Security Analysis"
echo "=========================================="
echo ""

cd "$(dirname "$0")/../.."

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 is not installed"
    echo "Please install Python 3 first"
    exit 1
fi

# Create virtual environment
echo "Creating virtual environment..."
python3 -m venv slither-env

# Activate and install
echo "Installing Slither..."
source slither-env/bin/activate
pip install --upgrade pip
pip install slither-analyzer

# Install solc 0.8.33
echo "Installing Solidity compiler 0.8.33..."
solc-select install 0.8.33
solc-select use 0.8.33

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Slither version: $(slither --version 2>&1 | head -1)"
echo "Solc version: $(solc --version 2>&1 | head -1)"
echo ""
echo "To run analysis:"
echo "  npm run slither"
echo "  or"
echo "  ./scripts/slither-analysis.sh"
echo ""

