import { generateToken } from './soap-alloggiati.mjs';

// Ogni struttura ha il proprio account sul portale Alloggiati Web: le credenziali vanno
// quindi lette in base alla struttura selezionata, non da un'unica variabile globale.
// Convenzione dei nomi variabile: ALLOGGIATI_USER_<ID_STRUTTURA>, ALLOGGIATI_PASSWORD_<ID_STRUTTURA>,
// ALLOGGIATI_WSKEY_<ID_STRUTTURA> — es. ALLOGGIATI_USER_ME006995, ALLOGGIATI_USER_ME001066.
export async function getAlloggiatiToken(strutturaId) {
  if (!strutturaId) {
    const err = new Error('ID struttura mancante: non so quali credenziali usare');
    err.status = 400;
    throw err;
  }

  const suffix = strutturaId.trim().toUpperCase();
  const utente = process.env['ALLOGGIATI_USER_' + suffix];
  const password = process.env['ALLOGGIATI_PASSWORD_' + suffix];
  const wskey = process.env['ALLOGGIATI_WSKEY_' + suffix];

  if (!utente || !password || !wskey) {
    const err = new Error(
      'Credenziali Alloggiati Web non configurate per la struttura "' + strutturaId + '" '
      + '(mancano ALLOGGIATI_USER_' + suffix + ' / ALLOGGIATI_PASSWORD_' + suffix + ' / ALLOGGIATI_WSKEY_' + suffix + ')'
    );
    err.status = 500;
    throw err;
  }
  const token = await generateToken(utente, password, wskey);
  return { utente, token };
}

