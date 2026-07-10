// ============================================================
// CONFIGURAZIONE STRUTTURE
// ============================================================
const STRUTTURE = {
    'ME001066': 'Via Nazionale',
    'ME006995': 'MiPA'
};

// Stato dell'applicazione
const state = {
    allGuests: [],
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
    loadConfig();
});

function loadConfig() {
    const savedUrl = localStorage.getItem('sheetsUrl');
    if (savedUrl) {
        document.getElementById('sheets-url').value = savedUrl;
    }
}

function saveConfig() {
    const url = document.getElementById('sheets-url').value.trim();
    localStorage.setItem('sheetsUrl', url);
}

// ============================================================
// CARICAMENTO TABELLE DI LOOKUP (CSV)
// ============================================================
function parseCSV(text) {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    
    return lines.slice(1).map(line => {
        // Gestione virgolette nei CSV
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
    console.log(`   Comuni: ${state.lookup.comuni.length}`);
    console.log(`   Stati: ${state.lookup.stati.length}`);
    console.log(`   Documenti: ${state.lookup.documenti.length}`);
    console.log(`   Tipo Alloggiato: ${state.lookup.tipoAlloggiato.length}`);
}

// ============================================================
// EVENT LISTENERS
// ============================================================
function setupEventListeners() {
    document.getElementById('btn-load').addEventListener('click', loadFromGoogleSheets);
    document.getElementById('btn-generate').addEventListener('click', generateAndDownloadTXT);
    document.getElementById('btn-clear').addEventListener('click', clearAll);
    document.getElementById('btn-select-all').addEventListener('click', selectAll);
    document.getElementById('btn-deselect-all').addEventListener('click', deselectAll);
    document.getElementById('sheets-url').addEventListener('change', saveConfig);
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
    return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
}

function calculateNights(arrival, departure) {
    const arr = parseDate(arrival);
    const dep = parseDate(departure);
    if (!arr || !dep) return 1;
    const diff = Math.ceil((dep - arr) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 1;
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
    
    // Se c'è una data di riferimento, gestisci validità storica
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
    
    // Restituisci il primo attivo o l'ultimo disponibile
    return candidates.find(c => !c.DataFineVal && !c.dataFineVal) || candidates[0];
}

function pad(str, len) {
    return String(str || '').padEnd(len, ' ').substring(0, len);
}

// ============================================================
// CARICAMENTO DATI DA GOOGLE SHEETS
// ============================================================
async function loadFromGoogleSheets() {
    const sheetsUrl = document.getElementById('sheets-url').value.trim();
    const dateFilter = document.getElementById('date-filter').value;
    const structureFilter = document.getElementById('structure-filter').value;

    if (!sheetsUrl) {
        showStatus(' Inserisci l\'URL di Google Sheets', 'error');
        return;
    }

    if (!structureFilter) {
        showStatus(' Seleziona una struttura', 'error');
        return;
    }

    showStatus(' Caricamento dati...', 'success');

    try {
        const response = await fetch(sheetsUrl);
        const allData = await response.json();

        if (!Array.isArray(allData) || allData.length === 0) {
            showStatus('⚠️ Nessun dato trovato nel foglio', 'error');
            return;
        }

        console.log(`📊 Dati ricevuti: ${allData.length} righe`);
        console.log('Primo record:', allData[0]);

        // Filtra per data e struttura
        const targetDate = dateFilter === 'today' ? getDateFormatted(0) : getDateFormatted(-1);
        
        state.filteredGuests = allData
            .filter(guest => {
                const guestDate = String(guest.data_scansione || '').trim();
                const guestStructure = String(guest.struttura_id || '').trim();
                const matchesDate = guestDate === targetDate;
                const matchesStructure = guestStructure === structureFilter;
                return matchesDate && matchesStructure;
            })
            .map((guest, index) => ({
                ...guest,
                id: `guest-${index}`,
                selected: true
            }));

        if (state.filteredGuests.length === 0) {
            showStatus(`⚠️ Nessun ospite trovato per ${dateFilter === 'today' ? 'oggi' : 'ieri'} nella struttura selezionata`, 'error');
            return;
        }

        document.getElementById('guest-list-section').classList.remove('hidden');
        renderGuestList();
        updateStats();
        showStatus(`✅ Caricati ${state.filteredGuests.length} ospiti`, 'success');

    } catch (error) {
        console.error('Errore caricamento:', error);
        showStatus(' Errore nel caricamento dei dati. Verifica l\'URL.', 'error');
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
            <input type="checkbox" ${guest.selected ? 'checked' : ''} 
                   onchange="toggleGuest(${index})" 
                   id="guest-${index}">
            <div class="guest-info">
                <div class="guest-name">${cognome} ${nome}</div>
                <div class="guest-meta">
                    ${tipoAllog} • Arrivo: ${dataArrivo}
                </div>
            </div>
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
}

function clearAll() {
    state.filteredGuests = [];
    document.getElementById('guest-list-section').classList.add('hidden');
    document.getElementById('structure-filter').value = '';
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

// ============================================================
// CONVERSIONE IN RECORD POSIZIONALE (168 caratteri)
// Secondo tracciato PDF Manuale Alloggiati Web
// ============================================================
function convertToRecord(guest) {
    // Array di 168 caratteri, inizializzato con spazi
    const rec = new Array(168).fill(' ');
    
    const tipoAlloggiatoDesc = String(guest.tipo_alloggiato || '').trim();
    const isFamilyMember = ['FAMILIARE', 'MEMBRO GRUPPO'].includes(tipoAlloggiatoDesc.toUpperCase());
    
    // 1. TIPO ALLOGGIATO (posizioni 0-1, 2 caratteri)
    const tipo = findInTable(state.lookup.tipoAlloggiato, 'Descrizione', tipoAlloggiatoDesc);
    if (tipo) {
        rec.splice(0, 2, ...pad(tipo.Codice, 2));
    } else {
        console.warn(`Tipo alloggiato non trovato: "${tipoAlloggiatoDesc}"`);
    }

    // 2. DATA ARRIVO (posizioni 2-11, 10 caratteri) - formato gg/mm/aaaa
    const dataArrivo = String(guest.data_arrivo || '').trim();
    rec.splice(2, 10, ...pad(dataArrivo, 10));

    // 3. GIORNI PERMANENZA (posizioni 12-13, 2 caratteri)
    const nights = calculateNights(guest.data_arrivo, guest.data_partenza);
    const nightsStr = String(Math.min(nights, 30)).padStart(2, '0');
    rec.splice(12, 2, ...nightsStr);

    // 4. COGNOME (posizioni 14-63, 50 caratteri)
    const cognome = String(guest.cognome || '').toUpperCase().trim();
    rec.splice(14, 50, ...pad(cognome, 50));

    // 5. NOME (posizioni 64-93, 30 caratteri)
    const nome = String(guest.nome || '').toUpperCase().trim();
    rec.splice(64, 30, ...pad(nome, 30));

    // 6. SESSO (posizione 94, 1 carattere) - 1=M, 2=F
    const sesso = String(guest.sesso || '').toUpperCase().trim();
    rec[94] = sesso === 'M' ? '1' : '2';

    // 7. DATA NASCITA (posizioni 95-104, 10 caratteri) - formato gg/mm/aaaa
    const dataNascita = String(guest.data_nascita || '').trim();
    rec.splice(95, 10, ...pad(dataNascita, 10));

    // 8-10. LUOGO NASCITA (Comune + Provincia + Stato)
    const luogoNascita = String(guest.luogo_nascita || '').trim();
    const cittadinanza = String(guest.cittadinanza || '').trim();
    
    // Cerca prima come comune italiano
    const comune = findInTable(state.lookup.comuni, 'Descrizione', luogoNascita, dataNascita);
    
    if (comune) {
        // Nato in Italia
        rec.splice(105, 9, ...pad(comune.Codice, 9));
        rec.splice(114, 2, ...pad(comune.Provincia, 2));
        // Stato nascita = Italia
        const statoItalia = findInTable(state.lookup.stati, 'Descrizione', 'ITALIA');
        if (statoItalia) {
            rec.splice(116, 9, ...pad(statoItalia.Codice, 9));
        }
    } else {
        // Nato all'estero: 9 spazi + 2 spazi + codice stato
        rec.splice(105, 9, ...' '.repeat(9));
        rec.splice(114, 2, ...' '.repeat(2));
        const statoNascita = findInTable(state.lookup.stati, 'Descrizione', luogoNascita, dataNascita);
        if (statoNascita) {
            rec.splice(116, 9, ...pad(statoNascita.Codice, 9));
        } else {
            console.warn(`Stato di nascita non trovato: "${luogoNascita}"`);
        }
    }

    // 11. CITTADINANZA (posizioni 125-133, 9 caratteri)
    const statoCittadinanza = findInTable(state.lookup.stati, 'Descrizione', cittadinanza);
    if (statoCittadinanza) {
        rec.splice(125, 9, ...pad(statoCittadinanza.Codice, 9));
    } else {
        console.warn(`Cittadinanza non trovata: "${cittadinanza}"`);
    }

    // 12-14. DOCUMENTO (solo per ospiti singoli, capi famiglia/gruppo)
    if (!isFamilyMember) {
        // Tipo Documento (posizioni 134-138, 5 caratteri)
        const tipoDoc = String(guest.tipo_documento || '').trim();
        const doc = findInTable(state.lookup.documenti, 'Descrizione', tipoDoc);
        if (doc) {
            rec.splice(134, 5, ...pad(doc.Codice, 5));
        } else {
            console.warn(`Tipo documento non trovato: "${tipoDoc}"`);
        }
        
        // Numero Documento (posizioni 139-158, 20 caratteri)
        const numDoc = String(guest.numero_documento || '').toUpperCase().trim();
        rec.splice(139, 20, ...pad(numDoc, 20));
        
        // Luogo Rilascio (posizioni 159-167, 9 caratteri)
        const luogoRilascio = String(guest.luogo_rilascio || '').trim();
        if (luogoRilascio) {
            const luogoComune = findInTable(state.lookup.comuni, 'Descrizione', luogoRilascio);
            if (luogoComune) {
                rec.splice(159, 9, ...pad(luogoComune.Codice, 9));
            } else {
                const luogoStato = findInTable(state.lookup.stati, 'Descrizione', luogoRilascio);
                if (luogoStato) {
                    rec.splice(159, 9, ...pad(luogoStato.Codice, 9));
                } else {
                    console.warn(`Luogo rilascio non trovato: "${luogoRilascio}"`);
                }
            }
        }
    } else {
        // Per familiari/membri gruppo: 34 spazi bianchi (posizioni 134-167)
        rec.splice(134, 34, ...' '.repeat(34));
    }

    return rec.join('');
}

// ============================================================
// GENERAZIONE E DOWNLOAD FILE TXT
// ============================================================
function generateAndDownloadTXT() {
    const selectedGuests = state.filteredGuests.filter(g => g.selected);
    
    if (selectedGuests.length === 0) {
        showStatus('❌ Nessun ospite selezionato', 'error');
        return;
    }

    // Genera i record
    const records = selectedGuests.map(guest => convertToRecord(guest));
    
    // Unisci con CR+LF tranne l'ultima riga (come da PDF)
    const content = records.join('\r\n');
    
    // Verifica lunghezza record (debug)
    records.forEach((rec, idx) => {
        if (rec.length !== 168) {
            console.error(`Record ${idx} ha lunghezza ${rec.length} invece di 168`);
        }
    });

    // Crea il blob e scarica
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const structureName = STRUTTURE[document.getElementById('structure-filter').value] || 'struttura';
    const dateStr = new Date().toISOString().slice(0,10);
    a.download = `alloggiati_${structureName.replace(/\s+/g, '_')}_${dateStr}.txt`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showStatus(`✅ File TXT generato con ${records.length} record`, 'success');
    console.log(`📄 File generato: ${records.length} record, ${content.length} caratteri totali`);
}
