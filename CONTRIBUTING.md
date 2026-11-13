# Contribuire a Sibilla

Grazie dell'interesse. Segnalazioni, idee e modifiche sono benvenute.

## Prima di cominciare

- Per un bug o una proposta apri una issue: descrivi cosa hai fatto, cosa ti aspettavi e cosa è successo.
- Per una vulnerabilità non aprire una issue pubblica: segui [SECURITY.md](SECURITY.md).
- Per modifiche grandi (un nuovo tipo di nodo, un nuovo fornitore di modelli, un cambio allo schema dei dati) apri prima una issue per discuterne.

## Ambiente

```bash
npm install
npm run dev        # API su :8787, interfaccia su :5173
```

Serve Node.js 24 o successivo. Per provare senza toccare i tuoi dati puoi avviare un secondo server su un database vuoto:

```bash
cd server && SIBILLA_DB=":memory:" PORT=8788 SIBILLA_AUTH=off npx tsx --env-file-if-exists=.env src/index.ts
cd web && SIBILLA_API=http://localhost:8788 npx vite --port 5174
```

## Prima di aprire una pull request

```bash
npm run typecheck
npm run lint
npm test
```

Tutti e tre devono passare; la CI li ripete insieme alla build.

## Come è scritto il codice

- **La spec è l'unica fonte di verità.** Lo schema Zod in `shared/src/spec.ts` definisce cosa può scrivere il modello; da lì derivano lo schema JSON dello strumento, la validazione e i tipi. Un nuovo tipo di nodo si aggiunge lì, poi nel renderer (`web/src/renderer`), poi nel prompt (`server/src/generate.ts`).
- **Il modello non scrive SQL.** Chiede dati con query strutturate che il server valida e traduce (`server/src/query.ts`). Tieni questa regola.
- **Ogni comportamento ha un test.** I test del server usano un database in memoria e un modello finto (`LlmStep`); quelli dell'interfaccia usano Testing Library.
- **Commenti che spiegano il perché**, in inglese come il resto del codice; testi dell'interfaccia in italiano.
- **Niente dipendenze nuove senza motivo**: controlla prima cosa c'è già.

La struttura è descritta in [docs/Sviluppo/Codice.md](docs/Sviluppo/Codice.md), le scelte di fondo in [docs/Sviluppo/Decisioni.md](docs/Sviluppo/Decisioni.md).

## Licenza dei contributi

Inviando una modifica accetti che sia distribuita con la licenza [MIT](LICENSE) del progetto.
