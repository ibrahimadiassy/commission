// Serveur CTC sans dépendance externe (Node 22.5+)
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");
const PORT = process.env.PORT === undefined || process.env.PORT === "" ? 3000 : Number(process.env.PORT);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error("PORT doit être un nombre entier compris entre 1 et 65535.");
const DATA = process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : path.join(__dirname, "data"); fs.mkdirSync(DATA, { recursive: true });
const db = new DatabaseSync(process.env.DB_PATH || path.join(__dirname, "data", "commission.db"));
db.exec("pragma busy_timeout=5000");
db.exec(`create table if not exists users(id integer primary key, name text unique, hash text, role text);
create table if not exists docs(col text, id text, json text, primary key(col,id));
create table if not exists audit(t text, u text, a text, col text, id text);
create table if not exists sessions(tok text primary key, uid integer, exp integer);
create index if not exists sessions_exp on sessions(exp);`);
try { db.prepare("select photo from users limit 1").get(); }
catch { db.exec("alter table users add column photo text"); }
const COLS = ["members", "events", "projects", "ledger", "participations"], ROLES = ["admin", "tresorier", "lecteur"], WRITERS = ["admin", "tresorier"];
const q = (s, ...a) => db.prepare(s).all(...a), one = (s, ...a) => db.prepare(s).get(...a), run = (s, ...a) => db.prepare(s).run(...a);
const transaction = action => {
  db.exec("begin immediate");
  try { const result = action(); db.exec("commit"); return result; }
  catch (error) { db.exec("rollback"); throw error; }
};

const hash = (pw, salt = crypto.randomBytes(16).toString("hex")) => salt + ":" + crypto.scryptSync(pw, salt, 32).toString("hex");
const check = (pw, h) => {
  if (typeof h !== "string" || !/^[a-f0-9]{32}:[a-f0-9]{64}$/i.test(h)) return false;
  const [salt, stored] = h.split(":");
  const actual = Buffer.from(hash(pw, salt).split(":")[1], "hex"), expected = Buffer.from(stored, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};
const idValue = v => typeof v === "string" && /^[A-Za-z0-9]{1,80}$/.test(v);
const text = (v, min, max) => typeof v === "string" && v.trim().length >= min && v.trim().length <= max && !/[\u0000-\u001f\u007f]/.test(v);
const integer = (v, min) => Number.isSafeInteger(v) && v >= min;
const photo = v => v === null || v === "" || typeof v === "string" && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= 1500000;
const date = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
function normalizeSenegalPhone(value) {
  if (typeof value !== "string") return null;
  const input = value.trim();
  if (!input) return "";
  if (!/^\+?[0-9 ().-]+$/.test(input)) return null;
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("00221") && digits.length === 14) digits = digits.slice(5);
  else if (digits.startsWith("221") && digits.length === 12) digits = digits.slice(3);
  if (!/^(?:33|71|70|75|76|77|78)[0-9]{7}$/.test(digits)) return null;
  return `+221 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7)}`;
}

