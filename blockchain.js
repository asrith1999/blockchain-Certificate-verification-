// blockchain.js
const fs = require('fs');
const path = require('path');
const { createHash } = require('node:crypto');

class Block {
  constructor(index, timestamp, data, previousHash = '') {
    this.index = index;
    this.timestamp = timestamp;
    this.data = data; // e.g., certificate object or tx list
    this.previousHash = previousHash;
    this.nonce = 0;
    this.hash = this.calculateHash();
  }

  calculateHash() {
    return createHash('sha256').update(
      this.index + this.timestamp + JSON.stringify(this.data) + this.previousHash + this.nonce
    ).digest('hex');
  }

  mineBlock(difficulty) {
    const target = Array(difficulty + 1).join('0');
    while (this.hash.substring(0, difficulty) !== target) {
      this.nonce++;
      this.hash = this.calculateHash();
    }
  }
}

class Blockchain {
  constructor({ dataDir = __dirname, persist = true } = {}) {
    this.chainFile = persist ? path.join(dataDir, 'chain.json') : null;
    if (persist) fs.mkdirSync(dataDir, { recursive: true });
    this.difficulty = 3; // keep small for local usage
    this.chain = [];
    if (persist) this.loadChain();
    if (this.chain.length === 0) {
      this.createGenesisBlock();
    }
    if (!this.isChainValid()) throw new Error('Stored chain is invalid. Restore a trusted backup before starting.');
  }

  static fromRecords(records) {
    if (!Array.isArray(records) || records.length === 0) throw new Error('Stored chain is empty or malformed.');
    const chain = Object.create(Blockchain.prototype);
    chain.difficulty = 3;
    chain.chainFile = null;
    chain.chain = records.map(record => {
      if (!record || !Number.isInteger(record.index) || typeof record.timestamp !== 'string' ||
          typeof record.previousHash !== 'string' || !Number.isSafeInteger(record.nonce) || record.nonce < 0 ||
          typeof record.hash !== 'string' || !/^[a-f0-9]{64}$/.test(record.hash)) {
        throw new Error('Stored chain contains a malformed block.');
      }
      const block = new Block(record.index, record.timestamp, record.data, record.previousHash);
      block.nonce = record.nonce;
      block.hash = record.hash;
      return block;
    });
    if (!chain.isChainValid()) throw new Error('Stored chain is invalid. Restore a trusted backup before starting.');
    return chain;
  }

  createGenesisBlock() {
    const genesis = new Block(0, new Date().toISOString(), { info: 'Genesis Block' }, '0');
    genesis.mineBlock(this.difficulty);
    this.chain = [genesis];
    this.saveChain();
  }

  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  addBlock(newBlock) {
    newBlock.previousHash = this.getLatestBlock().hash;
    newBlock.mineBlock(this.difficulty);
    this.chain.push(newBlock);
    try {
      this.saveChain();
    } catch (error) {
      this.chain.pop();
      throw error;
    }
    return newBlock;
  }

  isChainValid() {
    if (!this.chain.length) return false;
    const genesis = this.chain[0];
    if (genesis.index !== 0 || genesis.previousHash !== '0' || genesis.hash !== genesis.calculateHash()) return false;
    for (let i = 1; i < this.chain.length; i++) {
      const curr = this.chain[i];
      const prev = this.chain[i - 1];

      if (curr.hash !== curr.calculateHash()) return false;
      if (curr.previousHash !== prev.hash) return false;
      if (curr.index !== i || !curr.hash.startsWith('0'.repeat(this.difficulty))) return false;
    }
    return true;
  }

  saveChain() {
    if (!this.chainFile) return;
    const temporary = this.chainFile + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(this.chain, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, this.chainFile);
  }

  loadChain() {
    try {
      if (fs.existsSync(this.chainFile)) {
        const raw = fs.readFileSync(this.chainFile, 'utf8');
        const parsed = JSON.parse(raw);
        this.chain = Blockchain.fromRecords(parsed).chain;
      } else {
        this.chain = [];
      }
    } catch (err) {
      throw new Error('Failed to load chain: ' + err.message);
    }
  }
}

module.exports = { Block, Blockchain };
