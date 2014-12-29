scrooge
=======

Scrooge is a generic financial data aggregator. It works on the concept of _bank transform_ scripts, and _exporter_ scripts.

Configuration is done through command line options. Command objects are encrypted using AES-128-CBC, with a Key and Cypher.

Running from the command line
-----------------------------
Run using: `node . [KEY] [CYPHER] [BANK_OBJECT] [EXPORT_OBJECT]`

**Example Bank Object**
```json
{
  "bank": "banks/bank_name",
  "username": "superman",
  "password": "abc123",
  "transactionsFor": [1234],
  "days": 10
}
```

**Example Exporter Object**
```json
{
  "name": "exports/export_name",
  "key": "greatAPIkey123"
}
```
