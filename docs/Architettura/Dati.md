---
tags: [architettura]
---

# Dati

Sibilla lavora su due tipi di dati, che query, form e viste libere usano allo stesso modo.

## Tabelle

Tabelle SQL vere nel file SQLite. Il server ne legge lo schema (`server/src/schema.ts`) e lo rilegge ogni volta che una tabella viene creata, estesa o eliminata.

- Si gestiscono dalla schermata **Database** o dalla chat (`server/src/tables.ts`): creare una tabella (sempre con un `id` numerico automatico), aggiungere una colonna, eliminare una tabella a cui nessun'altra punta, inserire righe.
- I nomi sono identificatori minuscoli, controllati prima di arrivare all'SQL; le tabelle `sib_` di Sibilla non si possono né vedere né toccare.
- Sono **comuni a tutti gli utenti**.

## Collezioni

I dati propri di una mini app. Una spec le dichiara in `collections`:

```json
{ "name": "attivita", "fields": [
  { "name": "titolo", "type": "text", "required": true, "references": null },
  { "name": "assegnatario_id", "type": "number", "required": false, "references": "membri" }
] }
```

- Sono **documenti JSON** nella tabella `sib_docs`, separati per `appId` (l'identificativo dell'app, assegnato dal server alla prima generazione).
- **Niente migrazioni**: aggiungere un campo significa solo dichiararlo; i documenti esistenti lo hanno vuoto.
- Ogni collezione ha in automatico `id`, `creato_il`, `aggiornato_il`.
- Le definizioni viaggiano con ogni richiesta (`app: { id, collections }`): la spec è la loro unica fonte di verità, e il server le valida ogni volta (`shared/src/collections.ts`).
- Eliminando una conversazione si eliminano i documenti della sua app; i documenti di app mai salvate vengono rimossi all'avvio dopo un giorno.

Per il motore delle query una collezione è una tabella derivata: una sottoquery che estrae ogni campo dal JSON. Per questo si può filtrare, aggregare e mettere in join con le tabelle vere.

## Query strutturate

Né il modello né l'interfaccia scrivono SQL. Descrivono cosa vogliono:

```json
{
  "table": "ordini",
  "select": ["month(data)", "clienti.segmento"],
  "join": [{ "table": "clienti", "on": ["cliente_id", "id"] }],
  "where": [{ "field": "stato", "op": "eq", "value": "{{stato}}" }],
  "groupBy": ["month(data)", "clienti.segmento"],
  "aggregates": [{ "fn": "sum", "field": "totale", "as": "fatturato" }],
  "orderBy": [{ "field": "month_data", "dir": "asc" }],
  "limit": null
}
```

`server/src/query.ts` controlla ogni tabella e colonna contro lo schema, poi costruisce l'SQL con i valori come parametri. Operatori: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `in`, `is_null`, `not_null`. Aggregati: `count`, `count_distinct`, `sum`, `avg`, `min`, `max`. Sulle date: `year()`, `month()`, `day()`. Limite predefinito 200 righe, massimo 1000.

## Scritture

`server/src/records.ts` crea, modifica ed elimina un record di una tabella o di una collezione, con le stesse regole: campi sconosciuti rifiutati, tipi convertiti, obbligatori verificati, riferimenti controllati. Gli errori tornano campo per campo, e l'interfaccia li mostra sotto il campo giusto.

Eliminando un documento di una collezione, i campi che puntavano a lui vengono svuotati.

## Tabelle di Sibilla

| Tabella | Contenuto |
| --- | --- |
| `sib_interfaces` | Le conversazioni: nome, proprietario, fissata, archiviata, token del link pubblico |
| `sib_versions` | Le versioni della spec di ogni conversazione |
| `sib_messages` | I messaggi della chat, con ragionamento e costi |
| `sib_docs` | I documenti delle collezioni |
| `sib_settings` | Le chiavi API salvate, cifrate |
| `sib_users`, `sib_sessions` | Account e sessioni |

Le colonne aggiunte dopo la prima versione vengono create all'apertura del database (`ADDED` in `server/src/db.ts`).
