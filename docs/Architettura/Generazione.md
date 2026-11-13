---
tags: [architettura]
---

# Generazione

Il codice è in `server/src/generate.ts`. Una richiesta è un **ciclo**: il modello può chiamare strumenti quante volte serve (fino a 12 passi) e finisce in due modi: mostrando un'interfaccia o rispondendo a parole.

## Strumenti del modello

| Strumento | Cosa fa |
| --- | --- |
| `esegui_query` | Esegue una [query strutturata](Dati.md) e restituisce al massimo 50 righe. Serve per esplorare i dati prima di costruire e per rispondere con numeri veri. |
| `prepara_libreria` | Scarica un pacchetto npm sul server e restituisce versione, percorsi importabili e CSS, per scrivere una vista libera con gli import giusti. |
| `crea_tabella` | Crea una tabella nel database. |
| `inserisci_righe` | Inserisce righe in una tabella, tutte o nessuna. |
| `mostra_interfaccia` | Consegna la [spec](Spec.md) e un messaggio per l'utente. Può portare `dati_iniziali` per riempire le collezioni appena create. |

Se la spec non è valida il modello riceve l'elenco dei problemi come risultato dello strumento e riprova. Lo stesso vale per una query sbagliata o una riga rifiutata.

## Il prompt

`buildSystemPrompt` produce le istruzioni: come lavorare, quando usare collezioni o tabelle, la navigazione tra schermate, lo stile, le viste libere, i nodi, le regole delle query e, in fondo, lo schema del database. È lo stesso per tutta la conversazione, così può essere messo in cache dal fornitore.

Il messaggio dell'utente porta la richiesta, gli allegati e, se c'è, la spec della schermata che sta guardando: il modello lavora sempre su **una schermata per volta**.

## Fornitori

Il ciclo non conosce i fornitori: parla con un `LlmStep`, una funzione che riceve prompt e messaggi e restituisce i blocchi della risposta nella forma di Claude.

| File | Fornitore | Note |
| --- | --- | --- |
| `generate.ts` (`makeClaudeStep`) | Anthropic | Ragionamento adattivo, impegno, ripiego lato server su rifiuto, input dello strumento in streaming |
| `openai.ts` | OpenAI | Responses API; converte messaggi e strumenti, ripassa gli elementi di ragionamento |
| `gemini.ts` | Google | `generateContent` in streaming; ripassa le parti con le firme di ragionamento |
| `llm.ts` | – | Sceglie il fornitore dal modello, con la chiave configurata; verifica le chiavi |

Lo stato proprio di un fornitore (ragionamento cifrato, firme) viaggia in un blocco `provider_state` dentro la risposta e torna indietro intatto al passo successivo.

Per aggiungere un fornitore: un nuovo file che implementa `LlmStep`, una riga in `BUILD` e `verifyKey` (`llm.ts`), il fornitore e i suoi modelli in `shared/src/llm.ts`.

## Avanzamento, anteprima, interruzione

`POST /api/generate/stream` risponde con una riga JSON per evento:

- `status`: cosa sta facendo («Esploro i dati…», «Costruisco l'interfaccia…»);
- `thinking`: il ragionamento, se richiesto, mentre viene scritto;
- `preview`: la spec scritta fin lì (solo con Claude), che l'interfaccia mostra come struttura con segnaposto al posto dei dati;
- `result` oppure `error`: la fine.

Se il client chiude la connessione (il pulsante **Ferma**), il server annulla la chiamata al modello.

## Costi

Ogni passo riporta i token usati; il risultato ne dà la somma e una stima in dollari al prezzo di listino del modello (`shared/src/llm.ts`), senza gli sconti della cache. Dove il prezzo non è noto compaiono solo i token.
