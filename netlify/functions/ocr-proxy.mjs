/**
 * MiPA OCR Proxy — Netlify Function
 * Gestisce chiavi Google Vision diverse per ogni struttura.
 */
export default async (request) => {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  const corsHeaders = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-App-Token',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const expectedToken = process.env.APP_SHARED_TOKEN;
  if (expectedToken) {
    const token = request.headers.get('X-App-Token');
    if (token !== expectedToken) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response('Invalid JSON', { status: 400, headers: corsHeaders });
  }

  const raw = body.image || '';
  const base64Image = raw.includes(',') ? raw.split(',').pop() : raw;
  if (!base64Image) {
    return new Response('Missing image', { status: 400, headers: corsHeaders });
  }

  // === SELEZIONE CHIAVE IN BASE ALLA STRUTTURA ===
  const strutturaId = body.struttura_id || '';
  let apiKey = '';

  // Opzione A: variabile JSON unica (consigliata, più scalabile)
  if (process.env.GOOGLE_VISION_KEYS) {
    try {
      const keysMap = JSON.parse(process.env.GOOGLE_VISION_KEYS);
      apiKey = keysMap[strutturaId] || '';
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid GOOGLE_VISION_KEYS config' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // Opzione B: fallback su variabili dedicate per struttura
  if (!apiKey) {
    apiKey = process.env[`GOOGLE_VISION_API_KEY_${strutturaId}`] || '';
  }

  // Opzione C: fallback legacy su singola chiave globale
  if (!apiKey) {
    apiKey = process.env.GOOGLE_VISION_API_KEY || '';
  }

  if (!apiKey) {
    return new Response(JSON.stringify({ 
      error: 'Missing API key for structure', 
      detail: `Nessuna chiave Vision configurata per la struttura "${strutturaId}".` 
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let visionRes;
  try {
    visionRes = await fetch(
      'https://vision.googleapis.com/v1/images:annotate?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64Image },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          }],
        }),
      }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Vision API unreachable' }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!visionRes.ok) {
    const detail = await visionRes.text();
    return new Response(JSON.stringify({ error: 'Vision API error', detail }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const data = await visionRes.json();
  const annotation = data.responses && data.responses[0] && data.responses[0].fullTextAnnotation;
  const text = annotation ? annotation.text : '';
  const confidence = annotation && annotation.pages && annotation.pages[0] && typeof annotation.pages[0].confidence === 'number'
    ? annotation.pages[0].confidence : null;

  return new Response(JSON.stringify({ text, confidence }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
};

export const config = { path: '/api/ocr-proxy' };
