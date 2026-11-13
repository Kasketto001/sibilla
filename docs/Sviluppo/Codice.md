---
tags: [sviluppo]
---

# Codice

## shared/

| File | Contenuto |
| --- | --- |
| `spec.ts` | Schema della [spec](../Architettura/Spec.md): nodi, stile, schermate, validazione dell'albero, spec parziale per l'anteprima |
| `collections.ts` | Collezioni: schema, traduzione in tabelle, controlli sui nomi |
| `routes.ts`, `screens.ts` | Rotte e schermate della modalità [procedurale](../Architettura/Procedurale.md) |
| `llm.ts` | Fornitori, modelli, livelli di impegno, prezzi |
| `jsonSchema.ts` | Lo schema JSON della spec mostrato al modello |
| `vars.ts`, `db.ts`, `interfaces.ts` | Variabili nelle query; tipi dello schema del database e delle conversazioni |

## server/src/

| File | Contenuto |
| --- | --- |
| `index.ts` | Avvio: database, chiavi, server HTTP, interfaccia compilata |
| `app.ts` | Tutti gli endpoint, il controllo d'accesso, la traduzione degli errori |
| `generate.ts` | Il ciclo con il modello, il prompt, gli strumenti, il fornitore Claude |
| `openai.ts`, `gemini.ts`, `llm.ts` | Gli altri fornitori e la scelta tra di loro |
| `query.ts` | Controllo e traduzione delle query strutturate |
| `records.ts` | Scritture su tabelle e collezioni, dati iniziali, importazione |
| `tables.ts` | Creazione, estensione ed eliminazione di tabelle |
| `schema.ts`, `db.ts`, `seed.ts` | Lettura dello schema; apertura del database; dati dimostrativi |
| `interfaces.ts` | Conversazioni, versioni, messaggi, link pubblici |
| `auth.ts`, `keys.ts` | Account e sessioni; chiavi API cifrate |
| `bundle.ts`, `libraries.ts`, `custom.ts` | Compilazione delle viste libere e gestione delle librerie npm |

## web/src/

| File | Contenuto |
| --- | --- |
| `App.tsx` | Lo stato dell'app: conversazione aperta, rotta, generazione, salvataggio |
| `Home.tsx`, `Chat.tsx`, `Composer.tsx` | Schermata iniziale, chat, casella di scrittura |
| `InterfacesSidebar.tsx`, `CanvasHeader.tsx` | Barra laterale; barra del titolo con versioni, condivisione, dati |
| `DatabaseView.tsx`, `DataDialog.tsx` | Schermata del database; dati di una mini app |
| `LlmSettings.tsx`, `AccessDialog.tsx` | Scelta del modello; chiavi dei fornitori |
| `Access.tsx`, `SharedApp.tsx` | Login; pagina del link pubblico |
| `api.ts`, `dataApi.ts` | Chiamate al server; accesso ai dati limitato a una mini app |
| `renderer/` | Il renderer della spec: un componente per tipo di nodo, lo stato delle variabili, la sandbox delle viste libere |
| `components/ui/` | Componenti shadcn |
| `theme.tsx`, `index.css` | Tema chiaro e scuro; token di colore |

## Convenzioni

- **Lingue**: codice e commenti in inglese; testi mostrati all'utente e prompt del modello in italiano.
- **Commenti**: spiegano il perché di una scelta, non cosa fa la riga.
- **Errori verso l'utente**: sempre una frase che dice cosa è successo e cosa fare, mai un codice.
- **Dipendenze tra pacchetti**: `server` e `web` importano da `shared`, mai l'uno dall'altro.
