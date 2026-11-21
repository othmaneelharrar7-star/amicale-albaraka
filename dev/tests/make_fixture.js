// Crée un fichier Excel d'exemple (noms inventés) pour les tests d'import.
// Les vrais fichiers de l'Amicale contiennent des données personnelles : ne jamais les mettre dans le dépôt.
const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");
(async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Liste par étage");
  const head = ["N°", "Étage", "Immeuble", "Appartement", "Surface (m²)", "Colonne1", "Prix total", "Avance", "Montant payé", "Reste à payer", "Coordonnées ", "Commentaire"];
  const noms = ["KARIM TEST", "SALMA EXEMPLE", "", "YOUSSEF ESSAI", "", "NADIA DEMO", "OMAR FICTIF", "LEILA ESSAI", "", "HAMZA TEST", "SARA DEMO", "MEHDI EXEMPLE"];
  const rows = [];
  let i = 0;
  for (const et of ["RDC", "1er étage", "2ème étage"]) {
    for (const im of ["A", "B"]) {
      for (let k = 1; k <= 2; k++) {
        const nom = noms[i % noms.length];
        const sf = 60 + (i % 5) * 7, m2 = 14000 + (i % 3) * 500;
        rows.push([i + 1, et, im, im + "." + (k + (et === "RDC" ? 0 : et[0] === "1" ? 2 : 4)), sf, m2, sf * m2, sf * m2 * 0.4, nom ? 100000 + i * 25000 : null, null, nom, ""]);
        i++;
      }
    }
  }
  ws.addTable({ name: "ListeTest", ref: "A1", headerRow: true, style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: head.map(h => ({ name: h })), rows });
  rows.forEach((r, j) => { const rr = j + 2; ws.getCell("J" + rr).value = { formula: "G" + rr + "-I" + rr }; });
  const out = path.join(__dirname, "out");
  fs.mkdirSync(out, { recursive: true });
  await wb.xlsx.writeFile(path.join(out, "exemple.xlsx"));
  console.log("fixture:", rows.length, "lignes");
})();
