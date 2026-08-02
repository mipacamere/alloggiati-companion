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
  populateOcrDocumentoSelect();
  populateTipoAlloggiatoSelects();
  populateArrivalDateSelect();
}

// Popola un <select> con tutte le Descrizioni ufficiali di una tabella di lookup,
// mettendo in cima le voci più frequenti (PRIORITY) e il resto in ordine alfabetico.
// Usata sia per il modulo OCR sia per la modale di modifica ospite, così i valori
// disponibili sono sempre identici a quelli riconosciuti da findInTable() in fase
// di generazione/invio del file: nessun valore "orfano" non selezionabile da menu.
function populateSelectFromLookup(selectId, table, priorityList, defaultValue) {
  const select = document.getElementById(selectId);
  if (!select || !table || !table.length) return;

  const all = table.map(d => d.Descrizione).filter(Boolean);
  const priorityFound = (priorityList || []).filter(p => all.includes(p));
  const rest = all.filter(d => !priorityFound.includes(d)).sort((a, b) => a.localeCompare(b, 'it'));

  select.innerHTML = '';
  [...priorityFound, ...rest].forEach(desc => {
    const opt = document.createElement('option');
    opt.value = desc;
    opt.textContent = desc;
    select.appendChild(opt);
  });
  if (defaultValue && all.includes(defaultValue)) select.value = defaultValue;
}

// Popola dinamicamente il menu "Tipo Documento" della sezione OCR con TUTTE le voci
// ufficiali di documenti.csv (95 voci), non solo le 4 più comuni codificate a mano in
// precedenza: essendo un <select>, un valore riconosciuto dall'OCR ma assente tra le
// opzioni (es. "PATENTE NAUTICA" o "CARTA IDENTITA' ELETTRONICA") non potrebbe mai
// essere selezionato via JavaScript e andrebbe perso silenziosamente in revisione.
// I tipi più frequenti in un B&B restano in cima, il resto segue in ordine alfabetico.
const DOCUMENT_TYPE_PRIORITY = ["CARTA DI IDENTITA'", "CARTA IDENTITA' ELETTRONICA", 'PASSAPORTO ORDINARIO', 'PATENTE DI GUIDA', "CERTIFICATO D'IDENTITA'"];

function populateOcrDocumentoSelect() {
  populateSelectFromLookup('ocr-tipo-documento', state.lookup.documenti, DOCUMENT_TYPE_PRIORITY, "CARTA DI IDENTITA'");
  populateSelectFromLookup('edit-tipo-documento', state.lookup.documenti, DOCUMENT_TYPE_PRIORITY, "CARTA DI IDENTITA'");
}

// Popola il menu "Tipo Alloggiato" (sia nella revisione OCR/manuale sia nella modale
// di modifica) con le voci ufficiali di tipo_alloggiato.csv. In precedenza il valore
// di default per gli ospiti aggiunti via OCR era la stringa libera "SINGOLO", che non
// corrisponde a nessuna Descrizione ufficiale ("OSPITE SINGOLO") e veniva quindi
// sempre segnalata come "non riconosciuta" in fase di generazione/invio.
function populateTipoAlloggiatoSelects() {
  populateSelectFromLookup('ocr-tipo-alloggiato', state.lookup.tipoAlloggiato, ['OSPITE SINGOLO'], 'OSPITE SINGOLO');
  populateSelectFromLookup('edit-tipo-alloggiato', state.lookup.tipoAlloggiato, ['OSPITE SINGOLO'], 'OSPITE SINGOLO');
}