function docError(col, b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return "Les données envoyées sont invalides.";
  if (col === "members") {
    if (!text(b.name, 2, 80)) return "Le nom du membre doit contenir entre 2 et 80 caractères.";
    if (b.tel != null && b.tel !== "") {
      if (!text(b.tel, 1, 24) || normalizeSenegalPhone(b.tel) === null) return "Le téléphone doit être un numéro sénégalais valide : mobile en 71, 70, 75, 76, 77 ou 78, ou fixe en 33, avec 9 chiffres (ex. +221 77 123 45 67).";
    }
    if (b.position != null && b.position !== "" && !text(b.position, 2, 80)) return "La fonction doit contenir entre 2 et 80 caractères.";
    if (b.joined != null && b.joined !== "" && !date(b.joined)) return "La date d’adhésion est invalide.";
    return null;
  }
  if (col === "events") {
    if (!text(b.name, 2, 100)) return "Le nom de l’événement doit contenir entre 2 et 100 caractères.";
    if (!date(b.date)) return "La date de l’événement est invalide.";
    if (!integer(b.amount, 1)) return "La cotisation doit être un montant entier supérieur à 0 FCFA.";
    if (!b.pay || typeof b.pay !== "object" || Array.isArray(b.pay)) return "Les règlements de l’événement sont invalides.";
    for (const [id, payment] of Object.entries(b.pay)) {
      if (!idValue(id) || !payment || typeof payment !== "object" || Array.isArray(payment) || !integer(payment.paid, 0) || payment.paid > b.amount || typeof payment.present !== "boolean") return "Un règlement doit être un montant entier compris entre 0 et la cotisation, avec une présence valide.";
    }
    return null;
  }
  if (col === "projects") {
    if (!text(b.name, 2, 100)) return "Le nom du projet doit contenir entre 2 et 100 caractères.";
    if (!integer(b.price, 1)) return "Le prix de vente doit être un montant entier supérieur à 0 FCFA.";
    if (!integer(b.cost, 0)) return "Le coût d’achat doit être un montant entier positif ou nul.";
    if (!Array.isArray(b.sales)) return "La liste des ventes du projet est invalide.";
    for (const sale of b.sales) {
      if (!sale || typeof sale !== "object" || !idValue(sale.id) || !idValue(sale.mid) || !integer(sale.qty, 1) || !date(sale.date)) return "Chaque vente doit avoir un vendeur, une quantité entière positive et une date valide.";
    }
    return null;
  }
  if (col === "ledger") {
    if (b.type !== "r" && b.type !== "d") return "Choisissez une recette ou une dépense.";
    if (!text(b.label, 2, 140)) return "La désignation doit contenir entre 2 et 140 caractères.";
    if (!date(b.date)) return "La date du mouvement est invalide.";
    if (!integer(b.amount, 1)) return "Le montant doit être un nombre entier supérieur à 0 FCFA.";
  }
  if (col === "participations") {
    const year = new Date().getFullYear();
    if (!integer(b.year, 2000) || b.year > year + 1) return `L’année doit être comprise entre 2000 et ${year + 1}.`;
    if (b.id !== `participation${b.year}`) return "L’identifiant de la participation annuelle est invalide.";
    if (!integer(b.amount, 1)) return "La participation doit être un montant entier supérieur à 0 FCFA.";
    if (!b.pay || typeof b.pay !== "object" || Array.isArray(b.pay)) return "Les versements de la participation sont invalides.";
    for (const [memberId, payments] of Object.entries(b.pay)) {
      if (!idValue(memberId) || !Array.isArray(payments)) return "La liste des versements d’un membre est invalide.";
      const paymentIds = new Set(); let total = 0;
      for (const payment of payments) {
        if (!payment || typeof payment !== "object" || Array.isArray(payment) || !idValue(payment.id) || paymentIds.has(payment.id) || !integer(payment.amount, 1) || !date(payment.date)) return "Chaque versement doit avoir un identifiant unique, un montant positif et une date valide.";
        paymentIds.add(payment.id); total += payment.amount;
        if (!Number.isSafeInteger(total) || total > b.amount) return "Le total versé par un membre ne peut pas dépasser la participation annuelle.";
      }
    }
    return null;
  }
  return null;
}
const tries = new Map();
const limited = ip => {
  const now = Date.now(), attempts = (tries.get(ip) || []).filter(time => now - time < 600000);
  if (attempts.length) tries.set(ip, attempts); else tries.delete(ip);
  return attempts.length >= 10;
};
const failure = ip => { const attempts = tries.get(ip) || []; attempts.push(Date.now()); tries.set(ip, attempts); };
const clearExpiredSessions = () => run("delete from sessions where exp<=?", Date.now());
clearExpiredSessions();
const sessionCleanup = setInterval(() => {
  clearExpiredSessions();
  const now = Date.now();
  for (const [ip, attempts] of tries) {
    const active = attempts.filter(time => now - time < 600000);
    if (active.length) tries.set(ip, active); else tries.delete(ip);
  }
}, 60000);
sessionCleanup.unref();

