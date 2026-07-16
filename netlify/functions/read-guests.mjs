/**
 * AlloggiatiCompanion — Lettura ospiti dal Google Sheet — Netlify Function
 * ---------------------------------------------------------------------------
 * Raggiungibile su: https://tuosito.netlify.app/api/read-guests
 * Metodo: POST { struttura_id, data_arrivo } (data_arrivo nel formato gg/mm/aaaa)
 * Restituisce l'elenco ospiti come oggetti JSON — nessuna conversione in codici qui,
 * se ne occupa il client con le tabelle CSV già caricate.
 */
import { readFilteredGuests } from './_lib/sheet-reader.mjs';

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

  const strutturaId = (body.struttura_id || '').trim();
  const dataArrivo = (body.data_arrivo || '').trim();
  if (!strutturaId || !/^\d{2}\/\d{2}\/\d{4}$/.test(dataArrivo)) {
    return new Response(JSON.stringify({ error: 'struttura_id e data_arrivo (gg/mm/aaaa) sono obbligatori' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const guests = await readFilteredGuests(strutturaId, dataArrivo);
    return new Response(JSON.stringify({ ok: true, guests, count: guests.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: e.status || 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

export const config = { path: '/api/read-guests' };
