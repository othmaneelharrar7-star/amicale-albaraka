// Connecteur MCP de l'Amicale Albaraka.
// Serveur MCP « Streamable HTTP » sans dépendance, pour Cloudflare Workers.
// Il lit la base Firestore de l'application avec un compte du bureau dédié, et peut
// ajouter ou modifier des adhérents, paiements, chèques et pièces jointes (jamais de suppression).
//
// Secrets (Cloudflare) : MCP_TOKEN, FB_EMAIL, FB_PASSWORD
// Variables (wrangler.toml) : FB_API_KEY, FB_PROJECT_ID

const PRE = "am_";
const SERVER = { name: "amicale-albaraka", title: "Amicale Albaraka", version: "1.1.0" };
const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const CHQ_ST = { attente: "En attente", remis: "Remis à la banque", encaisse: "Encaissé", impaye: "Impayé" };

/* ---------------- Firebase (REST, lecture seule) ---------------- */
let tokenCache = null; // {id, exp}
async function idToken(env) {
  if (tokenCache && tokenCache.exp > Date.now() + 60000) return tokenCache.id;
  const r = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + encodeURIComponent(env.FB_API_KEY), {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: env.FB_EMAIL, password: env.FB_PASSWORD, returnSecureToken: true })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.idToken) throw new Error("Connexion à Firebase impossible (" + ((j.error && j.error.message) || r.status) + "). Vérifiez FB_EMAIL et FB_PASSWORD.");
  tokenCache = { id: j.idToken, exp: Date.now() + (Number(j.expiresIn) || 3600) * 1000 };
  return j.idToken;
}
function fsVal(v) {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) return fsMap(v.mapValue.fields || {});
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fsVal);
  return null; // bytes, références : ignorés
}
function fsMap(f) { const o = {}; for (const k in f) o[k] = fsVal(f[k]); return o; }
async function listCol(env, tok, col) {
  const out = []; let page = "";
  const base = "https://firestore.googleapis.com/v1/projects/" + env.FB_PROJECT_ID + "/databases/(default)/documents/" + PRE + col + "?pageSize=300";
  for (let i = 0; i < 50; i++) {
    const r = await fetch(base + (page ? "&pageToken=" + encodeURIComponent(page) : ""), { headers: { authorization: "Bearer " + tok } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error("Lecture de « " + col + " » impossible (" + ((j.error && j.error.message) || r.status) + ").");
    (j.documents || []).forEach(d => { const o = fsMap(d.fields || {}); o.id = d.name.split("/").pop(); out.push(o); });
    if (!j.nextPageToken) break; page = j.nextPageToken;
  }
  return out;
}
async function loadAll(env) {
  const tok = await idToken(env);
  const cols = ["projets", "adherents", "paiements", "cheques", "factures", "phases", "journal", "documents"];
  const res = await Promise.all(cols.map(c => listCol(env, tok, c)));
  const s = {}; cols.forEach((c, i) => s[c] = res[i]);
  return s;
}

/* ---------------- écriture (REST) ---------------- */
const FS_BASE = env => "https://firestore.googleapis.com/v1/projects/" + env.FB_PROJECT_ID + "/databases/(default)/documents/";
function fsEnc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Uint8Array) { let t = ""; for (let i = 0; i < v.length; i += 0x8000) t += String.fromCharCode.apply(null, v.subarray(i, i + 0x8000)); return { bytesValue: btoa(t) }; }
  if (typeof v === "object" && v.__bytes) return { bytesValue: v.__bytes };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fsEnc) } };
  if (typeof v === "object") { const f = {}; for (const k in v) f[k] = fsEnc(v[k]); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
}
/* écrit seulement les champs donnés (les autres champs du document, dont « src », sont gardés) */
async function fsSet(env, col, id, data) {
  const tok = await idToken(env), keys = Object.keys(data);
  const fields = {}; keys.forEach(k => fields[k] = fsEnc(data[k]));
  const mask = keys.map(k => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&");
  const r = await fetch(FS_BASE(env) + PRE + col + "/" + encodeURIComponent(id) + "?" + mask, { method: "PATCH", headers: { authorization: "Bearer " + tok, "content-type": "application/json" }, body: JSON.stringify({ fields }) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error("Écriture dans « " + col + " » impossible (" + ((j.error && j.error.message) || r.status) + ")."); }
}
function newId() { const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", b = crypto.getRandomValues(new Uint8Array(20)); let t = ""; b.forEach(x => t += c[x % 62]); return t; }
const nowIso = () => new Date().toISOString();
function numArg(v, label) {
  if (v === undefined || v === null || v === "") return undefined;
  const x = typeof v === "number" ? v : parseFloat(String(v).replace(/[\s ]/g, "").replace(",", "."));
  if (!isFinite(x) || x < 0) throw new Error("« " + label + " » doit être un nombre positif.");
  return Math.round(x * 100) / 100;
}
function dateArg(v) {
  if (!v) return today();
  const t = String(v).trim(); let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (m) return t;
  m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (m) return (m[3].length === 2 ? "20" + m[3] : m[3]) + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
  throw new Error("Date illisible : « " + t + " » (format JJ/MM/AAAA ou AAAA-MM-JJ).");
}
const lotKey = v => norm(v).replace(/[\s.\-_]/g, "");
function findAdh(s, a) {
  if (!a.lot && !a.nom) throw new Error("Indiquez le lot (ex. C15) ou le nom de l'adhérent.");
  const p = findProj(s, a.projet); if (!p) throw new Error("Indiquez le projet.");
  let l = s.adherents.filter(x => x.projet === p.id);
  if (a.partie) { const t = norm(a.partie); l = l.filter(x => norm(x.section) === t || norm(x.section).includes(t)); }
  if (a.lot) { const k = lotKey(a.lot); l = l.filter(x => lotKey(x.lot) === k); }
  if (a.nom && (!a.lot || l.length > 1)) { const t = norm(a.nom); const l2 = l.filter(x => norm(x.nom).includes(t)); if (l2.length || !a.lot) l = l2; }
  if (!l.length) throw new Error("Aucun lot « " + (a.lot || a.nom) + " » dans " + p.nom + (a.partie ? " · " + a.partie : "") + ". Utilisez ajouter_adherent pour un nouveau lot.");
  if (l.length > 1) throw new Error("Plusieurs lots correspondent, précisez la partie : " + l.map(x => x.lot + " (" + (x.section || "sans partie") + ", " + (x.nom || "disponible") + ")").join(" ; "));
  return { p, x: l[0] };
}
const ADH_FIELDS = { nom: "s", tel: "s", etage: "s", immeuble: "s", note: "s", banque: "s", refCheque: "s", surface: "n", prixM2: "n", prix: "n", avance: "n", dejaPaye: "n", tranches: "n", montantT60: "n" };
function adhData(a, old) {
  const d = {};
  for (const k in ADH_FIELDS) { if (a[k] === undefined || a[k] === null) continue; d[k] = ADH_FIELDS[k] === "n" ? numArg(a[k], k) : String(a[k]).trim(); }
  const sf = d.surface !== undefined ? d.surface : n(old && old.surface), m2 = d.prixM2 !== undefined ? d.prixM2 : n(old && old.prixM2);
  /* mêmes calculs que la fiche de l'application : surface × prix au m² = prix ; avance = 40 % du prix */
  if (d.prix === undefined && d.avance !== undefined && d.prixM2 === undefined && d.surface === undefined && d.avance > 0) d.prix = Math.round(d.avance / 0.4);
  if (d.prix === undefined && (d.surface !== undefined || d.prixM2 !== undefined) && sf > 0 && m2 > 0) d.prix = Math.round(sf * m2);
  if (d.prix !== undefined && d.prixM2 === undefined && sf > 0 && d.prix > 0) d.prixM2 = Math.round(d.prix / sf * 100) / 100;
  if (d.avance === undefined && d.prix > 0) d.avance = Math.round(d.prix * 0.4);
  return d;
}
const adhLine = (s, x, d) => (d.nom !== undefined ? d.nom : x.nom || "Lot disponible") + " · lot " + x.lot + " · " + pName(s, x.projet) + (x.section ? " · " + x.section : "");
function changes(old, d) { return Object.keys(d).map(k => "- " + k + " : " + (old[k] === undefined || old[k] === "" ? "—" : old[k]) + " → " + d[k]).join("\n"); }
const FILE_COLS = { paiement: "paiements", adherent: "adherents", cheque: "cheques", facture: "factures", document: "documents", journal: "journal" };
const MAX_FILE = 950 * 1024;
async function hmac(env, txt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("upload:" + env.MCP_TOKEN), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(txt)));
  return Array.from(sig, b => b.toString(16).padStart(2, "0")).join("");
}
async function storeFile(env, col, id, name, type, bytes) {
  if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(type)) throw new Error("Format non accepté : " + type + " (JPG, PNG, WEBP ou PDF).");
  if (!bytes.length) throw new Error("Fichier vide.");
  if (bytes.length > MAX_FILE) throw new Error("Fichier trop lourd (" + Math.round(bytes.length / 1024) + " Ko) : 950 Ko maximum. Réduisez la photo.");
  const fid = newId();
  await fsSet(env, "fichiers", fid, { name, type, size: bytes.length, data: bytes, createdAt: nowIso() });
  await fsSet(env, col, id, { fileId: fid, fileName: name, fileType: type });
  return fid;
}
function b64ToBytes(b) { const t = atob(String(b).replace(/^data:[^,]*,/, "").replace(/\s/g, "")); const u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u; }

