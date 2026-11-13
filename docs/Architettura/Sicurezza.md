---
tags: [architettura, sicurezza]
---

# Sicurezza

Sibilla è pensata per una persona o un piccolo gruppo fidato. Questa nota dice cosa protegge e cosa no.

## Account e sessioni

`server/src/auth.ts`. Password con hash scrypt e sale casuale; sessione in un cookie `HttpOnly`, `SameSite=Lax`, valida 30 giorni. Con gli account attivi ogni chiamata alle API richiede una sessione, tranne quelle di accesso, i file delle viste libere e ciò che è concesso a un link pubblico.

- Dopo il primo account la registrazione è chiusa (`SIBILLA_SIGNUP=open` la riapre).
- Con `SIBILLA_AUTH=off` non c'è controllo d'accesso: usalo solo su una macchina che raggiungi soltanto tu.
- Mancano: recupero password, limiti ai tentativi di accesso, ruoli.

## Chi vede cosa

| Dato | Visibile a |
| --- | --- |
| Conversazioni, versioni, messaggi | Solo chi le ha create |
| Tabelle del database | Tutti gli utenti, e chi ha un link pubblico |
| Documenti di una mini app | Chi ne conosce l'`appId` (un UUID) o ha il suo link pubblico |
| Chiavi API | Nessuno le legge; tutti gli utenti le usano e possono sostituirle |

Non c'è separazione per utente dei dati del database: è il limite più importante per un uso condiviso.

## Chiavi API

`server/src/keys.ts`. Le chiavi salvate dall'app sono cifrate con AES-256-GCM. Il segreto viene da `SIBILLA_SECRET` o da `server/.sibilla-secret`, creato al primo avvio e leggibile solo dal proprietario. Senza quel segreto le chiavi salvate non si possono leggere e vanno reinserite. Le API non restituiscono mai una chiave, solo le ultime quattro cifre.

## Link pubblici

Un link pubblico porta un token casuale. Con quel token si può soltanto: leggere la spec dell'app, interrogare e scrivere i dati di **quella** app (e leggere le tabelle del database), caricare le viste libere. Non si può generare, vedere conversazioni, gestire chiavi o il database. Spegnendo la condivisione il token smette di valere.

## SQL

Nessun testo scritto dal modello o dall'utente diventa SQL. Le query sono strutturate e ogni nome è verificato contro lo schema; i valori sono parametri. I nomi di tabelle, colonne, collezioni e campi devono essere identificatori minuscoli e vengono ricontrollati nel punto in cui entrano nell'SQL.

## Codice generato

Le viste libere (`custom`) sono componenti React scritti dal modello.

- **Nel browser** girano in un iframe `sandbox` senza `allow-same-origin`: origine opaca, nessun accesso all'app, ai cookie o alla sessione. Una Content Security Policy blocca ogni connessione di rete (`connect-src 'none'`). I dati passano solo da un ponte `postMessage` che espone lettura, scrittura e navigazione.
- **Sul server** le librerie npm richieste vengono scaricate con npm e impacchettate con esbuild. Il codice della vista non viene eseguito sul server, ma l'installazione di un pacchetto npm sì: è il punto più delicato. Chi può far generare una vista può far scaricare un pacchetto.
- Le immagini da qualunque indirizzo `https` sono permesse nella sandbox: un canale possibile di uscita dei dati mostrati.

## Prima di esporla

- Mettila dietro un reverse proxy con HTTPS.
- Tieni chiusa la registrazione.
- Considera che ogni utente può spendere con le chiavi configurate: non ci sono limiti di spesa.
- Fai copie di `server/sibilla.db` e conserva `server/.sibilla-secret`.

Per segnalare un problema: [SECURITY.md](../../SECURITY.md).
