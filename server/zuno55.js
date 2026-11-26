'use strict';
// Zuno 0.55.1: the founder can download the code Zuno is running right now, as a zip, from the
// Admin Dashboard. Never included: passwords/keys files, the database, uploads, git history,
// installed packages or build output. It's built once per start (the code only changes on deploy).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'data', 'dist', 'uploads', '.cache', 'tmp']);
const SKIP_FILE = /(^\.env|\.sqlite|\.sqlite-(wal|shm|journal)$|\.db$|\.pem$|\.key$|\.p12$|\.pfx$|^id_rsa|\.log$|^source\.json$)/i;
const MAX_TOTAL = 60 * 1048576;

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function listFiles(dataDir) {
  const out = [];
  const skipAbs = new Set([dataDir && path.resolve(dataDir)].filter(Boolean));
  (function walk(dir, rel) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name), r = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isSymbolicLink()) continue;
      if (ent.isDirectory()) { if (!SKIP_DIRS.has(ent.name) && !skipAbs.has(path.resolve(abs))) walk(abs, r); continue; }
      if (ent.isFile() && !SKIP_FILE.test(ent.name)) out.push([abs, r]);
    }
  })(ROOT, '');
  return out.sort((a, b) => a[1].localeCompare(b[1]));
}

function buildZip(files, prefix) {
  const parts = [], central = [];
  let offset = 0, total = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const [abs, rel] of files) {
    const data = fs.readFileSync(abs);
    total += data.length;
    if (total > MAX_TOTAL) throw new Error('The code is bigger than expected; download stopped.');
    const name = Buffer.from(`${prefix}/${rel}`, 'utf8');
    const deflated = zlib.deflateRawSync(data, { level: 6 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data, crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    parts.push(local, name, body);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(useDeflate ? 8 : 0, 10);
    cen.writeUInt16LE(dosTime, 12); cen.writeUInt16LE(dosDate, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(body.length, 20); cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(name.length, 28); cen.writeUInt32LE(offset, 42);
    central.push(cen, name);
    offset += 30 + name.length + body.length;
  }
  const cenBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cenBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cenBuf, end]);
}

module.exports = function (z) {
  const { route, fail, hooks } = z;
  let cached = null; // { buf, name, files }
  const zipNow = () => {
    if (cached) return cached;
    const version = z.PKG?.version || 'latest';
    const files = listFiles(process.env.ZUNO_DATA_DIR);
    cached = { buf: buildZip(files, `zuno-${version}`), name: `zuno-${version}.zip`, files: files.length };
    return cached;
  };
  const tickets = new Map(); // one-time download tickets, memory only

  route('POST', '/api/admin/source-ticket', async ({ me, token }) => {
    if (!z.isFounder(me.id) || me.system) fail(403, 'Only the founder can download Zuno.');
    z.needReauth(token);
    const t = crypto.randomBytes(24).toString('base64url');
    tickets.set(t, Date.now() + 60e3);
    for (const [k, until] of tickets) if (until < Date.now()) tickets.delete(k);
    const { name, files, buf } = zipNow();
    return { url: `/api/admin/source.zip?ticket=${t}`, name, files, sizeMB: Math.round(buf.length / 104857.6) / 10 };
  });
  hooks.rawRoutes.push({ path: '/api/admin/source.zip', fn: async (req, res, url) => {
    const t = String(url.searchParams.get('ticket') || '');
    const until = tickets.get(t);
    tickets.delete(t);
    if (!until || until < Date.now()) { res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); res.end('This download link expired. Press Download again in the Admin Dashboard.'); return; }
    const { buf, name } = zipNow();
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': buf.length, 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(buf);
  } });
};
