// ============================================================
// CONFIGURAZIONE
// ============================================================
const STRUTTURE = {
  'ME001066': 'Via Nazionale',
  'ME006995': 'MiPA'
};

// Deve combaciare con APP_SHARED_TOKEN configurato su Netlify per questo sito.
const APP_TOKEN = 'alloggiati2026xyz';
const READ_GUESTS_URL = '/api/read-guests';
const TEST_URL = '/api/test-schedine';
const SEND_URL = '/api/send-schedine';

// Stato dell'applicazione
const state = {
  filteredGuests: [],
  lookup: {
    comuni: [],
    stati: [],
    documenti: [],
    tipoAlloggiato: []
  }
};

// ============================================================
// INIZIALIZZAZIONE
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  await loadLookupTables();
  setupEventListeners();
});

// ============================================================
// CARICAMENTO TABELLE DI LOOKUP (CSV)
// ============================================================
function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

  return lines.slice(1).map(line => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    values.push(current.trim());

    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = values[index] || '';
    });
    return obj;
  });
}

async function loadLookupTables() {
  const files = ['comuni.csv', 'stati.csv', 'documenti.csv', 'tipo_alloggiato.csv'];
  const promises = files.map(async (file) => {
    try {
      const res = await fetch(`./data/${file}`);
      if (!res.ok) throw new Error(`${file} non trovato`);
      const text = await res.text();
      return parseCSV(text);
    } catch (err) {
      console.error(`Errore caricamento ${file}:`, err);
      return [];
    }
  });

  [state.lookup.comuni, state.lookup.stati, state.lookup.documenti, state.lookup.tipoAlloggiato] = await Promise.all(promises);
  console.log('✅ Tabelle di lookup caricate');
  console.log(` Comuni: ${state.lookup.comuni.length}`);
  console.log(` Stati: ${state.lookup.stati.length}`);
  console.log(` Documenti: ${state.lookup.documenti.length}`);
  console.log(` Tipo Alloggiato: ${state.lookup.tipoAlloggiato.length}`);
}

// ============================================================
// IMPORTAZIONE DA FILE TXT/CSV LOCALE
// ============================================================
document.getElementById('txt-file-input').addEventListener('change', function(event) {
  const file = event.target.files[0];
  if (!file) return;

  document.getElementById('txt-file-name').textContent = file.name;
  showStatus('⏳ Lettura del file in corso...', 'success');

  const reader = new FileReader();
  reader.onload = function(e) {
    const content = e.target.result;
    const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');

    if (lines.length === 0) {
      showStatus('⚠️ Il file è vuoto', 'error');
      return;
    }

    const newGuests = [];
    const firstLine = lines[0].trim();

    // Rilevamento formato: se contiene separatori tipici è un CSV, altrimenti proviamo come formato fisso 168 char
    const isCSV = firstLine.includes(';') || firstLine.includes(',') || firstLine.includes('\t');

    if (!isCSV && firstLine.length >= 168) {
      // Parsing formato fisso 168 caratteri (Standard Alloggiati Web)
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.length >= 168) {
          newGuests.push({
            uiId: `txt-raw-${Date.now()}-${i}`,
            isRawRecord: true,
            rawRecord: line.substring(0, 168).padEnd(168, ' '),
            cognome: line.substring(14, 64).trim(),
            nome: line.substring(64, 94).trim(),
            data_arrivo: line.substring(2, 12).trim(),
            selected: true
          });
        }
      }
    } else {
      // Parsing CSV/TSV
      const separator = firstLine.includes(';') ? ';' : (firstLine.includes('\t') ? '\t' : ',');
      const headers = parseCSVLine(firstLine, separator).map(h => h.toLowerCase());

      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i], separator);
        if (values.length < 2) continue; // Salta righe vuote o malformate

        const guest = { uiId: `txt-csv-${Date.now()}-${i}`, selected: true };
        headers.forEach((header, index) => {
          const key = mapCsvHeader(header);
          if (key && values[index]) {
            guest[key] = values[index];
          }
        });

        // Accetta il record se ha almeno cognome o nome
        if (guest.cognome || guest.nome) {
          newGuests.push(guest);
        }
      }
    }

    if (newGuests.length === 0) {
      showStatus('⚠️ Nessun dato valido trovato nel file', 'error');
      return;
    }

    // Raggruppa con gli ospiti già caricati (da Google Sheet o da precedenti import)
    state.filteredGuests = [...state.filteredGuests, ...newGuests];

    document.getElementById('guest-list-section').classList.remove('hidden');
    renderGuestList();
    updateStats();
    showStatus(`✅ Importati ${newGuests.length} ospiti dal file`, 'success');

    // Resetta l'input per permettere di ricaricare lo stesso file se necessario
    event.target.value = '';
    document.getElementById('txt-file-name').textContent = '';
  };

  reader.readAsText(file, 'UTF-8');
});