// Popola il menu "Data Arrivo" della revisione OCR/manuale con le uniche due date
// ammesse per la schedina (oggi/ieri), coerentemente col resto dell'app.
function populateArrivalDateSelect() {
  const select = document.getElementById('ocr-data-arrivo');
  if (!select) return;
  const oggi = getDateFormatted(0);
  const ieri = getDateFormatted(-1);
  select.innerHTML = '';
  [{ v: ieri, l: ieri + ' — Ieri' }, { v: oggi, l: oggi + ' — Oggi' }].forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.v;
    opt.textContent = o.l;
    select.appendChild(opt);
  });
  select.value = oggi;
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
  document.getElementById('btn-save-edit-guest').addEventListener('click', saveEditGuest);
  document.getElementById('btn-cancel-edit-guest').addEventListener('click', closeEditGuest);
  document.getElementById('edit-guest-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'edit-guest-overlay') closeEditGuest();
  });
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
      <label style="flex:1; display:flex; align-items:center; gap:1rem;">
        <input type="checkbox" ${guest.selected ? 'checked' : ''} onchange="toggleGuest(${index})">
        <div class="guest-info">
          <strong>${escapeHtml(cognome)} ${escapeHtml(nome)}</strong>
          <span>${escapeHtml(tipoAllog)} • Arrivo: ${escapeHtml(dataArrivo)} • Permanenza: ${escapeHtml(String(guest.permanenza || '-'))} gg</span>
        </div>
      </label>
      <div class="guest-card-actions">
        <button type="button" class="guest-card-btn" title="Modifica dati ospite" onclick="openEditGuest(${index})">✏️</button>
        <button type="button" class="guest-card-btn danger" title="Rimuovi ospite dalla lista" onclick="removeGuestAt(${index})">🗑️</button>
      </div>
    `;
    list.appendChild(card);
  });
}

// ============================================================
// MODIFICA OSPITE (modale) — valida per ospiti caricati da foglio Google,
// importati da TXT/CSV o aggiunti via OCR/compilazione manuale: qualunque sia
// l'origine dei dati, prima di generare o inviare il file alla Questura è
// sempre possibile correggerli qui.
// ============================================================
let editingGuestIndex = null;

function openEditGuest(index) {
  const guest = state.filteredGuests[index];
  if (!guest) return;

  if (guest.isRawRecord) {
    alert('Questo ospite proviene da un file a formato fisso (168 caratteri) importato senza intestazioni CSV: non contiene campi separati da modificare qui. Puoi comunque rimuoverlo e reinserirlo manualmente se serve correggerlo.');
    return;
  }

  editingGuestIndex = index;
  populateOcrDocumentoSelect();
  populateTipoAlloggiatoSelects();

  document.getElementById('edit-struttura').value = guest.struttura_id || document.getElementById('structure-filter').value || '';
  document.getElementById('edit-data-arrivo').value = guest.data_arrivo || '';
  document.getElementById('edit-permanenza').value = guest.permanenza || '1';
  document.getElementById('edit-tipo-alloggiato').value = guest.tipo_alloggiato || 'OSPITE SINGOLO';
  document.getElementById('edit-cognome').value = guest.cognome || '';
  document.getElementById('edit-nome').value = guest.nome || '';
  document.getElementById('edit-data-nascita').value = guest.data_nascita || '';
  document.getElementById('edit-sesso').value = guest.sesso || '';
  document.getElementById('edit-comune-nascita').value = guest.comune_nascita || '';
  document.getElementById('edit-provincia-nascita').value = guest.provincia_nascita || '';
  document.getElementById('edit-stato-nascita').value = guest.stato_nascita || '';
  document.getElementById('edit-cittadinanza').value = guest.cittadinanza || '';
  document.getElementById('edit-tipo-documento').value = guest.tipo_documento || "CARTA DI IDENTITA'";
  document.getElementById('edit-numero-documento').value = guest.numero_documento || '';
  document.getElementById('edit-luogo-rilascio').value = guest.luogo_rilascio || '';

  document.getElementById('edit-guest-overlay').classList.remove('hidden');
}

function closeEditGuest() {
  editingGuestIndex = null;
  document.getElementById('edit-guest-overlay').classList.add('hidden');
}

function saveEditGuest() {
  if (editingGuestIndex === null) return;
  const guest = state.filteredGuests[editingGuestIndex];
  if (!guest) { closeEditGuest(); return; }

  const cognome = document.getElementById('edit-cognome').value.trim().toUpperCase();
  const nome = document.getElementById('edit-nome').value.trim().toUpperCase();
  if (!cognome && !nome) {
    alert('Inserisci almeno il Cognome o il Nome per salvare le modifiche.');
    return;
  }

  Object.assign(guest, {
    struttura_id: document.getElementById('edit-struttura').value,
    data_arrivo: document.getElementById('edit-data-arrivo').value.trim(),
    permanenza: String(Math.max(1, Math.min(30, parseInt(document.getElementById('edit-permanenza').value, 10) || 1))),
    tipo_alloggiato: document.getElementById('edit-tipo-alloggiato').value,
    cognome,
    nome,
    data_nascita: document.getElementById('edit-data-nascita').value.trim(),
    sesso: document.getElementById('edit-sesso').value,
    comune_nascita: document.getElementById('edit-comune-nascita').value.trim().toUpperCase(),
    provincia_nascita: document.getElementById('edit-provincia-nascita').value.trim().toUpperCase(),
    stato_nascita: document.getElementById('edit-stato-nascita').value.trim().toUpperCase(),
    cittadinanza: document.getElementById('edit-cittadinanza').value.trim().toUpperCase(),
    tipo_documento: document.getElementById('edit-tipo-documento').value,
    numero_documento: document.getElementById('edit-numero-documento').value.trim().toUpperCase(),
    luogo_rilascio: document.getElementById('edit-luogo-rilascio').value.trim().toUpperCase(),
  });

  closeEditGuest();
  renderGuestList();
  updateStats();
  clearQuesturaResult();
  showStatus(`✅ Dati di ${cognome} ${nome} aggiornati`, 'success');
}

function removeGuestAt(index) {
  const guest = state.filteredGuests[index];
  if (!guest) return;
  const label = `${guest.cognome || ''} ${guest.nome || ''}`.trim() || 'questo ospite';
  if (!confirm(`Rimuovere ${label} dalla lista?`)) return;
  state.filteredGuests.splice(index, 1);
  renderGuestList();
  updateStats();
  if (state.filteredGuests.length === 0) {
    document.getElementById('guest-list-section').classList.add('hidden');
  }
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
// Motore di estrazione allineato a quello di Via Nazionale/MiPA Companion: lettura
// della MRZ (passaporti TD3, carte d'identità elettroniche TD1/TD2) quando presente,
// con fallback all'estrazione generica multilingua per etichetta quando la MRZ non
// è leggibile (patenti UE, carte d'identità non elettroniche, permessi di soggiorno).
// A differenza dell'app rivolta all'ospite, qui i valori riconosciuti (Stato,
// tipo documento, comune di nascita) vengono anche ricondotti — con corrispondenza
// esatta o per somiglianza — alle voci ufficiali delle tabelle comuni.csv/stati.csv/
// documenti.csv già caricate in state.lookup, così i controlli di validazione più in
// basso (findInTable) li riconoscono senza bisogno di correzioni manuali.
const OCR_PROXY_URL = '/api/ocr-proxy';
const OCR_APP_TOKEN = 'alloggiati2026xyz'; // Deve combaciare con APP_SHARED_TOKEN su Netlify

let ocrState = {
  images: [],
  phase: 'capture',
  rawText: '',
  extractedData: null,
  confidence: null,
  error: null,
  errorDetail: '',
  strutturaId: ''
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

  const strutturaId = document.getElementById('ocr-struttura-capture').value;
  if (!strutturaId) {
    alert('⚠️ Seleziona prima la struttura di destinazione.');
    return;
  }

  ocrState.phase = 'processing';
  ocrState.error = null;
  ocrState.errorDetail = '';
  ocrState.strutturaId = strutturaId; // Salva per il form di review
  document.getElementById('ocr-actions').style.display = 'none';
  document.getElementById('ocr-processing').style.display = 'block';

  let combinedText = '';
  const confidences = [];
  try {
    for (const img of ocrState.images) {
      const pre = await preprocessImage(img);
      const { text, confidence } = await callVisionOCR(pre, strutturaId);
      combinedText += '\n' + text;
      if (typeof confidence === 'number') confidences.push(confidence);
    }
  } catch (err) {
    console.warn('Vision OCR non disponibile:', err);
    ocrState.error = 'vision_failed';
    ocrState.errorDetail = err.message || 'Errore sconosciuto';
  }

  ocrState.rawText = combinedText;
  ocrState.confidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;
  ocrState.extractedData = ocrResultToAlloggiatoGuest(extractFieldsFromText(combinedText));
  ocrState.phase = 'review';

  document.getElementById('ocr-processing').style.display = 'none';
  renderOCRReview();
});

// 2bis. Compilazione manuale (nessuna foto, nessun invio a Google Vision)
// Stessa scelta offerta da MiPA Companion: chi preferisce non usare l'OCR può
// aprire direttamente il form di revisione con i campi vuoti e compilarli a mano.
document.getElementById('btn-manual-entry').addEventListener('click', () => {
  const strutturaId = document.getElementById('ocr-struttura-capture').value;
  if (!strutturaId) {
    alert('⚠️ Seleziona prima la struttura di destinazione.');
    return;
  }
  ocrState = { images: [], phase: 'review', rawText: '', extractedData: {}, confidence: null, error: null, errorDetail: '', strutturaId };
  document.getElementById('ocr-preview').innerHTML = '';
  document.getElementById('ocr-actions').style.display = 'none';
  document.getElementById('ocr-processing').style.display = 'none';
  renderOCRReview();
  document.getElementById('ocr-review-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// 3. Aggiunta alla Lista Principale
document.getElementById('btn-add-ocr-guest').addEventListener('click', () => {
  const selectedStruttura = ocrState.strutturaId || document.getElementById('structure-filter').value;

  if (!selectedStruttura) {
    alert('⚠️ Struttura non valida.');
    return;
  }

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
    data_arrivo: document.getElementById('ocr-data-arrivo').value.trim(),
    permanenza: String(Math.max(1, Math.min(30, parseInt(document.getElementById('ocr-permanenza').value, 10) || 1))),
    tipo_alloggiato: document.getElementById('ocr-tipo-alloggiato').value
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
  ocrState = { images: [], phase: 'capture', rawText: '', extractedData: null, confidence: null, error: null, errorDetail: '', strutturaId: '' };
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

  // La struttura è già stata scelta in fase di cattura, la sincronizziamo col filtro principale
  if (ocrState.strutturaId) {
    document.getElementById('structure-filter').value = ocrState.strutturaId;
  }

  // Soggiorno: sempre proposti e sempre modificabili, sia dopo OCR sia in compilazione
  // manuale — stessa sezione "Stay" mostrata da MiPA Companion in fase di revisione.
  populateArrivalDateSelect();
  if (d.data_arrivo) document.getElementById('ocr-data-arrivo').value = d.data_arrivo;
  document.getElementById('ocr-permanenza').value = d.permanenza || '1';
  populateTipoAlloggiatoSelects();
  if (d.tipo_alloggiato) document.getElementById('ocr-tipo-alloggiato').value = d.tipo_alloggiato;

  document.getElementById('ocr-cognome').value = d.cognome || '';
  document.getElementById('ocr-nome').value = d.nome || '';
  document.getElementById('ocr-data-nascita').value = d.data_nascita || '';
  document.getElementById('ocr-sesso').value = d.sesso || '';
  document.getElementById('ocr-comune-nascita').value = d.comune_nascita || '';
  document.getElementById('ocr-provincia-nascita').value = d.provincia_nascita || '';
  document.getElementById('ocr-cittadinanza').value = d.cittadinanza || 'ITALIANA';
  populateOcrDocumentoSelect();
  document.getElementById('ocr-tipo-documento').value = d.tipo_documento || 'CARTA DI IDENTITA\'';
  document.getElementById('ocr-numero-documento').value = d.numero_documento || '';
  document.getElementById('ocr-luogo-rilascio').value = d.luogo_rilascio || '';

  // Affidabilità OCR ed eventuali errori: mostrati in evidenza nel form, non solo
  // nascosti dentro il testo grezzo di debug (in linea con la revisione di MiPA).
  const confNote = document.getElementById('ocr-confidence-note');
  if (typeof ocrState.confidence === 'number') {
    confNote.textContent = `📊 Affidabilità OCR stimata: ${Math.round(ocrState.confidence * 100)}% — verifica comunque ogni campo prima di aggiungere l'ospite.`;
    confNote.style.display = 'block';
  } else {
    confNote.style.display = 'none';
  }
  const errNote = document.getElementById('ocr-error-note');
  if (ocrState.error) {
    errNote.textContent = `⚠️ Non è stato possibile leggere il documento con l'OCR (${ocrState.errorDetail || 'errore sconosciuto'}). Compila i campi manualmente.`;
    errNote.style.display = 'block';
  } else {
    errNote.style.display = 'none';
  }

  let rawDisplay = ocrState.rawText || 'Nessun testo estratto.';
  if (typeof ocrState.confidence === 'number') {
    rawDisplay = `[Affidabilità OCR stimata: ${Math.round(ocrState.confidence * 100)}%]\n\n` + rawDisplay;
  }
  if (ocrState.error) {
    rawDisplay += `\n\n⚠️ ERRORE OCR: ${ocrState.errorDetail}`;
  }
  document.getElementById('ocr-raw-text').textContent = rawDisplay;
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

