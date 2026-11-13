import type { DatabaseSync } from "node:sqlite";

// mulberry32: tiny deterministic PRNG so every fresh db has the same demo data.
function prng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOMI = ["Rossi", "Bianchi", "Verdi", "Russo", "Ferrari", "Esposito", "Romano", "Colombo", "Ricci", "Marino",
  "Greco", "Bruno", "Gallo", "Conti", "De Luca", "Costa", "Giordano", "Mancini", "Rizzo", "Lombardi"];
const FORME = ["Srl", "SpA", "& Figli", "Group"];
const CITTA = ["Milano", "Roma", "Torino", "Napoli", "Bologna", "Firenze", "Genova", "Bari", "Verona", "Padova"];
const SEGMENTI = ["Enterprise", "PMI", "Privato"];
const CATALOGO: [string, string, number][] = [
  ["Laptop Pro 14", "Hardware", 1499], ["Laptop Air 13", "Hardware", 999], ["Monitor 27\"", "Hardware", 329],
  ["Tastiera meccanica", "Accessori", 119], ["Mouse wireless", "Accessori", 49], ["Docking station", "Accessori", 189],
  ["Cuffie ANC", "Accessori", 249], ["Webcam HD", "Accessori", 89], ["Server rack 1U", "Hardware", 3200],
  ["Switch 24 porte", "Networking", 540], ["Access point Wi-Fi 7", "Networking", 310], ["Firewall", "Networking", 1250],
  ["Licenza Office", "Software", 129], ["Antivirus business", "Software", 59], ["Backup cloud 1TB", "Servizi", 99],
  ["Assistenza annuale", "Servizi", 480], ["Installazione on-site", "Servizi", 250], ["Formazione 1 giorno", "Servizi", 690],
  ["Stampante laser", "Hardware", 420], ["Toner", "Accessori", 79], ["NAS 4 bay", "Hardware", 760],
  ["UPS 1500VA", "Hardware", 380], ["Licenza CRM", "Software", 45], ["Licenza ERP", "Software", 210], ["Tablet 11", "Hardware", 599],
];
const STATI = ["nuovo", "in_lavorazione", "spedito", "consegnato", "annullato"];

export function seed(db: DatabaseSync) {
  const r = prng(42);
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  const end = Date.UTC(2026, 10, 1);
  const day = 86_400_000;

  db.exec("begin");
  const cli = db.prepare("insert into clienti (nome, email, citta, segmento) values (?, ?, ?, ?)");
  for (let i = 0; i < 40; i++) {
    const nome = `${pick(NOMI)} ${pick(FORME)}`;
    cli.run(nome, `info${i + 1}@${nome.toLowerCase().replace(/[^a-z]/g, "")}.it`, pick(CITTA), pick(SEGMENTI));
  }
  const prod = db.prepare("insert into prodotti (nome, categoria, prezzo, attivo) values (?, ?, ?, ?)");
  CATALOGO.forEach(([n, c, p], i) => prod.run(n, c, p, i % 9 === 8 ? 0 : 1));

  const ord = db.prepare("insert into ordini (cliente_id, data, stato, totale) values (?, ?, ?, 0)");
  const riga = db.prepare("insert into righe_ordine (ordine_id, prodotto_id, quantita, prezzo_unitario) values (?, ?, ?, ?)");
  for (let i = 0; i < 300; i++) {
    const data = new Date(end - Math.floor(r() * 365) * day).toISOString().slice(0, 10);
    const id = Number(ord.run(1 + Math.floor(r() * 40), data, pick(STATI)).lastInsertRowid);
    const righe = 1 + Math.floor(r() * 4);
    for (let j = 0; j < righe; j++) {
      const p = 1 + Math.floor(r() * CATALOGO.length);
      riga.run(id, p, 1 + Math.floor(r() * 5), CATALOGO[p - 1][2]);
    }
  }
  db.exec(`update ordini set totale = round((select sum(quantita * prezzo_unitario) from righe_ordine where ordine_id = ordini.id), 2)`);
  db.exec("commit");
}
