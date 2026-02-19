#!/bin/bash
# Slither security analysis script
# Uses Slither 0.11.5+ with full custom error support

set -e

echo "=========================================="
echo "Slither Security Analysis"
echo "=========================================="
echo ""

cd "$(dirname "$0")/../.."

# Activate virtual environment if it exists
if [ -d "slither-env" ]; then
    source slither-env/bin/activate
    echo "Using Slither version: $(slither --version 2>&1 | head -1)"
    echo ""
    
    # Run full analysis
    slither . \
        --compile-force-framework hardhat \
        --print human-summary \
        2>&1 | tee reports/slither-report.txt
    
    echo ""
    echo "=========================================="
    echo "Analysis completed"
    echo "=========================================="
    echo ""
    echo "Report saved to: reports/slither-report.txt"
    echo ""
    echo "Full analysis report: reports/slither-report.txt"
else
    echo "Error: Slither virtual environment not found."
    echo "Please run: python3 -m venv slither-env && source slither-env/bin/activate && pip install slither-analyzer"
    exit 1
fi