const WRITE_FN = {
  async modifier_adherent(s, a, env) {
    if (a.deplacer_vers) return WRITE_FN.deplacer_adherent(s, a, env);
    const { x } = findAdh(s, a), d = adhData(a, x);
    if (!Object.keys(d).length) throw new Error("Rien à modifier : donnez au moins un champ (nom, tel, surface, prixM2, prix, avance, note…).");
    await fsSet(env, "adherents", x.id, d);
    return "✅ Fiche modifiée : " + adhLine(s, x, d) + "\n" + changes(x, d);
  },
  /* change d'adhérent de lot : nom, montants déjà payés, pièce jointe et paiements passent sur le lot libre « deplacer_vers » ;
     l'ancien lot redevient DISPONIBLE (ses caractéristiques et son lien avec le fichier Excel restent) */
  async deplacer_adherent(s, a, env) {
    const { p, x } = findAdh(s, a);
    if (isFree(x)) throw new Error("Le lot " + x.lot + " est déjà disponible : rien à déplacer.");
    const { x: y } = findAdh(s, { projet: a.projet, partie: a.partie_dest || a.partie, lot: a.deplacer_vers });
    if (y.id === x.id) throw new Error("Même lot.");
    if (!isFree(y)) throw new Error("Le lot " + y.lot + " est attribué à " + y.nom + " : libérez-le d'abord.");
    const MOVE = ["nom", "tel", "dejaPaye", "dejaPayeParts", "tranches", "refCheque", "banque", "fileId", "fileName", "fileType", "montantT60"];
    const to = {}, clear = {};
    MOVE.forEach(k => { const v = x[k]; to[k] = v === undefined ? (k === "dejaPaye" || k === "tranches" || k === "montantT60" ? 0 : k === "dejaPayeParts" || k === "fileId" ? null : "") : v; clear[k] = typeof to[k] === "number" ? 0 : (k === "dejaPayeParts" || k === "fileId" ? null : ""); });
    if (a.note_dest !== undefined) to.note = String(a.note_dest);
    await fsSet(env, "adherents", y.id, to);
    const pays = s.paiements.filter(q => q.adherentId === x.id);
    for (const q of pays) await fsSet(env, "paiements", q.id, { adherentId: y.id });
    await fsSet(env, "adherents", x.id, clear);
    const paid = paidOf(s, x);
    return "✅ " + x.nom + " déplacé du lot " + x.lot + " vers le lot " + y.lot + " (" + p.nom + ")\n- " + pays.length + " paiement(s) déplacé(s), déjà payé " + dh(x.dejaPaye) + " · total payé " + dh(paid)
      + "\n- Lot " + y.lot + " : prix " + dh(y.prix) + (n(y.avance) ? " · avance exigée " + dh(y.avance) : "") + " · reste " + dh(Math.max(0, n(y.prix) - paid))
      + "\n- Lot " + x.lot + " : maintenant DISPONIBLE";
  },
  async ajouter_adherent(s, a, env) {
    const p = findProj(s, a.projet); if (!p) throw new Error("Indiquez le projet.");
    if (!a.lot) throw new Error("Indiquez le lot ou l'appartement.");
    const secs = String(p.sections || "").split(",").map(x => x.trim()).filter(Boolean);
    let sec = "";
    if (a.partie) { sec = secs.find(x => norm(x) === norm(a.partie)) || secs.find(x => norm(x).includes(norm(a.partie))) || ""; if (!sec) throw new Error("Partie inconnue : « " + a.partie + " ». Parties de " + p.nom + " : " + secs.join(", ")); }
    else if (secs.length) throw new Error("Précisez la partie : " + secs.join(", "));
    const same = s.adherents.find(x => x.projet === p.id && (x.section || "") === sec && lotKey(x.lot) === lotKey(a.lot));
    if (same && !isFree(same)) throw new Error("Le lot " + same.lot + " est déjà attribué à " + same.nom + ". Utilisez modifier_adherent.");
    const d = adhData(a, same || {});
    if (!(d.prix || (same && same.prix))) throw new Error("Indiquez le prix total, ou le prix au m² et la surface.");
    if (same) { await fsSet(env, "adherents", same.id, d); return "✅ Lot disponible attribué : " + adhLine(s, same, d) + "\n" + changes(same, d); }
    const id = newId(), full = Object.assign({ projet: p.id, section: sec, lot: String(a.lot).trim(), nom: "", tel: "", etage: "", immeuble: "", surface: 0, prixM2: 0, prix: 0, avance: 0, dejaPaye: 0, tranches: 0, refCheque: "", banque: "", note: "" }, d, { createdAt: nowIso() });
    await fsSet(env, "adherents", id, full);
    return "✅ Adhérent ajouté : " + adhLine(s, full, d) + " · prix " + dh(full.prix) + " (id " + id + ")";
  },
  async ajouter_paiement(s, a, env) {
    const { p, x } = findAdh(s, a);
    if (isFree(x)) throw new Error("Le lot " + x.lot + " est disponible (sans adhérent) : ajoutez d'abord le nom avec modifier_adherent.");
    const montant = numArg(a.montant, "montant"); if (!montant) throw new Error("Indiquez le montant.");
    const mode = a.mode ? (["Chèque", "Virement", "Espèces"].find(m => norm(m) === norm(a.mode)) || String(a.mode)) : (a.reference ? "Chèque" : "");
    const d = { adherentId: x.id, projet: p.id, date: dateArg(a.date), montant, tranche: numArg(a.tranche, "tranche") || 0, mode, reference: String(a.reference || ""), banque: String(a.banque || ""), note: String(a.note || ""), createdAt: nowIso() };
    const id = newId(); await fsSet(env, "paiements", id, d);
    const paid = paidOf(s, x) + montant;
    return "✅ Paiement enregistré (id " + id + ") : " + dh(montant) + " le " + fdate(d.date) + " · " + [mode, d.reference && "N° " + d.reference, d.banque].filter(Boolean).join(" · ") + "\nAdhérent : " + adhLine(s, x, {}) + "\nTotal payé : " + dh(paid) + " / " + dh(x.prix) + " · reste " + dh(Math.max(0, n(x.prix) - paid))
      + (n(x.avance) ? " · avance exigée " + dh(x.avance) + (paid >= n(x.avance) ? " (atteinte)" : " (manque " + dh(n(x.avance) - paid) + ")") : "")
      + "\nPour joindre la photo du chèque : joindre_fichier avec cible « paiement » et id « " + id + " ».";
  },
  async ajouter_cheque(s, a, env) {
    const p = findProj(s, a.projet); if (!p) throw new Error("Indiquez le projet.");
    const montant = numArg(a.montant, "montant"); if (!montant || !a.numero) throw new Error("Indiquez le numéro et le montant du chèque.");
    const d = { projet: p.id, sens: a.sens === "emis" ? "emis" : "recu", numero: String(a.numero), montant, banque: String(a.banque || ""), date: a.date ? dateArg(a.date) : "", tiers: String(a.tiers || ""), statut: ["attente", "remis", "encaisse", "impaye"].includes(a.statut) ? a.statut : "attente", section: String(a.partie || ""), note: String(a.note || ""), createdAt: nowIso() };
    const id = newId(); await fsSet(env, "cheques", id, d);
    return "✅ Chèque enregistré (id " + id + ") : N° " + d.numero + " · " + dh(montant) + " · " + (d.sens === "emis" ? "émis" : "reçu") + " · " + CHQ_ST[d.statut];
  },
  async joindre_fichier(s, a, env, origin) {
    const col = FILE_COLS[a.cible]; if (!col) throw new Error("cible : " + Object.keys(FILE_COLS).join(", "));
    const item = (s[col] || []).find(x => x.id === a.id); if (!item) throw new Error("Aucun élément « " + a.id + " » dans " + col + ".");
    const type = String(a.type || "image/jpeg"), name = String(a.nom_fichier || ("piece-" + today() + (type === "application/pdf" ? ".pdf" : ".jpg"))).replace(/[\/\\]/g, "-");
    if (a.base64) { const fid = await storeFile(env, col, item.id, name, type, b64ToBytes(a.base64)); return "✅ Fichier « " + name + " » joint (" + fid + ")."; }
    const exp = Date.now() + 30 * 60000, path = col + "/" + item.id + "/" + exp;
    const sig = await hmac(env, path + "/" + name + "/" + type);
    return "Adresse d'envoi (valable 30 min, un seul fichier ≤ 950 Ko) :\n" + origin + "/up/" + path + "/" + sig + "?name=" + encodeURIComponent(name) + "&type=" + encodeURIComponent(type)
      + "\nEnvoyez le fichier brut en POST, par ex. : curl -X POST --data-binary @photo.jpg \"<adresse>\"";
  }
};
async function upload(req, env, parts, url) {
  const [, col, id, exp, sig] = parts, name = url.searchParams.get("name") || "piece.jpg", type = url.searchParams.get("type") || "image/jpeg";
  if (req.method !== "POST" || parts.length !== 5 || !Object.values(FILE_COLS).includes(col) || !/^\d+$/.test(exp || "")) return new Response("Not found", { status: 404 });
  if (Number(exp) < Date.now()) return json({ error: "Adresse expirée : redemandez joindre_fichier." }, 410);
  if (!safeEq(sig, await hmac(env, col + "/" + id + "/" + exp + "/" + name + "/" + type))) return new Response("Not found", { status: 404 });
  try { const fid = await storeFile(env, col, id, name, type, new Uint8Array(await req.arrayBuffer())); return json({ ok: true, fileId: fid, message: "Fichier « " + name + " » joint." }); }
  catch (e) { return json({ ok: false, error: String(e && e.message || e) }, 400); }
}

