// Client minimale (nessuna libreria esterna) per il Web-API REST dell'Osservatorio
// Turistico della Regione Siciliana (piattaforma Turist@t), destinato ai software
// gestionali (PMS) per l'invio dei dati statistici ISTAT sul movimento dei clienti.
//
// Riferimento: "Sistema Informativo Osservatorio Turistico Regione Siciliana —
// Protocollo di Comunicazione Property Management System", rev. 1.0.7 (03/04/2025),
// pubblicato su https://osservatorioturistico.regione.sicilia.it (sezione Documenti).
//
// Endpoint principali:
// - GET  /webapi/api/auth/login          (header UserId, Password → header/body Authorization: Bearer ...)
// - POST /webapi/api/auth/logout         (header UserId, Authorization)
// - POST /webapi/api/stay/addfrompms     (nuovo soggiorno/check-in, corpo XML StaysPmsDTO)
// - POST /webapi/api/stay/updatefrompms  (aggiornamento soggiorno/check-out/cambio camera)
// - POST /webapi/api/entity/enddayfrompms (chiusura giornaliera)
//
// Questa app usa solo Login + addfrompms (nuovo soggiorno) + Logout: la comunicazione
// avviene al momento dell'inserimento ospite, corrispondente a un check-in.

const BASE_URL = 'https://osservatorioturistico.regione.sicilia.it/webapi/api';

function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Estrae il contenuto del PRIMO tag non annidato con questo nome (va bene per campi
// "foglia" come <IsValid>, <ObjectType>, ecc. che non contengono altri tag omonimi).
function extractTag(xml, tag) {
  const m = xml.match(new RegExp('<' + tag + '>([\\s\\S]*?)<\\/' + tag + '>'));
  return m ? m[1] : null;
}

// Estrae tutti i blocchi DI PRIMO LIVELLO con questo nome, rispettando la profondità di
// annidamento (necessario perché ValidationResultDTO può contenere altri
// ValidationResultDTO omonimi dentro NestedValidation: una regex "non greedy" semplice
// si fermerebbe alla prima chiusura, tagliando il blocco a metà).
function extractBalancedBlocks(xml, tag) {
  const openTag = '<' + tag + '>';
  const closeTag = '</' + tag + '>';
  const blocks = [];
  let pos = 0;
  while (pos < xml.length) {
    const start = xml.indexOf(openTag, pos);
    if (start === -1) break;
    let depth = 1;
    let cursor = start + openTag.length;
    while (depth > 0) {
      const nextOpen = xml.indexOf(openTag, cursor);
      const nextClose = xml.indexOf(closeTag, cursor);
      if (nextClose === -1) { cursor = xml.length; depth = 0; break; }
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        cursor = nextOpen + openTag.length;
      } else {
        depth--;
        cursor = nextClose + closeTag.length;
      }
    }
    const contentEnd = Math.max(start + openTag.length, cursor - closeTag.length);
    blocks.push(xml.slice(start + openTag.length, contentEnd));
    pos = cursor;
  }
  return blocks;
}

// Login: recupera il token Bearer usando le credenziali PMS assegnate alla struttura.
// Il token può arrivare nell'header Authorization oppure nel body (tra virgolette).
export async function loginRegione(userId, password) {
  const res = await fetch(BASE_URL + '/auth/login', {
    method: 'GET',
    headers: { UserId: userId, Password: password },
  });
  const bodyText = await res.text().catch(() => '');
  if (!res.ok) {
    const err = new Error('Login Regione Sicilia fallito (HTTP ' + res.status + '): ' + bodyText.slice(0, 300));
    err.status = res.status === 401 ? 401 : 502;
    throw err;
  }
  let token = res.headers.get('authorization') || res.headers.get('Authorization');
  if (!token && bodyText) {
    token = bodyText.trim().replace(/^"+|"+$/g, '');
  }
  if (!token) {
    const err = new Error('Token non ottenuto dal login Regione Sicilia (risposta inattesa dal servizio)');
    err.status = 502;
    throw err;
  }
  // Il servizio si aspetta il valore già nel formato "Bearer <token>" nelle chiamate
  // successive: se l'header non lo includeva già, lo normalizziamo qui.
  return token.startsWith('Bearer ') ? token : 'Bearer ' + token;
}

// Logout: chiamata "best effort", non deve mai far fallire l'operazione principale.
export async function logoutRegione(userId, token) {
  try {
    await fetch(BASE_URL + '/auth/logout', {
      method: 'POST',
      headers: { UserId: userId, Authorization: token },
    });
  } catch (e) {
    // Logout non riuscito: non blocchiamo la risposta all'operatore per questo.
  }
}

