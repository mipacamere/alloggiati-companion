# AlloggiatiCompanion — Guida di configurazione

App interna (non pubblica) per acquisire gli ospiti dal Google Sheet condiviso,
generare il file TXT per il portale Alloggiati Web, e convalidare/inviare le schedine
tramite il Web Service ufficiale della Polizia di Stato.

**Progetto Netlify separato** da MiPA Companion (l'app che usa l'ospite): sito diverso,
credenziali configurate separatamente, per una netta separazione tra lo strumento
pubblico e quello ad uso interno.

## 1. Pubblica il sito su Netlify

Stesso procedimento già visto per MiPA Companion: crea un nuovo sito Netlify da questo
repository/cartella (drag & drop, o collegato a un repo Git — non deve essere lo stesso
repo di MiPA Companion).

## 2. Variabili d'ambiente da configurare

Pannello Netlify → questo sito → **Site configuration → Environment variables**:

### Lettura del Google Sheet (stesso account di servizio già usato in MiPA Companion)
- `GOOGLE_SHEET_ID` → l'ID del foglio condiviso (lo stesso di MiPA Companion)
- `GOOGLE_SHEET_NAME` → `Sheet1`
- `GOOGLE_SA_EMAIL` → l'email dell'account di servizio Google
- `GOOGLE_SA_PRIVATE_KEY` → la chiave privata dell'account di servizio (stesso valore
  già usato in MiPA Companion — vedi le note lì su come incollarla correttamente)

L'account di servizio deve avere accesso al foglio come **Editor o Lettore** — se è già
condiviso con lui per MiPA Companion, va bene anche qui, non serve rifare nulla su
Google Cloud.

### Web Service Alloggiati Web (Polizia di Stato) — una credenziale per ogni struttura

⚠️ **Importante**: ogni struttura ha il **proprio account** distinto sul portale
Alloggiati Web (utente, password e chiave Web Service sono specifici per ciascuna).
Le variabili vanno quindi create **una volta per ogni struttura**, con l'ID struttura
come suffisso del nome:

Per MiPA (`ME006995`):
- `ALLOGGIATI_USER_ME006995` → nome utente sul portale per questa struttura
- `ALLOGGIATI_PASSWORD_ME006995` → password sul portale per questa struttura
- `ALLOGGIATI_WSKEY_ME006995` → chiave Web Service per questa struttura

Per Via Nazionale (`ME001066`):
- `ALLOGGIATI_USER_ME001066`
- `ALLOGGIATI_PASSWORD_ME001066`
- `ALLOGGIATI_WSKEY_ME001066`

Se in futuro aggiungi altre strutture, ripeti lo schema con il relativo ID (e aggiungi
anche l'opzione corrispondente nel menu a tendina di `index.html`).

La WSKEY si genera dal menu account sul portale (diverso per ciascun account/struttura)
→ **"Chiave Web Service"** → **"Genera Nuovo Codice"** — una al giorno, da rigenerare
ad ogni cambio password.

⚠️ **`ALLOGGIATI_PASSWORD_*` sono le password reali del portale ufficiale**: conservale
solo come variabili d'ambiente su Netlify, mai nel codice.

### Web-API Osservatorio Turistico Regione Siciliana (Turist@t) — statistiche ISTAT, opzionale

⚠️ Adempimento **distinto e aggiuntivo** rispetto all'invio alla Questura: la Regione
Siciliana richiede alle strutture ricettive di comunicare quotidianamente i dati sul
movimento dei clienti anche all'Osservatorio Turistico regionale, ai fini della
rilevazione ISTAT. Per usare questa funzione dall'app serve un account di tipo
**UTENTE PMS** (diverso dall'account "struttura ricettiva" con cui si accede al
portale via browser): va richiesto al Servizio 3 "Osservatorio Turistico"
dell'Assessorato Regionale del Turismo (per la provincia di Messina:
servizioturistico.ct@certmail.regione.sicilia.it, o il servizio turistico provinciale
competente), indicando esplicitamente che si vuole collegare un gestionale (PMS).

