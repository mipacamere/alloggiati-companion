// Lettura delle righe del Google Sheet, filtrate per struttura + data di arrivo, e
// restituite come oggetti con nomi di campo (non righe grezze) — la conversione nei
// codici ufficiali avviene lato client in app.js, che ha già le tabelle CSV caricate.

import { getGoogleAccessToken, normalizePrivateKey } from './google-auth.mjs';

// Colonne del foglio (A:Q), nell'ordine scritto dall'app MiPA Companion (ospiti):
// id | struttura_id | tipo_alloggiato | data_arrivo | permanenza | cognome | nome | sesso |
// data_nascita | comune_nascita | provincia_nascita | stato_nascita | cittadinanza |
// tipo_documento | numero_documento | luogo_rilascio | data_scansione
const COLUMNS = [
  'id', 'struttura_id', 'tipo_alloggiato', 'data_arrivo', 'permanenza', 'cognome', 'nome',
  'sesso', 'data_nascita', 'comune_nascita', 'provincia_nascita', 'stato_nascita',
  'cittadinanza', 'tipo_documento', 'numero_documento', 'luogo_rilascio', 'data_scansione',
];

function rowToObject(row) {
  const obj = {};
  COLUMNS.forEach((key, i) => { obj[key] = (row[i] || '').trim(); });
  return obj;
}

export async function readFilteredGuests(strutturaId, dataArrivo) {
  const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
  const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
  const SA_EMAIL = process.env.GOOGLE_SA_EMAIL;
  const SA_PRIVATE_KEY = normalizePrivateKey(process.env.GOOGLE_SA_PRIVATE_KEY);

  if (!SPREADSHEET_ID || !SA_EMAIL || !SA_PRIVATE_KEY) {
    const err = new Error('Google Sheets non configurato sul server (variabili mancanti)');
    err.status = 500;
    throw err;
  }

  const accessToken = await getGoogleAccessToken(SA_EMAIL, SA_PRIVATE_KEY, 'https://www.googleapis.com/auth/spreadsheets.readonly')
    .catch(e => { const err = new Error('Autenticazione Google fallita: ' + (e.message || e)); err.status = 502; throw err; });

  const range = encodeURIComponent(SHEET_NAME + '!A2:Q');
  const res = await fetch(
    'https://sheets.googleapis.com/v4/spreadsheets/' + SPREADSHEET_ID + '/values/' + range,
    { headers: { Authorization: 'Bearer ' + accessToken } }
  );
  if (!res.ok) {
    const detail = await res.text();
    const err = new Error('Lettura da Google Sheets fallita: ' + detail);
    err.status = 502;
    throw err;
  }
  const data = await res.json();
  const allRows = (data.values || []).map(rowToObject);
  return allRows.filter(g => g.struttura_id === strutturaId && g.data_arrivo === dataArrivo);
}
