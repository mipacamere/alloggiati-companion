// Stato dell'applicazione
const state = {
    allGuests: [],
    filteredGuests: [],
    structures: new Set(),
    lookup: {
        comuni: [],
        stati: [],
        documenti: [],
        tipoAlloggiato: []
    }
};

// Inizializzazione
document.addEventListener('DOMContentLoaded', async () => {
    await loadLookupTables();
    setupEventListeners();
    loadConfig();
});

// Carica configurazione salvata
function loadConfig() {
    const savedUrl = localStorage.getItem('sheetsUrl');
    if (savedUrl) {
        document.getElementById('sheets-url').value = savedUrl;
    }
}

// Parsa CSV in array di oggetti
function parseCSV(text) {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    return lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        const obj = {};
        headers.forEach((header, index) => {
            obj[header] = values[index] || '';
        });
        return obj;
    });
}

// Carica le tabelle di conversione da CSV
async function loadLookupTables() {
    const files = ['comuni.csv', 'stati.csv', 'documenti.csv', 'tipo_alloggiato.csv'];
    const promises = files.map(async (file) => {
        try {
            const res = await fetch(`./data/${file}`);
            if (!res.ok) throw new Error(`${file} non trovato`);
            const text = await res.text();
            return parseCSV(text);
        } catch (err) {
            console.error(err);
            return [];
        }
    });

    [state.lookup.comuni, state.lookup.stati, state.lookup.documenti, state.lookup.tipoAlloggiato] = await Promise.all(promises);
    console.log('✅ Tabelle di lookup caricate da CSV');
}

// Setup event listeners
function setupEventListeners() {
    document.getElementById('btn-load').addEventListener('click', loadFromGoogleSheets);
    document.getElementById('btn-generate').addEventListener('click', generateAndDownloadTXT);
    document.getElementById('btn-clear').addEventListener('click', clearAll);
    document.getElementById('btn-select-all').addEventListener('click', selectAll);
    document.getElementById('btn-deselect-all').addEventListener('click', deselectAll);
    document.getElementById('sheets-url').addEventListener('change', saveConfig);
}

// Salva configurazione
function saveConfig() {
    const url = document.getElementById('sheets-url').value;
    localStorage.setItem('sheetsUrl', url);
}

// Helper: ottieni data formattata
function getDateFormatted(daysOffset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

// Carica dati da Google Sheets
async function loadFromGoogleSheets() {
    const sheetsUrl = document.getElementById('sheets-url').value.trim();
    const dateFilter = document.getElementById('date-filter').value;
    const structureFilter = document.getElementById('structure-filter').value;

    if (!sheetsUrl) {
        showStatus('Inserisci l\'URL di Google Sheets', 'error');
        return;
    }

    if (!structureFilter) {
        showStatus('Seleziona una struttura', 'error');
        return;
    }

    showStatus('Caricamento dati...', 'success');

    try {
        const response = await fetch(sheetsUrl);
        const allData = await response.json();

        if (!Array.isArray(allData) || allData.length === 0) {
            showStatus('Nessun dato trovato', 'error');
            return;
        }

        // Filtra per data e struttura
        const targetDate = dateFilter === 'today' ? getDateFormatted(0) : getDateFormatted(-1);
        
        state.filteredGuests = allData
            .filter(guest => {
                const matchesDate = guest.data_scansione === targetDate;
                const matchesStructure = guest.struttura_id === structureFilter;
                return matchesDate && matchesStructure;
            })
            .map((guest, index) => ({
                ...guest,
                id: `guest-${index}`,
                selected: true
            }));

        if (state.filteredGuests.length === 0) {
            showStatus(`Nessun ospite trovato per ${dateFilter === 'today' ? 'oggi' : 'ieri'} nella struttura selezionata`, 'error');
            return;
        }

        document.getElementById('guest-list-section').classList.remove('hidden');
        renderGuestList();
        updateStats();
        showStatus(`✅ Caricati ${state.filteredGuests.length} ospiti`, 'success');

    } catch (error) {
        console.error('Errore caricamento:', error);
        showStatus('Errore nel caricamento dei dati. Verifica l\'URL.', 'error');
    }
}

// Renderizza lista ospiti
function renderGuestList() {
    const list = document.getElementById('guest-list');
    list.innerHTML = '';

    state.filteredGuests.forEach((guest, index) => {
        const card = document.createElement('div');
        card.className = `guest-card ${guest.selected ? '' : 'excluded'}`;
        
        card.innerHTML = `
            <input type="checkbox" ${guest.selected ? 'checked' : ''} 
                   onchange="toggleGuest(${index})" 
                   id="guest-${index}">
            <div class="guest-info">
                <div class="guest-name">${guest.cognome || '-'} ${guest.nome || '-'}</div>
                <div class="guest-meta">
                    ${guest.tipo_documento || '-'} • ${guest.data_arrivo || '-'} • ${guest.struttura_id || '-'}
                </div>
            </div>
        `;
        
        list.appendChild(card);
    });
}

// Toggle selezione ospite
window.toggleGuest = function(index) {
    state.filteredGuests[index].selected = !state.filteredGuests[index].selected;
    const card = document.querySelectorAll('.guest-card')[index];
    card.className = `guest-card ${state.filteredGuests[index].selected ? '' : 'excluded'}`;
    updateStats();
};

// Seleziona tutti
function selectAll() {
    state.filteredGuests.forEach(g => g.selected = true);
    renderGuestList();
    updateStats();
}

// Deseleziona tutti
function deselectAll() {
    state.filteredGuests.forEach(g => g.selected = false);
    renderGuestList();
    updateStats();
}

// Aggiorna statistiche
function updateStats() {
    const total = state.filteredGuests.length;
    const selected = state.filteredGuests.filter(g => g.selected).length;
    const excluded = total - selected;

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-selected').textContent = selected;
    document.getElementById('stat-excluded').textContent = excluded;
    document.getElementById('btn-generate').disabled = selected === 0;
}

// Svuota tutto
function clearAll() {
    state.filteredGuests = [];
    document.getElementById('guest-list-section').classList.add('hidden');
    document.getElementById('structure-filter').value = '';
    updateStats();
}

// Mostra messaggio di stato
function showStatus(message, type) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    statusEl.classList.remove('hidden');
    
    setTimeout(() => {
        statusEl.classList.add('hidden');
    }, 5000);
}

