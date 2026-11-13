---
tags: [sviluppo]
---

# Glossario

| Termine | Significato |
| --- | --- |
| **Spec** | Il documento JSON che descrive un'interfaccia. [Spec](../Architettura/Spec.md) |
| **Nodo** | Un elemento della spec: un contenitore, un grafico, un form… |
| **Variabile** | Lo stato di un'interfaccia: un filtro la scrive, una query la legge con `{{nome}}` |
| **Vista** | Un'interfaccia costruita su tabelle esistenti |
| **Mini app** | Un'interfaccia con dati propri (collezioni) |
| **Collezione** | Un insieme di documenti JSON di una mini app. [Dati](../Architettura/Dati.md) |
| **appId** | L'identificativo che separa i documenti di una mini app da quelli delle altre |
| **Query strutturata** | Una richiesta di dati in JSON, che il server controlla e traduce in SQL |
| **Vista libera** | Il nodo `custom`: un componente React scritto dal modello, in una sandbox |
| **Schermata** | Una pagina di un'app, su una rotta. [Procedurale](../Architettura/Procedurale.md) |
| **Rotta** | L'indirizzo di una schermata dentro l'app, con eventuali parametri: `/clienti/:id` |
| **Intento** | La descrizione, scritta su un link, di cosa deve mostrare la schermata di destinazione |
| **Conversazione** | Una chat con le sue versioni; nel codice si chiama ancora *interface* |
| **Versione** | Uno stato salvato della spec di una conversazione |
| **Fornitore** | Chi serve un modello: Anthropic, OpenAI, Google |
| **Impegno** | Quanto lavora il modello su una richiesta (*effort*) |
| **LlmStep** | La funzione che esegue un turno del modello; ogni fornitore ne ha una |
| **Link pubblico** | Un indirizzo con un token che apre solo una mini app, senza account |