function parseCSVLine(line, separator) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === separator && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}

function mapCsvHeader(header) {
  const h = header.toLowerCase().trim();
  const map = {
    'cognome': 'cognome',
    'nome': 'nome',
    'data arrivo': 'data_arrivo',
    'data_arrivo': 'data_arrivo',
    'permanenza': 'permanenza',
    'sesso': 'sesso',
    'data nascita': 'data_nascita',
    'data_nascita': 'data_nascita',
    'comune nascita': 'comune_nascita',
    'provincia nascita': 'provincia_nascita',
    'stato nascita': 'stato_nascita',
    'cittadinanza': 'cittadinanza',
    'tipo documento': 'tipo_documento',
    'numero documento': 'numero_documento',
    'luogo rilascio': 'luogo_rilascio',
    'tipo alloggiato': 'tipo_alloggiato',
    'struttura': 'struttura_id'
  };
  return map[h] || null;
}

// ============================================================
// EVENT LISTENERS PRINCIPALI
// ============================================================
function setupEventListeners() {
  document.getElementById('btn-load').addEventListener('click', loadFromSheet);
  document.getElementById('btn-generate').addEventListener('click', generateAndDownloadTXT);
  document.getElementById('btn-test').addEventListener('click', testWithQuestura);
  document.getElementById('btn-send').addEventListener('click', sendToQuestura);
  document.getElementById('btn-clear').addEventListener('click', clearAll);
  document.getElementById('btn-select-all').addEventListener('click', selectAll);
  document.getElementById('btn-deselect-all').addEventListener('click', deselectAll);
}

