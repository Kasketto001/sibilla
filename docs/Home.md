---
tags: [indice]
aliases: [Indice, Sibilla]
---

# Sibilla: base di conoscenza

<img src="allegati/sibilla.svg" width="72" height="72" alt="La sfera di Sibilla">

Tutto quello che serve per usare, capire e modificare Sibilla. Questa cartella è un vault di [Obsidian](https://obsidian.md) (*Apri cartella come vault* → `docs`); le note usano link Markdown normali, quindi si leggono anche su GitHub.

Sibilla in una frase: descrivi in chat l'interfaccia o la mini app che ti serve, un modello ne scrive la descrizione in JSON (la [spec](Architettura/Spec.md)) e l'app la disegna, collegata ai dati veri.

## Guida

- [Installazione](Guida/Installazione.md): requisiti, primo avvio, produzione
- [Configurazione](Guida/Configurazione.md): variabili d'ambiente, chiavi dei modelli, account
- [Uso](Guida/Uso.md): conversazioni, modalità, database, condivisione

## Architettura

- [Panoramica](Architettura/Panoramica.md): i tre pacchetti e il giro di una richiesta
- [Spec](Architettura/Spec.md): il formato dell'interfaccia, nodo per nodo
- [Generazione](Architettura/Generazione.md): il ciclo con il modello, gli strumenti, i fornitori
- [Dati](Architettura/Dati.md): tabelle, collezioni, query strutturate
- [Procedurale](Architettura/Procedurale.md): schermate generate al clic e conservate
- [Sicurezza](Architettura/Sicurezza.md): account, chiavi, sandbox, link pubblici
- [API](Architettura/API.md): gli endpoint HTTP

## Sviluppo

- [Codice](Sviluppo/Codice.md): dove sta cosa
- [Test](Sviluppo/Test.md): come si prova una modifica
- [Decisioni](Sviluppo/Decisioni.md): le scelte di fondo e il loro perché
- [Limiti](Sviluppo/Limiti.md): cosa manca e cosa non è stato verificato
- [Da fare](Sviluppo/Todo.md): proposte su cosa aggiungere e come
- [Glossario](Sviluppo/Glossario.md)

## Storia

- [Design iniziale](Storia/specs/2026-11-13-sibilla-design.md) e [piano della prova di concetto](Storia/plans/2026-11-13-sibilla-poc.md): com'era pensata all'inizio. Sono documenti d'epoca, superati in più punti dalle note qui sopra.