// Chiama la Netlify Function che a sua volta interroga Google Cloud Vision.
// In caso di errore, restituisce un dettaglio tecnico leggibile (mostrato nel testo
// grezzo dietro <details>) invece di un generico fallimento silenzioso.
async function callVisionOCR(dataUrl, strutturaId) {
  let res;
  try {
    res = await fetch(OCR_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Token': OCR_APP_TOKEN },
      body: JSON.stringify({ image: dataUrl, struttura_id: strutturaId }),
    });
  } catch (networkErr) {
    throw new Error('Rete: impossibile raggiungere il servizio OCR (' + networkErr.message + ')');
  }
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    const detail = 'HTTP ' + res.status + ' dal servizio OCR' + (bodyText ? ' — ' + bodyText.slice(0, 300) : '')
      + (res.status === 401 ? ' (probabile disallineamento tra OCR_APP_TOKEN e APP_SHARED_TOKEN)' : '')
      + (res.status === 404 ? ' (funzione non trovata: verifica che netlify.toml e netlify/functions/ocr-proxy.mjs siano stati pubblicati)' : '')
      + (res.status === 500 ? ' (nessuna chiave Vision configurata per questa struttura: verifica GOOGLE_VISION_KEYS su Netlify)' : '')
      + (res.status === 502 ? ' (la funzione ha risposto ma la chiamata a Google Vision è fallita: verifica la chiave e la fatturazione del progetto Google Cloud)' : '');
    throw new Error(detail);
  }
  const json = await res.json();
  return { text: json.text || '', confidence: typeof json.confidence === 'number' ? json.confidence : null };
}

const MRZ_ALPHA3_TO_STATO = {
  ITA: 'ITALIA', FRA: 'FRANCIA', DEU: 'GERMANIA', ESP: 'SPAGNA', GBR: 'REGNO UNITO',
  USA: "STATI UNITI D'AMERICA", CHE: 'SVIZZERA', AUT: 'AUSTRIA', BEL: 'BELGIO',
  NLD: 'PAESI BASSI', PRT: 'PORTOGALLO', POL: 'POLONIA', ROU: 'ROMANIA',
  RUS: 'FEDERAZIONE RUSSA', UKR: 'UCRAINA', GRC: 'GRECIA', IRL: 'IRLANDA',
  SWE: 'SVEZIA', NOR: 'NORVEGIA', DNK: 'DANIMARCA', FIN: 'FINLANDIA',
  CHN: 'CINA', JPN: 'GIAPPONE', BRA: 'BRASILE', CAN: 'CANADA', AUS: 'AUSTRALIA',
  MEX: 'MESSICO', ARG: 'ARGENTINA', IND: 'INDIA', MAR: 'MAROCCO', TUN: 'TUNISIA',
  ALB: 'ALBANIA', HRV: 'CROAZIA', SRB: 'SERBIA', HUN: 'UNGHERIA', BGR: 'BULGARIA',
  TUR: 'TURCHIA', BLR: 'BIELORUSSIA',
  // Restanti Stati membri UE/SEE (codici MRZ alpha-3 ICAO) — carte d'identità e
  // passaporti UE usano tutti lo stesso standard MRZ, quindi bastano i codici corretti
  // perché il resto del parsing (TD1/TD3) funzioni automaticamente per ogni paese.
  CYP: 'CIPRO', CZE: 'REPUBBLICA CECA', EST: 'ESTONIA', LVA: 'LETTONIA',
  LTU: 'LITUANIA', LUX: 'LUSSEMBURGO', MLT: 'MALTA', SVK: 'REPUBBLICA SLOVACCA',
  SVN: 'SLOVENIA', ISL: 'ISLANDA', LIE: 'LIECHTENSTEIN',
};

// Titoli con cui le carte d'identità dei paesi UE si presentano (lingua nazionale),
// usati per riconoscere il tipo di documento nel percorso generico senza MRZ leggibile.
// Elenco paesi di riferimento: identity-cards.net.
const EU_ID_CARD_TITLES = [
  "carte d'identité", 'documento nacional de identidad', 'documento de identidad',
  'cartão de cidadão', 'bilhete de identidade', 'personalausweis', 'identiteitskaart', 'dowód osobisty',
  'személyazonosító igazolvány', 'občanský průkaz', 'občiansky preukaz',
  'osebna izkaznica', 'asmens tapatybės kortelė', 'personas apliecība',
  'isikutunnistus', 'karta tożsamości', 'identity card',
  // Lingue mancanti nell'elenco originale — aggiunte per coprire tutti gli Stati UE/SEE.
  'δελτίο ταυτότητας', 'лична карта', 'carte de identitate', 'lična karta',
  'henkilökortti', 'identitetskort', 'skilríki', 'cartu tal-identità',
];

// Titoli con cui la patente di guida si presenta nelle varie lingue UE — tutte le patenti
// UE seguono lo stesso modello (Direttiva 2006/126/CE), quindi il documento fisico è
// sostanzialmente identico in tutta l'Unione: cambia solo la lingua dell'intestazione.
const EU_DRIVING_LICENCE_TITLES = [
  'permis de conduire', 'führerschein', 'rijbewijs', 'körkort', 'kørekort',
  'ajokortti', 'carta de condução', 'permiso de conducción', 'prawo jazdy',
  'vezetői engedély', 'řidičský průkaz', 'vodičský preukaz', 'vozniško dovoljenje',
  'vairuotojo pažymėjimas', 'vadītāja apliecība', 'juhiluba',
  // Lingue mancanti nell'elenco originale (testo esatto dell'intestazione armonizzata
  // Allegato I Direttiva 2006/126/CE nelle rispettive lingue nazionali).
  'свидетелство за управление на мпс', 'άδεια οδήγησης', 'vozačka dozvola',
  'permis de conducere', 'liċenzja tas-sewqan',
];


// Confronto testuale approssimato: toglie accenti/punteggiatura e confronta in maiuscolo.
function normalizeForMatch(s) {
  return (s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9 ]/g, '').trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// Trova nella lista ufficiale la voce che più somiglia al testo letto dall'OCR: prova prima
// corrispondenza esatta, poi prefisso/contenuto, infine distanza di Levenshtein entro una
// soglia ragionevole. Restituisce '' se non trova nulla di abbastanza simile (l'operatore
// sceglierà a mano dal menu).
function findBestMatch(text, list) {
  if (!text) return '';
  const norm = normalizeForMatch(text);
  if (!norm) return '';
  const exact = list.find(item => normalizeForMatch(item) === norm);
  if (exact) return exact;
  const starts = list.find(item => {
    const n = normalizeForMatch(item);
    return n.startsWith(norm) || norm.startsWith(n);
  });
  if (starts) return starts;
  const includes = list.find(item => {
    const n = normalizeForMatch(item);
    return n.includes(norm) || norm.includes(n);
  });
  if (includes) return includes;
  let best = '', bestDist = Infinity;
  for (const item of list) {
    const d = levenshtein(norm, normalizeForMatch(item));
    if (d < bestDist) { bestDist = d; best = item; }
  }
  const threshold = Math.max(2, Math.floor(norm.length * 0.35));
  return bestDist <= threshold ? best : '';
}

