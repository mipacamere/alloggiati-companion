// Client SOAP minimale (nessuna libreria esterna) per il Web Service ufficiale
// WS_ALLOGGIATI della Polizia di Stato: https://alloggiatiweb.poliziadistato.it/service/service.asmx

const SERVICE_URL = 'https://alloggiatiweb.poliziadistato.it/service/Service.asmx';

function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function extractTag(xml, tag) {
  const m = xml.match(new RegExp('<' + tag + '>([\\s\\S]*?)<\\/' + tag + '>'));
  return m ? m[1] : null;
}

function extractAllTags(xml, tag) {
  const re = new RegExp('<' + tag + '>([\\s\\S]*?)<\\/' + tag + '>', 'g');
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

async function soapCall(action, bodyXml) {
  const envelope = '<?xml version="1.0" encoding="utf-8"?>'
    + '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
    + 'xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">'
    + '<soap:Body>' + bodyXml + '</soap:Body></soap:Envelope>';

  const res = await fetch(SERVICE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': '"AlloggiatiService/' + action + '"',
    },
    body: envelope,
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error('SOAP HTTP ' + res.status + ': ' + text.slice(0, 500));
    err.status = 502;
    throw err;
  }
  return text;
}

// Ottiene un token temporaneo dal portale, usando le credenziali dell'account e la WSKEY
// generata dal menu "Chiave Web Service".
export async function generateToken(utente, password, wskey) {
  const body = '<GenerateToken xmlns="AlloggiatiService">'
    + '<Utente>' + xmlEscape(utente) + '</Utente>'
    + '<Password>' + xmlEscape(password) + '</Password>'
    + '<WsKey>' + xmlEscape(wskey) + '</WsKey>'
    + '</GenerateToken>';
  const xml = await soapCall('GenerateToken', body);

  const errore = extractTag(xml, 'ErroreDettaglio');
  const token = extractTag(xml, 'token') || extractTag(xml, 'Token');
  if (!token) {
    const err = new Error('Token non ottenuto' + (errore ? ': ' + errore : ' (risposta inattesa dal servizio)'));
    err.status = 502;
    throw err;
  }
  return token;
}

function parseEsitoResponse(xml, righe) {
  const resultTag = extractTag(xml, 'TestResult') !== null ? 'TestResult' : 'SendResult';
  const topBlock = extractTag(xml, resultTag) || '';
  const topLevelError = extractTag(topBlock, 'ErroreDettaglio') || '';

  const resultBlock = extractTag(xml, 'result') || xml;
  const schedineValideMatch = resultBlock.match(/<SchedineValide>(\d+)<\/SchedineValide>/);
  const schedineValide = schedineValideMatch ? parseInt(schedineValideMatch[1], 10) : null;

  const dettaglioBlock = extractTag(resultBlock, 'Dettaglio') || '';
  const esiti = extractAllTags(dettaglioBlock, 'EsitoOperazioneServizio');
  const perRiga = esiti.map((esitoXml, i) => ({
    riga: i + 1,
    errore: (extractTag(esitoXml, 'ErroreDettaglio') || '').trim(),
  }));

  return { topLevelError, schedineValide, totaleRighe: righe.length, perRiga };
}

// Convalida un elenco di righe (168 caratteri ciascuna) SENZA inviarle realmente alla
// Questura.
export async function testSchedine(utente, token, righe) {
  const schedineXml = righe.map(r => '<string>' + xmlEscape(r) + '</string>').join('');
  const body = '<Test xmlns="AlloggiatiService">'
    + '<Utente>' + xmlEscape(utente) + '</Utente>'
    + '<token>' + xmlEscape(token) + '</token>'
    + '<ElencoSchedine>' + schedineXml + '</ElencoSchedine>'
    + '</Test>';
  const xml = await soapCall('Test', body);
  return parseEsitoResponse(xml, righe);
}

// Invia REALMENTE l'elenco di righe alla Questura. Stessa firma di testSchedine: usarla
// solo dopo una conferma esplicita dell'operatore, idealmente dopo un Test riuscito.
export async function sendSchedine(utente, token, righe) {
  const schedineXml = righe.map(r => '<string>' + xmlEscape(r) + '</string>').join('');
  const body = '<Send xmlns="AlloggiatiService">'
    + '<Utente>' + xmlEscape(utente) + '</Utente>'
    + '<token>' + xmlEscape(token) + '</token>'
    + '<ElencoSchedine>' + schedineXml + '</ElencoSchedine>'
    + '</Send>';
  const xml = await soapCall('Send', body);
  return parseEsitoResponse(xml, righe);
}