// ============================================================
// HELPER DATE
// ============================================================
function getDateFormatted(daysOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function parseDate(str) {
  if (!str) return null;
  const match = String(str).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  return new Date(parseInt(match[3], 10), parseInt(match[2], 10) - 1, parseInt(match[1], 10));
}

// ============================================================
// LOOKUP FUNCTIONS
// ============================================================
function findInTable(table, searchField, value, dateRef = null) {
  if (!value) return null;
  const norm = String(value).trim().toUpperCase();
  const candidates = table.filter(item => {
    const itemVal = String(item[searchField] || '').trim().toUpperCase();
    return itemVal === norm;
  });

  if (candidates.length === 0) return null;

  if (dateRef && candidates.length > 1) {
    const refDate = parseDate(dateRef);
    if (refDate) {
      for (const c of candidates) {
        const endVal = c.DataFineVal || c.dataFineVal || '';
        if (!endVal) return c; // Attivo
        const dataFine = parseDate(String(endVal).split(' ')[0]);
        if (dataFine && refDate <= dataFine) return c;
      }
    }
  }

  return candidates.find(c => !c.DataFineVal && !c.dataFineVal) || candidates[0];
}

function findComune(nome, provincia) {
  if (!nome) return null;
  const normNome = String(nome).trim().toUpperCase();
  const normProv = String(provincia || '').trim().toUpperCase();
  if (normProv) {
    const withProv = state.lookup.comuni.find(c =>
      String(c.Descrizione || '').trim().toUpperCase() === normNome &&
      String(c.Provincia || '').trim().toUpperCase() === normProv
    );
    if (withProv) return withProv;
  }
  return findInTable(state.lookup.comuni, 'Descrizione', nome);
}

function pad(str, len) {
  return String(str || '').padEnd(len, ' ').substring(0, len);
}

// ============================================================
// CARICAMENTO DATI (Netlify Function → Google Sheets API)
// ============================================================
async function loadFromSheet() {
  const dateFilter = document.getElementById('date-filter').value;
  const structureFilter = document.getElementById('structure-filter').value;

  if (!structureFilter) {
    showStatus('⚠️ Seleziona una struttura', 'error');
    return;
  }

  const dataArrivo = dateFilter === 'today' ? getDateFormatted(0) : getDateFormatted(-1);
  showStatus('⏳ Caricamento dati dal foglio…', 'success');
  clearQuesturaResult();

  try {
    const res = await fetch(READ_GUESTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Token': APP_TOKEN },
      body: JSON.stringify({ struttura_id: structureFilter, data_arrivo: dataArrivo }),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok || !data || !data.ok) {
      const errMsg = (data && (data.error + (data.detail ? ' — ' + data.detail : ''))) || `HTTP ${res.status}`;
      showStatus('❌ ' + errMsg, 'error');
      return;
    }

    if (data.guests.length === 0) {
      showStatus(`⚠️ Nessun ospite trovato per ${dateFilter === 'today' ? 'oggi' : 'ieri'} nella struttura selezionata`, 'error');
      document.getElementById('guest-list-section').classList.add('hidden');
      return;
    }

    state.filteredGuests = data.guests.map((guest, index) => ({
      ...guest,
      uiId: `guest-${index}`,
      selected: true
    }));

    document.getElementById('guest-list-section').classList.remove('hidden');
    renderGuestList();
    updateStats();
    showStatus(`✅ Caricati ${state.filteredGuests.length} ospiti`, 'success');

  } catch (error) {
    console.error('Errore caricamento:', error);
    showStatus('❌ Errore di rete nel caricamento dei dati.', 'error');
  }
}

// ============================================================
// RENDERING LISTA
// ============================================================
function renderGuestList() {
  const list = document.getElementById('guest-list');
  list.innerHTML = '';

  state.filteredGuests.forEach((guest, index) => {
    const card = document.createElement('div');
    card.className = `guest-card ${guest.selected ? '' : 'excluded'}`;

    const tipoAllog = String(guest.tipo_alloggiato || '-');
    const dataArrivo = String(guest.data_arrivo || '-');
    const cognome = String(guest.cognome || '-');
    const nome = String(guest.nome || '-');

    card.innerHTML = `
      <label>
        <input type="checkbox" ${guest.selected ? 'checked' : ''} onchange="toggleGuest(${index})">
        <div class="guest-info">
          <strong>${cognome} ${nome}</strong>
          <span>${tipoAllog} • Arrivo: ${dataArrivo} • Permanenza: ${guest.permanenza || '-'} gg</span>
        </div>
      </label>
    `;
    list.appendChild(card);
  });
}

window.toggleGuest = function(index) {
  state.filteredGuests[index].selected = !state.filteredGuests[index].selected;
  const card = document.querySelectorAll('.guest-card')[index];
  card.className = `guest-card ${state.filteredGuests[index].selected ? '' : 'excluded'}`;
  updateStats();
};

function selectAll() {
  state.filteredGuests.forEach(g => g.selected = true);
  renderGuestList();
  updateStats();
}

function deselectAll() {
  state.filteredGuests.forEach(g => g.selected = false);
  renderGuestList();
  updateStats();
}

function updateStats() {
  const total = state.filteredGuests.length;
  const selected = state.filteredGuests.filter(g => g.selected).length;
  const excluded = total - selected;

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-selected').textContent = selected;
  document.getElementById('stat-excluded').textContent = excluded;
  document.getElementById('btn-generate').disabled = selected === 0;
  document.getElementById('btn-test').disabled = selected === 0;
  document.getElementById('btn-send').disabled = selected === 0;
}

function clearAll() {
  state.filteredGuests = [];
  document.getElementById('guest-list-section').classList.add('hidden');
  document.getElementById('structure-filter').value = '';
  clearQuesturaResult();
  updateStats();
}

function showStatus(message, type) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.classList.remove('hidden');

  setTimeout(() => {
    statusEl.classList.add('hidden');
  }, 5000);
}