// Stato/nazionalità: prova prima la mappa MRZ (codici alpha-3 come "ITA", "FRA"...),
// poi il confronto testuale generico (utile per il percorso senza MRZ, dove l'OCR legge
// direttamente un nome per esteso).
// Alcune carte d'identità UE riportano la nazionalità come aggettivo nella propria lingua
// (es. "POLSKIE" sulla carta polacca, "MAGYAR" su quella ungherese) anziché come codice
// alpha-3 o nome Stato in italiano: il fuzzy-match su STATI_LIST da solo non li riconosce
// (sono parole troppo diverse dal nome italiano dello Stato), quindi serve un elenco
// dedicato, sul modello di MRZ_ALPHA3_TO_STATO.
const NATIONALITY_ALIAS_TO_STATO = {
  POLSKIE: 'POLONIA', POLSKA: 'POLONIA',
  MAGYAR: 'UNGHERIA',
  DEUTSCH: 'GERMANIA', DEUTSCHE: 'GERMANIA',
  FRANÇAISE: 'FRANCIA', FRANCAISE: 'FRANCIA',
  ESPAÑOLA: 'SPAGNA', ESPANOLA: 'SPAGNA',
  PORTUGUESA: 'PORTOGALLO',
  NEDERLANDSE: 'PAESI BASSI',
  ÖSTERREICHISCH: 'AUSTRIA', OSTERREICHISCH: 'AUSTRIA',
  BELGE: 'BELGIO', BELGISCH: 'BELGIO',
  ROMÂNĂ: 'ROMANIA', ROMANA: 'ROMANIA',
  ΕΛΛΗΝΙΚΗ: 'GRECIA',
  SVENSK: 'SVEZIA', SUOMI: 'FINLANDIA', SUOMEN: 'FINLANDIA',
  DANSK: 'DANIMARCA',
  ČESKÁ: 'REPUBBLICA CECA', CESKA: 'REPUBBLICA CECA',
  SLOVENSKÁ: 'REPUBBLICA SLOVACCA', SLOVENSKA: 'REPUBBLICA SLOVACCA',
  HRVATSKA: 'CROAZIA', HRVATSKO: 'CROAZIA',
  BULGARSKO: 'BULGARIA',
};

function normalizeDateStr(s) {
  if (!s) return '';
  // Alcuni Stati UE separano gg/mm/aaaa con spazi anziché punti o barre (es. le carte
  // d'identità ungheresi: "31 12 1970"), e alcuni documenti italiani (patenti) usano
  // l'anno a 2 cifre ("02/03/89"): gestiamo entrambi i casi.
  const m = s.trim().match(/^(\d{2})[.\-\/\s](\d{2})[.\-\/\s](\d{2,4})$/);
  if (!m) return s.trim();
  return m[1] + '/' + m[2] + '/' + expandTwoDigitYear(m[3]);
}

// Espande un anno a 2 cifre in 4 cifre con la stessa euristica usata per la MRZ: se
// maggiore di 30 si assume 19xx, altrimenti 20xx (nessun documento UE in circolazione oggi
// può riportare una nascita dopo il 2030 o richiedere quell'ambiguità sul lato opposto).
function expandTwoDigitYear(yearStr) {
  if (yearStr.length === 4) return yearStr;
  const yy = parseInt(yearStr, 10);
  return String(yy > 30 ? 1900 + yy : 2000 + yy);
}

function formatMrzDate(yymmdd) {
  if (!/^\d{6}$/.test(yymmdd)) return '';
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = yymmdd.slice(2, 4), dd = yymmdd.slice(4, 6);
  const yyyy = yy > 30 ? 1900 + yy : 2000 + yy;
  return dd + '/' + mm + '/' + yyyy;
}

function splitMrzNames(namesPart) {
  const clean = namesPart.replace(/<+$/, '');
  const [surname = '', given = ''] = clean.split('<<');
  return {
    surname: surname.replace(/</g, ' ').trim(),
    givenNames: given.replace(/</g, ' ').trim(),
  };
}

// Passaporto (TD3): due righe da 44 caratteri
function parseTD3(line1, line2) {
  const country = line1.substr(2, 3).replace(/</g, '');
  const { surname, givenNames } = splitMrzNames(line1.substr(5));
  const number = line2.substr(0, 9).replace(/</g, '').trim();
  const nationality = line2.substr(10, 3).replace(/</g, '');
  const dob = formatMrzDate(line2.substr(13, 6));
  const sex = line2.substr(20, 1) === 'F' ? 'F' : (line2.substr(20, 1) === 'M' ? 'M' : '');
  const expiry = formatMrzDate(line2.substr(21, 6));
  return { docType: 'PASSAPORTO ORDINARIO', country, surname, givenNames, number, nationality, sex, dob, expiry };
}

// Etichetta ufficiale da usare per il tipo documento letto via MRZ: "elettronica" è la
// dicitura della tabella Alloggiati Web riservata al modello italiano CIE; per le carte
// d'identità di altri Stati UE, che seguono lo stesso standard MRZ ma non sono la CIE,
// usiamo la voce generica "CARTA DI IDENTITA'".
function mrzIdCardDocType(country) {
  return country === 'ITA' ? "CARTA IDENTITA' ELETTRONICA" : "CARTA DI IDENTITA'";
}

// Carta d'identità elettronica (TD1): tre righe da 30 caratteri
function parseTD1(line1, line2, line3) {
  const country = line1.substr(2, 3).replace(/</g, '');
  const number = line1.substr(5, 9).replace(/</g, '').trim();
  const dob = formatMrzDate(line2.substr(0, 6));
  const sex = line2.substr(7, 1) === 'F' ? 'F' : (line2.substr(7, 1) === 'M' ? 'M' : '');
  const expiry = formatMrzDate(line2.substr(8, 6));
  const nationality = line2.substr(15, 3).replace(/</g, '');
  const { surname, givenNames } = splitMrzNames(line3);
  return { docType: mrzIdCardDocType(country), country, surname, givenNames, number, nationality, sex, dob, expiry };
}

// Carta d'identità elettronica (TD2): due righe da 36 caratteri — formato usato da alcune
// carte d'identità UE (ICAO 9303 parte 6) in alternativa al TD1 a tre righe. La struttura è
// analoga al TD3 dei passaporti ma più corta: nomi in riga 1, dati anagrafici in riga 2.
function parseTD2(line1, line2) {
  const country = line1.substr(2, 3).replace(/</g, '');
  const { surname, givenNames } = splitMrzNames(line1.substr(5));
  const number = line2.substr(0, 9).replace(/</g, '').trim();
  const nationality = line2.substr(10, 3).replace(/</g, '');
  const dob = formatMrzDate(line2.substr(13, 6));
  const sex = line2.substr(20, 1) === 'F' ? 'F' : (line2.substr(20, 1) === 'M' ? 'M' : '');
  const expiry = formatMrzDate(line2.substr(21, 6));
  return { docType: mrzIdCardDocType(country), country, surname, givenNames, number, nationality, sex, dob, expiry };
}

