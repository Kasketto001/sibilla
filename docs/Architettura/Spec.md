---
tags: [architettura]
aliases: [UI spec]
---

# Spec

La spec è il documento JSON che descrive un'interfaccia. La scrive il modello, la valida il server, la disegna il renderer. Lo schema sta in `shared/src/spec.ts`.

## Forma

```jsonc
{
  "title": "Ordini",
  "style": { "colorScheme": "dark", "primary": "#7c3aed" },   // opzionale
  "variables": [{ "name": "stato", "type": "string", "default": null }],
  "nodes": [
    { "id": "root", "parentId": null, "type": "stack", "direction": "column" },
    { "id": "f", "parentId": "root", "type": "filter", "variable": "stato", "label": "Stato", "input": "select", ... },
    { "id": "t", "parentId": "root", "type": "table", "query": { ... }, "columns": [ ... ] }
  ],
  // Assegnati dal server, mai dal modello:
  "appId": "…", "collections": [ ... ], "procedural": true, "screens": [ ... ]
}
```

- **Lista piatta di nodi**: ognuno ha un `id` unico e un `parentId`. Un solo nodo è la radice (`parentId: null`).
- **Variabili**: lo stato dell'interfaccia. Un filtro scrive in una variabile; una query la legge con `"{{nome}}"`. Una variabile vuota fa cadere la condizione che la usa.
- **Stile**: tema chiaro o scuro, colori, raggio, font, densità, senza riscrivere i nodi.

## Nodi

| Tipo | A cosa serve |
| --- | --- |
| `stack`, `grid`, `card`, `tabs` + `tab`, `dialog` | Contenitori: impaginazione, sezioni, schede, finestre |
| `heading`, `text` | Titoli e testo (Markdown) |
| `kpi` | Un numero, da una query con un aggregato |
| `table` | Elenco con ordinamento e paginazione; `rowClick` scrive una variabile, `rowLink` apre un'altra schermata |
| `chart` | Barre, linee, aree, torta |
| `filter` | Selezione, ricerca o data che scrive in una variabile |
| `form` | Crea o modifica un record di una tabella o collezione; `allowDelete` aggiunge l'eliminazione |
| `link` | Pulsante o collegamento verso un'altra schermata dell'app |
| `custom` | Vista libera: un componente React scritto dal modello, con librerie npm, in una sandbox |

I nodi foglia non hanno figli; i figli di `tabs` sono solo `tab`.

## Cosa viene controllato

Prima che una spec arrivi all'utente o venga salvata:

1. **Schema** (`SpecSchema`): tipi e campi, oggetti chiusi.
2. **Albero** (`validateSpecTree`): una sola radice, niente cicli, genitori esistenti, variabili dichiarate, rotte valide.
3. **Dati** (`specProblems`, sul server): tabelle e colonne esistono, i campi usati da tabelle e grafici sono prodotti dalla query, i form includono i campi obbligatori.
4. **Viste libere** (`customProblems`): il codice viene davvero compilato con le sue librerie.

Ogni problema torna al modello come testo, e il modello corregge.

## Collezioni e schermate

- `collections` dichiara i dati propri di una mini app: vedi [Dati](Dati.md).
- `screens` contiene le schermate oltre la prima, una per rotta: vedi [Procedurale](Procedurale.md).

Il modello scrive sempre una schermata per volta: `appId`, `procedural` e `screens` sono tolti dallo schema che gli viene mostrato (`shared/src/jsonSchema.ts`).

## Aggiungere un tipo di nodo

1. Aggiungilo a `NodeSchema` in `shared/src/spec.ts` (e a `LEAF_TYPES` se non ha figli).
2. Scrivi il componente in `web/src/renderer/` e registralo in `VIEWS` (`Renderer.tsx`).
3. Descrivilo nel prompt in `server/src/generate.ts`, e aggiungi i controlli in `specProblems` se usa dati.
4. Aggiungi i test.
