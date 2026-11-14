const el = id => document.getElementById(id);
let key = sessionStorage.getItem('certchain-admin') || '';

async function api(path, options = {}, admin = false) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(admin ? { Authorization: `Bearer ${key}` } : {}) },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}

function section(name) {
  el('verify-section').hidden = name !== 'verify';
  el('admin-section').hidden = name !== 'admin';
  for (const tab of ['verify', 'admin']) el(`nav-${tab}`).classList.toggle('active', tab === name);
}

function paragraph(parent, label, value, className = '') {
  const p = document.createElement('p');
  p.className = className;
  const strong = document.createElement('strong');
  strong.textContent = label + ' ';
  p.append(strong, document.createTextNode(String(value)));
  parent.append(p);
}

async function verify(id) {
  const output = el('verify-result');
  output.textContent = 'Checking registry…';
  el('print-certificate').hidden = true;
  try {
    const result = await api(`/api/verify/${encodeURIComponent(id)}`);
    output.replaceChildren();
    if (!result.found) { output.textContent = 'No certificate matches that ID.'; return; }
    const box = document.createElement('div');
    box.className = 'record';
    const h = document.createElement('h3');
    h.className = result.validChain ? 'success' : 'error';
    h.textContent = result.validChain ? '✓ Record found · chain integrity valid' : 'Chain integrity check failed';
    box.append(h);
    const cert = result.certificate;
    for (const [label, value] of [['Recipient',cert.recipient],['Programme',cert.course],['Issuer',cert.issuer],['Date',cert.dateIssued],['Grade',cert.grade || '—'],['Certificate ID',cert.id]]) paragraph(box,label,value);
    paragraph(box, 'Block', result.block.index);
    paragraph(box, 'SHA-256', result.block.hash, 'hash');
    output.append(box);
    el('print-certificate').hidden = !result.validChain;
  } catch (error) { output.textContent = error.message; }
}

async function loadCertificates() {
  const { certificates } = await api('/api/certificates', {}, true);
  const output = el('cert-list');
  output.replaceChildren();
  if (!certificates.length) output.textContent = 'Your registry is empty. Issue the first certificate above.';
  for (const cert of certificates.slice().reverse()) {
    const item = document.createElement('div');
    item.className = 'list-record';
    paragraph(item, cert.recipient + ' ·', cert.course);
    paragraph(item, 'ID', cert.id, 'hash');
    const button = document.createElement('button');
    button.className = 'secondary';
    button.textContent = 'Open verification';
    button.addEventListener('click', () => {
      el('verify-id').value = cert.id;
      history.replaceState(null, '', `?id=${encodeURIComponent(cert.id)}`);
      section('verify');
      verify(cert.id);
    });
    item.append(button);
    output.append(item);
  }
}

async function unlock() {
  await api('/api/session', {}, true);
  sessionStorage.setItem('certchain-admin', key);
  el('login-panel').hidden = true;
  el('workspace').hidden = false;
  el('admin-error').textContent = '';
  await loadCertificates();
}

el('nav-verify').addEventListener('click', () => section('verify'));
el('nav-admin').addEventListener('click', () => section('admin'));
el('verify-form').addEventListener('submit', e => { e.preventDefault(); verify(el('verify-id').value.trim()); });
el('admin-login').addEventListener('submit', async e => {
  e.preventDefault();
  key = el('admin-key').value;
  try { await unlock(); el('admin-key').value = ''; }
  catch (error) { el('admin-error').textContent = error.message; key = ''; sessionStorage.removeItem('certchain-admin'); }
});
el('issue-form').addEventListener('submit', async e => {
  e.preventDefault();
  el('issue-submit').disabled = true;
  try {
    const data = Object.fromEntries(new FormData(e.target));
    const result = await api('/api/issue', { method: 'POST', body: JSON.stringify(data) }, true);
    el('issue-result').textContent = `Certificate issued. ID: ${result.certificate.id}`;
    e.target.reset();
    await loadCertificates();
  } catch (error) { el('issue-result').textContent = error.message; }
  finally { el('issue-submit').disabled = false; }
});
el('logout').addEventListener('click', () => {
  key = ''; sessionStorage.removeItem('certchain-admin');
  el('workspace').hidden = true; el('login-panel').hidden = false;
  el('cert-list').replaceChildren(); el('issue-result').textContent = '';
});
el('refresh').addEventListener('click', () => loadCertificates().catch(error => { el('admin-error').textContent = error.message; }));
el('print-certificate').addEventListener('click', () => window.print());
if (key) unlock().catch(() => { key = ''; sessionStorage.removeItem('certchain-admin'); });
const id = new URLSearchParams(location.search).get('id');
if (id) { el('verify-id').value = id; verify(id); }
