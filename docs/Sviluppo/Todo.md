---
tags: [sviluppo, todo]
aliases: [Da fare]
---

# Da fare

Proposte su cosa aggiungere e migliorare, in ordine di priorità dentro ogni gruppo. Ogni voce dice **cosa** e **come**. Il contesto è in [Limiti](Limiti.md) e [Decisioni](Decisioni.md).

## 1. Affidabilità dei modelli

- [ ] **Provare davvero ogni fornitore, in automatico.**
  Come: uno script `npm run test:live` che, per ogni modello con una chiave disponibile, lancia quattro richieste fisse (domanda sui dati, vista, mini app con collezioni, schermata passo per passo) contro un database in memoria e controlla che torni una spec valida. Fuori dalla CI, da lanciare a mano prima di un rilascio.
- [ ] **Collegare e provare Gemini.**
  Come: una chiave da Google AI Studio, poi lo script sopra. Se lo schema della spec viene rifiutato, passare a Gemini una versione ridotta (senza `anyOf` annidati) o lo schema come testo nel prompt.
- [ ] **Anteprima in tempo reale anche con GPT e Gemini.**
  Come: in `openai.ts` ascoltare `response.function_call_arguments.delta`, in `gemini.ts` le parti `functionCall` parziali; ricostruire il JSON incompleto e chiamare `on.input`, come già fa Claude.
- [ ] **Riprovare da soli sugli errori passeggeri.**
  Come: in `generate.ts`, un nuovo tentativo del passo su 429/503/529 con attesa crescente, prima di mostrare l'errore.
- [ ] **Prezzi e modelli aggiornati senza toccare il codice.**
  Come: spostare l'elenco di `shared/src/llm.ts` in un file JSON letto all'avvio, o leggere i modelli dalle API dei fornitori.

## 2. Dati e utenti

- [ ] **Separare i dati per utente.**
  Come: una colonna proprietario sulle tabelle create dall'app e il filtro nel motore delle query (`query.ts`), oppure il passaggio a Postgres con permessi per riga.
- [ ] **Chiavi API per utente e limiti di spesa.**
  Come: `sib_settings` con una colonna utente; una tabella dei consumi alimentata dai costi che ogni generazione già calcola; un tetto mensile che blocca le richieste.
- [ ] **Modificare lo schema delle tabelle.**
  Come: rinomina ed eliminazione di colonna con `ALTER TABLE` in `tables.ts`, più i pulsanti nella schermata Database. Avvisare quali viste usano la colonna (cercandola nelle spec salvate).
- [ ] **Importare un CSV o un Excel come tabella.**
  Come: caricare il file nella schermata Database, proporre nomi e tipi delle colonne dalle prime righe, creare la tabella e inserire le righe con `insertRows`.
- [ ] **Paginazione vera.**
  Come: `offset` nelle query strutturate e nei componenti tabella, al posto del tetto a 200 e 1000 righe.
- [ ] **Recupero della password e ruoli.**
  Come: un comando da terminale per reimpostare una password; un ruolo amministratore per chiavi, registrazioni e database.

## 3. Esperienza d'uso

- [ ] **Rotte nell'indirizzo del browser.**
  Come: scrivere conversazione e rotta nell'URL (`/c/12/clienti/7`) con la History API, così ricaricare, tornare indietro e condividere un punto preciso funzionano.
- [ ] **Annullare e confrontare le versioni.**
  Come: un pulsante «Annulla ultima modifica» che ripristina la versione precedente, e una vista che affianca due versioni.
- [ ] **Modifica diretta, senza chat.**
  Come: cliccando un titolo, un'etichetta o una colonna si modifica la spec sul posto; solo i cambi di struttura passano dal modello.
- [ ] **Rigenerare o eliminare una singola schermata.**
  Come: due azioni nella barra della schermata, che tolgono la voce da `screens` o la rigenerano dallo stesso intento.
- [ ] **Schermate generate anche dal link pubblico.**
  Come: permetterlo al proprietario con un interruttore e un tetto di spesa, perché ogni schermata nuova costa.
- [ ] **Traduzioni.**
  Come: raccogliere i testi dell'interfaccia in un file per lingua; il prompt del modello può restare in italiano con l'istruzione di rispondere nella lingua dell'utente.
- [ ] **Scorciatoie e ricerca globale.**
  Come: una palette (⌘K) per aprire conversazioni, tabelle e azioni.

## 4. Cosa può costruire

- [ ] **Query più espressive.**
  Come: `OR` e gruppi di condizioni, campi calcolati semplici (somme, differenze, percentuali) e `having` in `QuerySchema`, tradotti in `query.ts`.
- [ ] **Azioni oltre il form.**
  Come: un nodo pulsante che modifica un record con valori fissi («segna come pagato») e azioni sulle righe di una tabella.
- [ ] **Nuovi nodi frequenti.**
  Come: calendario, kanban e mappa come nodi standard, così non servono viste libere (più lente e più costose) per i casi comuni.
- [ ] **Automazioni.**
  Come: regole «quando un record cambia, fai…» e attività pianificate, eseguite dal server.
- [ ] **Esportare una mini app.**
  Come: scaricare spec e dati in un file, e reimportarli su un'altra installazione.

## 5. Sicurezza e messa in produzione

- [ ] **Isolare l'installazione dei pacchetti npm.**
  Come: `npm install --ignore-scripts`, un elenco di pacchetti ammessi, o l'installazione in un contenitore.
- [ ] **Limiti di frequenza.**
  Come: un contatore per utente e per indirizzo su accesso e generazione.
- [ ] **Immagine Docker e guida al deploy.**
  Come: un `Dockerfile` che compila l'interfaccia e avvia il server, con un volume per database e segreto.
- [ ] **Copie di sicurezza.**
  Come: un comando che salva database e segreto, e una nota su come ripristinarli.

## 6. Qualità del progetto

- [ ] **Prove nel browser automatiche.**
  Come: Playwright su un server in memoria con un modello finto: login, generazione, navigazione, schermata Database.
- [ ] **Dividere `App.tsx`.**
  Come: spostare la generazione e il salvataggio in un hook (`useConversation`) e la navigazione in un altro (`useRoute`).
- [ ] **Ridurre il peso dell'interfaccia.**
  Come: caricare su richiesta grafici, schermata Database e finestra dei dati (`import()` dinamico).
- [ ] **Registro delle modifiche e versioni.**
  Come: un `CHANGELOG.md` e un tag per ogni rilascio.
