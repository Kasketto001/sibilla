---
tags: [sviluppo]
aliases: [Roadmap, Cosa manca]
---

# Limiti

Cosa non c'è, cosa è fragile e cosa non è mai stato verificato. Tenere questa nota onesta vale più di tenerla corta.

## Mai verificato dal vivo

- **OpenAI e Gemini non hanno mai completato una generazione.** Gli adattatori sono provati solo con client finti. Il rischio concreto: lo schema della spec, molto grande, potrebbe essere rifiutato o gestito male come schema di uno strumento.
- I prezzi dei modelli Gemini non sono noti: per loro compaiono solo i token.
- Diversi percorsi dell'interfaccia sono coperti solo dai test automatici, non da una prova a mano: il pulsante Ferma, il login completo, l'aggiunta e modifica di righe dalla schermata Database.

## Dati e utenti

- **SQLite su file**: una sola istanza del server.
- **Le tabelle del database sono comuni a tutti gli utenti** e a chi ha un link pubblico.
- **Le chiavi API sono condivise**: ogni utente le usa e può sostituirle. Non ci sono limiti di spesa.
- Creare una tabella con lo stesso nome di una collezione rompe la mini app che usa quella collezione.
- Una colonna non si può rinominare né eliminare; un tipo non si può cambiare.
- Esportazioni e schermate dei dati si fermano a 1000 righe; la schermata Database mostra le 200 più recenti.
- Nessun recupero della password, nessun ruolo, nessun limite ai tentativi di accesso.

## Generazione

- L'anteprima mentre l'interfaccia viene scritta funziona solo con i modelli Claude.
- Le query strutturate non esprimono `OR`, sottoquery o espressioni calcolate.
- Dalla chat il modello non può modificare né eliminare tabelle.
- Il ragionamento mostrato è un riassunto, e non sempre c'è: a impegno basso il modello può non ragionare.

## Modalità passo per passo

- Dal link pubblico non si generano schermate nuove.
- Le rotte non stanno nell'indirizzo del browser: ricaricando si torna alla prima schermata.
- Non c'è un comando per rigenerare o eliminare una singola schermata.

## Interfaccia

- Su schermi molto stretti i pulsanti della barra del titolo vanno su due righe.
- Le finestre delle mini app generate potrebbero traboccare con tabelle larghe.
- L'app è solo in italiano.

## Idee per dopo

- Postgres, con permessi per riga e chiavi per utente.
- Rotte nell'indirizzo del browser, con cronologia.
- Modifica dello schema delle tabelle (rinomina, elimina colonna).
- Limiti di spesa e riepilogo dei costi.
- Traduzioni.
