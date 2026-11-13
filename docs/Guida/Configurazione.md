---
tags: [guida]
---

# Configurazione

Tutto si configura con variabili d'ambiente, lette da `server/.env` (modello in `server/.env.example`) o dall'ambiente del processo. Nessuna è obbligatoria.

## Variabili

| Variabile | Predefinito | A cosa serve |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | – | Chiave per i modelli Claude |
| `OPENAI_API_KEY` | – | Chiave per i modelli GPT |
| `GEMINI_API_KEY` | – | Chiave per i modelli Gemini |
| `SIBILLA_AUTH` | attivo | `off` disattiva gli account: chiunque raggiunga il server vede tutto |
| `SIBILLA_SIGNUP` | chiusa dopo il primo account | `open` lascia registrare chiunque |
| `SIBILLA_SECRET` | file `.sibilla-secret` | Segreto con cui si cifrano le chiavi salvate dall'app |
| `SIBILLA_DB` | `./sibilla.db` | Percorso del database SQLite (`:memory:` per uno usa e getta) |
| `SIBILLA_LIBS` | `./.sibilla-libs` | Dove finiscono le librerie npm delle viste libere |
| `PORT` | `8787` | Porta del server |
| `SIBILLA_API` | `http://localhost:8787` | Solo in sviluppo: a quale server punta l'interfaccia (`npm run dev -w web`) |

I percorsi relativi partono dalla cartella `server/`.

## Chiavi dei modelli

Una chiave può arrivare da due posti:

- **dall'app** (*Accesso ai modelli*): verificata con una chiamata gratuita al fornitore, poi salvata cifrata nel database;
- **dall'ambiente**: le variabili qui sopra.

Se ci sono entrambe vince quella salvata dall'app. L'app non mostra mai la chiave, solo le ultime quattro cifre e da dove arriva. Le chiavi sono condivise tra tutti gli utenti del server.

## Modelli disponibili

L'elenco sta in `shared/src/llm.ts`: per ogni modello il fornitore, i livelli di impegno accettati e il prezzo di listino usato per la stima dei costi. Per aggiungere o togliere un modello si modifica quel file. Il modello predefinito è `claude-opus-5-5` a impegno medio.

## Account

- Il **primo account** creato prende in carico le conversazioni che esistevano prima.
- **Dopo il primo** la registrazione è chiusa: per aggiungere persone avvia il server con `SIBILLA_SIGNUP=open`, falle registrare, poi toglila.
- Le sessioni durano 30 giorni.
- Non c'è recupero della password: per reimpostarla serve intervenire sul database.

Cosa vede ogni utente e cosa è in comune è descritto in [Sicurezza](../Architettura/Sicurezza.md).
