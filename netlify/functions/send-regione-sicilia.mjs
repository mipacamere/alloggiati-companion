/**
 * AlloggiatiCompanion — Invio dati statistici alla Regione Siciliana
 * (Osservatorio Turistico / piattaforma Turist@t) — Netlify Function
 * -----------------------------------------------------------------------
 * Raggiungibile su: https://tuosito.netlify.app/api/send-regione-sicilia
 * Metodo: POST { struttura_id: string, stays: object[] }
 *
 * Invio distinto e aggiuntivo rispetto a quello alla Questura (send-schedine.mjs):
 * questo endpoint comunica i dati all'Osservatorio Turistico della Regione Siciliana
 * ai soli fini della rilevazione statistica ISTAT "Movimento dei clienti nelle
 * strutture ricettive", secondo il Protocollo di Comunicazione PMS pubblicato su
 * osservatorioturistico.regione.sicilia.it.
 *
 * Gli oggetti "stays" arrivano già pronti dal client (uno per ospite selezionato, con i
 * codici ufficiali Nazioni/Comuni/Tipo Alloggiato già risolti lato browser tramite le
 * stesse tabelle usate per la Questura). Login/Logout e la scelta del HotelCode
 * autorevole avvengono qui, in base alle credenziali configurate per la struttura.
 */
import { getRegioneCredentials } from './_lib/regione-sicilia-auth.mjs';
import { sendStaysToRegione, logoutRegione } from './_lib/regione-sicilia.mjs';

export default async (request) => {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  const corsHeaders = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-App-Token',
  };

  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  const expectedToken = process.env.APP_SHARED_TOKEN;
  if (expectedToken) {
    const token = request.headers.get('X-App-Token');
    if (token !== expectedToken) return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response('Invalid JSON', { status: 400, headers: corsHeaders });
  }

  const stays = Array.isArray(body.stays) ? body.stays : null;
  const strutturaId = (body.struttura_id || '').trim();
  if (!stays || stays.length === 0) {
    return new Response(JSON.stringify({ error: 'Nessun soggiorno da inviare (campo "stays" mancante o vuoto)' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!strutturaId) {
    return new Response(JSON.stringify({ error: 'Campo "struttura_id" mancante: necessario per scegliere le credenziali corrette' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let credenziali;
  try {
    credenziali = await getRegioneCredentials(strutturaId);
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: e.status || 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { userId, hotelCode, token } = credenziali;

  try {
    const esito = await sendStaysToRegione(hotelCode, token, stays);
    return new Response(JSON.stringify({ ok: true, ...esito }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: e.status || 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } finally {
    // Logout best-effort: non deve influire sulla risposta già inviata all'operatore.
    logoutRegione(userId, token).catch(() => {});
  }
};

export const config = { path: '/api/send-regione-sicilia' };