function clearQuesturaResult() {
  document.getElementById('questura-result').innerHTML = '';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

// ============================================================
// CONVERSIONE IN RECORD POSIZIONALE (168 caratteri)
// ============================================================
function convertToRecord(guest, warnings) {
  if (guest.isRawRecord && guest.rawRecord) {
    return guest.rawRecord;
  }
  const rec = new Array(168).fill(' ');
  const cognome = String(guest.cognome || '').toUpperCase().trim();
  const nome = String(guest.nome || '').toUpperCase().trim();
  const rowLabel = `${cognome} ${nome}`;

  const tipoAlloggiatoDesc = String(guest.tipo_alloggiato || '').trim();
  const isFamilyMember = ['FAMILIARE', 'MEMBRO GRUPPO'].includes(tipoAlloggiatoDesc.toUpperCase());

  // 1. TIPO ALLOGGIATO (posizioni 0-1)
  const tipo = findInTable(state.lookup.tipoAlloggiato, 'Descrizione', tipoAlloggiatoDesc);
  if (tipo) {
    rec.splice(0, 2, ...pad(tipo.Codice, 2));
  } else {
    warnings.push(`${rowLabel}: tipo alloggiato "${tipoAlloggiatoDesc}" non riconosciuto`);
  }

  // 2. DATA ARRIVO (posizioni 2-11)
  rec.splice(2, 10, ...pad(String(guest.data_arrivo || '').trim(), 10));

  // 3. GIORNI PERMANENZA (posizioni 12-13)
  const nights = Math.max(1, Math.min(30, parseInt(guest.permanenza, 10) || 1));
  rec.splice(12, 2, ...String(nights).padStart(2, '0'));

  // 4. COGNOME (posizioni 14-63)
  rec.splice(14, 50, ...pad(cognome, 50));

  // 5. NOME (posizioni 64-93)
  rec.splice(64, 30, ...pad(nome, 30));

  // 6. SESSO (posizione 94) - 1=M, 2=F
  const sesso = String(guest.sesso || '').toUpperCase().trim();
  rec[94] = sesso === 'F' ? '2' : '1';

  // 7. DATA NASCITA (posizioni 95-104)
  const dataNascita = String(guest.data_nascita || '').trim();
  rec.splice(95, 10, ...pad(dataNascita, 10));

  // 8-10. COMUNE / PROVINCIA / STATO NASCITA
  const statoNascitaDesc = String(guest.stato_nascita || '').trim();
  const statoNascita = findInTable(state.lookup.stati, 'Descrizione', statoNascitaDesc);
  if (!statoNascita) warnings.push(`${rowLabel}: stato di nascita "${statoNascitaDesc}" non riconosciuto`);
  const isItalia = statoNascita && statoNascita.Codice === '100000100';

  if (isItalia) {
    const comune = findComune(guest.comune_nascita, guest.provincia_nascita, dataNascita);
    if (comune) {
      rec.splice(105, 9, ...pad(comune.Codice, 9));
    } else {
      warnings.push(`${rowLabel}: comune di nascita "${guest.comune_nascita || ''}" non riconosciuto`);
    }
    rec.splice(114, 2, ...pad(String(guest.provincia_nascita || '').toUpperCase(), 2));
  }
  if (statoNascita) {
    rec.splice(116, 9, ...pad(statoNascita.Codice, 9));
  }

  // 11. CITTADINANZA (posizioni 125-133)
  const cittadinanzaDesc = String(guest.cittadinanza || '').trim();
  const cittadinanza = findInTable(state.lookup.stati, 'Descrizione', cittadinanzaDesc);
  if (cittadinanza) {
    rec.splice(125, 9, ...pad(cittadinanza.Codice, 9));
  } else {
    warnings.push(`${rowLabel}: cittadinanza "${cittadinanzaDesc}" non riconosciuta`);
  }

  // 12-14. DOCUMENTO (solo per ospite singolo/capofamiglia/capogruppo)
  if (!isFamilyMember) {
    const tipoDocDesc = String(guest.tipo_documento || '').trim();
    const doc = findInTable(state.lookup.documenti, 'Descrizione', tipoDocDesc);
    if (doc) {
      rec.splice(134, 5, ...pad(doc.Codice, 5));
    } else {
      warnings.push(`${rowLabel}: tipo documento "${tipoDocDesc}" non riconosciuto`);
    }

    const numDoc = String(guest.numero_documento || '').toUpperCase().trim();
    rec.splice(139, 20, ...pad(numDoc, 20));

    const luogoRilascio = String(guest.luogo_rilascio || '').trim();
    if (luogoRilascio) {
      const luogoComune = findComune(luogoRilascio, '');
      if (luogoComune) {
        rec.splice(159, 9, ...pad(luogoComune.Codice, 9));
      } else {
        const luogoStato = findInTable(state.lookup.stati, 'Descrizione', luogoRilascio);
        if (luogoStato) {
          rec.splice(159, 9, ...pad(luogoStato.Codice, 9));
        } else {
          warnings.push(`${rowLabel}: luogo di rilascio documento "${luogoRilascio}" non riconosciuto`);
        }
      }
    } else {
      warnings.push(`${rowLabel}: luogo di rilascio documento mancante`);
    }
  }

  const line = rec.join('');
  if (line.length !== 168) warnings.push(`${rowLabel}: riga di lunghezza inattesa (${line.length} invece di 168)`);
  return line;
}

function buildRecordsForSelected() {
  const selectedGuests = state.filteredGuests.filter(g => g.selected);
  const warnings = [];
  const records = selectedGuests.map(guest => convertToRecord(guest, warnings));
  records.forEach((rec, idx) => {
    if (rec.length !== 168) console.error(`Record ${idx} ha lunghezza ${rec.length} invece di 168`);
  });
  return { records, warnings, selectedGuests };
}

// ============================================================
// GENERAZIONE E DOWNLOAD FILE TXT
// ============================================================
function generateAndDownloadTXT() {
  const { records, warnings } = buildRecordsForSelected();

  if (records.length === 0) {
    showStatus('❌ Nessun ospite selezionato', 'error');
    return;
  }

  const content = records.join('\r\n');
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;

  const structureName = STRUTTURE[document.getElementById('structure-filter').value] || 'struttura';
  const dateStr = new Date().toISOString().slice(0, 10);
  a.download = `alloggiati_${structureName.replace(/\s+/g, '_')}_${dateStr}.txt`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showStatus(`✅ File TXT generato con ${records.length} record`, 'success');

  if (warnings.length) {
    renderQuesturaWarnings(warnings);
  } else {
    clearQuesturaResult();
  }
}

function renderQuesturaWarnings(warnings) {
  const box = document.getElementById('questura-result');
  box.innerHTML = `<div class="warning-box"><strong>Attenzione, controlla questi campi prima di caricare/inviare il file:</strong><br>${warnings.map(escapeHtml).join('<br>')}</div>`;
}

// ============================================================
// CONVALIDA (TEST) E INVIO REALE (SEND)
// ============================================================
async function testWithQuestura() {
  const { records, warnings, selectedGuests } = buildRecordsForSelected();
  if (records.length === 0) {
    showStatus('❌ Nessun ospite selezionato', 'error');
    return;
  }
  const strutturaId = document.getElementById('structure-filter').value;
  if (!strutturaId) {
    showStatus('⚠️ Seleziona una struttura', 'error');
    return;
  }

  document.getElementById('btn-test').disabled = true;
  document.getElementById('questura-result').innerHTML = '<div class="loading">⏳ Convalida in corso con il sistema della Questura…</div>';

  try {
    const res = await fetch(TEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Token': APP_TOKEN },
      body: JSON.stringify({ righe: records, struttura_id: strutturaId }),
    });
    const data = await res.json().catch(() => null);
    renderEsitoQuestura(data, res.ok, warnings, selectedGuests, false);
  } catch (err) {
    document.getElementById('questura-result').innerHTML = `<div class="error-box">Errore di rete: ${escapeHtml(err.message || String(err))}</div>`;
  } finally {
    document.getElementById('btn-test').disabled = false;
  }
}