/* ---------------- calculs (mêmes règles que l'application) ---------------- */
const n = v => { const x = Number(v); return isFinite(x) ? x : 0; };
const sum = (l, k) => l.reduce((t, x) => t + n(x[k || "montant"]), 0);
const num = v => Math.round(n(v)).toLocaleString("fr-FR").replace(/ | /g, " ");
const dh = v => num(v) + " DH";
const pct = (a, b) => b > 0 ? Math.min(100, Math.round(a / b * 100)) : 0;
const fdate = d => /^\d{4}-\d{2}-\d{2}/.test(String(d || "")) ? String(d).slice(8, 10) + "/" + String(d).slice(5, 7) + "/" + String(d).slice(0, 4) : (d || "");
const today = () => new Date().toISOString().slice(0, 10);
const days = d => Math.round((new Date(String(d).slice(0, 10) + "T00:00:00Z") - new Date(today() + "T00:00:00Z")) / 864e5);
const norm = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const isFree = a => !String(a.nom || "").trim();
function etageRank(e) { const t = String(e || "").toLowerCase(); if (!t.trim()) return 999; if (/rdc|rez|^0/.test(t)) return 0; if (/sous|ss/.test(t)) return -1; const m = t.match(/\d+/); return m ? +m[0] : 500; }
const lotSort = (x, y) => etageRank(x.etage) - etageRank(y.etage) || String(x.immeuble || "").localeCompare(String(y.immeuble || ""), "fr", { numeric: true }) || String(x.lot || "").localeCompare(String(y.lot || ""), "fr", { numeric: true });
const paysOf = (s, a) => s.paiements.filter(p => p.adherentId === a.id).sort((x, y) => String(x.date || "").localeCompare(String(y.date || "")));
const paidOf = (s, a) => n(a.dejaPaye) + sum(paysOf(s, a));
function trancheOf(s, a) { let v = Math.round(n(a.tranches)); paysOf(s, a).forEach(p => { const t = Math.round(n(p.tranche)); if (t > 0) v = Math.max(v, t); else v += 1; }); return v; }
function facStatus(f) { const m = n(f.montant), p = n(f.paye); if (!(f.valP && f.valT)) return "À valider"; if (m > 0 && p >= m) return "Payée"; if (p > 0) return "Partielle"; return "À payer"; }
const projets = s => s.projets.slice().sort((a, b) => (n(a.ordre) || 999) - (n(b.ordre) || 999) || String(a.nom || "").localeCompare(String(b.nom || ""), "fr"));
const pName = (s, id) => (s.projets.find(p => p.id === id) || {}).nom || "";
function findProj(s, name) {
  if (!name) return null;
  const k = v => norm(v).replace(/[^a-z0-9]/g, ""), t = k(name), l = projets(s);
  const p = t && (l.find(x => k(x.nom) === t) || l.find(x => k(x.nom).includes(t) || t.includes(k(x.nom))));
  if (!p) throw new Error("Projet introuvable : « " + name + " ». Projets : " + l.map(x => x.nom).join(", "));
  return p;
}
const cell = v => String(v == null ? "" : v).replace(/\|/g, "/").replace(/\n/g, " ");
const table = (head, rows) => rows.length ? ["| " + head.join(" | ") + " |", "|" + head.map(() => "---").join("|") + "|"].concat(rows.map(r => "| " + r.map(cell).join(" | ") + " |")).join("\n") : "(aucun)";
function projStats(s, p) {
  const ad = s.adherents.filter(a => a.projet === p.id), sold = ad.filter(a => !isFree(a));
  const tp = sum(sold, "prix"), pd = sold.reduce((t, a) => t + paidOf(s, a), 0);
  return { ad, sold, free: ad.length - sold.length, tp, pd, rest: Math.max(0, tp - pd) };
}

