# Canonical contract ABIs (CAN-400)

Committed, reviewable ABI snapshots of the **production** contracts — the surface
the backend integrates against (typechain). Test tokens, mocks and Echidna
harnesses are excluded.

Regenerated from the Hardhat artifacts (no framework change):

```bash
npm run compile      # produce artifacts/
npm run abi:extract  # write abi/<Name>.json from artifacts
npm run abi:check    # fail if abi/ drifts from the compiled contracts
```

CI (`.github/workflows/abi-drift.yml`, non-blocking) compiles and runs
`abi:check` on push/PR to `main`. When an ABI legitimately changes: run
`abi:extract`, review the diff, commit `abi/`, and update the backend typechain
bindings that consume it.