async function sendToQuestura() {
  const { records, warnings, selectedGuests } = buildRecordsForSelected();
  if (records.length === 0) {
    showStatus('❌ Nessun ospite selezionato', 'error');
    return;
  }
  const strutturaId = document.getElementById('structure-filter').value;
  if (!strutturaId) {
    showStatus('⚠️ Seleziona una struttura', 'error');
    return;
  }
  const strutturaNome = STRUTTURE[strutturaId] || strutturaId;

  const conferma = confirm(
    `Stai per inviare REALMENTE ${records.length} schedina/e alla Questura tramite il Web Service ufficiale, ` +
    `per la struttura "${strutturaNome}" (${strutturaId}).\n\n` +
    `Questa operazione non è reversibile. Hai già eseguito la Convalida (Test) e controllato che i dati siano corretti?\n\n` +
    `Premi OK solo se sei sicuro di voler procedere con l'invio reale.`
  );
  if (!conferma) return;

  document.getElementById('btn-send').disabled = true;
  document.getElementById('questura-result').innerHTML = '<div class="loading">⏳ Invio in corso alla Questura…</div>';

  try {
    const res = await fetch(SEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Token': APP_TOKEN },
      body: JSON.stringify({ righe: records, struttura_id: strutturaId, confirm: true }),
    });
    const data = await res.json().catch(() => null);
    renderEsitoQuestura(data, res.ok, warnings, selectedGuests, true);
  } catch (err) {
    document.getElementById('questura-result').innerHTML = `<div class="error-box">Errore di rete: ${escapeHtml(err.message || String(err))}</div>`;
  } finally {
    document.getElementById('btn-send').disabled = false;
  }
}

