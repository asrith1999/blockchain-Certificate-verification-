const test = require('node:test');
const assert = require('node:assert/strict');
const { BlobLedger } = require('../blob-ledger');
const { createApp } = require('../server');

class BlobPreconditionFailedError extends Error {}
class BlobError extends Error {}

function objectStore() {
  let text = null;
  let version = 0;
  const calls = [];
  return {
    calls,
    BlobPreconditionFailedError,
    BlobError,
    async get(pathname, options) {
      calls.push({ operation: 'get', options });
      const current = text;
      const etag = `"version-${version}"`;
      await new Promise(resolve => setImmediate(resolve));
      return current === null ? null : {
        statusCode: 200,
        stream: new Response(current).body,
        blob: { etag, size: Buffer.byteLength(current) },
      };
    },
    async put(pathname, value, options) {
      calls.push({ operation: 'put', options });
      await new Promise(resolve => setImmediate(resolve));
      if (!options.allowOverwrite && text !== null) throw new BlobError('Vercel Blob: This blob already exists.');
      if (options.ifMatch && options.ifMatch !== `"version-${version}"`) throw new BlobPreconditionFailedError();
      text = value;
      version++;
      return { etag: `"version-${version}"` };
    },
    tamper() {
      const records = JSON.parse(text);
      records[1].data.certificate.recipient = 'Changed after issuance';
      text = JSON.stringify(records);
    },
  };
}

function certificate(id) {
  return { id, recipient: 'Example Student', course: 'Demo ICT', issuer: 'Demo Institution',
    dateIssued: '2026-11-15', issuedAt: '2026-11-15T00:00:00.000Z', grade: '' };
}

test('separate server instances read the same durable registry with private uncached reads', async t => {
  const sdk = objectStore();
  const key = 'test-only-issuer-access-1234567890';
  const servers = [];
  t.after(async () => {
    for (const server of servers) await new Promise(resolve => server.close(resolve));
  });
  const urls = [];
  for (let i = 0; i < 2; i++) {
    const app = createApp({ dataDir: '/must-not-write-here', adminToken: key, ledger: new BlobLedger({ sdk }) });
    const server = await new Promise(resolve => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    servers.push(server);
    urls.push(`http://127.0.0.1:${server.address().port}`);
  }
  const issued = await fetch(urls[0] + '/api/issue', { method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(certificate('ignored-client-id')) });
  assert.equal(issued.status, 201);
  const data = await issued.json();
  const verified = await (await fetch(urls[1] + '/api/verify/' + data.certificate.id)).json();
  assert.equal(verified.found, true);
  assert.equal(verified.validChain, true);
  assert.ok(sdk.calls.filter(call => call.operation === 'get').every(call => call.options.access === 'private' && call.options.useCache === false));
  assert.ok(sdk.calls.filter(call => call.operation === 'put').every(call => call.options.access === 'private'));
});

test('concurrent first issuance and subsequent writes do not lose certificates', async () => {
  const sdk = objectStore();
  const first = new BlobLedger({ sdk });
  const second = new BlobLedger({ sdk });
  await Promise.all([first.issue(certificate('first')), second.issue(certificate('second'))]);
  await Promise.all([first.issue(certificate('third')), second.issue(certificate('fourth'))]);
  const chain = await new BlobLedger({ sdk }).read();
  assert.equal(chain.chain.length, 5);
  assert.equal(chain.isChainValid(), true);
  assert.deepEqual(new Set(chain.chain.slice(1).map(block => block.data.certificate.id)), new Set(['first','second','third','fourth']));
  assert.ok(sdk.calls.some(call => call.operation === 'put' && call.options.ifMatch));
});

test('a corrupted object is rejected without overwriting it', async () => {
  const sdk = objectStore();
  const ledger = new BlobLedger({ sdk });
  await ledger.issue(certificate('tamper-check'));
  const writes = sdk.calls.filter(call => call.operation === 'put').length;
  sdk.tamper();
  await assert.rejects(() => ledger.read(), /invalid/);
  await assert.rejects(() => ledger.issue(certificate('next')), /invalid/);
  assert.equal(sdk.calls.filter(call => call.operation === 'put').length, writes);
});

test('storage capacity failures reject a write before uploading it', async () => {
  const sdk = objectStore();
  const ledger = new BlobLedger({ sdk, maxBytes: 100 });
  await assert.rejects(() => ledger.issue(certificate('capacity-check')), error => error.code === 'REGISTRY_FULL');
  assert.equal(sdk.calls.filter(call => call.operation === 'put').length, 0);
});
