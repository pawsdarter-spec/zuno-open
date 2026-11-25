// Zuno's storage. Everything lives in memory in `data` while Zuno runs, and is saved to
// data/zuno.sqlite (SQLite, built into Node 22+). Only what changed gets written, so saves stay
// small however big Zuno gets. If SQLite isn't available, Zuno falls back to data/db.json.
// Uploaded files go in data/uploads/ (or cloud storage, see storage.js).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// The desktop app points this at the user's app-data folder.
const DATA_DIR = process.env.ZUNO_DATA_DIR || path.join(__dirname, '..', 'data');
const JSON_FILE = path.join(DATA_DIR, 'db.json');
const SQLITE_FILE = path.join(DATA_DIR, 'zuno.sqlite');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const KEEP_BACKUPS = 3; // one per day

// node:sqlite prints an "experimental" warning when it loads; Zuno knows, so keep the log clean.
let sqlite = null;
if (process.env.ZUNO_STORAGE !== 'json') {
  const warn = process.emitWarning;
  process.emitWarning = (w, ...rest) => (String(w?.message || w).includes('SQLite') ? undefined : warn.call(process, w, ...rest));
  try { sqlite = require('node:sqlite'); } catch {} finally { process.emitWarning = warn; }
}
const MODE = sqlite ? 'sqlite' : 'json';

const empty = () => ({
  users: {},          // id -> user record
  sessions: {},       // token -> { uid, createdAt, lastSeen, agent }
  friendRequests: {}, // id -> { id, from, to, createdAt }
  friendships: [],    // [userIdA, userIdB]
  dms: {},            // "idA:idB" (sorted) -> { messages: [] }
});
// Conversations: their messages go in their own table, one row per message. Threads too, so a busy
// thread isn't rewritten as one big record every time someone replies in it.
const MESSAGE_MAPS = ['dms', 'channelMessages', 'groupMessages', 'threads'];

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
// db.json missing or broken: start from the newest JSON backup instead of from nothing.
function loadJson() {
  const d = readJson(JSON_FILE);
  if (d) return d;
  try {
    const newest = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json')).sort().pop();
    if (newest) { console.warn(`db.json couldn't be read, so Zuno started from the backup ${newest}.`); return readJson(path.join(BACKUP_DIR, newest)) || {}; }
  } catch {}
  return {};
}

let db = null;
// "kind\0id" -> a short fingerprint of the JSON last written. Keeping a fingerprint instead of the JSON
// itself means the server doesn't hold a second copy of every account and server in memory.
const docCache = new Map();
const fp = body => crypto.createHash('sha1').update(body).digest('base64');
const msgCache = new Map();  // conv -> Map(messageId -> the message object last written)
const shapeCache = { value: '' };

