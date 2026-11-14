const { createApp } = require('../server');
const { BlobLedger } = require('../blob-ledger');

module.exports = createApp({
  adminToken: process.env.ADMIN_TOKEN,
  ledger: new BlobLedger(),
});
