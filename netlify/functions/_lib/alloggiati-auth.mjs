import { generateToken } from './soap-alloggiati.mjs';

export async function getAlloggiatiToken() {
  const utente = process.env.ALLOGGIATI_USER;
  const password = process.env.ALLOGGIATI_PASSWORD;
  const wskey = process.env.ALLOGGIATI_WSKEY;
  if (!utente || !password || !wskey) {
    const err = new Error('Credenziali Alloggiati Web non configurate sul server (ALLOGGIATI_USER / ALLOGGIATI_PASSWORD / ALLOGGIATI_WSKEY)');
    err.status = 500;
    throw err;
  }
  const token = await generateToken(utente, password, wskey);
  return { utente, token };
}