function session(req) {
  const tok = sessionToken(req);
  if (!tok) return null;
  return one("select u.id,u.name,u.role,u.photo from sessions s join users u on u.id=s.uid where s.tok=? and s.exp>?", tok, Date.now()) || null;
}
const sessionToken = req => /(?:^|; )sid=([a-f0-9]+)/.exec(req.headers.cookie || "")?.[1] || null;
function setSessionCookie(req, res, tok, maxAge) {
  const forwardedProto = req.headers["x-forwarded-proto"]?.split(",")[0].trim().toLowerCase();
  const secure = Boolean(req.socket.encrypted) || process.env.TRUST_PROXY === "1" && forwardedProto === "https";
  const sec = secure ? "; Secure" : "";
  res.setHeader("Set-Cookie", `sid=${tok}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${sec}`);
}
const send = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };
const body = req => new Promise((ok, ko) => {
  const chunks = []; let size = 0, settled = false;
  req.on("data", c => {
    if (settled) return;
    size += c.length;
    if (size > 2e6) { settled = true; const e = new Error("Corps de requête trop volumineux"); e.status = 413; ko(e); req.resume(); return; }
    chunks.push(c);
  });
  req.on("end", () => {
    if (settled) return;
    try {
      const text = Buffer.concat(chunks).toString("utf8"), value = text ? JSON.parse(text) : {};
      if (!value || typeof value !== "object" || Array.isArray(value)) { const e = new Error("Un objet JSON est attendu"); e.status = 400; ko(e); return; }
      ok(value);
    }
    catch { const e = new Error("JSON invalide"); e.status = 400; ko(e); }
  });
  req.on("error", e => { if (!settled) { settled = true; ko(e); } });
});
const log = (u, a, col = "", id = "") => run("insert into audit values(?,?,?,?,?)", new Date().toISOString(), u.name, a, col, id);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x"), p = url.pathname, ip = req.socket.remoteAddress;
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  try {
    if (req.method === "GET" && !p.startsWith("/api/")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(fs.readFileSync(path.join(__dirname, "public", "index.html")));
    }
    if (!p.startsWith("/api/")) return send(res, 404, {});
    if (req.method !== "GET" && !(req.headers["content-type"] || "").split(";")[0].trim().match(/^application\/(?:[\w.+-]+\+)?json$/i) && req.method !== "DELETE") return send(res, 415, { error: "Le type de contenu doit être application/json." });
    const me = session(req);

    if (p === "/api/me") return me ? send(res, 200, me) : send(res, 401, { setup: one("select count(*) n from users").n === 0 });
    if (p === "/api/setup" && req.method === "POST") {
      if (one("select count(*) n from users").n) return send(res, 403, { error: "Déjà configuré" });
      const b = await body(req);
      if (!text(b.name, 2, 80) || typeof b.password !== "string" || b.password.length < 8 || b.password.length > 128 || !photo(b.photo)) return send(res, 400, { error: "Un nom de 2 à 80 caractères, un mot de passe de 8 à 128 caractères et une photo valide sont requis." });
      const name = b.name.trim(), passwordHash = hash(b.password);
      const tok = crypto.randomBytes(32).toString("hex");
      const r = transaction(() => {
        if (one("select count(*) n from users").n) return null;
        const created = run("insert into users(name,hash,role,photo) values(?,?,?,?)", name, passwordHash, "admin", b.photo || null);
        run("insert into sessions values(?,?,?)", tok, created.lastInsertRowid, Date.now() + 7 * 864e5);
        log({ name }, "initialiser espace", "users", name);
        return created;
      });
      if (!r) return send(res, 403, { error: "Déjà configuré" });
      setSessionCookie(req, res, tok, 604800); return send(res, 200, { ok: 1 });
    }
    if (p === "/api/login" && req.method === "POST") {
      if (limited(ip)) return send(res, 429, { error: "Trop d’essais. Réessayez dans 10 minutes." });
      const b = await body(req), name = typeof b.name === "string" ? b.name.trim() : "", password = typeof b.password === "string" ? b.password : "", u = one("select * from users where name=?", name);
      if (!u || password.length > 128 || !check(password, u.hash)) { failure(ip); return send(res, 401, { error: "Nom ou mot de passe incorrect" }); }
      tries.delete(ip);
      const tok = crypto.randomBytes(32).toString("hex");
      transaction(() => { run("insert into sessions values(?,?,?)", tok, u.id, Date.now() + 7 * 864e5); log(u, "connexion"); });
      setSessionCookie(req, res, tok, 604800); return send(res, 200, { ok: 1 });
    }
    if (p === "/api/logout" && req.method === "POST") {
      transaction(() => run("delete from sessions where tok=?", /(?:^|; )sid=([a-f0-9]+)/.exec(req.headers.cookie || "")?.[1] || ""));
      setSessionCookie(req, res, "", 0);
      return send(res, 200, {});
    }
    if (!me) return send(res, 401, {});

    if (p === "/api/me/photo" && req.method === "POST") {
      const b = await body(req);
      if (!photo(b.photo)) return send(res, 400, { error: "La photo doit être une image JPEG, PNG ou WebP valide." });
      transaction(() => {
        run("update users set photo=? where id=?", b.photo || null, me.id);
        log(me, b.photo ? "modifier photo de profil" : "supprimer photo de profil", "users", me.name);
      });
      return send(res, 200, { photo: b.photo || null });
    }
    if (p === "/api/me/password" && req.method === "POST") {
      const b = await body(req);
      if (typeof b.currentPassword !== "string" || b.currentPassword.length > 128 || typeof b.newPassword !== "string" || b.newPassword.length < 8 || b.newPassword.length > 128) {
        return send(res, 400, { error: "Le mot de passe actuel est requis et le nouveau doit contenir entre 8 et 128 caractères." });
      }
      const tok = sessionToken(req);
      const result = transaction(() => {
        const account = one("select hash,name from users where id=?", me.id);
        if (!account || !check(b.currentPassword, account.hash)) return { status: 401, error: "Le mot de passe actuel est incorrect." };
        run("update users set hash=? where id=?", hash(b.newPassword), me.id);
        run("delete from sessions where uid=? and tok<>?", me.id, tok);
        log(me, "modifier mot de passe", "users", account.name);
        return { ok: 1 };
      });
      return result.error ? send(res, result.status, { error: result.error }) : send(res, 200, { ok: 1 });
    }

    if (p === "/api/state") {
      const s = {}; COLS.forEach(c => s[c] = q("select json from docs where col=?", c).map(r => JSON.parse(r.json)));
      return send(res, 200, s);
    }
    let annualRoute = /^\/api\/participations\/(\d{4})(?:\/payments(?:\/([A-Za-z0-9]{1,80}))?)?$/.exec(p);
    if (annualRoute) {
      if (!WRITERS.includes(me.role)) return send(res, 403, { error: "Droits insuffisants" });
      const year = +annualRoute[1], id = `participation${year}`;
      if (year < 2000 || year > new Date().getFullYear() + 1) return send(res, 400, { error: "Année de participation invalide." });
      const current = one("select json from docs where col='participations' and id=?", id);
      if (!current) return send(res, 404, { error: `Aucune participation enregistrée pour ${year}.` });
      if (p.includes("/payments") && req.method === "POST") {
        if (annualRoute[2]) return send(res, 404, {});
        const b = await body(req), memberId = b.memberId;
        if (!idValue(memberId) || !integer(b.amount, 1) || !date(b.date)) return send(res, 400, { error: "Indiquez un membre, un montant entier positif et une date valide." });
        const member = one("select json from docs where col='members' and id=?", memberId);
        if (!member) return send(res, 404, { error: "Ce membre n’existe plus dans la liste de la commission." });
        const result = transaction(() => {
          const stored = one("select json from docs where col='participations' and id=?", id);
          if (!stored) return { status: 404, error: `Aucune participation enregistrée pour ${year}.` };
          const participation = JSON.parse(stored.json), payments = participation.pay[memberId] || [];
          const paid = payments.reduce((total, payment) => total + payment.amount, 0), remaining = participation.amount - paid;
          if (b.amount > remaining) return { status: 400, error: `Le versement dépasse le solde de ${remaining} FCFA pour ce membre.` };
          payments.push({ id: crypto.randomBytes(8).toString("hex"), amount: b.amount, date: b.date });
          participation.pay[memberId] = payments;
          run("update docs set json=? where col='participations' and id=?", JSON.stringify(participation), id);
          log(me, "enregistrer versement", "participations", `Participation ${year} – ${JSON.parse(member.json).name} – ${b.amount} FCFA`);
          return { participation };
        });
        return result.error ? send(res, result.status, { error: result.error }) : send(res, 200, { participation: result.participation });
      }
      if (p.includes("/payments/") && req.method === "DELETE") {
        const b = await body(req), memberId = b.memberId, paymentId = annualRoute[2];
        if (!idValue(memberId)) return send(res, 404, { error: "Versement introuvable." });
        const result = transaction(() => {
          const stored = one("select json from docs where col='participations' and id=?", id);
          if (!stored) return { status: 404, error: "Versement introuvable." };
          const participation = JSON.parse(stored.json), payments = participation.pay[memberId];
          if (!Array.isArray(payments) || !payments.some(payment => payment.id === paymentId)) return { status: 404, error: "Versement introuvable." };
          participation.pay[memberId] = payments.filter(payment => payment.id !== paymentId);
          if (!participation.pay[memberId].length) delete participation.pay[memberId];
          run("update docs set json=? where col='participations' and id=?", JSON.stringify(participation), id);
          log(me, "supprimer versement", "participations", `Participation ${year} – ${paymentId}`);
          return { participation };
        });
        return result.error ? send(res, result.status, { error: result.error }) : send(res, 200, { participation: result.participation });
      }
      if (p === `/api/participations/${year}` && req.method === "DELETE") {
        transaction(() => {
          run("delete from docs where col='participations' and id=?", id);
          log(me, "supprimer", "participations", `Participation annuelle ${year}`);
        });
        return send(res, 200, {});
      }
      return send(res, 404, {});
    }
    let m = /^\/api\/doc\/(\w+)\/(\w+)$/.exec(p);
    if (m) {
      if (!COLS.includes(m[1])) return send(res, 400, {});
      if (!idValue(m[2])) return send(res, 400, { error: "Identifiant de fiche invalide." });
      if (!WRITERS.includes(me.role)) return send(res, 403, { error: "Droits insuffisants" });
      if (req.method === "PUT") {
        const b = await body(req); b.id = m[2];
        const error = docError(m[1], b);
        if (error) return send(res, 400, { error });
        if (m[1] === "members") b.tel = normalizeSenegalPhone(b.tel ?? "");
        const result = transaction(() => {
          if (m[1] === "participations") {
            const current = one("select json from docs where col=? and id=?", m[1], m[2]);
            if (current) {
              const previous = JSON.parse(current.json);
              if (previous.year !== b.year || previous.amount !== b.amount) return { status: 400, error: "L’année et le montant d’une participation déjà créée ne peuvent pas être modifiés. Supprimez-la explicitement pour la recréer." };
              if (JSON.stringify(previous.pay) !== JSON.stringify(b.pay)) return { status: 400, error: "Utilisez les actions de versement pour modifier l’historique de paiement." };
            }
            const duplicate = q("select id,json from docs where col=?", m[1]).some(row => row.id !== m[2] && JSON.parse(row.json).year === b.year);
            if (duplicate) return { status: 409, error: `Une participation pour ${b.year} existe déjà.` };
          }
          run("insert or replace into docs values(?,?,?)", m[1], m[2], JSON.stringify(b));
          log(me, "enregistrer", m[1], b.name || b.label || (b.year ? `Participation annuelle ${b.year}` : m[2]));
          return {};
        });
        return result.error ? send(res, result.status, { error: result.error }) : send(res, 200, {});
      }
      if (req.method === "DELETE") {
        transaction(() => {
          const o = one("select json from docs where col=? and id=?", m[1], m[2]);
          run("delete from docs where col=? and id=?", m[1], m[2]);
          const doc = o ? JSON.parse(o.json) : null;
          log(me, "supprimer", m[1], doc ? (doc.name || doc.label || (doc.year ? `Participation annuelle ${doc.year}` : m[2])) : m[2]);
        });
        return send(res, 200, {});
      }
    }
    if (p === "/api/users" || /^\/api\/users\/\d+$/.test(p) || p === "/api/audit") {
      if (me.role !== "admin") return send(res, 403, { error: "Réservé à l’administrateur" });
      if (p === "/api/audit" && req.method === "GET") return send(res, 200, q("select * from audit order by t desc limit 200"));
      if (p === "/api/users" && req.method === "GET") return send(res, 200, q("select id,name,role,photo from users"));
      if (p === "/api/users" && req.method === "POST") {
        const b = await body(req);
        if (!text(b.name, 2, 80) || typeof b.password !== "string" || b.password.length < 8 || b.password.length > 128 || !ROLES.includes(b.role) || !photo(b.photo)) return send(res, 400, { error: "Un nom de 2 à 80 caractères, un rôle, un mot de passe de 8 à 128 caractères et une photo valide sont requis." });
        const name = b.name.trim(), passwordHash = hash(b.password);
        const created = transaction(() => {
          if (one("select id from users where name=?", name)) return false;
          run("insert into users(name,hash,role,photo) values(?,?,?,?)", name, passwordHash, b.role, b.photo || null);
          log(me, "créer utilisateur", "users", name);
          return true;
        });
        return created ? send(res, 200, {}) : send(res, 409, { error: "Ce nom existe déjà" });
      }
      m = /^\/api\/users\/(\d+)$/.exec(p);
      if (m && req.method === "DELETE") {
        if (+m[1] === me.id) return send(res, 400, { error: "Impossible de vous supprimer" });
        transaction(() => {
          run("delete from users where id=?", +m[1]);
          run("delete from sessions where uid=?", +m[1]);
          log(me, "supprimer utilisateur", "users", m[1]);
        });
        return send(res, 200, {});
      }
    }
    send(res, 404, {});
  } catch (e) {
    console.error("Erreur de traitement de la requête :", e);
    if (res.headersSent) return res.destroy();
    const status = e.status === 400 || e.status === 413 ? e.status : 500;
    send(res, status, { error: status === 413 ? e.message : status === 400 ? e.message : "Une erreur est survenue. Réessayez." });
  }
});
server.listen(PORT, () => console.log("Commission Trésorerie et Capacitation (CTC) sur http://localhost:" + PORT));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    clearInterval(sessionCleanup);
    server.close(() => db.close());
  });
}
