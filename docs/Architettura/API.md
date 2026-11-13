---
tags: [architettura]
---

# API

Tutte sotto `/api`, in JSON. Gli errori hanno la forma `{ "error": "…" }`, con `fieldErrors` per le scritture. Il codice è in `server/src/app.ts`.

Con gli account attivi serve il cookie di sessione, tranne dove indicato. *Link* = raggiungibile anche con l'intestazione `x-sibilla-share: <token>`.

## Accesso

| Metodo e percorso | Cosa fa |
| --- | --- |
| `GET /auth/me` | Stato: account attivi, utente corrente, registrazione aperta (pubblico) |
| `POST /auth/register` | Crea un account e apre la sessione (pubblico) |
| `POST /auth/login`, `POST /auth/logout` | Apre e chiude la sessione (pubblico) |

## Dati

| Metodo e percorso | Cosa fa |
| --- | --- |
| `GET /schema` | Tabelle e colonne del database |
| `POST /query` | Esegue una query strutturata: `{ query, vars, app? }` (*link*) |
| `POST /records/:table` | Crea un record: `{ values, app? }` (*link*) |
| `PATCH /records/:table/:id`, `DELETE /records/:table/:id` | Modifica ed elimina (*link*) |
| `POST /tables` | Crea una tabella: `{ name, columns }` |
| `POST /tables/:name/columns` | Aggiunge una colonna |
| `DELETE /tables/:name` | Elimina una tabella |
| `POST /tables/:name/rows` | Inserisce più righe, tutte o nessuna |
| `POST /data/:collection/import`, `DELETE /data/:collection` | Importa documenti in una collezione, la svuota |

`app` è `{ id, collections }`: indica a quale mini app appartengono le collezioni usate.

## Generazione

| Metodo e percorso | Cosa fa |
| --- | --- |
| `POST /generate` | Una generazione, risposta alla fine |
| `POST /generate/stream` | La stessa, con avanzamento: una riga JSON per evento |
| `POST /bundle`, `GET /bundle/:file` | Compila una vista libera; ne serve JS e CSS (*link* la prima, pubblica la seconda) |
| `GET /runtime/tailwind.js` | Tailwind per la sandbox (pubblico) |

Corpo di una generazione: `{ prompt, currentSpec, history, attachments, llm, mode, navigate }`. Vedi [Generazione](Generazione.md).

## Modelli

| Metodo e percorso | Cosa fa |
| --- | --- |
| `GET /providers` | Quali fornitori sono collegati (mai le chiavi) |
| `PUT /providers/:id` | Verifica e salva una chiave |
| `DELETE /providers/:id` | Rimuove la chiave salvata |

## Conversazioni

| Metodo e percorso | Cosa fa |
| --- | --- |
| `GET /interfaces`, `POST /interfaces` | Elenco; nuova conversazione |
| `GET`, `PATCH`, `DELETE /interfaces/:id` | Dettaglio; rinomina, fissa, archivia; elimina (con i dati della sua app) |
| `GET`, `POST /interfaces/:id/messages` | Messaggi della chat |
| `GET /interfaces/:id/versions/:n`, `POST /interfaces/:id/versions` | Una versione; nuova versione |
| `PUT /interfaces/:id/share` | Attiva o disattiva il link pubblico |
| `GET /shared/:token` | La spec dell'app condivisa (pubblico) |