function renderEsitoQuestura(data, resOk, conversionWarnings, selectedGuests, wasRealSend) {
  const box = document.getElementById('questura-result');
  if (!resOk || !data || !data.ok) {
    const errMsg = (data && (data.error + (data.detail ? ' — ' + data.detail : ''))) || 'Errore sconosciuto';
    box.innerHTML = `<div class="error-box"><strong>Errore:</strong> ${escapeHtml(errMsg)}</div>`;
    return;
  }

  let html = '';
  if (conversionWarnings.length) {
    html += `<div class="warning-box"><strong>Avvisi già in fase di conversione (prima della Questura):</strong><br>${conversionWarnings.map(escapeHtml).join('<br>')}</div>`;
  }
  if (data.topLevelError) {
    html += `<div class="error-box"><strong>Errore generale restituito dal servizio:</strong> ${escapeHtml(data.topLevelError)}</div>`;
  }

  const titolo = wasRealSend ? 'INVIATE REALMENTE alla Questura' : 'valide secondo la convalida (Test, nessun invio reale)';
  html += `<div class="success-box"><strong>${data.schedineValide} su ${data.totaleRighe} schedine ${titolo}.</strong></div>`;

  if (data.perRiga && data.perRiga.length) {
    html += '<ul class="dettaglio-lista">';
    data.perRiga.forEach(d => {
      const guest = selectedGuests[d.riga - 1];
      const nome = guest ? `${guest.cognome} ${guest.nome}` : `riga ${d.riga}`;
      const stato = d.errore ? '❌' : '✅';
      html += `<li>${stato} ${escapeHtml(nome)}${d.errore ? ' — ' + escapeHtml(d.errore) : ''}</li>`;
    });
    html += '</ul>';
  }

  box.innerHTML = html;
}

// ============================================================
// GESTIONE OCR (Integrazione Scansione Documenti)
// ============================================================
const OCR_PROXY_URL = '/api/ocr-proxy';
const OCR_APP_TOKEN = 'alloggiati2026xyz'; // Deve combaciare con APP_SHARED_TOKEN su Netlify

let ocrState = {
  images: [],
  phase: 'capture',
  rawText: '',
  extractedData: null,
  error: null,
  errorDetail: ''
};

// 1. Gestione Upload Foto
document.getElementById('ocr-file-input').addEventListener('change', function(event) {
  const files = Array.from(event.target.files);
  if (files.length === 0) return;

  ocrState.images = [];
  document.getElementById('ocr-preview').innerHTML = '';

  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      ocrState.images.push(e.target.result);
      const img = document.createElement('img');
      img.src = e.target.result;
      img.style.maxWidth = '100px';
      img.style.maxHeight = '100px';
      img.style.objectFit = 'cover';
      img.style.borderRadius = '6px';
      img.style.border = '1px solid #cbd5e1';
      document.getElementById('ocr-preview').appendChild(img);
      
      if (ocrState.images.length === files.length) {
        document.getElementById('ocr-actions').style.display = 'block';
      }
    };
    reader.readAsDataURL(file);
  });
  event.target.value = ''; // Reset per permettere ricaricamento
});

