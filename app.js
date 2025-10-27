// public/app.js
const api = {
  issue: '/api/issue',
  verify: (id) => `/api/verify/${id}`,
  list: '/api/certificates'
};

const btnIssue = document.getElementById('btn-issue');
const btnVerifyNav = document.getElementById('btn-verify');
const issueSection = document.getElementById('issue-section');
const verifySection = document.getElementById('verify-section');
const listSection = document.getElementById('list-section');

btnIssue.addEventListener('click', () => {
  issueSection.classList.remove('hidden');
  verifySection.classList.add('hidden');
  listSection.classList.add('hidden');
});
btnVerifyNav.addEventListener('click', () => {
  issueSection.classList.add('hidden');
  verifySection.classList.remove('hidden');
  listSection.classList.add('hidden');
});

document.getElementById('issue-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const recipient = document.getElementById('recipient').value.trim();
  const course = document.getElementById('course').value.trim();
  const grade = document.getElementById('grade').value.trim();
  const issuer = document.getElementById('issuer').value.trim();
  const dateIssued = document.getElementById('dateIssued').value;

  const resBox = document.getElementById('issue-result');
  resBox.innerHTML = 'Issuing...';

  try {
    const resp = await fetch(api.issue, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient, course, grade, issuer, dateIssued })
    });
    const json = await resp.json();
    if (json.success) {
      resBox.innerHTML = `<div class="p-3 rounded border"><strong>Issued!</strong> Certificate ID: <code>${json.certificate.id}</code><br>Block hash: <code>${json.blockHash}</code></div>`;
      // show list for convenience
      loadCertificates();
    } else {
      resBox.innerHTML = `<div class="text-red-600">Error: ${json.error || JSON.stringify(json)}</div>`;
    }
  } catch (err) {
    resBox.innerHTML = `<div class="text-red-600">Network error: ${err.message}</div>`;
  }
});

document.getElementById('verify-btn').addEventListener('click', async () => {
  const id = document.getElementById('verify-id').value.trim();
  const out = document.getElementById('verify-result');
  out.innerHTML = 'Checking...';
  if (!id) return out.innerHTML = '<div class="text-red-600">Enter an ID</div>';

  try {
    const resp = await fetch(api.verify(id));
    const json = await resp.json();
    if (json.found) {
      const cert = json.certificate;
      out.innerHTML = `
        <div class="p-4 border rounded">
          <div><strong>Recipient:</strong> ${cert.recipient}</div>
          <div><strong>Course:</strong> ${cert.course}</div>
          <div><strong>Issuer:</strong> ${cert.issuer}</div>
          <div><strong>Date Issued:</strong> ${cert.dateIssued}</div>
          <div><strong>Certificate ID:</strong> <code>${cert.id}</code></div>
          <div class="mt-2 text-sm text-slate-600">Block index: ${json.block.index}, block hash: <code>${json.block.hash}</code></div>
          <div class="mt-2 text-green-600">Chain valid: ${json.validChain ? 'Yes' : 'No'}</div>
        </div>
      `;
    } else {
      out.innerHTML = `<div class="text-red-600">Certificate not found on the chain.</div>`;
    }
  } catch (err) {
    out.innerHTML = `<div class="text-red-600">Error: ${err.message}</div>`;
  }
});

document.getElementById('clear-issue').addEventListener('click', () => {
  document.getElementById('recipient').value = '';
  document.getElementById('course').value = '';
  document.getElementById('grade').value = '';
  document.getElementById('issuer').value = '';
  document.getElementById('dateIssued').value = '';
  document.getElementById('issue-result').innerHTML = '';
});

async function loadCertificates() {
  try {
    const resp = await fetch(api.list);
    const json = await resp.json();
    const container = document.getElementById('cert-list');
    if (json.count === 0) {
      container.innerHTML = '<div class="text-slate-600">No certificates yet.</div>';
    } else {
      container.innerHTML = '<ul class="space-y-2">' +
        json.certificates.map(c => `<li class="p-3 border rounded">
          <div class="font-medium">${c.recipient} — <span class="text-slate-500">${c.course}</span></div>
          <div class="text-xs text-slate-600">ID: <code>${c.id}</code> • Issuer: ${c.issuer} • Date: ${c.dateIssued}</div>
        </li>`).join('') +
        '</ul>';
    }
    listSection.classList.remove('hidden');
    issueSection.classList.add('hidden');
    verifySection.classList.add('hidden');
  } catch (err) {
    console.error(err);
  }
}

// initial view
loadCertificates();
