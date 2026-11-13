import type { DbSchema } from "@sibilla/shared";

const isDate = (name: string) => /data|date|giorno|mese|creat|aggiorn/i.test(name);

/** A way to start: `title` says what kind of thing it builds, `summary` what it is about in a few words, `prompt` is what gets sent. */
export type Suggestion = { title: string; summary: string; prompt: string };

/** Starter prompts built from the live schema, so they make sense on any database. */
export function suggestions(schema: DbSchema | null): Suggestion[] {
  const tables = schema?.tables ?? [];
  const fact = tables.find((t) => t.columns.some((c) => c.references) && t.columns.some((c) => isDate(c.name))) ?? tables[0];
  const master = tables.find((t) => t !== fact && !t.columns.some((c) => c.references)) ?? tables[1] ?? fact;
  const app = { title: "Mini app", summary: "Attività del team, con stati e scadenze", prompt: "Una mini app per gestire le attività del team: stati, priorità, scadenze e assegnatari" };
  if (!fact) {
    return [
      { title: "Dashboard", summary: "I numeri chiave a colpo d'occhio", prompt: "Una dashboard con i numeri chiave" },
      app,
      { title: "Elenco", summary: "Con ricerca e filtri", prompt: "Un elenco con ricerca e filtri" },
      { title: "Gestione", summary: "Crea e modifica i record", prompt: "Una schermata di gestione: crea e modifica record" },
    ];
  }
  return [
    { title: "Dashboard", summary: `Numeri chiave e andamento di ${fact.name}`, prompt: `Una dashboard di ${fact.name}: numeri chiave, andamento mensile e ultimi record` },
    app,
    { title: "Elenco", summary: `${master!.name} con ricerca e filtri`, prompt: `Un elenco di ${master!.name} con ricerca e filtri` },
    { title: "Gestione", summary: `Crea e modifica ${master!.name}`, prompt: `Gestione ${master!.name}: crea e modifica record` },
  ];
}
