---
tags: [architettura]
aliases: [Passo per passo, Modalità procedurale]
---

# Procedurale

Nella modalità **Passo per passo** un'app non viene generata tutta insieme: nasce come una schermata, e ogni altra schermata viene scritta la prima volta che qualcuno ci entra, poi conservata.

## Rotte e schermate

Ogni schermata sta su una rotta: `/`, `/clienti`, `/clienti/:id`, `/ordini/nuovo`. I segmenti sono minuscoli; `:nome` è un parametro (`shared/src/routes.ts`).

La spec dell'app contiene la prima schermata (i suoi `nodes`) e, in `screens`, le altre:

```json
{ "path": "/clienti/:id", "title": "Scheda cliente",
  "variables": [{ "name": "id", "type": "number", "default": null }],
  "nodes": [ ... ], "message": "Qui trovi la scheda del cliente…" }
```

**Una schermata per rotta, non per record.** `/clienti/:id` è generata una volta e vale per tutti i clienti: il parametro arriva come variabile, e le query la usano con `"{{id}}"`. Il server rifiuta una schermata che non dichiara la variabile di ogni parametro della sua rotta.

## Come si naviga

Tre cose portano a un'altra schermata:

- il nodo `link` (pulsante o collegamento);
- `rowLink` su una tabella: il clic su una riga apre la schermata, con i parametri presi dai campi della riga;
- `navigate(rotta, parametri, intento)` nelle viste libere.

Ogni collegamento porta un `intent`: la descrizione di cosa deve mostrare la destinazione. È ciò che il modello saprà quando dovrà generarla.

## Cosa succede al clic

1. L'interfaccia cerca la schermata con `screenSpec(app, rotta)` (`shared/src/screens.ts`).
2. **Se esiste**, la apre subito: nessuna chiamata al modello.
3. **Se non esiste**, chiede al server di generarla, passando la schermata di provenienza, l'elenco delle rotte già presenti, la rotta, i parametri e l'intento. Il modello scrive solo quella schermata e una frase di risposta.
4. `withScreen` la inserisce nell'app, che viene salvata come nuova versione. La risposta compare in chat.

Quello che l'utente chiede in chat vale per la schermata che sta guardando: le altre restano intatte.

## Limiti

- Chi apre l'app da un link pubblico naviga solo tra le schermate già generate.
- Le rotte non finiscono nell'indirizzo del browser: ricaricando si torna alla prima schermata.
- Rigenerare una schermata esistente si fa chiedendolo in chat mentre la si guarda; non c'è un comando apposito.
