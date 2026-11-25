// Cloud storage test: a tiny fake S3 server, and a Zuno pointed at it.
// Checks that uploads leave the disk, still load (whole and in parts), and get deleted from the cloud.
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');

const { presignWith } = require('../server/storage');
const objects = new Map();
let presignedGets = 0;
// A link signed in its query string ("presigned"): check the signature the way S3 does.
function presignOk(req) {
  const u = new URL(req.url, 'http://x');
  const q = Object.fromEntries(u.searchParams);
  if (!q['X-Amz-Signature'] || !/^test\//.test(q['X-Amz-Credential'] || '')) return false;
  const extra = Object.fromEntries(Object.entries(q).filter(([k]) => k.startsWith('response-')));
  const again = presignWith({ key: 'test', secret: 'secret', region: 'auto' }, req.headers.host, u.pathname, q['X-Amz-Date'], q['X-Amz-Expires'], extra);
  const fresh = Date.parse(q['X-Amz-Date'].replace(/(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z/, '$1-$2-$3T$4:$5:$6Z')) + Number(q['X-Amz-Expires']) * 1000 > Date.now();
  return fresh && again.endsWith('X-Amz-Signature=' + q['X-Amz-Signature']);
}
const s3 = http.createServer((req, res) => {
  const presigned = req.method === 'GET' && req.url.includes('X-Amz-Signature=');
  if (presigned ? !presignOk(req) : !/^AWS4-HMAC-SHA256 Credential=test\//.test(req.headers.authorization || '')) { res.writeHead(403); return res.end(); }
  if (presigned) presignedGets++;
  const key = decodeURIComponent(req.url.split('?')[0]);
  if (req.method === 'PUT') { const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => { objects.set(key, Buffer.concat(chunks)); res.writeHead(200); res.end(); }); return; }
  if (req.method === 'DELETE') { objects.delete(key); res.writeHead(204); return res.end(); }
  const buf = objects.get(key);
  if (!buf) { res.writeHead(404); return res.end(); }
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
  if (m) { const a = Number(m[1]), b = m[2] ? Number(m[2]) : buf.length - 1; res.writeHead(206, { 'content-range': `bytes ${a}-${b}/${buf.length}`, 'content-length': b - a + 1 }); return res.end(buf.subarray(a, b + 1)); }
  const q = new URL(req.url, 'http://x').searchParams;
  res.writeHead(200, { 'content-length': buf.length, ...(q.get('response-content-disposition') ? { 'content-disposition': q.get('response-content-disposition') } : {}) }); res.end(buf);
});

(async () => {
  await new Promise(r => s3.listen(0, r));
  const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'zuno-cloud-')), PORT = 4391, B = `http://localhost:${PORT}`;
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], { env: { ...process.env, PORT, ZUNO_DATA_DIR: DIR,
    S3_ENDPOINT: `http://localhost:${s3.address().port}`, S3_BUCKET: 'zuno', S3_ACCESS_KEY_ID: 'test', S3_SECRET_ACCESS_KEY: 'secret' } });
  await new Promise(r => srv.stdout.on('data', d => String(d).includes('running') && r()));
  try {
    const { token } = await (await fetch(B + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'c@x.dev', username: 'cloudy', password: 'secret12' }) })).json();
    const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.from('0123456789'.repeat(50))]);
    const up = await (await fetch(B + '/api/me/sound', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'X-File-Name': 'hi.mp3' }, body: mp3 })).json();
    const url = up.me.profileSound;
    await new Promise(r => setTimeout(r, 500));
    const name = url.split('/').pop();
    assert.ok(objects.has('/zuno/uploads/' + name), 'the file is in the cloud');
    assert.ok(!fs.existsSync(path.join(DIR, 'uploads', name)), 'and gone from the disk');
    const hop = await fetch(B + url, { redirect: 'manual' });
    assert.strictEqual(hop.status, 302, 'the browser is sent to the cloud');
    assert.match(hop.headers.get('location'), /X-Amz-Signature=/);
    const whole = Buffer.from(await (await fetch(B + url)).arrayBuffer());
    assert.ok(whole.equals(mp3), 'it loads back the same');
    assert.ok(presignedGets > 0, 'straight from the cloud');
    const tampered = hop.headers.get('location').replace(/uploads\/[^?]+/, 'uploads/someone-else.png');
    assert.strictEqual((await fetch(tampered)).status, 403, "a link can't be changed to another file");
    const through = Buffer.from(await (await fetch(B + url + '?direct=1', { redirect: 'manual' })).arrayBuffer());
    assert.ok(through.equals(mp3), '?direct=1 passes it through Zuno');
    const part = await fetch(B + url, { headers: { Range: 'bytes=3-12' } });
    assert.strictEqual(part.status, 206);
    assert.strictEqual(await part.text(), '0123456789');
    // A file sent in a chat: only for the people in it, and a download keeps its name.
    const up2 = await (await fetch(B + '/api/attachments', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'X-File-Name': 'notes.txt' }, body: Buffer.from('cloud file') })).json();
    await new Promise(r => setTimeout(r, 400));
    assert.strictEqual((await fetch(B + up2.attachment.url, { redirect: 'manual' })).status, 401, 'signed out: no link to the cloud');
    const dl = await fetch(B + up2.attachment.url, { headers: { Authorization: 'Bearer ' + token } });
    assert.strictEqual(await dl.text(), 'cloud file');
    assert.match(dl.headers.get('content-disposition') || '', /attachment; filename\*=UTF-8''notes\.txt/);
    await fetch(B + '/api/me/sound', { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
    await new Promise(r => setTimeout(r, 300));
    assert.ok(!objects.has('/zuno/uploads/' + name), 'deleting removes it from the cloud too');
    console.log('  ✓ cloud storage: uploads move to the cloud, load straight from it (whole and in parts, with signed links), and delete');
  } catch (e) { console.log('  ✗ cloud storage\n    ' + e.message); process.exitCode = 1; }
  srv.kill(); s3.close(); fs.rmSync(DIR, { recursive: true, force: true });
})();
