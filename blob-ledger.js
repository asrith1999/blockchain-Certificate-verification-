const { Block, Blockchain } = require('./blockchain');

class BlobLedger {
  constructor({ sdk = null, pathname = 'certchain/chain.json', maxBytes = 2 * 1024 * 1024 } = {}) {
    this.sdk = sdk;
    this.pathname = pathname;
    this.maxBytes = maxBytes;
  }

  async client() {
    if (!this.sdk) this.sdk = await import('@vercel/blob');
    return this.sdk;
  }

  async snapshot() {
    const sdk = await this.client();
    const result = await sdk.get(this.pathname, { access: 'private', useCache: false });
    if (!result) return { chain: new Blockchain({ persist: false }), etag: null };
    if (result.statusCode !== 200 || !result.stream) throw new Error('The registry could not be read.');
    if (result.blob.size > this.maxBytes) throw this.capacityError();
    const text = await new Response(result.stream).text();
    if (Buffer.byteLength(text) > this.maxBytes) throw this.capacityError();
    return { chain: Blockchain.fromRecords(JSON.parse(text)), etag: result.blob.etag };
  }

  async read() {
    return (await this.snapshot()).chain;
  }

  capacityError() {
    return Object.assign(new Error('Registry storage limit reached.'), { code: 'REGISTRY_FULL' });
  }

  async issue(certificate) {
    const sdk = await this.client();
    // A conditional write protects the shared file when two instances issue
    // certificates at once. A fresh read is required after an ETag conflict.
    for (let attempt = 0; attempt < 4; attempt++) {
      const { chain, etag } = await this.snapshot();
      const existing = chain.chain.find(block => block.data?.certificate?.id === certificate.id);
      if (existing) return existing;
      const block = new Block(chain.chain.length, certificate.issuedAt, { certificate }, chain.getLatestBlock().hash);
      chain.addBlock(block);
      const text = JSON.stringify(chain.chain);
      if (Buffer.byteLength(text) > this.maxBytes) throw this.capacityError();
      try {
        await sdk.put(this.pathname, text, {
          access: 'private',
          contentType: 'application/json',
          addRandomSuffix: false,
          allowOverwrite: etag !== null,
          ...(etag !== null ? { ifMatch: etag } : {}),
          cacheControlMaxAge: 60,
        });
        return block;
      } catch (error) {
        const conflict = (sdk.BlobPreconditionFailedError && error instanceof sdk.BlobPreconditionFailedError) ||
          (etag === null && sdk.BlobError && error instanceof sdk.BlobError && /already exists/i.test(error.message));
        if (!conflict) throw error;
      }
    }
    throw Object.assign(new Error('Concurrent registry update.'), { code: 'REGISTRY_CONFLICT' });
  }
}

module.exports = { BlobLedger };
