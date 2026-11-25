// Sends the built installer to heyzuno.uk, which keeps it in cloud storage and serves
// heyzuno.uk/download (the repository is private, so people can't download from GitHub).
// GitHub vouches for each request with a short-lived OpenID Connect token; nothing secret is stored.
const fs = require('fs');
const BASE = process.env.ZUNO_URL || 'https://heyzuno.uk';
const VERSION = require('../../package.json').version;
const PART = 32 * 1024 * 1024;
async function oidc() {
  const u = new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
  u.searchParams.set('audience', 'zuno-release');
  const r = await fetch(u, { headers: { Authorization: 'Bearer ' + process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN } });
  if (!r.ok) throw new Error('Could not get a GitHub token: ' + r.status);
  return (await r.json()).value;
}
async function step(q, body) {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(`${BASE}/api/release47/upload?${q}`, { method: 'POST', headers: { Authorization: 'Bearer ' + (await oidc()), 'Content-Type': 'application/octet-stream' }, body });
    const text = await r.text();
    if (r.ok) return JSON.parse(text);
    if (attempt >= 3 || r.status < 500) throw new Error(`${q}: ${r.status} ${text}`);
    await new Promise(ok => setTimeout(ok, 5000 * attempt));
  }
}
(async () => {
  for (const name of ['Zuno-Setup.exe', 'Zuno-Setup.exe.blockmap', 'latest.yml']) {
    const buf = fs.readFileSync('dist/' + name);
    const q = `name=${encodeURIComponent(name)}&version=${VERSION}`;
    await step('op=start&' + q);
    for (let i = 0, n = 1; i < buf.length; i += PART, n++) {
      const r = await step(`op=part&n=${n}&${q}`, buf.subarray(i, i + PART));
      console.log(`${name}: ${r.size} / ${buf.length} bytes`);
    }
    const done = await step('op=finish&' + q);
    console.log(`${name}: done${done.live ? ` (heyzuno.uk/download now serves ${done.live})` : ''}`);
  }
})().catch(err => { console.error(err.message); process.exit(1); });
