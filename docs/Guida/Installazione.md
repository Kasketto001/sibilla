---
tags: [guida]
---

# Installazione

## Requisiti

- **Node.js 24 o successivo** (Sibilla usa `node:sqlite`, incluso in Node).
- Una **chiave API** di almeno un fornitore: Anthropic, OpenAI o Google. Senza chiave l'app si avvia e mostra i dati, ma non genera.

## Primo avvio

```bash
npm install
npm run dev
```

Parte il server delle API su `http://localhost:8787` e l'interfaccia su `http://localhost:5173`. Apri la seconda.

1. **Crea l'account.** Il primo account prende in carico le conversazioni già presenti. Dopo il primo, la registrazione si chiude (vedi [Configurazione](Configurazione.md)).
2. **Collega un modello.** Nella casella di scrittura clicca il pulsante del modello, poi **Accesso ai modelli**, e incolla la chiave. Il server la verifica prima di salvarla. In alternativa copia `server/.env.example` in `server/.env` e scrivila lì.
3. **Scrivi cosa ti serve.**

Il database `server/sibilla.db` viene creato al primo avvio con dati dimostrativi (clienti, prodotti, ordini, righe d'ordine). Per ripartire da zero, ferma il server e cancella il file.

## Produzione

```bash
npm run build
npm start
```

`npm run build` compila l'interfaccia in `web/dist`; `npm start` avvia il server, che a quel punto serve sia le API sia l'interfaccia su `http://localhost:8787` (porta modificabile con `PORT`). Mettilo dietro un reverse proxy con HTTPS: vedi [Sicurezza](../Architettura/Sicurezza.md).

## Cosa viene scritto su disco

| Percorso | Contenuto | Si può cancellare? |
| --- | --- | --- |
| `server/sibilla.db` | Dati, conversazioni, account, chiavi cifrate | Sì, ma perdi tutto |
| `server/.sibilla-secret` | Segreto che cifra le chiavi API salvate | Sì, ma dovrai reinserire le chiavi |
| `server/.sibilla-libs/` | Librerie npm scaricate per le viste libere e i loro bundle | Sì, vengono riscaricate |
| `server/.env` | Le tue variabili d'ambiente | È tuo |

Nessuno di questi va in git: il `.gitignore` li esclude.

## Problemi comuni

- **"Manca la chiave API di …"**: il modello scelto appartiene a un fornitore non collegato. Collega la chiave o scegli un altro modello.
- **"credito esaurito o non attivo"**: la chiave è valida ma l'account del fornitore non ha credito.
- **Schermata di login che non ti aspettavi**: gli account sono attivi per impostazione predefinita. `SIBILLA_AUTH=off` li disattiva.