// 2. Esecuzione OCR
document.getElementById('btn-run-ocr').addEventListener('click', async () => {
  if (ocrState.images.length === 0) return;

  ocrState.phase = 'processing';
  ocrState.error = null;
  ocrState.errorDetail = '';
  document.getElementById('ocr-actions').style.display = 'none';
  document.getElementById('ocr-processing').style.display = 'block';

  let combinedText = '';
  try {
    for (const img of ocrState.images) {
      const pre = await preprocessImage(img);
      const { text } = await callVisionOCR(pre);
      combinedText += '\n' + text;
    }
  } catch (err) {
    console.warn('Vision OCR non disponibile:', err);
    ocrState.error = 'vision_failed';
    ocrState.errorDetail = err.message || 'Errore sconosciuto';
  }

  ocrState.rawText = combinedText;
  ocrState.extractedData = parseOCRToGuest(combinedText);
  ocrState.phase = 'review';
  
  document.getElementById('ocr-processing').style.display = 'none';
  renderOCRReview();
});

// 3. Aggiunta alla Lista Principale
document.getElementById('btn-add-ocr-guest').addEventListener('click', () => {
  const selectedStruttura = document.getElementById('ocr-struttura').value;
  
  // Sincronizza il filtro principale dell'app con la struttura scelta per la scansione.
  document.getElementById('structure-filter').value = selectedStruttura;

  const newGuest = {
    uiId: `ocr-${Date.now()}`,
    selected: true,
    struttura_id: selectedStruttura,
    cognome: document.getElementById('ocr-cognome').value.trim().toUpperCase(),
    nome: document.getElementById('ocr-nome').value.trim().toUpperCase(),
    data_nascita: document.getElementById('ocr-data-nascita').value.trim(),
    sesso: document.getElementById('ocr-sesso').value,
    comune_nascita: document.getElementById('ocr-comune-nascita').value.trim().toUpperCase(),
    provincia_nascita: document.getElementById('ocr-provincia-nascita').value.trim().toUpperCase(),
    stato_nascita: document.getElementById('ocr-cittadinanza').value.trim().toUpperCase() === 'ITALIANA' ? 'ITALIA' : document.getElementById('ocr-cittadinanza').value.trim().toUpperCase(),
    cittadinanza: document.getElementById('ocr-cittadinanza').value.trim().toUpperCase(),
    tipo_documento: document.getElementById('ocr-tipo-documento').value,
    numero_documento: document.getElementById('ocr-numero-documento').value.trim().toUpperCase(),
    luogo_rilascio: document.getElementById('ocr-luogo-rilascio').value.trim().toUpperCase(),
    data_arrivo: document.getElementById('date-filter').value === 'today' ? getDateFormatted(0) : getDateFormatted(-1),
    permanenza: '1',
    tipo_alloggiato: 'SINGOLO'
  };

  if (!newGuest.cognome && !newGuest.nome) {
    alert('Inserisci almeno il Cognome o il Nome per aggiungere l\'ospite.');
    return;
  }

  state.filteredGuests.push(newGuest);
  document.getElementById('guest-list-section').classList.remove('hidden');
  renderGuestList();
  updateStats();
  
  clearOCR();
  const strutturaNome = STRUTTURE[selectedStruttura] || selectedStruttura;
  showStatus(`✅ Ospite ${newGuest.cognome} ${newGuest.nome} aggiunto per la struttura: ${strutturaNome}`, 'success');
});

// 4. Funzioni di Supporto OCR
function clearOCR() {
  ocrState = { images: [], phase: 'capture', rawText: '', extractedData: null, error: null, errorDetail: '' };
  document.getElementById('ocr-preview').innerHTML = '';
  document.getElementById('ocr-actions').style.display = 'none';
  document.getElementById('ocr-processing').style.display = 'none';
  document.getElementById('ocr-review-section').classList.add('hidden');
  document.getElementById('ocr-file-input').value = '';
}