// Fallback generico: cerca etichette note (multi-lingua) riga per riga nel testo OCR grezzo.
// Parole che indicano che il testo "catturato" è in realtà un'altra etichetta stampata
// sul documento (es. intestazioni bilingue "Cognome/Surname"), non il dato vero e proprio.
const GENERIC_LABEL_WORDS = [
  'cognome', 'surname', 'nom', 'nome', 'name', 'given', 'prénom', 'first',
  'data', 'date', 'nascita', 'birth', 'naissance', 'nazionalit', 'nationality',
  'documento', 'document', 'numero', 'number', 'scadenza', 'expiry', 'sesso', 'sex',
  'luogo', 'place', 'rilascio', 'issue', 'residenza', 'residence',
  'comune', 'municipality', 'emissione', 'issuing',
  // Altre lingue UE (etichette che possono comparire sui documenti di altri Stati membri)
  'achternaam', 'voornaam', 'geboorte', 'geboortedatum', 'nationaliteit',
  'apelido', 'nascimento', 'nacionalidade', 'apellido', 'nacimiento', 'nacionalidad',
  'nachname', 'vorname', 'geburtsdatum', 'staatsangehörigkeit', 'geburtsort',
  'nazwisko', 'imię', 'urodzenia', 'obywatelstwo',
  'efternamn', 'förnamn', 'födelsedatum', 'medborgarskap',
  'efternavn', 'fornavn', 'fødselsdato', 'statsborgerskab',
  'sukunimi', 'etunimi', 'syntymäaika', 'kansalaisuus',
  'příjmení', 'jméno', 'narození', 'státní příslušnost',
  'priezvisko', 'meno', 'narodenia', 'štátna príslušnosť',
  'priimek', 'ime', 'rojstva', 'državljanstvo',
  'pavardė', 'vardas', 'gimimo', 'pilietybė',
  'uzvārds', 'vārds', 'dzimšanas', 'pilsonība',
  'perekonnanimi', 'eesnimi', 'sünniaeg', 'kodakondsus',
  'vezetéknév', 'keresztnév', 'születési', 'állampolgárság', 'családi', 'utónev', 'utónév',
  // Francese (per le etichette bilingui tipo "Cetățenie/Nationalité" o "Seria/Série et numéro"
  // dove il francese non era in questo elenco e veniva scambiato per un valore vero)
  'nationalité', 'numéro', 'série', 'délivré',
  // Rumeno
  'nume', 'prenume', 'cetățenie', 'cetatenie', 'nașterii', 'nasterii', 'seria', 'nașterea',
  // Greco
  'επώνυμο', 'όνομα', 'ιθαγένεια', 'υπηκοότητα', 'φύλο', 'ημερομηνία', 'γέννησης', 'αριθμός',
  // Bulgaro (cirillico)
  'фамилия', 'име', 'гражданство', 'дата', 'раждане', 'номер', 'документа', 'пол',
  // Croato/sloveno
  'prezime',
  // Parole generiche 'carta/documento' in altre lingue che comparivano vicino al numero
  // documento e, non essendo qui, venivano scambiate per il valore (es. lussemburghese
  // "N° CARTE D'IDENTITÉ / IDENTITY CARD Nb" catturato per intero invece del vero numero
  // sulla riga sotto).
  'card', 'identity', 'carte', 'identité', 'kaart', 'karta', 'kortelė', 'korttinumero',
  'serijska', 'serial', 'citizenship',
];

function looksLikeAnotherLabel(str) {
  const low = str.toLowerCase();
  return GENERIC_LABEL_WORDS.some(w => low.includes(w));
}

// Cerca un'etichetta (con confini di parola, per evitare falsi positivi tipo "nome"
// dentro "cognome") e restituisce il valore associato: prima prova sulla stessa riga,
// altrimenti sulla riga successiva (utile quando etichetta e valore sono su righe diverse,
// come "LUOGO E DATA DI NASCITA" seguito, sulla riga sotto, dal vero valore).
// NB: usiamo confini "(?<!\p{L})...(?!\p{L})" invece di \b: in JavaScript \b considera
// carattere di parola solo [A-Za-z0-9_], quindi con lettere accentate (é, á, ó, à, ł...)
// molto comuni nelle etichette non italiane \b smette di funzionare — sia mancando
// etichette che finiscono con una lettera accentata (es. "okmányazonosító" seguito da un
// segno di punteggiatura), sia creando confini falsi dentro parole accentate (es. leggere
// "F" come isolato dentro "FÉRFI" perché \b vede una falsa transizione prima della É).
function findLabelValue(lines, labels) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const label of labels) {
      const hasLabel = new RegExp('(?<!\\p{L})' + label + '(?!\\p{L})', 'iu').test(line);
      if (!hasLabel) continue;
      // Il valore catturato deve iniziare con lettera o cifra: altrimenti, quando dopo
      // l'etichetta resta solo punteggiatura residua (es. "Doc. No.:" con il vero valore
      // sulla riga sotto), il tentativo di soddisfare la lunghezza minima finirebbe per
      // "inventare" un valore fatto di soli simboli come ".:".
      const sameLine = line.match(new RegExp('(?<!\\p{L})' + label + '(?!\\p{L})[\\s:.\\-/]*([\\p{L}\\p{N}].{1,39})$', 'iu'));
      if (sameLine && sameLine[1] && !looksLikeAnotherLabel(sameLine[1])) {
        return sameLine[1].trim();
      }
      // L'etichetta è presente ma sulla stessa riga non c'è un valore utilizzabile
      // (riga finita, o quel che segue è un'altra etichetta): prova la riga successiva.
      if (lines[i + 1] && !looksLikeAnotherLabel(lines[i + 1])) {
        return lines[i + 1].trim();
      }
    }
  }
  return '';
}

// Riconosce il formato tipico dei documenti italiani con sigla provincia tra parentesi,
// tratto univoco che non si trova sui documenti degli altri Stati UE. L'ordine cambia però
// da documento a documento: le carte d'identità scrivono "COMUNE (PR) gg.mm.aaaa" mentre le
// patenti scrivono "gg/mm/aa COMUNE (PR)" (spesso con l'anno a sole 2 cifre) — gestiamo
// entrambi. Lavora riga per riga (non sull'intero testo) per evitare che lo spazio bianco
// della regex "ingoi" righe precedenti non correlate attraverso gli a-capo.
function extractItalianBirthLine(lines) {
  const place = "([A-ZÀ-Ú][A-ZÀ-Ú'\\s]{1,30}?)\\s*\\(\\s*([A-Z]{2})\\s*\\)";
  const date = '(\\d{2})[.\\/](\\d{2})[.\\/](\\d{2,4})';
  for (const line of lines) {
    let m = line.match(new RegExp(place + '\\s*' + date, 'i'));
    if (m) return { comune: m[1].trim(), provincia: m[2].toUpperCase(), dob: m[3] + '/' + m[4] + '/' + expandTwoDigitYear(m[5]) };
    m = line.match(new RegExp(date + '\\s*' + place, 'i'));
    if (m) return { comune: m[4].trim(), provincia: m[5].toUpperCase(), dob: m[1] + '/' + m[2] + '/' + expandTwoDigitYear(m[3]) };
  }
  return null;
}

// Etichette del sesso nelle lingue UE — l'originale riconosceva solo "sesso"/"sex", quindi
// falliva su qualunque documento non italiano/inglese anche quando la MRZ non era leggibile.
const SEX_LABELS = [
  'sesso', 'sex', 'sexe', 'geschlecht', 'sexo', 'geslacht', 'płeć', 'kön', 'køn',
  'sukupuoli', 'pohlaví', 'pohlavie', 'spol', 'lytis', 'dzimums', 'sugu', 'nem', 'φύλο', 'пол',
];

// Il sesso spesso condivide la riga/colonna con un'altra informazione (es. "SESSO STATURA"
// seguito da "M 180" = sesso + altezza): cerchiamo un token isolato entro poche righe dopo
// l'etichetta, invece di fidarci ciecamente di quel che segue sulla stessa riga. Includiamo
// "K" (polacco, kobieta=donna), "Ž" (croato/sloveno, žensko/žena=donna) e la "Ж" cirillica
// (bulgaro, dove il valore compare spesso come "Ж/F" ma per sicurezza lo intercettiamo anche
// da solo) al posto di F. Molte carte UE mostrano comunque il valore come "lettera
// nazionale/F" (es. olandese "V/F", tedesco/belga "W/F"): in quel caso la "F" internazionale
// viene già trovata correttamente senza bisogno di mappare la lettera nazionale.
function extractSesso(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (SEX_LABELS.some(w => new RegExp('(?<!\\p{L})' + w + '(?!\\p{L})', 'iu').test(lines[i]))) {
      for (let j = i; j < Math.min(i + 4, lines.length); j++) {
        const m = lines[j].match(/(?<!\p{L})([MFKŽЖ])(?!\p{L})/iu);
        if (m) {
          const letter = m[1].toUpperCase();
          return (letter === 'K' || letter === 'Ž' || letter === 'Ж') ? 'F' : letter;
        }
      }
    }
  }
  return '';
}