Una volta ricevute le credenziali PMS (username e password iniziano tipicamente con
`TRS-IT-SIC-...`) e il relativo **Hotel Code** (visibile nel portale alla voce "Codice
Identificativo"), imposta su Netlify, una volta per ogni struttura:

Per MiPA (`ME006995`):
- `REGIONE_SICILIA_USERID_ME006995`
- `REGIONE_SICILIA_PASSWORD_ME006995`
- `REGIONE_SICILIA_HOTELCODE_ME006995`

Per Via Nazionale (`ME001066`):
- `REGIONE_SICILIA_USERID_ME001066`
- `REGIONE_SICILIA_PASSWORD_ME001066`
- `REGIONE_SICILIA_HOTELCODE_ME001066`

Se una struttura non ha ancora queste credenziali configurate, il pulsante "Invia Dati
alla Regione" resterà comunque visibile e cliccabile, ma la Netlify Function risponderà
con un errore chiaro che indica quali variabili mancano — non blocca in alcun modo
l'invio alla Questura, che resta indipendente.

**Limite noto**: il tracciato della Regione richiede anche il campo "comune/stato di
**residenza**" dell'ospite, dato che questa app **non raccoglie** (il tracciato
Alloggiati Web della Questura non lo prevede). Per non bloccare l'invio, l'app imposta
automaticamente questo campo uguale al **luogo di nascita** dell'ospite — un'
approssimazione dichiarata anche nell'interfaccia, non il dato di residenza reale. Se in
futuro serve maggiore precisione statistica, andrebbe aggiunto un campo "residenza"
all'anagrafica ospite (Google Sheet + form OCR) e aggiornata la funzione
`buildRegioneStayForGuest` in `app.js`.

### Protezione dell'app
- `APP_SHARED_TOKEN` → una stringa a scelta (es. `alloggiati2026xyz`), usata come
  "password" leggera tra il frontend e le function di questo sito. **Diversa** da quella
  usata su MiPA Companion — sono due siti distinti con le loro chiavi.

Dopo aver impostato le variabili, in `app.js` aggiorna questa riga con lo stesso valore
scelto per `APP_SHARED_TOKEN`:
```js
const APP_TOKEN = 'CHANGE-ME'; // <-- sostituisci con lo stesso valore di APP_SHARED_TOKEN
```

## 3. Come funziona l'app

1. Scegli **data di arrivo** (solo oggi o ieri, coerente con le regole di MiPA Companion)
   e **struttura**, poi premi "Carica Dati": la Netlify Function legge il Google Sheet e
   restituisce gli ospiti corrispondenti.
2. Rivedi/deseleziona ospiti se necessario, poi scegli una delle azioni:
   - **Genera File TXT**: scarica il file pronto per il caricamento manuale sul portale.
   - **Convalida con la Questura (Test)**: verifica le schedine tramite il Web Service
     ufficiale, **senza inviarle davvero**. Mostra l'esito ospite per ospite.
   - **Invia REALMENTE alla Questura**: trasmette davvero le schedine. Chiede sempre
     conferma esplicita prima di procedere — usala solo dopo aver controllato l'esito
     della convalida.
   - **Invia Dati alla Regione (Osservatorio Turistico Sicilia)**: invio distinto e
     aggiuntivo, ai soli fini statistici ISTAT, verso la piattaforma Turist@t della
     Regione Siciliana. Richiede le credenziali PMS descritte sopra; chiede conferma
     esplicita prima di procedere e mostra l'esito di validazione per ogni ospite.

## 4. Struttura del codice

- `app.js` / `index.html` / `style.css` — frontend (invariati nell'impostazione grafica
  originale, corretti nello schema dei campi)
- `data/*.csv` — tabelle ufficiali (Comuni, Stati, Documenti, Tipo Alloggiato), lette
  direttamente dal browser: nessun dato sensibile qui, possono restare pubbliche
- `netlify/functions/read-guests.mjs` — legge il foglio (richiede Google)
- `netlify/functions/test-schedine.mjs` — convalida (Test) via Web Service Polizia
- `netlify/functions/send-schedine.mjs` — invio reale (Send) via Web Service Polizia
- `netlify/functions/send-regione-sicilia.mjs` — invio dati statistici ISTAT alla
  Regione Siciliana (Osservatorio Turistico / Turist@t), indipendente dall'invio alla
  Questura
- `netlify/functions/_lib/` — moduli condivisi (autenticazione Google, autenticazione
  Alloggiati Web, client SOAP, client REST + autenticazione Regione Siciliana)

## Nota sullo schema dati

Questa app si aspetta che il Google Sheet abbia le 17 colonne nell'ordine definito da
MiPA Companion:
```
id | struttura_id | tipo_alloggiato | data_arrivo | permanenza | cognome | nome | sesso |
data_nascita | comune_nascita | provincia_nascita | stato_nascita | cittadinanza |
tipo_documento | numero_documento | luogo_rilascio | data_scansione
```
Se lo schema del foglio cambia in futuro, va aggiornata la costante `COLUMNS` in
`netlify/functions/_lib/sheet-reader.mjs`.
