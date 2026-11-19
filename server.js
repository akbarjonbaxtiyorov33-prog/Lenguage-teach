/* Tilchi serveri — tashqi paketlarsiz. Ishga tushirish:  node server.js  →  http://localhost:3000
   Vazifasi: saytni berish + haqiqiy foydalanuvchilar ro‘yxatini (reyting, obunalar) saqlash.
   Ixtiyoriy ovoz (avatar): YANDEX_API_KEY=... [YANDEX_VOICE=alice] [YANDEX_LANG=ru-RU] node server.js */
const http = require("http"), https = require("https"), fs = require("fs"), path = require("path");
const PORT = process.env.PORT || 3000;
const DB = path.join(__dirname, "users.json");
const KEY = process.env.YANDEX_API_KEY || "";
const VOICE = process.env.YANDEX_VOICE || "alice", TLANG = process.env.YANDEX_LANG || "ru-RU";
const FILES = { "/": "tilchi.html", "/tilchi.html": "tilchi.html", "/manifest.json": "manifest.json", "/sw.js": "sw.js", "/icon-192.png": "icon-192.png" };
const MIME = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript", ".png": "image/png" };

let users = {};
try { users = JSON.parse(fs.readFileSync(DB, "utf8")); } catch (e) {}
let dirty = false;
setInterval(() => { if (dirty) { dirty = false; fs.writeFile(DB, JSON.stringify(users), () => {}); } }, 5000);
process.on("SIGINT", () => { try { fs.writeFileSync(DB, JSON.stringify(users)); } catch (e) {} process.exit(); });

