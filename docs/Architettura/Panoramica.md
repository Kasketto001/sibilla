---
tags: [architettura]
---

# Panoramica

Sibilla è un monorepo npm con tre pacchetti.

| Pacchetto | Cosa contiene | Tecnologie |
| --- | --- | --- |
| `shared/` | Lo schema della [spec](Spec.md), delle query e dei modelli. È l'unica fonte di verità: server e interfaccia lo importano entrambi. | TypeScript, Zod |
| `server/` | Le [API](API.md), il motore delle query, la [generazione](Generazione.md), account e chiavi. | Hono, `node:sqlite`, SDK di Anthropic, OpenAI e Google, esbuild |
| `web/` | L'interfaccia: chat, renderer della spec, schermata del database. | React, Vite, Tailwind, shadcn/ui, Recharts |

## Il giro di una richiesta

```
utente ──prompt──▶ web ──POST /api/generate/stream──▶ server
                                                        │  ciclo con il modello:
                                                        │   esegui_query ─▶ dati veri
                                                        │   crea_tabella / inserisci_righe
                                                        │   prepara_libreria
                                                        │   mostra_interfaccia ─▶ spec
                                                        │  validazione (schema, albero, query, bundle)
web ◀── avanzamento, anteprima, risultato (una riga JSON alla volta) ──┘
 │
 ├─ disegna la spec con il renderer
 ├─ ogni nodo chiede i propri dati: POST /api/query
 └─ salva: conversazione, messaggi, nuova versione
```

Tre idee reggono il tutto:

1. **Il modello descrive, non programma.** Scrive una [spec](Spec.md) in JSON, non codice (tranne le viste libere). La spec è validata prima di arrivare all'utente e, se non è valida, il modello riceve l'elenco dei problemi e riprova.
2. **Il modello non scrive SQL.** Legge e fa leggere i dati con [query strutturate](Dati.md) che il server controlla contro lo schema e traduce.
3. **L'interfaccia è dati.** Una spec si salva, si versiona, si ripristina, si condivide, e la stessa spec gira dentro Sibilla e nella pagina del link pubblico.

## Dove vivono i dati

Un solo file SQLite contiene:

- le **tabelle dell'utente** (quelle dimostrative e quelle create dall'app);
- le tabelle di Sibilla, tutte con prefisso `sib_`: conversazioni e versioni, messaggi, documenti delle collezioni, impostazioni, account e sessioni.

Le tabelle `sib_` non sono mai visibili al modello né alle query dell'interfaccia. Il dettaglio è in [Dati](Dati.md).

## Per approfondire

- Il formato dell'interfaccia: [Spec](Spec.md)
- Come lavora il modello: [Generazione](Generazione.md)
- Le schermate generate al clic: [Procedurale](Procedurale.md)
- Dove sta il codice: [Codice](../Sviluppo/Codice.md)