// Riconosce il tipo di documento dal testo libero (percorso generico, senza MRZ) e
// restituisce direttamente l'etichetta ufficiale della tabella Documenti.
function detectDocType(text) {
  const low = text.toLowerCase();
  if (low.includes('patente nautica')) return 'PATENTE NAUTICA';
  if (low.includes('patente') || low.includes('driving licence') || low.includes('driver')) return 'PATENTE DI GUIDA';
  // Patente UE straniera: stesso modello della patente italiana (Direttiva 2006/126/CE),
  // cambia solo la lingua dell'intestazione stampata sul documento.
  if (EU_DRIVING_LICENCE_TITLES.some(title => low.includes(title))) return 'PATENTE DI GUIDA';
  if (low.includes('porto d\'armi') || low.includes('porto darmi')) return "PORTO D'ARMI GUARDIE GIUR";
  if (low.includes('passaporto') || low.includes('passport') || low.includes('reisepass') || low.includes('passeport') || low.includes('pasaporte')) return 'PASSAPORTO ORDINARIO';
  if (low.includes('elettronica') && (low.includes('identit') || low.includes('identity'))) return "CARTA IDENTITA' ELETTRONICA";
  if (low.includes('identit') || low.includes('identity card')) return "CARTA DI IDENTITA'";
  // Carta d'identità di un altro paese UE: riconosciuta dal titolo nella lingua nazionale.
  if (EU_ID_CARD_TITLES.some(title => low.includes(title))) return "CARTA DI IDENTITA'";
  return '';
}

// Etichette multilingua del campo combinato "data e luogo di nascita" — presente su TUTTE
// le patenti UE (campo 3, Direttiva 2006/126/CE) e su molte carte d'identità non elettroniche
// che non hanno l'MRZ. L'originale riconosceva solo il formato italiano via
// extractItalianBirthLine (con sigla provincia tra parentesi); qui copriamo il caso generale.
const BIRTH_PLACE_DATE_LABELS = [
  'luogo e data di nascita', 'data e luogo di nascita',
  'date and place of birth', 'place and date of birth',
  'date et lieu de naissance', 'lieu et date de naissance',
  'geburtsdatum und -ort', 'geburtsort und -datum', 'geburtsdatum/-ort',
  'fecha y lugar de nacimiento', 'lugar y fecha de nacimiento',
  'data e local de nascimento', 'local e data de nascimento',
  'geboortedatum en -plaats', 'geboorteplaats en -datum',
  'data i miejsce urodzenia',
  'data și locul nașterii', 'locul și data nașterii',
  'születési hely és idő', 'születési idő és hely',
  'datum a místo narození', 'místo a datum narození',
  'dátum a miesto narodenia', 'miesto a dátum narodenia',
  'datum in kraj rojstva', 'kraj in datum rojstva',
  'gimimo data ir vieta', 'gimimo vieta ir data',
  'dzimšanas datums un vieta', 'dzimšanas vieta un datums',
  'sünniaeg ja -koht', 'sünnikoht ja -aeg',
  'syntymäaika ja -paikka', 'syntymäpaikka ja -aika',
  'födelsedatum och födelseort', 'födelseort och födelsedatum',
  'fødselsdato og -sted', 'fødselssted og -dato',
  'ημερομηνία και τόπος γέννησης',
  'дата и място на раждане',
  'datum i mjesto rođenja',
];

// Cerca una di queste etichette, poi la data (gg.mm.aaaa o gg/mm/aaaa) sulla stessa riga
// o su una delle due righe successive: il testo che resta sulla riga della data, ripulito
// da virgole/trattini, è il luogo di nascita in chiaro. A differenza del formato italiano,
// qui NON si assume alcuna sigla provincia: la maggior parte degli Stati UE non la usa.
function extractGenericBirthDatePlace(lines) {
  // L'anno può essere a 2 o 4 cifre: molte patenti (comprese quelle italiane) usano il
  // formato breve "gg/mm/aa".
  const dateRe = /(\d{2}[.\/]\d{2}[.\/]\d{2,4})/;
  for (let i = 0; i < lines.length; i++) {
    const low = lines[i].toLowerCase();
    if (!BIRTH_PLACE_DATE_LABELS.some(l => low.includes(l))) continue;
    for (let j = i; j < Math.min(i + 3, lines.length); j++) {
      const m = lines[j].match(dateRe);
      if (!m) continue;
      const dateStr = normalizeDateStr(m[1]);
      let rest = (lines[j].slice(0, m.index) + ' ' + lines[j].slice(m.index + m[0].length)).trim();
      rest = rest.replace(/^[,.\-–\s]+|[,.\-–\s]+$/g, '').trim();
      const place = (rest && rest.length <= 40 && !looksLikeAnotherLabel(rest)) ? rest : '';
      return { dob: dateStr, place };
    }
  }
  return null;
}