function openSqlite() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new sqlite.DatabaseSync(SQLITE_FILE);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS docs (kind TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (kind, id));
    CREATE TABLE IF NOT EXISTS messages (conv TEXT NOT NULL, id TEXT NOT NULL, created INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY (conv, id));
    CREATE INDEX IF NOT EXISTS messages_by_time ON messages (conv, created);
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);`);
}
function loadSqlite() {
  const shape = JSON.parse(db.prepare("SELECT v FROM meta WHERE k = 'shape'").get()?.v || 'null');
  if (!shape) return null; // a brand-new database
  const out = {};
  for (const [key, kind] of Object.entries(shape)) out[key] = kind === 'value' ? undefined : {};
  for (const row of db.prepare('SELECT kind, id, body FROM docs').iterate()) {
    const body = JSON.parse(row.body);
    if (row.kind === '_value') out[row.id] = body;
    else (out[row.kind] ||= {})[row.id] = body;
    docCache.set(row.kind + '\0' + row.id, fp(row.body));
  }
  for (const row of db.prepare('SELECT conv, id, body FROM messages ORDER BY conv, created, rowid').iterate()) {
    const sep = row.conv.indexOf('|');
    const map = row.conv.slice(0, sep), key = row.conv.slice(sep + 1);
    const conv = ((out[map] ||= {})[key] ||= {});
    const m = JSON.parse(row.body);
    (conv.messages ||= []).push(m);
    let cache = msgCache.get(row.conv);
    if (!cache) msgCache.set(row.conv, (cache = new Map()));
    cache.set(m.id, m);
  }
  for (const map of MESSAGE_MAPS) for (const conv of Object.values(out[map] || {})) conv.messages ||= [];
  shapeCache.value = JSON.stringify(shape);
  return out;
}

let data;
if (MODE === 'sqlite') {
  openSqlite();
  data = loadSqlite();
  if (!data) {
    // First start on SQLite: bring everything over from db.json (kept as db.json.imported).
    data = loadJson();
    data = { ...empty(), ...data };
    writeSqlite(true);
    if (fs.existsSync(JSON_FILE)) { try { fs.renameSync(JSON_FILE, JSON_FILE + '.imported'); } catch {} console.log('Zuno moved its data from db.json into SQLite.'); }
  }
  data = { ...empty(), ...data };
} else {
  data = { ...empty(), ...loadJson() };
}

// Write only what changed since the last save, in one transaction.
function writeSqlite(all = false) {
  const shape = {};
  const putDoc = db.prepare('INSERT INTO docs (kind, id, body) VALUES (?, ?, ?) ON CONFLICT (kind, id) DO UPDATE SET body = excluded.body');
  const delDoc = db.prepare('DELETE FROM docs WHERE kind = ? AND id = ?');
  const putMsg = db.prepare('INSERT INTO messages (conv, id, created, body) VALUES (?, ?, ?, ?) ON CONFLICT (conv, id) DO UPDATE SET body = excluded.body, created = excluded.created');
  const delMsg = db.prepare('DELETE FROM messages WHERE conv = ? AND id = ?');
  const seenDocs = new Set(), seenConvs = new Set();
  db.exec('BEGIN');
  try {
    const doc = (kind, id, value) => {
      const k = kind + '\0' + id;
      seenDocs.add(k);
      const body = JSON.stringify(value ?? null);
      const print = fp(body);
      if (!all && docCache.get(k) === print) return;
      putDoc.run(kind, id, body);
      docCache.set(k, print);
    };
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      if (MESSAGE_MAPS.includes(key)) {
        shape[key] = 'map';
        for (const [convKey, conv] of Object.entries(value || {})) {
          const { messages = [], ...rest } = conv || {};
          doc(key, convKey, rest);
          const cid = key + '|' + convKey;
          seenConvs.add(cid);
          let cache = msgCache.get(cid);
          if (!cache) msgCache.set(cid, (cache = new Map()));
          const ids = new Set();
          for (const m of messages) {
            ids.add(m.id);
            // Messages are replaced (not changed in place) when edited, so a new object means "write it".
            if (!all && cache.get(m.id) === m) continue;
            putMsg.run(cid, String(m.id), Number(m.createdAt) || 0, JSON.stringify(m));
            cache.set(m.id, m);
          }
          for (const id of cache.keys()) if (!ids.has(id)) { delMsg.run(cid, String(id)); cache.delete(id); }
        }
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        shape[key] = 'map';
        for (const [id, v] of Object.entries(value)) doc(key, id, v);
      } else {
        shape[key] = 'value';
        doc('_value', key, value);
      }
    }
    for (const k of [...docCache.keys()]) if (!seenDocs.has(k)) { const [kind, id] = k.split('\0'); delDoc.run(kind, id); docCache.delete(k); }
    for (const [cid, cache] of msgCache) if (!seenConvs.has(cid)) { for (const id of cache.keys()) delMsg.run(cid, String(id)); msgCache.delete(cid); }
    const s = JSON.stringify(shape);
    if (s !== shapeCache.value) { db.prepare("INSERT INTO meta (k, v) VALUES ('shape', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v").run(s); shapeCache.value = s; }
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
}

// ---------- JSON fallback ----------
let writing = false, again = false;
function writeJsonNow() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = JSON_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, JSON_FILE);
}
// JSON writes happen in the background so a big save never freezes chat for everyone.
async function writeJsonLater() {
  if (writing) { again = true; return; }
  writing = true;
  try {
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    const tmp = JSON_FILE + '.tmp';
    await fs.promises.writeFile(tmp, JSON.stringify(data));
    await fs.promises.rename(tmp, JSON_FILE);
  } catch (err) { console.error('Saving failed:', err.message); }
  writing = false;
  if (again) { again = false; save(); }
}

// Batch writes so a burst of messages only hits the disk once. Each save looks over everything, so
// they're grouped into one per second at most (Zuno writes right away when it's shutting down).
// (0.45) Busy paths can say exactly what changed (save.touch(kind, id), like a new message in one
// chat): then only that is written, instead of checking everything. A full check still runs at
// least every 15 seconds while anything is being touched, so nothing is ever missed for long.
const SAVE_DELAY = 1000;
const FULL_EVERY = 15000;
let timer = null;
let fullWanted = false;
let lastFull = Date.now();
const touched = new Map(); // kind -> Set(id)
let slowWarned = 0;
function runSave() {
  timer = null;
  const t0 = Date.now();
  if (MODE !== 'sqlite') { touched.clear(); fullWanted = false; return writeJsonLater(); }
  try {
    if (fullWanted || Date.now() - lastFull > FULL_EVERY) { fullWanted = false; touched.clear(); writeSqlite(); lastFull = Date.now(); }
    else if (touched.size) { const list = [...touched]; touched.clear(); writeTouched(list); if (!timer) timer = setTimeout(runSave, FULL_EVERY); }
  } catch (err) { console.error('Saving failed:', err.message); }
  const ms = Date.now() - t0;
  if (ms > 250 && Date.now() - slowWarned > 600e3) { slowWarned = Date.now(); console.warn(`Saving took ${ms} ms.`); }
}
function save() {
  fullWanted = true;
  if (!timer) timer = setTimeout(runSave, SAVE_DELAY);
}
save.touch = (kind, id) => {
  if (MODE !== 'sqlite') return save();
  let set = touched.get(kind);
  if (!set) touched.set(kind, (set = new Set()));
  set.add(String(id));
  if (!timer) timer = setTimeout(runSave, SAVE_DELAY);
};
// Write only the documents that were named.
function writeTouched(list) {
  const putDoc = db.prepare('INSERT INTO docs (kind, id, body) VALUES (?, ?, ?) ON CONFLICT (kind, id) DO UPDATE SET body = excluded.body');
  const delDoc = db.prepare('DELETE FROM docs WHERE kind = ? AND id = ?');
  const putMsg = db.prepare('INSERT INTO messages (conv, id, created, body) VALUES (?, ?, ?, ?) ON CONFLICT (conv, id) DO UPDATE SET body = excluded.body, created = excluded.created');
  const delMsg = db.prepare('DELETE FROM messages WHERE conv = ? AND id = ?');
  const doc = (kind, id, value) => {
    const k = kind + '\0' + id;
    if (value === undefined) { if (docCache.has(k)) { delDoc.run(kind, id); docCache.delete(k); } return; }
    const body = JSON.stringify(value ?? null);
    const print = fp(body);
    if (docCache.get(k) === print) return;
    putDoc.run(kind, id, body);
    docCache.set(k, print);
  };
  db.exec('BEGIN');
  try {
    for (const [kind, ids] of list) {
      const map = data[kind];
      if (!map || typeof map !== 'object' || Array.isArray(map)) { doc('_value', kind, map); continue; }
      for (const id of ids) {
        if (!MESSAGE_MAPS.includes(kind)) { doc(kind, id, map[id]); continue; }
        const conv = map[id];
        const cid = kind + '|' + id;
        if (!conv) { doc(kind, id, undefined); continue; } // a removed chat waits for the next full check
        const { messages = [], ...rest } = conv;
        doc(kind, id, rest);
        let cache = msgCache.get(cid);
        if (!cache) msgCache.set(cid, (cache = new Map()));
        const seen = new Set();
        for (const m of messages) {
          seen.add(m.id);
          if (cache.get(m.id) === m) continue;
          putMsg.run(cid, String(m.id), Number(m.createdAt) || 0, JSON.stringify(m));
          cache.set(m.id, m);
        }
        for (const mid of [...cache.keys()]) if (!seen.has(mid)) { delMsg.run(cid, String(mid)); cache.delete(mid); }
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
}
// Used when Zuno is closing: write right away.
function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  touched.clear(); fullWanted = false;
  if (MODE === 'sqlite') writeSqlite(); else writeJsonNow();
}

// Once a day, copy the database into backups/ and keep the last few days.
function backup() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    if (MODE === 'sqlite') {
      const file = path.join(BACKUP_DIR, `zuno-${day}.sqlite`);
      if (!fs.existsSync(file)) db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    } else if (fs.existsSync(JSON_FILE)) {
      const file = path.join(BACKUP_DIR, `db-${day}.json`);
      if (!fs.existsSync(file)) fs.copyFileSync(JSON_FILE, file);
    }
    for (const re of [/^zuno-\d{4}-\d\d-\d\d\.sqlite$/, /^db-\d{4}-\d\d-\d\d\.json$/]) {
      const all = fs.readdirSync(BACKUP_DIR).filter(f => re.test(f)).sort();
      for (const old of all.slice(0, -KEEP_BACKUPS)) fs.unlinkSync(path.join(BACKUP_DIR, old));
    }
  } catch (err) { console.warn('Backup failed:', err.message); }
}
backup();
setInterval(backup, 6 * 3600e3).unref();

const dbFile = MODE === 'sqlite' ? SQLITE_FILE : JSON_FILE;
module.exports = { data, save, flush, DATA_DIR, MODE, dbFile };
