---
tags: [sviluppo, decisioni]
---

# Decisioni

Le scelte di fondo, con il motivo. Aggiungi una voce quando ne prendi una che un futuro contributore potrebbe voler rimettere in discussione.

## Il modello scrive una spec, non codice

Una descrizione in JSON si valida, si versiona, si corregge un pezzo alla volta e non può fare nulla che il renderer non preveda. Il codice libero resta possibile (nodo `custom`), ma è l'eccezione e gira in una sandbox.

## Niente SQL dal modello

Le query sono strutturate e controllate contro lo schema. Si perde espressività (niente sottoquery, niente `OR`), si guadagna che nessun testo generato arrivi al database. Quando una query non si può esprimere, il modello ripiega su una vista libera che elabora i dati nel browser.

## Collezioni di documenti per le mini app

Una mini app deve poter nascere e cambiare senza migrazioni. I dati stanno come JSON in una sola tabella, e la loro forma è dichiarata nella spec: versionando la spec si versiona anche lo schema. Le definizioni viaggiano con ogni richiesta, così bozze e versioni vecchie funzionano senza uno stato da tenere allineato sul server.

## Tabelle vere per i dati condivisi

Le collezioni appartengono a un'app. Per dati usati da più interfacce servono tabelle del database, che si creano dalla schermata Database o dalla chat. Dalla chat il modello può solo creare e riempire: modificare ed eliminare restano gesti espliciti dell'utente.

## Una schermata per volta

Il modello vede e scrive sempre una sola schermata. Le altre vengono attaccate intorno dal codice (`withScreen`). Così una modifica non può rovinare il resto dell'app e il costo di una richiesta non cresce con la sua dimensione.

## Schermate generate al clic, per rotta

Nella modalità passo per passo una schermata corrisponde a una rotta con parametri, non a un record: generata una volta, vale per tutti. Il server rifiuta le schermate che scrivono un valore fisso al posto del parametro.

## Tutto si salva da solo

Una conversazione è salvata al primo messaggio e ogni interfaccia generata è una versione. Niente bozze, niente «salva»: si può solo tornare indietro.

## Un'astrazione sola per i fornitori

Il ciclo parla con un `LlmStep` nella forma dei messaggi di Claude; OpenAI e Gemini sono adattatori che convertono. Aggiungere un fornitore non tocca il ciclo.

## SQLite su file, login locale

Per partire senza servizi esterni: `npm install` e funziona. Il costo è che non regge più istanze né una vera separazione dei dati tra utenti. Il codice che parla SQL è concentrato in pochi file proprio per poterlo sostituire.

## Interfaccia quieta

Colore sui dati e sull'azione principale, non sulla cornice: voce attiva in grigio, niente ombre a riposo, niente icone decorative. La sfera è l'unico elemento animato ed è il segno del prodotto.