function buildRoomXml(room) {
  return '<Room>'
    + '<RoomId>' + xmlEscape(room.roomId) + '</RoomId>'
    + '<StartDate>' + xmlEscape(room.startDate) + '</StartDate>'
    + '<EndDate>' + xmlEscape(room.endDate) + '</EndDate>'
    + '</Room>';
}

function buildStayXml(stay, hotelCode) {
  const roomsXml = (stay.rooms || []).map(buildRoomXml).join('');
  return '<Stay>'
    + '<StayId>' + xmlEscape(stay.stayId) + '</StayId>'
    + '<HotelCode>' + xmlEscape(hotelCode) + '</HotelCode>'
    + '<Guests><Guest>'
    + '<GuestId>' + xmlEscape(stay.guestId) + '</GuestId>'
    + '<Age>' + xmlEscape(stay.age) + '</Age>'
    + '<NationalityCode>' + xmlEscape(stay.nationalityCode) + '</NationalityCode>'
    + '<BirthPlaceCode>' + xmlEscape(stay.birthPlaceCode) + '</BirthPlaceCode>'
    + '<ResidencePlaceCode>' + xmlEscape(stay.residencePlaceCode) + '</ResidencePlaceCode>'
    + '<Type>' + xmlEscape(stay.type) + '</Type>'
    + '<Gender>' + xmlEscape(stay.gender) + '</Gender>'
    + '<EMail>' + xmlEscape(stay.email || '') + '</EMail>'
    + '<ArrivalDate>' + xmlEscape(stay.arrivalDate) + '</ArrivalDate>'
    + '<DepartureDate>' + xmlEscape(stay.departureDate) + '</DepartureDate>'
    + '<Checkout>' + (stay.checkout ? 'true' : 'false') + '</Checkout>'
    + '<BedOccupancy>' + (stay.bedOccupancy ? 'true' : 'false') + '</BedOccupancy>'
    + '<Rooms>' + roomsXml + '</Rooms>'
    + '</Guest></Guests>'
    + '</Stay>';
}

// Interpreta ricorsivamente un blocco <ValidationResultDTO> (vedi documento §4.1.6).
function parseValidationResult(block) {
  const objectType = extractTag(block, 'ObjectType') || '';
  const objectId = extractTag(block, 'ObjectId') || '';
  const isValid = (extractTag(block, 'IsValid') || '').trim() === 'true';

  const messagesBlock = extractBalancedBlocks(block, 'Messages')[0] || '';
  const messages = extractBalancedBlocks(messagesBlock, 'ValidationMessageDTO').map(m => ({
    level: extractTag(m, 'Level') || '',
    code: extractTag(m, 'Code') || '',
    message: extractTag(m, 'Message') || '',
    fieldName: extractTag(m, 'FieldName') || '',
    fieldValue: extractTag(m, 'FieldValue') || '',
  }));

  const nestedBlock = extractBalancedBlocks(block, 'NestedValidation')[0] || '';
  const nested = extractBalancedBlocks(nestedBlock, 'ValidationResultDTO').map(parseValidationResult);

  return { objectType, objectId, isValid, messages, nested };
}

// Invia un elenco di nuovi soggiorni (uno per ospite, in questa app) tramite
// /stay/addfrompms. Risposta: HTTP 200 o 400, corpo XML ArrayOfValidationResultDTO con
// un ValidationResultDTO per ogni Stay inviato, nello stesso ordine.
export async function sendStaysToRegione(hotelCode, token, stays) {
  const staysXml = stays.map(s => buildStayXml(s, hotelCode)).join('');
  const body = '<?xml version="1.0" encoding="utf-8" ?>' + '<StaysPmsDTO>' + staysXml + '</StaysPmsDTO>';

  const res = await fetch(BASE_URL + '/stay/addfrompms', {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'Authorization': token,
    },
    body,
  });
  const text = await res.text().catch(() => '');

  if (res.status !== 200 && res.status !== 400) {
    const err = new Error('Regione Sicilia — HTTP ' + res.status + ': ' + text.slice(0, 500));
    err.status = 502;
    throw err;
  }

  const risultati = extractBalancedBlocks(text, 'ValidationResultDTO').map(parseValidationResult);
  const tuttiValidi = risultati.length ? risultati.every(r => r.isValid) : res.status === 200;

  return { httpStatus: res.status, tuttiValidi, risultati, totaleInviati: stays.length };
}
