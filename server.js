const express = require('express');
const path = require('node:path');
const { randomBytes, createHash, timingSafeEqual } = require('node:crypto');
const { Block, Blockchain } = require('./blockchain');

function createApp({ dataDir = process.env.DATA_DIR || __dirname, adminToken = process.env.ADMIN_TOKEN } = {}) {
  if (!adminToken || adminToken.length < 20) throw new Error('ADMIN_TOKEN must contain at least 20 characters.');
  const chain = new Blockchain({ dataDir });
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    });
    if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
    next();
  });

  function admin(req, res, next) {
    const supplied = String(req.headers.authorization || '').replace(/^Bearer /, '');
    const hash = value => createHash('sha256').update(value).digest();
    if (!timingSafeEqual(hash(supplied), hash(adminToken))) return res.status(401).json({ error: 'Admin access key required.' });
    next();
  }

  app.get('/health', (req, res) => res.json({ ok: true, validChain: chain.isChainValid() }));
  app.get('/api/session', admin, (req, res) => res.json({ success: true }));
  app.get('/api/certificates', admin, (req, res) => {
    const certificates = chain.chain.slice(1).map(block => block.data.certificate).filter(Boolean);
    res.json({ certificates, count: certificates.length });
  });
  app.get('/api/chain', admin, (req, res) => res.json({ chain: chain.chain, valid: chain.isChainValid() }));

  app.post('/api/issue', admin, (req, res) => {
    const input = req.body || {};
    const cert = {};
    for (const field of ['recipient', 'course', 'issuer', 'dateIssued']) {
      if (typeof input[field] !== 'string' || !input[field].trim() || input[field].length > 300) {
        return res.status(400).json({ error: `A valid ${field} is required (maximum 300 characters).` });
      }
      cert[field] = input[field].trim();
    }
    const date = new Date(cert.dateIssued);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cert.dateIssued) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== cert.dateIssued) {
      return res.status(400).json({ error: 'dateIssued must be a real calendar date in YYYY-MM-DD format.' });
    }
    if (input.grade !== undefined && (typeof input.grade !== 'string' || input.grade.length > 80)) {
      return res.status(400).json({ error: 'Grade must be text of at most 80 characters.' });
    }
    cert.grade = (input.grade || '').trim();
    cert.id = randomBytes(12).toString('hex');
    cert.issuedAt = new Date().toISOString();
    const block = new Block(chain.chain.length, cert.issuedAt, { certificate: cert }, chain.getLatestBlock().hash);
    chain.addBlock(block);
    res.status(201).json({ success: true, certificate: cert, blockHash: block.hash });
  });

  app.get('/api/verify/:id', (req, res) => {
    const block = chain.chain.find(b => b.data?.certificate?.id === req.params.id);
    if (!block) return res.json({ found: false });
    const { index, timestamp, hash, previousHash, nonce } = block;
    res.json({ found: true, certificate: block.data.certificate, block: { index, timestamp, hash, previousHash, nonce }, validChain: chain.isChainValid() });
  });

  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
  app.use((error, req, res, next) => {
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON request.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
    console.error(error.message);
    res.status(500).json({ error: 'The operation could not be saved. Check the server.' });
  });
  return app;
}

if (require.main === module) {
  let adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken && process.env.NODE_ENV !== 'production') {
    adminToken = randomBytes(24).toString('hex');
    console.log('Temporary local admin access key:', adminToken);
    console.log('Set ADMIN_TOKEN to keep the same access key across restarts.');
  }
  const app = createApp({ adminToken });
  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => console.log(`CertChain listening on port ${port}`));
}

module.exports = { createApp };
