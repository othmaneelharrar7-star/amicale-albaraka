// Sauvegarde automatique de toute la base Firestore de l'application (collections am_*),
// photos et fichiers compris, compressée puis chiffrée (AES-256-GCM).
// La clé n'apparaît jamais dans les journaux GitHub (dépôt public) : elle est enregistrée
// dans am_meta/backup, lisible seulement par les comptes du bureau, et affichée dans
// l'application (Tableau de bord > Sauvegarde) pour que le bureau la note.
// Variables : FB_API_KEY, FB_PROJECT_ID, FB_EMAIL, FB_PASSWORD, BK_KEY, OUT_DIR
import crypto from "node:crypto";
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";

const E = process.env;
const COLS = ["projets", "adherents", "paiements", "cheques", "factures", "phases", "journal", "documents", "fichiers"];
const BASE = `https://firestore.googleapis.com/v1/projects/${E.FB_PROJECT_ID}/databases/(default)/documents/`;

async function signIn() {
  const r = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + encodeURIComponent(E.FB_API_KEY), {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: E.FB_EMAIL, password: E.FB_PASSWORD, returnSecureToken: true })
  });
  const j = await r.json();
  if (!j.idToken) throw new Error("Connexion Firebase refusée : " + ((j.error && j.error.message) || r.status));
  return j.idToken;
}
function val(v) {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("bytesValue" in v) return { __bytes: v.bytesValue };
  if ("mapValue" in v) return map(v.mapValue.fields || {});
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(val);
  if ("geoPointValue" in v) return v.geoPointValue;
  if ("referenceValue" in v) return v.referenceValue;
  return null;
}
function map(f) { const o = {}; for (const k in f) o[k] = val(f[k]); return o; }
async function list(tok, col) {
  const out = []; let page = "";
  for (let i = 0; i < 1000; i++) {
    const r = await fetch(BASE + "am_" + col + "?pageSize=200" + (page ? "&pageToken=" + encodeURIComponent(page) : ""), { headers: { authorization: "Bearer " + tok } });
    const j = await r.json();
    if (!r.ok) throw new Error("Lecture de " + col + " impossible : " + ((j.error && j.error.message) || r.status));
    for (const d of j.documents || []) { const o = map(d.fields || {}); o.__id = d.name.split("/").pop(); out.push(o); }
    if (!j.nextPageToken) break;
    page = j.nextPageToken;
  }
  return out;
}

const tok = await signIn();
const collections = {};
let count = 0;
for (const c of COLS) { collections[c] = await list(tok, c); count += collections[c].length; console.log(c + " : " + collections[c].length); }
const at = new Date().toISOString();
const plain = zlib.gzipSync(Buffer.from(JSON.stringify({ app: "amicale-albaraka", type: "sauvegarde", v: 1, at, par: "sauvegarde automatique", collections })));
const key = crypto.createHash("sha256").update(String(E.BK_KEY)).digest();
const iv = crypto.randomBytes(12);
const ci = crypto.createCipheriv("aes-256-gcm", key, iv);
const data = Buffer.concat([ci.update(plain), ci.final(), ci.getAuthTag()]);
const file = { app: "amicale-albaraka", type: "sauvegarde-chiffree", v: 1, at, count, alg: "AES-GCM", gzip: true, iv: iv.toString("base64"), data: data.toString("base64") };
fs.mkdirSync(E.OUT_DIR, { recursive: true });
const name = "sauvegarde-" + at.slice(0, 10) + ".json.enc";
fs.writeFileSync(path.join(E.OUT_DIR, name), JSON.stringify(file));
console.log("Fichier " + name + " : " + count + " éléments, " + (data.length / 1048576).toFixed(2) + " Mo");

// Date et clé visibles dans l'application
const body = { fields: { lastAt: { stringValue: at }, count: { integerValue: String(count) }, key: { stringValue: String(E.BK_KEY) } } };
const r = await fetch(BASE + "am_meta/backup?updateMask.fieldPaths=lastAt&updateMask.fieldPaths=count&updateMask.fieldPaths=key", {
  method: "PATCH", headers: { authorization: "Bearer " + tok, "content-type": "application/json" }, body: JSON.stringify(body)
});
if (!r.ok) throw new Error("Impossible d'enregistrer la date de sauvegarde (" + r.status + ")");
console.log("OK");
