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
  }
  send(res, 404, "Topilmadi", "text/plain");
}).listen(PORT, () => console.log("Tilchi: http://localhost:" + PORT));
