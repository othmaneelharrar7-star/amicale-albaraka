// Connecteur MCP de l'Amicale Albaraka (lecture seule).
// Serveur MCP « Streamable HTTP » sans dépendance, pour Cloudflare Workers.
// Il lit la base Firestore de l'application avec un compte du bureau dédié
// et ne fait que des lectures : aucune donnée n'est jamais modifiée.
//
// Secrets (Cloudflare) : MCP_TOKEN, FB_EMAIL, FB_PASSWORD
// Variables (wrangler.toml) : FB_API_KEY, FB_PROJECT_ID

const PRE = "am_";
const SERVER = { name: "amicale-albaraka", title: "Amicale Albaraka", version: "1.0.0" };
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
      + "\nPayé : " + dh(q) + " (" + pct(q, n(x.prix)) + " %) dont déjà payé à l'import " + dh(x.dejaPaye) + "\nReste à payer : " + dh(Math.max(0, n(x.prix) - q)) + "\nTranche atteinte : " + trancheOf(s, x)
      + (x.note ? "\nNote : " + x.note : "") + "\n\n## Paiements saisis (" + pays.length + ")\n"
      + table(["Date", "Montant", "Tranche", "Mode", "Référence", "Note"], pays.map(y => [fdate(y.date), dh(y.montant), y.tranche || "", y.mode || "", y.reference || "", y.note || ""]));
  },
  lister_paiements(s, a) {
    const p = a.projet ? findProj(s, a.projet) : null;
    const l = s.paiements.filter(y => (!p || y.projet === p.id) && (!a.depuis || String(y.date) >= a.depuis) && (!a.jusqua || String(y.date) <= a.jusqua)).sort((x, y) => String(y.date || "").localeCompare(String(x.date || "")));
    const rows = l.map(y => { const ad = s.adherents.find(z => z.id === y.adherentId) || {}; return [fdate(y.date), pName(s, y.projet), ad.nom || "", ad.lot || "", dh(y.montant), y.tranche || "", y.mode || "", y.reference || ""]; });
    return "# Paiements" + (p ? " — " + p.nom : "") + " : " + l.length + " · total " + dh(sum(l)) + "\n\n" + table(["Date", "Projet", "Adhérent", "Lot", "Montant", "Tranche", "Mode", "Réf."], rows);
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
const INSTRUCTIONS = "Données de gestion de l'Amicale Albaraka (amicale immobilière au Maroc) : projets, adhérents, paiements, chèques, factures, travaux et documents. Lecture seule. Le montant payé d'un adhérent = « déjà payé » de sa fiche + paiements saisis. Un lot sans nom est DISPONIBLE. Montants en dirhams (DH).";
async function rpc(msg, env) {
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
    const name = params && params.name, fn = TOOL_FN[name];
    if (!fn) return err(-32602, "Outil inconnu : " + name);
    try { const s = await loadAll(env); return ok({ content: [{ type: "text", text: fn(s, (params && params.arguments) || {}) }] }); }
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
    // adresse : /mcp/<MCP_TOKEN>
    if (parts[0] !== "mcp" || !env.MCP_TOKEN || String(env.MCP_TOKEN).length < 24 || !safeEq(parts[1], env.MCP_TOKEN) || parts.length > 2) return new Response("Not found", { status: 404 });
    if (req.method === "GET" || req.method === "DELETE") return new Response(null, { status: 405, headers: { allow: "POST" } });
    if (req.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
    let body; try { body = await req.json(); } catch (e) { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map(m => rpc(m, env)))).filter(Boolean);
      return out.length ? json(out) : new Response(null, { status: 202 });
    }
    const r = await rpc(body, env);
    return r ? json(r) : new Response(null, { status: 202 });
  }
};