// Helper: Lookup nelle tabelle
function findInTable(table, searchField, value, dateRef = null) {
    const norm = value?.trim().toUpperCase();
    const candidates = table.filter(item => item[searchField]?.toUpperCase() === norm);
    if (!candidates.length) return null;

    if (dateRef && candidates.length > 1) {
        const refDate = parseDate(dateRef);
        for (const c of candidates) {
            const endVal = parseDate(c.DataFineVal || c.dataFineVal);
            if (!endVal || refDate <= endVal) return c;
        }
    }
    return candidates.find(c => !c.DataFineVal && !c.dataFineVal) || candidates[0];
}

function parseDate(str) {
    if (!str) return null;
    const match = str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    return match ? new Date(+match[3], +match[2] - 1, +match[1]) : null;
}

function pad(str, len) {
    return (str || '').padEnd(len, ' ').substring(0, len);
}

// Conversione in record posizionale
function convertToRecord(guest) {
    const rec = new Array(168).fill(' ');
    
    // 1. Tipo Alloggiato
    const tipo = findInTable(state.lookup.tipoAlloggiato, 'Descrizione', guest.tipo_alloggiato);
    if (tipo) rec.splice(0, 2, ...pad(tipo.Codice, 2));

    // 2. Data Arrivo
    rec.splice(2, 10, ...pad(guest.data_arrivo, 10));

    // 3. Notti
    const arr = parseDate(guest.data_arrivo);
    const dep = parseDate(guest.data_partenza);
    const nights = Math.ceil((dep - arr) / (1000 * 60 * 60 * 24));
    rec.splice(12, 2, ...pad(String(nights).padStart(2, '0'), 2));

    // 4. Cognome & Nome
    rec.splice(14, 50, ...pad((guest.cognome || '').toUpperCase(), 50));
    rec.splice(64, 30, ...pad((guest.nome || '').toUpperCase(), 30));

    // 5. Sesso
    rec[94] = (guest.sesso || '').toUpperCase() === 'M' ? '1' : '2';

    // 6. Data Nascita
    rec.splice(95, 10, ...pad(guest.data_nascita, 10));

    // 7. Luogo Nascita
    const com = findInTable(state.lookup.comuni, 'Descrizione', guest.luogo_nascita, guest.data_nascita);
    if (com) {
        rec.splice(105, 9, ...pad(com.Codice, 9));
        rec.splice(114, 2, ...pad(com.Provincia, 2));
        const ita = findInTable(state.lookup.stati, 'Descrizione', 'ITALIA');
        if (ita) rec.splice(116, 9, ...pad(ita.Codice, 9));
    } else {
        rec.splice(105, 11, ...' '.repeat(11));
        const st = findInTable(state.lookup.stati, 'Descrizione', guest.cittadinanza, guest.data_nascita);
        if (st) rec.splice(116, 9, ...pad(st.Codice, 9));
    }

    // 8. Cittadinanza
    const cit = findInTable(state.lookup.stati, 'Descrizione', guest.cittadinanza);
    if (cit) rec.splice(125, 9, ...pad(cit.Codice, 9));

    // 9. Documento
    const isFamily = ['FAMILIARE', 'MEMBRO GRUPPO'].includes((guest.tipo_alloggiato || '').toUpperCase());
    if (!isFamily) {
        const doc = findInTable(state.lookup.documenti, 'Descrizione', guest.tipo_documento);
        if (doc) rec.splice(134, 5, ...pad(doc.Codice, 5));
        rec.splice(139, 20, ...pad((guest.numero_documento || '').toUpperCase(), 20));
        
        const luogo = findInTable(state.lookup.comuni, 'Descrizione', guest.luogo_rilascio) || 
                      findInTable(state.lookup.stati, 'Descrizione', guest.luogo_rilascio);
        if (luogo) rec.splice(159, 9, ...pad(luogo.Codice, 9));
    } else {
        rec.splice(134, 34, ...' '.repeat(34));
    }

    return rec.join('');
}

// Genera e scarica TXT
function generateAndDownloadTXT() {
    const selectedGuests = state.filteredGuests.filter(g => g.selected);
    
    if (selectedGuests.length === 0) {
        showStatus('Nessun ospite selezionato', 'error');
        return;
    }

    const structure = document.getElementById('structure-filter').value;
    const records = selectedGuests.map(guest => convertToRecord(guest));
    const content = records.join('\r\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alloggiati_${structure}_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showStatus(`✅ File TXT generato con ${records.length} record`, 'success');
}
