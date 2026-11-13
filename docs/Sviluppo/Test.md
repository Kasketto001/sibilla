---
tags: [sviluppo]
---

# Test

```bash
npm test             # tutto
npx vitest run server/test/query.test.ts   # un file
npm run typecheck && npm run lint
```

Vitest esegue due gruppi (`vitest.config.ts`): `shared` e `server` in Node, `web` in jsdom.

## Server

- Ogni test apre un database **in memoria** (`openDb(":memory:")`), già con i dati dimostrativi.
- Il modello è **finto**: un `LlmStep` che restituisce turni scritti a mano, così si prova il ciclo (strumenti, errori, correzioni) senza chiamare nessuno.
- Le librerie npm sono finte (`server/test/fake-npm.ts`), tranne dove si prova la compilazione vera.
- Gli endpoint si provano con `app.request(...)`, senza aprire una porta.

## Interfaccia

- Testing Library, con `api` sostituita da funzioni finte (`vi.mock("./api")`).
- Si prova ciò che l'utente vede e fa: scrivere, cliccare, leggere il risultato.

## Provare dal vivo senza toccare i propri dati

```bash
cd server && SIBILLA_DB=":memory:" PORT=8788 SIBILLA_AUTH=off npx tsx --env-file-if-exists=.env src/index.ts
cd web && SIBILLA_API=http://localhost:8788 npx vite --port 5174
```

Un server su un database vuoto e senza login, e una seconda interfaccia che punta lì.

## Cosa non è coperto

I test non chiamano mai un modello vero: che un fornitore accetti gli strumenti e produca spec valide si verifica solo a mano. Vedi [Limiti](Limiti.md). Un esempio di cosa sfugge: il primo uso reale di GPT falliva al secondo turno perché l'SDK aggiungeva campi che l'API non accetta indietro.