// Le patenti UE seguono i campi numerati dell'Allegato I della Direttiva 2006/126/CE,
// identici in tutti gli Stati membri (cambia solo la lingua delle etichette stampate):
// 1 Cognome, 2 Nome, 3 Data e luogo di nascita, 4a Data di rilascio, 4b Data di scadenza,
// 4c Autorità di rilascio, 5 Numero della patente. Usiamo questi codici numerici come rete
// di sicurezza quando l'OCR legge il codice campo isolato su una riga (tipico dei layout a
// tabella) e l'etichetta testuale, in una lingua non coperta sopra, non basta da sola.
// Nota: sulle patenti italiane 4a e 4c compaiono spesso affiancati sulla STESSA riga
// (es. "4a. 25/09/2021  4c. MIT-UCO"), quindi cerchiamo tutti i codici presenti in ogni
// riga, non solo il primo.
function extractDrivingLicenceFields(lines) {
  const out = {};
  const dateRe = /(\d{2}[.\/]\d{2}[.\/]\d{2,4})/;
  const codeRe = /(?:^|\s)(\d{1,2}[abc]?)[.)]\s*/gi;

  function assign(code, value) {
    if (!value || looksLikeAnotherLabel(value)) return;
    if (code === '5' && !out.number) out.number = value;
    else if (code === '1' && !out.surname) out.surname = value;
    else if (code === '2' && !out.givenNames) out.givenNames = value;
    else if (code === '4c' && !out.issuingAuthority) out.issuingAuthority = value;
    else if (code === '3' && !out.dob) {
      const dm = value.match(dateRe);
      if (dm) {
        out.dob = normalizeDateStr(dm[1]);
        let rest = (value.slice(0, dm.index) + ' ' + value.slice(dm.index + dm[0].length)).trim();
        rest = rest.replace(/^[,.\-–\s]+|[,.\-–\s]+$/g, '').trim();
        if (rest && rest.length <= 40) out.place = rest;
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const matches = [...line.matchAll(codeRe)];
    if (matches.length) {
      for (let k = 0; k < matches.length; k++) {
        const code = matches[k][1].toLowerCase();
        const start = matches[k].index + matches[k][0].length;
        const end = (k + 1 < matches.length) ? matches[k + 1].index : line.length;
        assign(code, line.slice(start, end).trim());
      }
      continue;
    }
    // Riga che contiene solo il codice, senza punto/valore a seguire: il valore sarà sulla
    // riga successiva (capita quando l'OCR legge il layout a tabella riga per riga).
    const codeOnly = line.match(/^(\d{1,2}[abc]?)$/i);
    if (codeOnly) assign(codeOnly[1].toLowerCase(), lines[i + 1] ? lines[i + 1].trim() : '');
  }
  return out;
}

function genericExtract(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const find = (labels) => findLabelValue(lines, labels);

  // Alcuni Stati (es. Ungheria) non separano cognome e nome in due campi distinti, ma usano
  // un'unica etichetta combinata ("Family name and Given name"/"Családi és utónév"). Va
  // rilevata PRIMA della ricerca standard qui sotto: altrimenti l'etichetta "given name",
  // contenuta nella frase combinata, verrebbe intercettata per sbaglio dalla ricerca normale
  // del solo campo nome, lasciando il cognome vuoto e mettendo il nome completo in un unico
  // campo. Quando troviamo il campo combinato, assumiamo che la prima parola sia il cognome
  // e il resto il/i nome/i — euristica corretta nella stragrande maggioranza dei casi, e
  // comunque sempre correggibile in revisione.
  const combinedName = find([
    'family name and given name', 'family name and given names',
    'családi és utónev', 'családi és utónév',
  ]);
  let surname, givenNames;
  if (combinedName) {
    const parts = combinedName.trim().split(/\s+/);
    surname = parts.shift() || '';
    givenNames = parts.join(' ');
  } else {
    surname = find([
      'cognome', 'surname', 'nom', 'apellido', 'nachname', 'achternaam', 'apelido',
      'nazwisko', 'efternamn', 'efternavn', 'sukunimi', 'příjmení', 'priezvisko',
      'priimek', 'pavardė', 'uzvārds', 'perekonnanimi', 'vezetéknév',
      // Rumeno, croato, greco, bulgaro: mancanti, trovati esaminando i campioni di
      // carte d'identità UE (Romania, Croazia, Grecia, Cipro, Bulgaria).
      'nume', 'prezime', 'επώνυμο', 'фамилия',
    ]);
    givenNames = find([
      'nome', 'given name', 'given names', 'prénom', 'first name', 'nombre', 'vorname', 'voornaam',
      'nome próprio', 'imię', 'imiona', 'förnamn', 'fornavn', 'etunimi', 'jméno', 'meno',
      'ime', 'vardas', 'vārds', 'eesnimi', 'keresztnév',
      'prenume', 'όνομα', 'име',
    ]);
  }

  const result = {
    docType: detectDocType(text),
    surname,
    givenNames,
    number: find([
      'numero documento', 'n\\.?\\s*documento', 'document no', 'document number',
      'doc\\.?\\s*no', 'passport no', 'n°', 'card no', 'identity card no', 'identity card number',
      'nr dokumentu', 'numer dokumentu', 'seria i numer dokumentu', 'documentnummer',
      'ausweisnummer', 'ausweisnr', 'dokumentennummer', 'dokumentnummer', 'kaartnr', 'kaartnummer', 'card n',
      'número de documento', 'número do documento', 'document id no', 'n\\.?º\\s*documento',
      'asiakirjan numero', 'korttinumero', 'kortnummer', 'kortnr',
      'číslo dokladu', 'številka dokumenta', 'serijska številka', 'serial number',
      'dokumento numeris', 'kortelės nr', 'dokumenta numurs',
      'dokumendi number', 'okmány száma', 'okmányazonosító', 'driving licence no', 'permis n', 'licence no',
      "n\\.?\\s*patente", 'führerschein nr', 'dni',
      'seria si numărul', 'seria și numărul', 'αριθμός δελτίου ταυτότητας', 'id card number',
      'номер на документа', 'broj osobne iskaznice',
    ]),
    nationality: find([
      'nazionalit[aà]', 'nationality', 'citizenship', 'nacionalidad', 'staatsangehörigkeit', 'nationaliteit',
      'nacionalidade', 'obywatelstwo', 'medborgarskap', 'statsborgerskab', 'kansalaisuus',
      'státní příslušnost', 'štátna príslušnosť', 'državljanstvo', 'pilietybė',
      'pilsonība', 'kodakondsus', 'állampolgárság',
      'cetățenie', 'cetatenie', 'ιθαγένεια', 'υπηκοότητα', 'гражданство',
    ]),
    dob: find([
      'data di nascita', 'date of birth', 'geburtsdatum', 'fecha de nacimiento',
      'geboortedatum', 'data de nascimento', 'data urodzenia', 'födelsedatum',
      'fødselsdato', 'syntymäaika', 'datum narození', 'dátum narodenia',
      'datum rojstva', 'gimimo data', 'dzimšanas dat', 'sünniaeg', 'születési idő',
      'data nașterii', 'data nasterii', 'ημερομηνία γέννησης', 'дата на раждане',
    ]),
    // Sulla carta d'identità italiana "COMUNE DI / MUNICIPALITY" indica il comune che ha
    // rilasciato il documento — è il nome del luogo di rilascio (il codice numerico resta
    // comunque da inserire a mano, serve la tabella ufficiale).
    luogoRilascio: find([
      'comune di', 'municipality', 'rilasciat[oa] da', 'issued by', 'délivré par',
      'ausgestellt von', 'ausgestellt durch', 'expedido por', 'emitido por', 'wydany przez',
      'vydal', 'vydala', 'izdao', 'väljastanud', 'izsniedza', 'išdavė', 'kiadta', 'izdal',
    ]),
    comuneNascita: '', provinciaNascita: '', birthPlaceGeneric: '',
  };

  result.sex = extractSesso(lines);

  // Formato italiano "Comune (PR) gg.mm.aaaa": se trovato, ha priorità perché più affidabile
  // della ricerca per etichette separate (e ci dà anche comune/provincia, che altrimenti
  // resterebbero sempre da inserire a mano).
  const birthLine = extractItalianBirthLine(lines);
  if (birthLine) {
    result.comuneNascita = birthLine.comune;
    result.provinciaNascita = birthLine.provincia;
    result.dob = birthLine.dob;
  } else {
    // Non è il formato italiano: proviamo il campo combinato multilingua (patenti UE e
    // carte non elettroniche). Il luogo va in un campo separato (birthPlaceGeneric) perché,
    // a differenza del "Comune" italiano, qui NON possiamo assumere che il paese di nascita
    // sia l'Italia solo perché abbiamo trovato un luogo in chiaro.
    const genericBirth = extractGenericBirthDatePlace(lines);
    if (genericBirth) {
      if (genericBirth.dob) result.dob = genericBirth.dob;
      if (genericBirth.place) result.birthPlaceGeneric = genericBirth.place;
    }
  }

  // Rete di sicurezza per le patenti UE: completa solo i campi che l'estrazione per
  // etichetta non è riuscita a leggere, usando i codici numerici armonizzati (1, 2, 4c, 5).
  if (result.docType === 'PATENTE DI GUIDA') {
    const dl = extractDrivingLicenceFields(lines);
    if (!result.surname && dl.surname) result.surname = dl.surname;
    if (!result.givenNames && dl.givenNames) result.givenNames = dl.givenNames;
    if (!result.number && dl.number) result.number = dl.number;
    if (!result.luogoRilascio && dl.issuingAuthority) result.luogoRilascio = dl.issuingAuthority;
    if (!result.dob && dl.dob) result.dob = dl.dob;
    if (!result.birthPlaceGeneric && dl.place) result.birthPlaceGeneric = dl.place;
  }

  // Rete di sicurezza per la CIE (carta d'identità elettronica italiana): il numero
  // documento (es. "CA00265DL") compare in alto a destra SENZA alcuna etichetta testuale
  // adiacente, quindi la ricerca per etichetta non lo trova mai. Il formato è però
  // distintivo e stabile (2 lettere + 5 cifre + 2 lettere, 9 caratteri) — lo cerchiamo come
  // ultima risorsa solo sui documenti d'identità italiani, per non rischiare falsi positivi
  // su documenti di altri Stati.
  if (!result.number && (result.docType === "CARTA IDENTITA' ELETTRONICA" || result.docType === "CARTA DI IDENTITA'")) {
    for (const line of lines) {
      const m = line.match(/(?<!\p{L}|\d)[A-Z]{2}\d{5}[A-Z]{2}(?!\p{L}|\d)/u);
      if (m) { result.number = m[0]; break; }
    }
  }

  return result;
}

// Individua e interpreta la MRZ nel testo OCR; se non trovata, usa l'estrazione generica.
function extractFieldsFromText(text) {
  const candidateLines = text.split('\n')
    .map(l => l.replace(/\s+/g, '').toUpperCase())
    .filter(l => l.length >= 28 && l.length <= 46 && /^[A-Z0-9<]+$/.test(l));

  const td3Index = candidateLines.findIndex(l => l.length >= 43 && l.startsWith('P<'));
  if (td3Index >= 0 && candidateLines[td3Index + 1] && candidateLines[td3Index + 1].length >= 43) {
    try {
      return parseTD3(candidateLines[td3Index].padEnd(44, '<'), candidateLines[td3Index + 1].padEnd(44, '<'));
    } catch (e) { console.warn('Parsing TD3 fallito', e); }
  }

  for (let i = 0; i < candidateLines.length - 2; i++) {
    const [a, b, c] = [candidateLines[i], candidateLines[i + 1], candidateLines[i + 2]];
    if (a.length >= 29 && a.length <= 31 && b.length >= 29 && b.length <= 31 && c.length >= 29 && c.length <= 31) {
      try {
        return parseTD1(a.padEnd(30, '<'), b.padEnd(30, '<'), c.padEnd(30, '<'));
      } catch (e) { console.warn('Parsing TD1 fallito', e); }
    }
  }

  // Formato TD2 (2 righe da 36): usato da alcune carte d'identità elettroniche UE al posto
  // del TD1 a tre righe. Va cercato dopo il TD1 per non confondere righe da ~30-31 caratteri
  // con quelle da ~35-36.
  for (let i = 0; i < candidateLines.length - 1; i++) {
    const [a, b] = [candidateLines[i], candidateLines[i + 1]];
    if (a.length >= 35 && a.length <= 37 && b.length >= 35 && b.length <= 37 && !a.startsWith('P<')) {
      try {
        return parseTD2(a.padEnd(36, '<'), b.padEnd(36, '<'));
      } catch (e) { console.warn('Parsing TD2 fallito', e); }
    }
  }

  const emptyRaw = { docType: '', surname: '', givenNames: '', number: '', nationality: '', sex: '', dob: '', comuneNascita: '', provinciaNascita: '', birthPlaceGeneric: '', luogoRilascio: '' };
  return { ...emptyRaw, ...genericExtract(text) };
}


// ============================================================
// ADATTAMENTO ALLE TABELLE UFFICIALI (comuni.csv / stati.csv / documenti.csv)
// ============================================================
// A differenza di Via Nazionale/MiPA Companion (che confronta con elenchi fissi in
// JavaScript), qui le tabelle ufficiali sono già caricate da CSV in state.lookup —
// più complete (includono i codici Alloggiati Web veri) e sempre aggiornabili senza
// toccare il codice. Le funzioni sotto riusano lo stesso algoritmo di corrispondenza
// (esatta → prefisso/contenuto → distanza di Levenshtein) ma pescano dalle
// Descrizioni di queste tabelle invece che da un elenco hardcoded.

function findBestMatchInTable(text, table, field) {
  if (!text || !table || !table.length) return '';
  return findBestMatch(text, table.map(row => row[field] || ''));
}

// Stato/cittadinanza: prova prima la mappa dei codici MRZ alpha-3 ("ITA", "FRA"...) e
// gli alias di nazionalità in lingua nazionale ("POLSKIE", "MAGYAR"...), poi il
// confronto per somiglianza contro le Descrizioni ufficiali di stati.csv.
function matchStatoAlloggiati(text) {
  if (!text) return '';
  const code = text.trim().toUpperCase();
  if (MRZ_ALPHA3_TO_STATO[code]) return MRZ_ALPHA3_TO_STATO[code];
  if (NATIONALITY_ALIAS_TO_STATO[code]) return NATIONALITY_ALIAS_TO_STATO[code];
  const tokens = code.match(/(?<!\p{L})[A-Z]{3}(?!\p{L})/gu) || [];
  for (const tk of tokens) {
    if (MRZ_ALPHA3_TO_STATO[tk]) return MRZ_ALPHA3_TO_STATO[tk];
  }
  return findBestMatchInTable(text, state.lookup.stati, 'Descrizione');
}

// Tipo documento: confronto per somiglianza contro le Descrizioni ufficiali di
// documenti.csv (es. "CARTA DI IDENTITA'", "PASSAPORTO ORDINARIO", "PATENTE DI GUIDA"...).
function matchDocumentoAlloggiati(text) {
  return findBestMatchInTable(text, state.lookup.documenti, 'Descrizione');
}

// Comune di nascita: prova prima l'abbinamento esatto (nome + provincia, quando nota,
// per evitare ambiguità tra comuni omonimi in province diverse — es. "San Giovanni"),
// poi ripiega sulla somiglianza testuale contro le ~11.000 Descrizioni di comuni.csv.
function matchComuneAlloggiati(nome, provincia) {
  if (!nome) return { comune: '', provincia: provincia || '' };
  const exact = findComune(nome, provincia);
  if (exact) return { comune: exact.Descrizione, provincia: exact.Provincia || provincia || '' };
  const best = findBestMatchInTable(nome, state.lookup.comuni, 'Descrizione');
  if (!best) return { comune: nome, provincia: provincia || '' };
  const row = state.lookup.comuni.find(c => c.Descrizione === best);
  return { comune: best, provincia: (row && row.Provincia) || provincia || '' };
}

// Traduce il risultato grezzo di extractFieldsFromText (MRZ o estrazione generica) in un
// ospite nel formato piatto usato da questa app, riconducendo Stato/tipo documento/comune
// alle voci ufficiali delle tabelle CSV quando possibile — l'operatore verifica e
// corregge comunque tutto in revisione prima di aggiungere l'ospite alla lista.
function ocrResultToAlloggiatoGuest(raw) {
  const out = {
    cognome: (raw.surname || '').trim(),
    nome: (raw.givenNames || '').trim(),
    data_nascita: normalizeDateStr(raw.dob || ''),
    sesso: raw.sex || '',
    comune_nascita: '',
    provincia_nascita: '',
    stato_nascita: '',
    cittadinanza: '',
    tipo_documento: matchDocumentoAlloggiati(raw.docType) || raw.docType || '',
    numero_documento: (raw.number || '').trim(),
    luogo_rilascio: (raw.luogoRilascio || '').trim(),
  };

  // Cittadinanza/nazionalità: ricondotta alla Descrizione ufficiale di stati.csv.
  const statoCittadinanza = matchStatoAlloggiati(raw.nationality);
  out.cittadinanza = statoCittadinanza || (raw.nationality || '').trim();

  if (raw.comuneNascita) {
    // Formato italiano "COMUNE (PR)": comune di nascita in Italia, riconosciuto e
    // ricondotto alla voce ufficiale (con codice) in comuni.csv.
    const matched = matchComuneAlloggiati(raw.comuneNascita, raw.provinciaNascita);
    out.comune_nascita = matched.comune;
    out.provincia_nascita = matched.provincia;
    out.stato_nascita = 'ITALIA';
  } else if (raw.birthPlaceGeneric) {
    // Luogo di nascita letto in chiaro su un documento non italiano (patente UE o
    // carta d'identità non elettronica): riportiamo il luogo così com'è — non è detto
    // sia un comune italiano, né che coincida con la cittadinanza — resta da
    // verificare/completare in revisione.
    out.comune_nascita = raw.birthPlaceGeneric;
    out.stato_nascita = '';
  } else if (statoCittadinanza) {
    // Nessun indizio di nascita in Italia: come suggerimento di partenza usiamo la
    // stessa corrispondenza della cittadinanza (spesso coincidono, ma l'operatore
    // verifica sempre in revisione).
    out.stato_nascita = statoCittadinanza;
  }

  return out;
}
