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
Back up `/data/chain.json`. Local-file mode requires persistent disk and one
writer. The Vercel adapter below stores the same chain format in private
object storage and uses conditional writes across function instances.

Docker build verification requires Docker.

## Vercel hosting with persistent private storage

`api/index.js` uses `BlobLedger` instead of writing the function's temporary
filesystem. Create a private Vercel Blob store connected to this project and
set a strong **production-only** `ADMIN_TOKEN` in Vercel environment settings.
The store connection supplies `BLOB_READ_WRITE_TOKEN`, or an OIDC connection
can supply `BLOB_STORE_ID`. Keep storage credentials on the server.

Deploy with Node.js 24, the root directory, `npm ci --omit=dev`, no build
command, and the committed `vercel.json`. It routes the UI and API through one
Node function. The Vercel account does not need a GitHub connection when
deploying source files directly; automatic Git deployment does require one.

Private reads bypass the object cache so new records are visible immediately.
Writes use the previous object's ETag to reject a concurrent overwrite, then
read the latest chain and retry a bounded number of times. Corrupted chains
are rejected. The original local-file mode remains available with `npm start`.

This learning registry has a 2 MB chain-file limit. Each issuance reads and
rewrites that file; use a transactional database for a large registry. Keep
production storage and keys out of preview environments. Use a separate store
and issuer key if you later enable preview deployments. A newly provisioned
hosted registry starts empty; local records are not uploaded automatically.

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

Tests run real loopback HTTP servers and cover static assets, issuer
authorization, date validation, issue/verify, local restart persistence, and
tamper detection. Object-store contract tests also cover separate app
instances, concurrent initial issuance and updates, private uncached reads,
capacity limits and rejection of corrupted remote data. They use an isolated
object-store fixture; validate the real provisioned store after deployment.
