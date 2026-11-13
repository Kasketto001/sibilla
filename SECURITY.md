# Sicurezza

## Segnalare una vulnerabilità

Non aprire una issue pubblica. Usa la segnalazione privata di GitHub (scheda **Security** del repository → **Report a vulnerability**) descrivendo il problema e come riprodurlo. Riceverai una risposta appena possibile.

## Cosa sapere prima di esporre Sibilla

Sibilla è pensata per uso personale o di un piccolo gruppo fidato. Il quadro completo è in [docs/Architettura/Sicurezza.md](docs/Architettura/Sicurezza.md); in breve:

- **Account**: login con email e password (hash scrypt), sessione in un cookie `HttpOnly`. Dopo il primo account la registrazione è chiusa, salvo `SIBILLA_SIGNUP=open`. Con `SIBILLA_AUTH=off` non c'è alcun controllo d'accesso.
- **Chiavi API**: quelle salvate dall'app sono cifrate nel database (AES-256-GCM) con un segreto in `server/.sibilla-secret` o in `SIBILLA_SECRET`. Sono condivise tra tutti gli utenti, che possono anche sostituirle.
- **Dati**: ogni utente vede solo le proprie conversazioni, ma le tabelle del database sono comuni a tutti. I dati di una mini app sono raggiungibili da chi ne conosce l'identificativo o ha il suo link pubblico.
- **Codice generato**: le viste libere sono codice scritto dal modello. Girano in un iframe senza origine, con una Content Security Policy che blocca la rete, e parlano con l'app solo per leggere e scrivere dati. Le librerie npm richieste vengono però scaricate e impacchettate sul server.
- **Niente HTTPS né limiti di frequenza integrati**: mettila dietro un reverse proxy che se ne occupi.

Non committare mai `server/.env`, `server/sibilla.db` o `server/.sibilla-secret`: il `.gitignore` li esclude già.