/* ---------------- outils ---------------- */
const P_PROJ = { type: "string", description: "Nom du projet (ex. Sid El Abed, Val d'Or, Casino 1). Facultatif : tous les projets si absent." };
const TOOLS = [
  { name: "resume_general", title: "Résumé général",
    description: "Vue d'ensemble de l'Amicale : pour chaque projet le nombre d'adhérents, lots libres, prix total, montant payé, reste et pourcentage encaissé, plus les points à surveiller (chèques impayés ou à échéance, factures à payer, documents qui expirent).",
    inputSchema: { type: "object", properties: {} } },
  { name: "lister_adherents", title: "Lister les adhérents",
    description: "Liste des adhérents et des lots d'un projet avec appartement, étage, immeuble, partie, nom, téléphone, surface, prix, avance exigée, montant payé, reste et tranche atteinte. Filtres possibles.",
    inputSchema: { type: "object", properties: {
      projet: { type: "string", description: "Nom du projet" },
      partie: { type: "string", description: "Partie du projet (ex. Résidence 1, Commerce)" },
      recherche: { type: "string", description: "Texte à chercher dans le nom, le lot ou le téléphone" },
      filtre: { type: "string", enum: ["tous", "avance_non_atteinte", "reste_a_payer", "solde", "disponibles"], description: "tous (défaut), avance_non_atteinte, reste_a_payer, solde (tout payé), disponibles (lots libres)" }
    }, required: ["projet"] } },
  { name: "fiche_adherent", title: "Fiche d'un adhérent",
    description: "Fiche détaillée d'un adhérent (retrouvé par son lot ou son nom) avec tous ses paiements.",
    inputSchema: { type: "object", properties: { projet: P_PROJ, lot: { type: "string" }, nom: { type: "string" } } } },
  { name: "lister_paiements", title: "Lister les paiements",
    description: "Paiements saisis dans l'application (date, adhérent, lot, montant, tranche, mode, référence), filtrables par projet et par période.",
    inputSchema: { type: "object", properties: { projet: P_PROJ, depuis: { type: "string", description: "Date AAAA-MM-JJ" }, jusqua: { type: "string", description: "Date AAAA-MM-JJ" } } } },
  { name: "lister_cheques", title: "Lister les chèques",
    description: "Chèques reçus des adhérents ou émis aux fournisseurs, avec numéro, montant, banque, échéance, tiers et statut.",
    inputSchema: { type: "object", properties: { projet: P_PROJ, sens: { type: "string", enum: ["recu", "emis"] }, statut: { type: "string", enum: ["attente", "remis", "encaisse", "impaye"] } } } },
  { name: "lister_factures", title: "Lister les factures",
    description: "Factures et dépenses (fournisseur, n°, poste, montant, payé, reste, statut et validations Président/Trésorier), avec totaux par poste.",
    inputSchema: { type: "object", properties: { projet: P_PROJ, statut: { type: "string", enum: ["À valider", "À payer", "Partielle", "Payée"] } } } },
  { name: "suivi_travaux", title: "Suivi des travaux",
    description: "Avancement des phases de travaux (%) et dernières entrées du journal de chantier d'un projet.",
    inputSchema: { type: "object", properties: { projet: P_PROJ } } },
  { name: "lister_documents", title: "Lister les documents",
    description: "Documents juridiques et administratifs d'un projet ou de l'association, avec catégorie, date et date d'expiration.",
    inputSchema: { type: "object", properties: { projet: { type: "string", description: "Nom du projet, ou « association » pour les documents de l'association. Tous si absent." } } } }
].map(t => Object.assign(t, { annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }));
const P_ADH = { projet: { type: "string", description: "Nom du projet (ex. Val d'Or)" }, partie: { type: "string", description: "Partie du projet si besoin (Appartements, Résidence 1, Résidence 2, Commerce…)" }, lot: { type: "string", description: "Appartement ou lot (ex. C15, R1-6)" } };
const P_FIELDS = { nom: { type: "string", description: "Nom et prénom" }, tel: { type: "string" }, surface: { type: "number", description: "m²" }, prixM2: { type: "number", description: "Prix au m² (DH). Le prix total est recalculé avec la surface si « prix » n'est pas donné." }, prix: { type: "number", description: "Prix total (DH)" }, avance: { type: "number", description: "Avance exigée (DH). Si absente : 40 % du prix, recalculée quand le prix change ; donnée seule, elle recalcule le prix (avance / 40 %)." }, etage: { type: "string" }, immeuble: { type: "string" }, note: { type: "string" }, montantT60: { type: "number", description: "Montant de la tranche 60 % fixé à la main (DH), à la place de prix × 60 % ; 0 pour revenir au calcul" }, deplacer_vers: { type: "string", description: "modifier_adherent seulement : déplace l'adhérent (nom, déjà payé, paiements) vers ce lot libre ; l'ancien lot devient disponible" }, note_dest: { type: "string", description: "avec deplacer_vers : nouvelle note du lot de destination" } };
const WRITE_TOOLS = [
  { name: "modifier_adherent", title: "Modifier la fiche d'un adhérent",
    description: "Modifie la fiche d'un lot existant (nom, téléphone, surface, prix au m², prix, avance exigée, note…). Seuls les champs donnés changent. Ne pas utiliser pour un paiement : utiliser ajouter_paiement.",
    inputSchema: { type: "object", properties: Object.assign({}, P_ADH, P_FIELDS), required: ["projet", "lot"] }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } },
  { name: "ajouter_adherent", title: "Ajouter un adhérent ou un lot",
    description: "Ajoute un nouveau lot avec son adhérent (ou attribue un lot disponible).",
    inputSchema: { type: "object", properties: Object.assign({}, P_ADH, P_FIELDS), required: ["projet", "lot"] }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
  { name: "ajouter_paiement", title: "Enregistrer un paiement",
    description: "Enregistre un paiement (avance, tranche) pour l'adhérent d'un lot. Renvoie l'id du paiement, à utiliser avec joindre_fichier pour la photo du chèque.",
    inputSchema: { type: "object", properties: Object.assign({}, P_ADH, { montant: { type: "number", description: "Montant en DH" }, date: { type: "string", description: "JJ/MM/AAAA ou AAAA-MM-JJ (aujourd'hui si absent)" }, mode: { type: "string", enum: ["Chèque", "Virement", "Espèces"] }, reference: { type: "string", description: "N° du chèque ou référence du virement" }, banque: { type: "string" }, tranche: { type: "number", description: "Numéro de tranche (laisser vide : calculé)" }, note: { type: "string" } }), required: ["projet", "lot", "montant"] }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
  { name: "ajouter_cheque", title: "Enregistrer un chèque",
    description: "Ajoute un chèque au suivi des chèques (reçu d'un adhérent ou émis à un fournisseur).",
    inputSchema: { type: "object", properties: { projet: { type: "string" }, sens: { type: "string", enum: ["recu", "emis"] }, numero: { type: "string" }, montant: { type: "number" }, banque: { type: "string" }, date: { type: "string", description: "Échéance JJ/MM/AAAA" }, tiers: { type: "string", description: "Adhérent ou fournisseur" }, statut: { type: "string", enum: ["attente", "remis", "encaisse", "impaye"] }, partie: { type: "string" }, note: { type: "string" } }, required: ["projet", "numero", "montant"] }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
  { name: "joindre_fichier", title: "Joindre une photo ou un PDF",
    description: "Joint une photo (chèque, reçu, facture) ou un PDF ≤ 950 Ko à un paiement, une fiche, un chèque, une facture, un document ou une entrée du journal. Avec « base64 » le fichier est joint tout de suite ; sans, renvoie une adresse d'envoi (POST du fichier brut, 30 min).",
    inputSchema: { type: "object", properties: { cible: { type: "string", enum: Object.keys(FILE_COLS) }, id: { type: "string", description: "Id renvoyé par ajouter_paiement / ajouter_cheque, ou id de l'élément" }, nom_fichier: { type: "string" }, type: { type: "string", enum: ["image/jpeg", "image/png", "image/webp", "application/pdf"] }, base64: { type: "string", description: "Contenu du fichier en base64 (optionnel)" } }, required: ["cible", "id"] }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } }
];
TOOLS.push(...WRITE_TOOLS);

function alerts(s) {
  const out = [];
  s.cheques.forEach(c => {
    const st = c.statut || "attente";
    if (st === "impaye") out.push("🔴 Chèque impayé " + dh(c.montant) + (c.tiers ? " · " + c.tiers : "") + (c.numero ? " · n° " + c.numero : "") + " — " + pName(s, c.projet));
    else if (st === "attente" && c.date && days(c.date) <= 7) out.push((days(c.date) < 0 ? "🔴" : "🟠") + " Chèque " + ((c.sens || "recu") === "emis" ? "émis" : "reçu") + " " + dh(c.montant) + (c.tiers ? " · " + c.tiers : "") + " — échéance " + fdate(c.date) + " — " + pName(s, c.projet));
  });
  s.factures.forEach(f => { const st = facStatus(f); if (st !== "Payée") out.push("🟠 Facture " + st.toLowerCase() + " : " + (f.fournisseur || "") + " " + dh(f.montant) + " (reste " + dh(Math.max(0, n(f.montant) - n(f.paye))) + ") — " + pName(s, f.projet)); });
  s.documents.forEach(d => { if (d.expiration && days(d.expiration) <= 60) out.push((days(d.expiration) < 0 ? "🔴 Expiré" : "🟠 Expire") + " le " + fdate(d.expiration) + " : " + (d.nom || "") + " — " + (d.projet ? pName(s, d.projet) : "Association")); });
  projets(s).forEach(p => { const k = s.adherents.filter(a => a.projet === p.id && !isFree(a) && n(a.avance) > 0 && paidOf(s, a) < n(a.avance)).length; if (k) out.push("🟠 " + k + " adhérent(s) n'ont pas encore payé toute l'avance — " + p.nom); });
  return out;
}

const TOOL_FN = {
  resume_general(s) {
    let gT = 0, gP = 0;
    const rows = projets(s).map(p => { const st = projStats(s, p); gT += st.tp; gP += st.pd; return [p.nom, p.sections || "", st.sold.length, st.free, dh(st.tp), dh(st.pd), dh(st.rest), pct(st.pd, st.tp) + " %"]; });
    const al = alerts(s);
    return "# Amicale Albaraka — situation au " + fdate(today()) + "\n\nTotal payé : " + dh(gP) + " · Reste : " + dh(Math.max(0, gT - gP)) + " · Encaissé : " + pct(gP, gT) + " %\n\n"
      + table(["Projet", "Parties", "Adhérents", "Lots libres", "Prix total", "Payé", "Reste", "%"], rows)
      + "\n\n## À surveiller (" + al.length + ")\n" + (al.length ? al.map(x => "- " + x).join("\n") : "Rien d'urgent.");
  },
  lister_adherents(s, a) {
    const p = findProj(s, a.projet);
    let l = s.adherents.filter(x => x.projet === p.id);
    if (a.partie) { const t = norm(a.partie); l = l.filter(x => norm(x.section) === t || norm(x.section).includes(t)); }
    if (a.recherche) { const t = norm(a.recherche); l = l.filter(x => [x.nom, x.lot, x.tel, x.immeuble].some(v => norm(v).includes(t))); }
    const f = a.filtre || "tous";
    l = l.filter(x => {
      if (f === "disponibles") return isFree(x);
      if (f === "tous") return true;
      if (isFree(x)) return false;
      const pd = paidOf(s, x);
      if (f === "avance_non_atteinte") return n(x.avance) > 0 && pd < n(x.avance);
      if (f === "reste_a_payer") return pd < n(x.prix);
      if (f === "solde") return n(x.prix) > 0 && pd >= n(x.prix);
      return true;
    }).sort(lotSort);
    const tp = sum(l.filter(x => !isFree(x)), "prix"), pd = l.filter(x => !isFree(x)).reduce((t, x) => t + paidOf(s, x), 0);
    const rows = l.map(x => { const fr = isFree(x), q = fr ? 0 : paidOf(s, x); return [x.lot, x.etage, x.immeuble, x.section, fr ? "DISPONIBLE" : x.nom, x.tel, x.surface || "", num(x.prix), x.avance ? num(x.avance) : "", fr ? "" : num(q), fr ? "" : num(Math.max(0, n(x.prix) - q)), fr ? "" : trancheOf(s, x), x.note || ""]; });
    return "# " + p.nom + (a.partie ? " · " + a.partie : "") + " — " + l.length + " ligne(s), filtre : " + f + "\nTotal prix " + dh(tp) + " · payé " + dh(pd) + " · reste " + dh(Math.max(0, tp - pd)) + "\n\n"
      + table(["Lot", "Étage", "Imm.", "Partie", "Adhérent", "Tél", "m²", "Prix", "Avance", "Payé", "Reste", "Tranche", "Note"], rows);
  },
  fiche_adherent(s, a) {
    if (!a.lot && !a.nom) throw new Error("Indiquez le lot ou le nom de l'adhérent.");
    const p = a.projet ? findProj(s, a.projet) : null;
    let l = s.adherents.filter(x => !p || x.projet === p.id);
    if (a.lot) { const k = norm(a.lot).replace(/\s/g, ""); l = l.filter(x => norm(x.lot).replace(/\s/g, "") === k); }
    if (a.nom) { const t = norm(a.nom); l = l.filter(x => norm(x.nom).includes(t)); }
    if (!l.length) return "Aucun adhérent trouvé.";
    if (l.length > 1) return "Plusieurs résultats, précisez :\n" + l.slice(0, 15).map(x => "- " + (x.nom || "Lot disponible") + " · lot " + x.lot + " · " + pName(s, x.projet) + (x.section ? " · " + x.section : "")).join("\n");
    const x = l[0], pays = paysOf(s, x), q = paidOf(s, x);
    return "# " + (x.nom || "Lot disponible") + " — lot " + x.lot + "\nProjet : " + pName(s, x.projet) + (x.section ? " · " + x.section : "") + "\n"
      + [x.immeuble ? "Immeuble " + x.immeuble : "", x.etage, x.surface ? x.surface + " m²" : "", x.prixM2 ? num(x.prixM2) + " DH/m²" : ""].filter(Boolean).join(" · ")
      + "\nTéléphone : " + (x.tel || "—") + "\nPrix total : " + dh(x.prix) + "\nAvance exigée : " + (x.avance ? dh(x.avance) : "—")
      + "\nPayé : " + dh(q) + " (" + pct(q, n(x.prix)) + " %) dont déjà payé (fiche) " + dh(x.dejaPaye) + (Array.isArray(x.dejaPayeParts) && x.dejaPayeParts.length > 1 ? " — versements d'après le fichier Excel : " + x.dejaPayeParts.map(dh).join(" + ") : "") + (x.refCheque || x.banque ? " — chèque " + [x.refCheque, x.banque].filter(Boolean).join(", ") : "") + "\nReste à payer : " + dh(Math.max(0, n(x.prix) - q)) + "\nTranche atteinte : " + trancheOf(s, x)
      + (x.note ? "\nNote : " + x.note : "") + "\n\n## Paiements saisis (" + pays.length + ")\n"
      + table(["Date", "Montant", "Tranche", "Mode", "Référence", "Banque", "Note"], pays.map(y => [fdate(y.date), dh(y.montant), y.tranche || "", y.mode || "", y.reference || "", y.banque || "", y.note || ""]));
  },
  lister_paiements(s, a) {
    const p = a.projet ? findProj(s, a.projet) : null;
    const l = s.paiements.filter(y => (!p || y.projet === p.id) && (!a.depuis || String(y.date) >= a.depuis) && (!a.jusqua || String(y.date) <= a.jusqua)).sort((x, y) => String(y.date || "").localeCompare(String(x.date || "")));
    const rows = l.map(y => { const ad = s.adherents.find(z => z.id === y.adherentId) || {}; return [fdate(y.date), pName(s, y.projet), ad.nom || "", ad.lot || "", dh(y.montant), y.tranche || "", y.mode || "", y.reference || "", y.banque || ""]; });
    return "# Paiements" + (p ? " — " + p.nom : "") + " : " + l.length + " · total " + dh(sum(l)) + "\n\n" + table(["Date", "Projet", "Adhérent", "Lot", "Montant", "Tranche", "Mode", "Réf.", "Banque"], rows);
  },
  lister_cheques(s, a) {
    const p = a.projet ? findProj(s, a.projet) : null;
    const l = s.cheques.filter(c => (!p || c.projet === p.id) && (!a.sens || (c.sens || "recu") === a.sens) && (!a.statut || (c.statut || "attente") === a.statut)).sort((x, y) => String(x.date || "").localeCompare(String(y.date || "")));
    return "# Chèques" + (p ? " — " + p.nom : "") + " : " + l.length + " · total " + dh(sum(l)) + "\n\n"
      + table(["Sens", "N°", "Montant", "Banque", "Échéance", "Tiers", "Statut", "Projet"], l.map(c => [(c.sens || "recu") === "emis" ? "émis" : "reçu", c.numero, dh(c.montant), c.banque || "", fdate(c.date), c.tiers || "", CHQ_ST[c.statut || "attente"] || c.statut, pName(s, c.projet)]));
  },
  lister_factures(s, a) {
    const p = a.projet ? findProj(s, a.projet) : null;
    const l = s.factures.filter(f => (!p || f.projet === p.id) && (!a.statut || facStatus(f) === a.statut)).sort((x, y) => String(y.date || "").localeCompare(String(x.date || "")));
    const by = {}; l.forEach(f => { const k = f.poste || "Divers"; by[k] = (by[k] || 0) + n(f.montant); });
    return "# Factures" + (p ? " — " + p.nom : "") + " : " + l.length + " · total " + dh(sum(l)) + " · payé " + dh(sum(l, "paye")) + " · reste " + dh(Math.max(0, sum(l) - sum(l, "paye"))) + "\n\n"
      + table(["Date", "Fournisseur", "N°", "Poste", "Montant", "Payé", "Statut", "Président", "Trésorier", "Projet"], l.map(f => [fdate(f.date), f.fournisseur || "", f.numero || "", f.poste || "", dh(f.montant), dh(f.paye), facStatus(f), f.valP ? "oui" : "non", f.valT ? "oui" : "non", pName(s, f.projet)]))
      + "\n\n## Par poste\n" + table(["Poste", "Montant"], Object.keys(by).sort().map(k => [k, dh(by[k])]));
  },
  suivi_travaux(s, a) {
    const p = a.projet ? findProj(s, a.projet) : null;
    const ph = s.phases.filter(x => !p || x.projet === p.id).sort((x, y) => (n(x.ordre) || 99) - (n(y.ordre) || 99));
    const jr = s.journal.filter(x => !p || x.projet === p.id).sort((x, y) => String(y.date || "").localeCompare(String(x.date || ""))).slice(0, 20);
    return "# Travaux" + (p ? " — " + p.nom : "") + "\n\n## Phases\n" + table(["Phase", "Avancement", "Partie", "Projet"], ph.map(x => [x.nom, Math.min(100, n(x.pct)) + " %", x.section || "", pName(s, x.projet)]))
      + "\n\n## Journal de chantier (20 dernières entrées)\n" + table(["Date", "Ce qui a été fait", "Projet"], jr.map(x => [fdate(x.date), x.note || "", pName(s, x.projet)]));
  },
  lister_documents(s, a) {
    const asso = a.projet && /^asso/i.test(norm(a.projet));
    const p = a.projet && !asso ? findProj(s, a.projet) : null;
    const l = s.documents.filter(d => asso ? !d.projet : (!p || d.projet === p.id));
    return "# Documents" + (asso ? " de l'association" : p ? " — " + p.nom : "") + " : " + l.length + "\n\n"
      + table(["Nom", "Catégorie", "Date", "Expire le", "Projet"], l.map(d => [d.nom || "", d.categorie || "", fdate(d.date), d.expiration ? fdate(d.expiration) + (days(d.expiration) < 0 ? " (expiré)" : "") : "", d.projet ? pName(s, d.projet) : "Association"]));
  }
};

/* ---------------- protocole MCP ---------------- */
const INSTRUCTIONS = "Données de gestion de l'Amicale Albaraka (amicale immobilière au Maroc) : projets, adhérents, paiements, chèques, factures, travaux et documents. Lecture, et ajout ou modification d'adhérents, paiements, chèques et pièces jointes (aucune suppression) : avant d'écrire, vérifiez le lot avec fiche_adherent et annoncez à l'utilisateur ce qui sera enregistré. Le montant payé d'un adhérent = « déjà payé » de sa fiche + paiements saisis. Un lot sans nom est DISPONIBLE. Montants en dirhams (DH).";
async function rpc(msg, env, origin) {
  const { id, method, params } = msg || {};
  const ok = result => ({ jsonrpc: "2.0", id, result });
  const err = (code, message) => ({ jsonrpc: "2.0", id: id === undefined ? null : id, error: { code, message } });
  if (!msg || msg.jsonrpc !== "2.0" || typeof method !== "string") return err(-32600, "Invalid Request");
  if (id === undefined || id === null) return null; // notification
  if (method === "initialize") {
    const want = params && params.protocolVersion;
    return ok({ protocolVersion: VERSIONS.includes(want) ? want : VERSIONS[0], capabilities: { tools: { listChanged: false } }, serverInfo: SERVER, instructions: INSTRUCTIONS });
  }
  if (method === "ping") return ok({});
  if (method === "tools/list") return ok({ tools: TOOLS });
  if (method === "resources/list") return ok({ resources: [] });
  if (method === "prompts/list") return ok({ prompts: [] });
  if (method === "tools/call") {
    const name = params && params.name, fn = TOOL_FN[name] || WRITE_FN[name];
    if (!fn) return err(-32602, "Outil inconnu : " + name);
    try { const s = await loadAll(env); return ok({ content: [{ type: "text", text: await fn(s, (params && params.arguments) || {}, env, origin) }] }); }
    catch (e) { return ok({ content: [{ type: "text", text: "Erreur : " + (e && e.message || e) }], isError: true }); }
  }
  return err(-32601, "Méthode inconnue : " + method);
}
function safeEq(a, b) { a = String(a || ""); b = String(b || ""); if (!a || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
const json = (body, status, extra) => new Response(body == null ? null : JSON.stringify(body), { status: status || 200, headers: Object.assign({ "content-type": "application/json" }, extra || {}) });

export default {
  async fetch(req, env) {
    const url = new URL(req.url), parts = url.pathname.split("/").filter(Boolean);
    if (!parts.length) return new Response("Connecteur MCP Amicale Albaraka. Adresse : /mcp/<jeton>", { headers: { "content-type": "text/plain; charset=utf-8" } });
    if (parts[0] === "up") return upload(req, env, parts, url);
    // adresse : /mcp/<MCP_TOKEN>
    if (parts[0] !== "mcp" || !env.MCP_TOKEN || String(env.MCP_TOKEN).length < 24 || !safeEq(parts[1], env.MCP_TOKEN) || parts.length > 2) return new Response("Not found", { status: 404 });
    if (req.method === "GET" || req.method === "DELETE") return new Response(null, { status: 405, headers: { allow: "POST" } });
    if (req.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
    let body; try { body = await req.json(); } catch (e) { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map(m => rpc(m, env, url.origin)))).filter(Boolean);
      return out.length ? json(out) : new Response(null, { status: 202 });
    }
    const r = await rpc(body, env, url.origin);
    return r ? json(r) : new Response(null, { status: 202 });
  }
};