const str = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, "").slice(0, n);
const num = (v) => { v = Number(v); return isFinite(v) && v >= 0 ? Math.min(Math.floor(v), 1e9) : 0; };
function cleanAv(a) {
  const o = {}; if (!a || typeof a !== "object") return o;
  for (const k of ["skin", "shirt", "hc", "hatc"]) if (typeof a[k] === "string" && /^#[0-9a-f]{3,8}$/i.test(a[k])) o[k] = a[k];
  for (const k of ["eyes", "mouth", "hair", "glasses", "hat"]) if (typeof a[k] === "number" && a[k] >= 0 && a[k] < 50) o[k] = a[k];
  return o;
}
const hits = new Map();
function limited(ip, max) {
  const m = Math.floor(Date.now() / 60000), h = hits.get(ip);
  if (!h || h.m !== m) { hits.set(ip, { m, c: 1 }); if (hits.size > 5000) hits.clear(); return false; }
  return ++h.c > max;
}
function pub() {
  return Object.values(users).sort((a, b) => b.xp - a.xp).slice(0, 500)
    .map(({ tk, ...u }) => u);
}
function send(res, code, body, type) { res.writeHead(code, { "Content-Type": type || "application/json", "Cache-Control": "no-store" }); res.end(body); }

http.createServer((req, res) => {
  const ip = req.socket.remoteAddress, url = new URL(req.url, "http://x");
  if (url.pathname === "/api/sync" && req.method === "POST") {
    if (limited(ip, 40)) return send(res, 429, '{"error":"limit"}');
    let b = ""; req.on("data", (c) => { b += c; if (b.length > 20000) req.destroy(); });
    req.on("end", () => {
      let d; try { d = JSON.parse(b); } catch (e) { return send(res, 400, '{"error":"json"}'); }
      const un = str(d.un, 40).trim(), tk = str(d.tk, 80);
      if (!un || tk.length < 16) return send(res, 400, '{"error":"data"}');
      const old = users[un];
      if (old && old.tk !== tk) return send(res, 403, '{"error":"taken"}');
      if (!old && Object.keys(users).length >= 20000) return send(res, 503, '{"error":"full"}');
      users[un] = { un, tk, name: str(d.name, 40) || un, xp: num(d.xp), streak: num(d.streak), lang: str(d.lang, 8), lv: num(d.lv) || 1,
        av: cleanAv(d.av), fe: (Array.isArray(d.fe) ? d.fe : []).slice(0, 500).map((x) => str(x, 40)), reg: num(d.reg), seen: Date.now() };
      dirty = true;
      send(res, 200, JSON.stringify({ users: pub(), tts: !!KEY }));
    });
    return;
  }
  if (url.pathname === "/api/tts" && req.method === "GET") {
    const text = str(url.searchParams.get("text"), 300);
    if (!KEY || !text) return send(res, 404, "{}");
    if (limited(ip, 30)) return send(res, 429, "{}");
    const body = new URLSearchParams({ text, lang: TLANG, voice: VOICE, format: "mp3" }).toString();
    const r = https.request("https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize", { method: "POST",
      headers: { Authorization: "Api-Key " + KEY, "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) } },
      (up) => { if (up.statusCode !== 200) { up.resume(); return send(res, 502, "{}"); } res.writeHead(200, { "Content-Type": "audio/mpeg" }); up.pipe(res); });
    r.on("error", () => send(res, 502, "{}")); r.end(body); return;
  }
  const f = FILES[url.pathname];
  if (req.method === "GET" && f) {
    return fs.readFile(path.join(__dirname, f), (err, data) => err ? send(res, 404, "Topilmadi", "text/plain") : send(res, 200, data, MIME[path.extname(f)] || "application/octet-stream"));

   /* Tilchi serveri — tashqi paketlarsiz. Ishga tushirish:  node server.js  →  http://localhost:3000
   Vazifasi: saytni berish + haqiqiy foydalanuvchilar ro‘yxatini (reyting, obunalar) saqlash.
   Avatar ovozi (ixtiyoriy, odamdek o‘zbek ovozi): AZURE_SPEECH_KEY=... AZURE_SPEECH_REGION=eastus [AZURE_VOICE=uz-UZ-MadinaNeural] node server.js
   (Yandex ham bor: YANDEX_API_KEY=... [YANDEX_VOICE] [YANDEX_LANG])
   Xabarlar (chat): faqat o‘zi obuna bo‘lgan foydalanuvchiga yozish mumkin; bloklash bor. Ma’lumot chats.json da saqlanadi. */
const http = require("http"), https = require("https"), fs = require("fs"), path = require("path");
const PORT = process.env.PORT || 3000;
const DB = path.join(__dirname, "users.json"), CDB = path.join(__dirname, "chats.json");
const KEY = process.env.YANDEX_API_KEY || "";
const AZ_KEY = process.env.AZURE_SPEECH_KEY || "", AZ_REGION = process.env.AZURE_SPEECH_REGION || "", AZ_VOICE = process.env.AZURE_VOICE || "uz-UZ-MadinaNeural";
const AZ_URL = process.env.AZURE_TTS_URL || ("https://" + AZ_REGION + ".tts.speech.microsoft.com/cognitiveservices/v1");
const TTS_ON = !!((AZ_KEY && AZ_REGION) || KEY), DAILY = Number(process.env.TTS_DAILY_CHARS) || 200000;
const VOICE = process.env.YANDEX_VOICE || "alice", TLANG = process.env.YANDEX_LANG || "ru-RU";
const FILES = { "/": "tilchi.html", "/tilchi.html": "tilchi.html", "/manifest.json": "manifest.json", "/sw.js": "sw.js", "/icon-192.png": "icon-192.png" };
const MIME = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript", ".png": "image/png" };

let users = {};
try { users = JSON.parse(fs.readFileSync(DB, "utf8")); } catch (e) {}
let chats = {};
try { chats = JSON.parse(fs.readFileSync(CDB, "utf8")); } catch (e) {}
const byUser = new Map(); // un -> Set(thread keys)
const tkey = (a, b) => (a < b ? a + "\u0001" + b : b + "\u0001" + a);
function idx(k) { for (const u of k.split("\u0001")) { if (!byUser.has(u)) byUser.set(u, new Set()); byUser.get(u).add(k); } }
Object.keys(chats).forEach(idx);
let dirty = false, dirtyC = false;
setInterval(() => {
  if (dirty) { dirty = false; fs.writeFile(DB, JSON.stringify(users), () => {}); }
  if (dirtyC) { dirtyC = false; fs.writeFile(CDB, JSON.stringify(chats), () => {}); }
}, 5000);
process.on("SIGINT", () => { try { fs.writeFileSync(DB, JSON.stringify(users)); fs.writeFileSync(CDB, JSON.stringify(chats)); } catch (e) {} process.exit(); });

const str = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, "").slice(0, n);
const num = (v) => { v = Number(v); return isFinite(v) && v >= 0 ? Math.min(Math.floor(v), 1e9) : 0; };
function cleanAv(a) {
  const o = {}; if (!a || typeof a !== "object") return o;
  for (const k of ["skin", "shirt", "hc", "hatc"]) if (typeof a[k] === "string" && /^#[0-9a-f]{3,8}$/i.test(a[k])) o[k] = a[k];
  for (const k of ["eyes", "mouth", "hair", "glasses", "hat"]) if (typeof a[k] === "number" && a[k] >= 0 && a[k] < 50) o[k] = a[k];
  return o;
}
const hits = new Map();
function limited(ip, max) {
  const m = Math.floor(Date.now() / 60000), h = hits.get(ip);
  if (!h || h.m !== m) { hits.set(ip, { m, c: 1 }); if (hits.size > 5000) hits.clear(); return false; }
  return ++h.c > max;
}
const cache = new Map(), ttsDay = { d: "", n: 0 };
const esc = (t) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
function audio(res, buf) { res.writeHead(200, { "Content-Type": "audio/mpeg", "Content-Length": buf.length, "Cache-Control": "public, max-age=86400", ...CORS }); res.end(buf); }
function relay(up, res, text) {
  if (up.statusCode !== 200) { up.resume(); return send(res, 502, "{}"); }
  const ch = []; up.on("data", (c) => ch.push(c));
  up.on("end", () => { const buf = Buffer.concat(ch); if (cache.size >= 300) cache.delete(cache.keys().next().value); cache.set(text, buf); audio(res, buf); });
  up.on("error", () => send(res, 502, "{}"));
}
const nz2 = (t) => String(t).toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
function pub() {
  return Object.values(users).sort((a, b) => b.xp - a.xp).slice(0, 500)
    .map(({ tk, bl, rd, ...u }) => u);
}
const CORS = { "Access-Control-Allow-Origin": process.env.ALLOW_ORIGIN || "*" };
function send(res, code, body, type) { res.writeHead(code, { "Content-Type": type || "application/json", "Cache-Control": "no-store", ...CORS }); res.end(body); }
function readBody(req, res, cb) {
  let b = ""; req.on("data", (c) => { b += c; if (b.length > 20000) req.destroy(); });
  req.on("end", () => { let d; try { d = JSON.parse(b); } catch (e) { return send(res, 400, '{"error":"json"}'); } cb(d); });
}
const auth = (d) => { const u = users[str(d.un, 40).trim()]; return u && u.tk === str(d.tk, 80) ? u : null; };
const follows = (a, b) => (a.fe || []).includes(b.un);
const blocked = (by, x) => (by.bl || []).includes(x.un);
const typing = new Map(), REACT = ["❤️", "👍", "😂", "😮", "😢", "🙏"];
function chat(act, me, d, res) {
  if (limited("c:" + me.un, 240)) return send(res, 429, '{"error":"limit"}');
  if (act === "send") {
    const to = users[str(d.to, 40).trim()], text = str(d.x, 500).trim();
    if (!to || !text || to.un === me.un) return send(res, 400, '{"error":"data"}');
    if (!follows(me, to)) return send(res, 403, '{"error":"notfollow"}');
    if (blocked(to, me) || blocked(me, to)) return send(res, 403, '{"error":"blocked"}');
    if (limited("m:" + me.un, 30)) return send(res, 429, '{"error":"limit"}');
    const k = tkey(me.un, to.un), arr = chats[k] || (chats[k] = [], idx(k), chats[k]);
    const ts = Math.max(Date.now(), arr.length ? arr[arr.length - 1].ts + 1 : 0);
    const m = { id: ts.toString(36) + Math.random().toString(36).slice(2, 6), f: me.un, x: text, ts };
    const o = d.rp ? arr.find((x) => x.id === str(d.rp, 24) && !x.d) : null;
    if (o) m.rp = { id: o.id, f: o.f, x: o.x.slice(0, 60) };
    arr.push(m); if (arr.length > 500) arr.splice(0, arr.length - 500); dirtyC = true;
    return send(res, 200, JSON.stringify({ ok: 1, msg: m }));
  }
  if (act === "list") {
    const peer = users[str(d.peer, 40).trim()];
    if (!peer) return send(res, 404, '{"error":"nouser"}');
    const arr = chats[tkey(me.un, peer.un)] || [], after = num(d.after);
    me.rd = me.rd || {}; me.rd[peer.un] = Date.now(); dirty = true;
    return send(res, 200, JSON.stringify({ msgs: after ? arr.filter((m) => m.ts > after || (m.mt || 0) > after) : arr.slice(-100),
      can: follows(me, peer) && !blocked(me, peer) && !blocked(peer, me), seen: peer.seen,
      pr: (peer.rd || {})[me.un] || 0, typing: Date.now() - (typing.get(peer.un + ">" + me.un) || 0) < 4500 }));
  }
  if (act === "typing") {
    const peer = users[str(d.peer, 40).trim()];
    if (!peer) return send(res, 404, '{"error":"nouser"}');
    if (typing.size > 5000) typing.clear();
    typing.set(me.un + ">" + peer.un, Date.now());
    return send(res, 200, '{"ok":1}');
  }
  if (act === "react" || act === "del") {
    const peer = users[str(d.peer, 40).trim()];
    if (!peer) return send(res, 404, '{"error":"nouser"}');
    const arr = chats[tkey(me.un, peer.un)] || [], m = arr.find((x) => x.id === str(d.id, 24));
    if (!m) return send(res, 404, '{"error":"nomsg"}');
    if (blocked(peer, me) || blocked(me, peer)) return send(res, 403, '{"error":"blocked"}');
    if (act === "react") {
      const em = str(d.e, 8);
      if (m.d || (em && !REACT.includes(em))) return send(res, 400, '{"error":"data"}');
      m.r = m.r || {}; if (em) m.r[me.un] = em; else delete m.r[me.un];
    } else {
      if (m.f !== me.un) return send(res, 403, '{"error":"own"}');
      m.d = 1; m.x = ""; delete m.rp; delete m.r;
    }
    m.mt = Math.max(Date.now(), arr.reduce((t, x) => Math.max(t, x.ts, x.mt || 0), 0) + 1);
    dirtyC = true;
    return send(res, 200, JSON.stringify({ ok: 1, msg: m }));
  }
  if (act === "inbox") {
    const rd = me.rd || {}, out = []; let tot = 0;
    for (const k of byUser.get(me.un) || []) {
      const arr = chats[k]; if (!arr || !arr.length) continue;
      const [a, b] = k.split("\u0001"), peer = a === me.un ? b : a, pu = users[peer];
      if (!pu || blocked(me, pu)) continue;
      const un = arr.filter((m) => m.f === peer && m.ts > (rd[peer] || 0)).length; tot += un;
      out.push({ peer, name: pu.name, av: pu.av, seen: pu.seen, last: arr[arr.length - 1], unread: un });
    }
    out.sort((x, y) => y.last.ts - x.last.ts);
    return send(res, 200, JSON.stringify({ threads: out.slice(0, 100), unread: tot }));
  }
  send(res, 404, "{}");
}

http.createServer((req, res) => {
  const ip = req.socket.remoteAddress, url = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") { res.writeHead(204, { ...CORS, "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" }); return res.end(); }
  if (url.pathname.startsWith("/api/chat/") && req.method === "POST") {
    if (limited(ip, 900)) return send(res, 429, '{"error":"limit"}');
    return readBody(req, res, (d) => { const me = auth(d); if (!me) return send(res, 401, '{"error":"auth"}'); chat(url.pathname.slice(10), me, d, res); });
  }
  if (url.pathname === "/api/find" && req.method === "GET") {
    if (limited("f:" + ip, 60)) return send(res, 429, '{"error":"limit"}');
    const q = str(url.searchParams.get("q"), 40).trim().replace(/^@/, "").toLowerCase();
    if (nz2(q).length < 2) return send(res, 200, '{"users":[]}');
    const out = [];
    for (const u of Object.values(users)) {
      if (nz2(u.un).includes(nz2(q)) || nz2(u.name || "").includes(nz2(q))) {
        const { tk, bl, rd, ...pu } = u; out.push(pu); if (out.length >= 20) break;
      }
    }
    return send(res, 200, JSON.stringify({ users: out }));
  }
  if (url.pathname === "/api/sync" && req.method === "POST") {
    if (limited(ip, 40)) return send(res, 429, '{"error":"limit"}');
    let b = ""; req.on("data", (c) => { b += c; if (b.length > 20000) req.destroy(); });
    req.on("end", () => {
      let d; try { d = JSON.parse(b); } catch (e) { return send(res, 400, '{"error":"json"}'); }
      const un = str(d.un, 40).trim(), tk = str(d.tk, 80);
      if (!un || tk.length < 16) return send(res, 400, '{"error":"data"}');
      const old = users[un];
      if (old && old.tk !== tk) return send(res, 403, '{"error":"taken"}');
      if (!old && Object.keys(users).length >= 20000) return send(res, 503, '{"error":"full"}');
      users[un] = { un, tk, name: str(d.name, 40) || un, xp: num(d.xp), streak: num(d.streak), lang: str(d.lang, 8), lv: num(d.lv) || 1,
        av: cleanAv(d.av), fe: (Array.isArray(d.fe) ? d.fe : []).slice(0, 500).map((x) => str(x, 40)), reg: num(d.reg), seen: Date.now(),
        bl: (Array.isArray(d.bl) ? d.bl : []).slice(0, 200).map((x) => str(x, 40)), rd: old && old.rd ? old.rd : {} };
      dirty = true;
      send(res, 200, JSON.stringify({ users: pub(), tts: TTS_ON }));
    });
    return;
  }
  if (url.pathname === "/api/tts" && req.method === "GET") {
    const text = str(url.searchParams.get("text"), 300).trim();
    if (!TTS_ON || !text) return send(res, 404, "{}");
    if (cache.has(text)) return audio(res, cache.get(text));
    if (limited(ip, 30)) return send(res, 429, "{}");
    const day = new Date().toISOString().slice(0, 10);
    if (ttsDay.d !== day) { ttsDay.d = day; ttsDay.n = 0; }
    if ((ttsDay.n += text.length) > DAILY) return send(res, 429, "{}");
    let r;
    if (AZ_KEY && AZ_REGION) {
      const ssml = '<speak version="1.0" xml:lang="uz-UZ" xmlns="http://www.w3.org/2001/10/synthesis"><voice name="' + AZ_VOICE + '"><prosody rate="-4%">' + esc(text) + "</prosody></voice></speak>";
      r = (AZ_URL.startsWith("http:") ? http : https).request(AZ_URL, { method: "POST", headers: { "Ocp-Apim-Subscription-Key": AZ_KEY, "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "tilchi", "Content-Length": Buffer.byteLength(ssml) } }, (up) => relay(up, res, text));
      r.on("error", () => send(res, 502, "{}")); r.end(ssml); return;
    }
    const body = new URLSearchParams({ text, lang: TLANG, voice: VOICE, format: "mp3" }).toString();
    r = https.request("https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize", { method: "POST",
      headers: { Authorization: "Api-Key " + KEY, "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) } },
      (up) => relay(up, res, text));
    r.on("error", () => send(res, 502, "{}")); r.end(body); return;
  }
  const f = FILES[url.pathname];
  if (req.method === "GET" && f) {
    return fs.readFile(path.join(__dirname, f), (err, data) => err ? send(res, 404, "Topilmadi", "text/plain") : send(res, 200, data, MIME[path.extname(f)] || "application/octet-stream"));
  }
  send(res, 404, "Topilmadi", "text/plain");
}).listen(PORT, () => console.log("Tilchi: http://localhost:" + PORT));
