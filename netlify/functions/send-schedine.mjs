/**
 * AlloggiatiCompanion — Invio REALE schedine (Send) — Netlify Function
 * -----------------------------------------------------------------------
 * Raggiungibile su: https://tuosito.netlify.app/api/send-schedine
 * Metodo: POST { righe: string[], confirm: true }
 *
 * ATTENZIONE: questa function trasmette DAVVERO le schedine alla Questura tramite il
 * Web Service ufficiale (operazione Send). Richiede il campo "confirm: true" come
 * ulteriore rete di sicurezza contro chiamate accidentali — il client deve chiedere
 * conferma esplicita all'operatore prima di impostarlo.
 */
import { getAlloggiatiToken } from './_lib/alloggiati-auth.mjs';
import { sendSchedine } from './_lib/soap-alloggiati.mjs';

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

  const righe = Array.isArray(body.righe) ? body.righe : null;
  if (!righe || righe.length === 0) {
    return new Response(JSON.stringify({ error: 'Nessuna riga da inviare (campo "righe" mancante o vuoto)' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (body.confirm !== true) {
    return new Response(JSON.stringify({ error: 'Conferma mancante: imposta "confirm": true solo dopo esplicita conferma dell\'operatore' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { utente, token } = await getAlloggiatiToken();
    const esito = await sendSchedine(utente, token, righe);
    return new Response(JSON.stringify({ ok: true, ...esito }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: e.status || 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

export const config = { path: '/api/send-schedine' };
