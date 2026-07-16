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

### Web Service Alloggiati Web (Polizia di Stato)
- `ALLOGGIATI_USER` → il tuo nome utente sul portale
- `ALLOGGIATI_PASSWORD` → la tua password sul portale
- `ALLOGGIATI_WSKEY` → la chiave Web Service (menu account sul portale → "Chiave Web
  Service" → "Genera Nuovo Codice" — una al giorno, da rigenerare ad ogni cambio password)

⚠️ **`ALLOGGIATI_PASSWORD` è la password reale del portale ufficiale**: conservala solo
come variabile d'ambiente su Netlify, mai nel codice.

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
2. Rivedi/deseleziona ospiti se necessario, poi scegli una delle tre azioni:
   - **Genera File TXT**: scarica il file pronto per il caricamento manuale sul portale.
   - **Convalida con la Questura (Test)**: verifica le schedine tramite il Web Service
     ufficiale, **senza inviarle davvero**. Mostra l'esito ospite per ospite.
   - **Invia REALMENTE alla Questura**: trasmette davvero le schedine. Chiede sempre
     conferma esplicita prima di procedere — usala solo dopo aver controllato l'esito
     della convalida.

## 4. Struttura del codice

- `app.js` / `index.html` / `style.css` — frontend (invariati nell'impostazione grafica
  originale, corretti nello schema dei campi)
- `data/*.csv` — tabelle ufficiali (Comuni, Stati, Documenti, Tipo Alloggiato), lette
  direttamente dal browser: nessun dato sensibile qui, possono restare pubbliche
- `netlify/functions/read-guests.mjs` — legge il foglio (richiede Google)
- `netlify/functions/test-schedine.mjs` — convalida (Test) via Web Service Polizia
- `netlify/functions/send-schedine.mjs` — invio reale (Send) via Web Service Polizia
- `netlify/functions/_lib/` — moduli condivisi (autenticazione Google, autenticazione
  Alloggiati Web, client SOAP)

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
