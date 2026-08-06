const HTLC = artifacts.require('HTLC');

module.exports = function (deployer) {
  // Constructor sets deployer as owner and feeRecipient; feeRate starts at 0.
  // Fee wiring (setFeeRecipient/setFeeRate) is a separate operator step, same
  // as on EVM networks.
  deployer.deploy(HTLC);
};
