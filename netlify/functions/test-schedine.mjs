/**
 * AlloggiatiCompanion — Convalida schedine (Test) — Netlify Function
 * -----------------------------------------------------------------------
 * Raggiungibile su: https://tuosito.netlify.app/api/test-schedine
 * Metodo: POST { righe: string[] } — righe già costruite lato client (168 caratteri
 * ciascuna). Chiama GenerateToken + Test sul Web Service ufficiale: NESSUN invio reale.
 */
import { getAlloggiatiToken } from './_lib/alloggiati-auth.mjs';
import { testSchedine } from './_lib/soap-alloggiati.mjs';

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
    return new Response(JSON.stringify({ error: 'Nessuna riga da convalidare (campo "righe" mancante o vuoto)' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { utente, token } = await getAlloggiatiToken();
    const esito = await testSchedine(utente, token, righe);
    return new Response(JSON.stringify({ ok: true, ...esito }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: e.status || 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

export const config = { path: '/api/test-schedine' };
