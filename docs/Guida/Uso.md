---
tags: [guida]
---

# Uso

## Una conversazione

Dalla schermata iniziale scrivi cosa ti serve: «una dashboard degli ordini con l'andamento mensile», «un'app per tracciare le spese del team». Puoi dettare, allegare immagini, PDF o testi, incollare uno screenshot da riprodurre.

- La conversazione **si salva da sola** al primo messaggio e compare nella barra laterale.
- Ogni interfaccia generata è una **nuova versione**: dal menu delle versioni torni a una precedente e la ripristini.
- Se fai solo una **domanda sui dati** («quanti clienti abbiamo a Milano?») Sibilla risponde a parole, senza toccare l'interfaccia.
- Durante la generazione vedi cosa sta facendo e l'interfaccia che prende forma; il pulsante di invio diventa **Ferma**.
- Sotto ogni risposta ci sono i **token usati e una stima del costo**.

## Due modi di costruire

Sotto la casella di scrittura scegli:

- **Tutta insieme**: Sibilla costruisce l'app completa in una volta.
- **Passo per passo**: costruisce solo la prima schermata, con link verso le altre. Ogni schermata viene generata la prima volta che ci entri, e poi resta. Vedi [Procedurale](../Architettura/Procedurale.md).

## Modello, impegno, ragionamento

Il pulsante con il nome del modello apre le impostazioni:

- **Modello**: raggruppati per fornitore; quelli di un fornitore non collegato sono disattivati.
- **Impegno**: quanto lavora il modello su una richiesta. Più impegno, risultati più curati ma più tempo e costo.
- **Mostra il ragionamento**: fa comparire il riassunto del ragionamento sopra la risposta.
- **Accesso ai modelli**: dove si incollano le chiavi API.

## Viste e mini app

- Una **vista** lavora su tabelle che esistono già.
- Una **mini app** ha anche dati propri: quando chiedi qualcosa che il database non copre, Sibilla crea le collezioni che servono e le riempie con qualche esempio. Dal pulsante **Dati** nella barra del titolo le vedi, esporti (JSON, CSV), importi e svuoti.

## Database

In fondo alla barra laterale c'è l'elenco delle tabelle con il numero di record.

- Clicca una tabella per aprirla: aggiungi, modifica ed elimina righe, aggiungi colonne, esporta in CSV, elimina la tabella.
- Il **+** apre il modulo per una nuova tabella.
- Puoi chiederlo a parole, da lì o da qualsiasi conversazione: «crea una tabella fornitori con nome, email e città e inserisci dieci esempi». Dalla chat Sibilla può creare tabelle e inserire righe, non modificare o eliminare quelle esistenti.

## Organizzare e condividere

- **Barra laterale**: le conversazioni sono divise in Mini app, Viste e Domande; con più di sei compare la ricerca. Dalla barra del titolo puoi **fissare** una conversazione in alto o **archiviarla**.
- **Condividi**: crea un link pubblico che apre solo l'app, a tutta pagina e senza account. Chi lo ha può usarne i dati; spegnendolo smette di funzionare.
- **Tema**: chiaro, scuro o quello del dispositivo, dal selettore in fondo alla barra laterale.
