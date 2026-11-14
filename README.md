# CertChain — certificate issuance and verification

Complete Node/Express app with an issuer workspace, public verification,
input validation, printable certificates, protected record listing, and a
persistent SHA-256 hash chain. All browser assets are local; no CDN is needed.

This is an independent educational registry, **not an Ethereum smart contract
or a decentralized public blockchain**. A valid chain shows consistency with
this server's records. It does not establish the issuer's authority or prevent
a server administrator from replacing the entire chain. There are no wallet,
MetaMask, Solidity, email, account-registration or revocation workflows.

## Run on Windows

Install Node.js 22 or 24, then run these commands in the project folder:

```powershell
npm ci
npm start
```

Open **http://localhost:3000**. The development server prints a temporary local
admin access key. Open **Issuer workspace**, enter that key, and issue a
certificate. Open its verification record to check it or print/save it as PDF.
You can share a verification link such as `https://your-host/?id=YOUR_ID`.

The dev key changes after restart unless you configure `ADMIN_TOKEN`. Records
remain in `chain.json` across restarts. Existing root `chain.json` files use
the same hash format. Keep a backup before changing storage paths. A malformed
or tampered chain stops startup instead of being silently reset.

## Production configuration and Docker

Set `NODE_ENV=production`, a random `ADMIN_TOKEN` of at least 20 characters,
`PORT` if required by the host, and a **persistent** `DATA_DIR`. For example:

```powershell
$env:NODE_ENV = 'production'
$env:ADMIN_TOKEN = Read-Host 'Enter your unique admin access key'
$env:DATA_DIR = './data'
npm start
```

`.env.example` documents the variables. Node does not automatically load this
file; use your host's environment settings, PowerShell assignments above, or
`node --env-file=.env server.js` after creating `.env`.

Docker Compose reads `ADMIN_TOKEN` from a root `.env`:

```text
ADMIN_TOKEN=your-random-private-access-key
```

```powershell
docker compose up --build -d
```

It serves http://localhost:3000 and keeps the chain in `certificate_data`.
For a public Docker host, mount persistent storage at `/data`, use **one
replica / one writer**, configure HTTPS at the host, and health-check `/health`.
Back up `/data/chain.json`. Do not use a stateless function host with this
filesystem implementation; temporary filesystems lose records. A hosted
database adapter would be required for serverless deployment.

Deployment configuration is included. A live provider deployment has to
succeed before the project has a public hosting URL; none is assumed here.
Docker build verification requires Docker.

## API

| Method and route | Access | Purpose |
| --- | --- | --- |
| `GET /health` | Public | Process and chain health |
| `GET /api/verify/:id` | Public | Verify a specific certificate |
| `GET /api/session` | Admin | Check an access key |
| `POST /api/issue` | Admin | Issue a certificate |
| `GET /api/certificates` | Admin | List issued certificates |
| `GET /api/chain` | Admin | Inspect the chain |

Admin requests require `Authorization: Bearer YOUR_KEY`. Issuance JSON fields:
`recipient`, `course`, `issuer`, `dateIssued` (`YYYY-MM-DD`), optional `grade`.
Public verification returns the recipient and course, so publish only records
you are entitled to make available. The browser keeps its admin key in that
tab's sessionStorage and clears it on sign out. This key is a single issuer
credential, not an individual-account session system.

## Verify

```powershell
npm run check
npm test
```

Tests run a real loopback HTTP server with temporary storage and cover static
assets, issuer authorization, date validation, issue/verify, persistence after
reopening the app, and tamper detection. They do not replace real-browser QA
or a hosted persistent-volume acceptance check.
