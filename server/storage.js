// Cloud storage for uploads (Cloudflare R2, Amazon S3, or anything S3-compatible).
// Turned on by S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY (S3_REGION is
// "auto" for R2). Optional S3_PUBLIC_URL: a public address for the bucket, so pictures load
// straight from the cloud instead of through Zuno. No packages needed: requests are signed by hand.
const https = require('https');
const http = require('http');
const crypto = require('crypto');

const env = () => ({
  endpoint: (process.env.S3_ENDPOINT || '').replace(/\/+$/, ''), bucket: process.env.S3_BUCKET || '',
  key: process.env.S3_ACCESS_KEY_ID || '', secret: process.env.S3_SECRET_ACCESS_KEY || '', region: process.env.S3_REGION || 'auto',
  publicUrl: (process.env.S3_PUBLIC_URL || '').replace(/\/+$/, ''),
});
const enabled = () => { const e = env(); return !!(e.endpoint && e.bucket && e.key && e.secret); };

const hmac = (key, s) => crypto.createHmac('sha256', key).update(s).digest();
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

// AWS Signature Version 4, path-style (https://endpoint/bucket/key).
function signed(method, objectKey, headers = {}, query = {}) {
  const e = env();
  const u = new URL(e.endpoint);
  const pathName = `/${enc(e.bucket)}/${objectKey.split('/').map(enc).join('/')}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const h = { host: u.host, 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD', 'x-amz-date': amzDate, ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)])) };
  const names = Object.keys(h).sort();
  const qs = Object.keys(query).sort().map(k => `${enc(k)}=${enc(query[k])}`).join('&');
  const canonical = [method, pathName, qs, names.map(n => `${n}:${h[n].trim()}`).join('\n') + '\n', names.join(';'), 'UNSIGNED-PAYLOAD'].join('\n');
  const scope = `${day}/${e.region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, hash(canonical)].join('\n');
  const kSigning = hmac(hmac(hmac(hmac('AWS4' + e.secret, day), e.region), 's3'), 'aws4_request');
  h.authorization = `AWS4-HMAC-SHA256 Credential=${e.key}/${scope}, SignedHeaders=${names.join(';')}, Signature=${crypto.createHmac('sha256', kSigning).update(toSign).digest('hex')}`;
  return { url: `${u.protocol}//${u.host}${pathName}${qs ? '?' + qs : ''}`, headers: h, lib: u.protocol === 'http:' ? http : https };
}
// A link that lets a browser download one file straight from the bucket for a while (a "presigned"
// GET, AWS Signature Version 4 in the query string). Pictures and videos then come from the
// cloud (Cloudflare R2 doesn't charge for downloads) instead of through Zuno's server, which
// counts against the host's bandwidth. The link is the same all day, so browsers can cache it.
// `extra` can set response-content-type / response-content-disposition for the download.
function presignWith({ key, secret, region }, host, pathName, amzDate, expires, extra = {}) {
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${region}/s3/aws4_request`;
  const q = { 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${key}/${scope}`, 'X-Amz-Date': amzDate, 'X-Amz-Expires': String(expires), 'X-Amz-SignedHeaders': 'host', ...extra };
  const query = Object.keys(q).sort().map(k => `${enc(k)}=${enc(q[k])}`).join('&');
  const canonical = ['GET', pathName, query, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, hash(canonical)].join('\n');
  const kSigning = hmac(hmac(hmac(hmac('AWS4' + secret, day), region), 's3'), 'aws4_request');
  return `${query}&X-Amz-Signature=${crypto.createHmac('sha256', kSigning).update(toSign).digest('hex')}`;
}
function presignedUrl(name, extra = {}) {
  const e = env();
  const u = new URL(e.endpoint);
  const pathName = `/${enc(e.bucket)}/uploads/${enc(name)}`;
  // Signed as of midnight (UTC) and good for two days: one stable link per file per day.
  const amzDate = new Date().toISOString().slice(0, 10).replace(/-/g, '') + 'T000000Z';
  return `${u.protocol}//${u.host}${pathName}?${presignWith(e, u.host, pathName, amzDate, 172800, extra)}`;
}
function request(method, objectKey, { body = null, headers = {}, query = {}, timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const s = signed(method, objectKey, body ? { ...headers, 'content-length': body.length } : headers, query);
    const r = s.lib.request(s.url, { method, headers: s.headers, timeout }, res => resolve(res));
    r.on('timeout', () => r.destroy(new Error('timeout')));
    r.on('error', reject);
    r.end(body || undefined);
  });
}
const drain = res => new Promise(r => { res.resume(); res.on('end', r); res.on('error', r); });

const TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp3: 'audio/mpeg', mp4: 'video/mp4', webm: 'video/webm', avif: 'image/avif', bmp: 'image/bmp', heic: 'image/heic', ogg: 'audio/ogg', m4a: 'audio/mp4', wav: 'audio/wav', aac: 'audio/aac', bin: 'application/octet-stream' };
const typeOf = name => TYPES[(name.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';

async function put(name, buf) {
  const res = await request('PUT', 'uploads/' + name, { body: buf, headers: { 'content-type': typeOf(name), 'cache-control': 'public, max-age=31536000, immutable' } });
  await drain(res);
  if (res.statusCode >= 300) throw new Error('upload failed with status ' + res.statusCode);
}
async function del(name) {
  const res = await request('DELETE', 'uploads/' + name);
  await drain(res);
}
// Hands back the cloud's response (so it can be streamed on), or null if it isn't there.
async function get(name, range) {
  const res = await request('GET', 'uploads/' + name, { headers: range ? { range } : {} });
  if (res.statusCode >= 300) { await drain(res); return null; }
  return res;
}
// (0.47) Big files in parts (S3 multipart upload), for the PC app's installer.
const text = res => new Promise((ok, no) => { const c = []; res.on('data', d => c.push(d)); res.on('end', () => ok(Buffer.concat(c).toString('utf8'))); res.on('error', no); });
async function multiStart(name, type) {
  const res = await request('POST', 'uploads/' + name, { query: { uploads: '' }, headers: { 'content-type': type || typeOf(name) } });
  const body = await text(res);
  const id = /<UploadId>([^<]+)<\/UploadId>/.exec(body)?.[1];
  if (res.statusCode >= 300 || !id) throw new Error('multipart start failed with status ' + res.statusCode);
  return id;
}
async function multiPart(name, uploadId, n, buf) {
  const res = await request('PUT', 'uploads/' + name, { body: buf, query: { partNumber: String(n), uploadId }, timeout: 120000 });
  await drain(res);
  if (res.statusCode >= 300) throw new Error('part upload failed with status ' + res.statusCode);
  return String(res.headers.etag || '').replace(/"/g, '');
}
async function multiFinish(name, uploadId, etags) {
  const xml = `<CompleteMultipartUpload>${etags.map((e, i) => `<Part><PartNumber>${i + 1}</PartNumber><ETag>"${e}"</ETag></Part>`).join('')}</CompleteMultipartUpload>`;
  const res = await request('POST', 'uploads/' + name, { body: Buffer.from(xml), query: { uploadId }, headers: { 'content-type': 'application/xml' }, timeout: 120000 });
  const body = await text(res);
  if (res.statusCode >= 300 || /<Error>/.test(body)) throw new Error('multipart finish failed with status ' + res.statusCode);
}
const publicUrl = name => (env().publicUrl ? `${env().publicUrl}/uploads/${encodeURIComponent(name)}` : null);

module.exports = { enabled, put, del, get, publicUrl, presignedUrl, presignWith, typeOf, multiStart, multiPart, multiFinish };
