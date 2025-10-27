// server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Block, Blockchain } = require('./blockchain');
const CryptoJS = require('crypto-js');

const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const CERT_FILE = path.join(__dirname, 'certificates.json');

function loadCertificates() {
  try {
    if (fs.existsSync(CERT_FILE)) {
      return JSON.parse(fs.readFileSync(CERT_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to load certificates', e);
  }
  return [];
}

function saveCertificates(list) {
  fs.writeFileSync(CERT_FILE, JSON.stringify(list, null, 2), 'utf8');
}

const chain = new Blockchain();
let certificates = loadCertificates();

// Helper: generate a certificate ID (hash)
function makeCertificateId(cert) {
  // include timestamp for uniqueness
  return CryptoJS.SHA256(
    cert.recipient + cert.course + cert.issuer + cert.dateIssued + Math.random().toString()
  ).toString().substring(0, 16);
}

/**
 * Admin endpoint: issue a certificate
 * POST /api/issue
 * body: { recipient, course, grade, issuer, dateIssued (YYYY-MM-DD) }
 */
app.post('/api/issue', (req, res) => {
  const { recipient, course, grade, issuer, dateIssued } = req.body || {};
  if (!recipient || !course || !issuer || !dateIssued) {
    return res.status(400).json({ error: 'missing required fields' });
  }

  const cert = {
    recipient,
    course,
    grade: grade || '',
    issuer,
    dateIssued,
    issuedAt: new Date().toISOString(),
  };

  cert.id = makeCertificateId(cert); // short id
  // store human-readable certificate list
  certificates.push(cert);
  saveCertificates(certificates);

  // create a new block containing the certificate
  const newBlock = new Block(chain.chain.length, new Date().toISOString(), { certificate: cert }, chain.getLatestBlock().hash);
  chain.addBlock(newBlock);

  return res.json({
    success: true,
    message: 'Certificate issued and recorded on local chain',
    certificate: cert,
    blockHash: newBlock.hash
  });
});

/**
 * Public endpoint: verify certificate by id
 * GET /api/verify/:id
 */
app.get('/api/verify/:id', (req, res) => {
  const id = req.params.id;
  // search chain blocks for certificate id
  for (const block of chain.chain) {
    const data = block.data || {};
    if (data.certificate && data.certificate.id === id) {
      // Return block details and certificate
      return res.json({
        found: true,
        certificate: data.certificate,
        block: {
          index: block.index,
          timestamp: block.timestamp,
          hash: block.hash,
          previousHash: block.previousHash,
          nonce: block.nonce
        },
        validChain: chain.isChainValid()
      });
    }
  }
  return res.json({ found: false });
});

/**
 * Endpoint: list all certificates (for admin)
 */
app.get('/api/certificates', (req, res) => {
  res.json({ certificates, count: certificates.length });
});

/**
 * Endpoint: show chain (debug)
 */
app.get('/api/chain', (req, res) => {
  res.json({ chain: chain.chain, valid: chain.isChainValid() });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
