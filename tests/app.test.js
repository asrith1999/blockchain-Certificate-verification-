const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../server');
const { Blockchain } = require('../blockchain');

const token = 'test-only-credential-123456789';
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

async function start(dataDir) {
  const app = createApp({ dataDir, adminToken: token });
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
async function close(server) { await new Promise(resolve => server.close(resolve)); }

test('complete issue and verify workflow persists across restart', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'certchain-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  let { server, url } = await start(dataDir);
  try {
    assert.match(await (await fetch(url)).text(), /CertChain/);
    assert.equal((await fetch(url + '/app.js')).status, 200);
    assert.equal((await fetch(url + '/api/certificates')).status, 401);
    assert.equal((await fetch(url + '/api/issue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
    const fields = { recipient: 'Example Student', course: 'ICT', issuer: 'Demo Institution', dateIssued: '2026-11-14' };
    assert.equal((await fetch(url + '/api/issue', { method: 'POST', headers, body: JSON.stringify({ ...fields, dateIssued: '2026-02-30' }) })).status, 400);
    const response = await fetch(url + '/api/issue', { method: 'POST', headers, body: JSON.stringify(fields) });
    assert.equal(response.status, 201);
    const issued = await response.json();
    const check = await (await fetch(`${url}/api/verify/${issued.certificate.id}`)).json();
    assert.equal(check.validChain, true);
    assert.equal(check.certificate.recipient, fields.recipient);
    await close(server);
    ({ server, url } = await start(dataDir));
    const persisted = await (await fetch(`${url}/api/verify/${issued.certificate.id}`)).json();
    assert.equal(persisted.found, true);
    const listing = await (await fetch(url + '/api/certificates', { headers })).json();
    assert.equal(listing.count, 1);
    assert.equal((await (await fetch(url + '/api/verify/not-found')).json()).found, false);
  } finally { await close(server); }
});

test('stored-chain corruption stops startup without replacing evidence', t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'certchain-tamper-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  new Blockchain({ dataDir });
  const file = path.join(dataDir, 'chain.json');
  const parsed = JSON.parse(fs.readFileSync(file));
  parsed[0].data.info = 'changed';
  fs.writeFileSync(file, JSON.stringify(parsed));
  assert.throws(() => new Blockchain({ dataDir }), /invalid/);
  assert.equal(JSON.parse(fs.readFileSync(file))[0].data.info, 'changed');
});