function renderOCRReview() {
  const section = document.getElementById('ocr-review-section');
  section.classList.remove('hidden');
  
  const d = ocrState.extractedData || {};
  
  // Pre-seleziona la struttura attualmente scelta nel filtro principale dell'app
  const currentStructure = document.getElementById('structure-filter').value;
  if (currentStructure) {
    document.getElementById('ocr-struttura').value = currentStructure;
  }

  document.getElementById('ocr-cognome').value = d.cognome || '';
  document.getElementById('ocr-nome').value = d.nome || '';
  document.getElementById('ocr-data-nascita').value = d.data_nascita || '';
  document.getElementById('ocr-sesso').value = d.sesso || '';
  document.getElementById('ocr-comune-nascita').value = d.comune_nascita || '';
  document.getElementById('ocr-provincia-nascita').value = d.provincia_nascita || '';
  document.getElementById('ocr-cittadinanza').value = d.cittadinanza || 'ITALIANA';
  document.getElementById('ocr-tipo-documento').value = d.tipo_documento || 'CARTA DI IDENTITA';
  document.getElementById('ocr-numero-documento').value = d.numero_documento || '';
  document.getElementById('ocr-luogo-rilascio').value = d.luogo_rilascio || '';
  
  document.getElementById('ocr-raw-text').textContent = ocrState.rawText || 'Nessun testo estratto.';
  
  if (ocrState.error) {
    document.getElementById('ocr-raw-text').textContent += `\n\n⚠️ ERRORE OCR: ${ocrState.errorDetail}`;
  }
}

function preprocessImage(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;
      // Scala di grigi
      for (let i = 0; i < d.length; i += 4) {
        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        d[i] = d[i + 1] = d[i + 2] = gray;
      }
      // Stiramento del contrasto
      let min = 255, max = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] < min) min = d[i];
        if (d[i] > max) max = d[i];
      }
      const range = Math.max(1, max - min);
      for (let i = 0; i < d.length; i += 4) {
        const v = (d[i] - min) * 255 / range;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function callVisionOCR(dataUrl) {
  let res;
  try {
    res = await fetch(OCR_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Token': OCR_APP_TOKEN },
      body: JSON.stringify({ image: dataUrl }),
    });
  } catch (networkErr) {
    throw new Error('Rete: impossibile raggiungere il servizio OCR (' + networkErr.message + ')');
  }
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error('HTTP ' + res.status + ' dal servizio OCR' + (bodyText ? ' — ' + bodyText.slice(0, 200) : ''));
  }
  const json = await res.json();
  return { text: json.text || '', confidence: typeof json.confidence === 'number' ? json.confidence : null };
}

function parseOCRToGuest(text) {
  const fullText = text.toUpperCase();
  const findAfter = (labels) => {
    for (const label of labels) {
      const regex = new RegExp(label + '[\\s:]*([^\\n]+)', 'i');
      const match = text.match(regex);
      if (match) return match[1].trim().replace(/[^a-zA-Z0-9À-ÿ\s\-']/g, '');
    }
    return '';
  };

  const dobMatch = text.match(/(\d{2}[-\/]\d{2}[-\/]\d{4})/) || text.match(/(\d{2}[-\/]\d{2}[-\/]\d{2})/);
  let data_nascita = dobMatch ? dobMatch[1].replace(/-/g, '/') : '';
  if (data_nascita && data_nascita.length === 8) {
    const parts = data_nascita.split('/');
    if (parts[2].length === 2) {
      const year = parseInt(parts[2], 10);
      parts[2] = year > 30 ? '19' + parts[2] : '20' + parts[2];
      data_nascita = parts.join('/');
    }
  }

  const sesso = fullText.includes('SESSO M') || (fullText.includes('M\n') && !fullText.includes('F\n')) ? 'M' : 
                fullText.includes('SESSO F') || (fullText.includes('F\n') && !fullText.includes('M\n')) ? 'F' : '';

  return {
    cognome: findAfter(['COGNOME', 'SURNAME', 'NOM']),
    nome: findAfter(['NOME', 'GIVEN NAME', 'PRENOMS']),
    data_nascita: data_nascita,
    comune_nascita: findAfter(['COMUNE DI NASCITA', 'LUOGO DI NASCITA', 'BORN IN', 'COMUNE']),
    provincia_nascita: '',
    stato_nascita: findAfter(['STATO DI NASCITA', 'COUNTRY OF BIRTH']) || 'ITALIA',
    cittadinanza: findAfter(['CITTADINANZA', 'NATIONALITY']) || 'ITALIANA',
    tipo_documento: fullText.includes('PASSAPORTO') ? 'PASSAPORTO' : 
                    fullText.includes('PATENTE') ? 'PATENTE DI GUIDA' : 'CARTA DI IDENTITA',
    numero_documento: findAfter(['NUMERO DOCUMENTO', 'DOCUMENT NO', 'N.']),
    luogo_rilascio: findAfter(['RILASCIATO DA', 'ISSUED BY', 'LUOGO DI RILASCIO']),
    sesso: sesso
  };
}
