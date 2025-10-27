// blockchain.js
const fs = require('fs');
const path = require('path');
const CryptoJS = require('crypto-js');

const CHAIN_FILE = path.join(__dirname, 'chain.json');

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
    return CryptoJS.SHA256(
      this.index + this.timestamp + JSON.stringify(this.data) + this.previousHash + this.nonce
    ).toString();
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
  constructor() {
    this.difficulty = 3; // keep small for local usage
    this.chain = [];
    this.loadChain();
    if (this.chain.length === 0) {
      this.createGenesisBlock();
    }
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
    this.saveChain();
    return newBlock;
  }

  isChainValid() {
    for (let i = 1; i < this.chain.length; i++) {
      const curr = this.chain[i];
      const prev = this.chain[i - 1];

      if (curr.hash !== curr.calculateHash()) return false;
      if (curr.previousHash !== prev.hash) return false;
    }
    return true;
  }

  saveChain() {
    fs.writeFileSync(CHAIN_FILE, JSON.stringify(this.chain, null, 2), 'utf8');
  }

  loadChain() {
    try {
      if (fs.existsSync(CHAIN_FILE)) {
        const raw = fs.readFileSync(CHAIN_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        // restore Block prototypes
        this.chain = parsed.map(b => {
          const block = new Block(b.index, b.timestamp, b.data, b.previousHash);
          block.nonce = b.nonce;
          block.hash = b.hash;
          return block;
        });
      } else {
        this.chain = [];
      }
    } catch (err) {
      console.error('Failed to load chain:', err);
      this.chain = [];
    }
  }
}

module.exports = { Block, Blockchain };
