import { loginRegione } from './regione-sicilia.mjs';

// Come per Alloggiati Web (Questura), ogni struttura ha il proprio account "UTENTE PMS"
// sulla piattaforma Turist@t della Regione Siciliana: le credenziali vanno quindi lette
// in base alla struttura selezionata, con l'ID struttura come suffisso del nome variabile.
// Convenzione: REGIONE_SICILIA_USERID_<ID_STRUTTURA>, REGIONE_SICILIA_PASSWORD_<ID_STRUTTURA>,
// REGIONE_SICILIA_HOTELCODE_<ID_STRUTTURA> — es. REGIONE_SICILIA_USERID_ME006995.
export async function getRegioneCredentials(strutturaId) {
  if (!strutturaId) {
    const err = new Error('ID struttura mancante: non so quali credenziali Regione Sicilia usare');
    err.status = 400;
    throw err;
  }

  const suffix = strutturaId.trim().toUpperCase();
  const userId = process.env['REGIONE_SICILIA_USERID_' + suffix];
  const password = process.env['REGIONE_SICILIA_PASSWORD_' + suffix];
  const hotelCode = process.env['REGIONE_SICILIA_HOTELCODE_' + suffix];

  if (!userId || !password || !hotelCode) {
    const err = new Error(
      'Credenziali Regione Sicilia (Osservatorio Turistico) non configurate per la struttura "' + strutturaId + '" '
      + '(mancano REGIONE_SICILIA_USERID_' + suffix + ' / REGIONE_SICILIA_PASSWORD_' + suffix + ' / REGIONE_SICILIA_HOTELCODE_' + suffix + ')'
    );
    err.status = 500;
    throw err;
  }

  const token = await loginRegione(userId, password);
  return { userId, hotelCode, token };
}
