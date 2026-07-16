// ============================================================
// CONFIGURAZIONE
// ============================================================
const STRUTTURE = {
    'ME001066': 'Via Nazionale',
    'ME006995': 'MiPA'
};

// Deve combaciare con APP_SHARED_TOKEN configurato su Netlify per questo sito.
const APP_TOKEN = 'CHANGE-ME';
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
// CARICAMENTO TABELLE DI LOOKUP (CSV) — invariato, restano locali
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
    console.log(`   Comuni: ${state.lookup.comuni.length}`);
    console.log(`   Stati: ${state.lookup.stati.length}`);
    console.log(`   Documenti: ${state.lookup.documenti.length}`);
    console.log(`   Tipo Alloggiato: ${state.lookup.tipoAlloggiato.length}`);
}

// ============================================================
// EVENT LISTENERS
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
    return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
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

    // Restituisci il primo attivo o l'ultimo disponibile
    return candidates.find(c => !c.DataFineVal && !c.dataFineVal) || candidates[0];
}

// Cerca un comune per nome, con preferenza per la combinazione nome+provincia (utile
// perché diversi comuni italiani condividono lo stesso nome in province diverse).
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
            <input type="checkbox" ${guest.selected ? 'checked' : ''} 
                   onchange="toggleGuest(${index})" 
                   id="guest-${index}">
            <div class="guest-info">
                <div class="guest-name">${cognome} ${nome}</div>
                <div class="guest-meta">
                    ${tipoAllog} • Arrivo: ${dataArrivo} • Permanenza: ${guest.permanenza || '-'} gg
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
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ============================================================
// CONVERSIONE IN RECORD POSIZIONALE (168 caratteri)
// Secondo tracciato PDF Manuale Alloggiati Web — sezione 12
// ============================================================
function convertToRecord(guest, warnings) {
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

    // 3. GIORNI PERMANENZA (posizioni 12-13) — già calcolati e salvati dall'app MiPA Companion
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

    // 8-10. COMUNE / PROVINCIA / STATO NASCITA — tre campi separati, come scritti
    // dall'app MiPA Companion (non più un unico "luogo_nascita" da indovinare).
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
    // per familiari/membri gruppo le posizioni 134-167 restano spazi bianchi (già inizializzate così)

    const line = rec.join('');
    if (line.length !== 168) warnings.push(`${rowLabel}: riga di lunghezza inattesa (${line.length} invece di 168)`);
    return line;
}

// Costruisce l'elenco di righe per gli ospiti selezionati, raccogliendo eventuali
// avvisi di conversione (usato sia per il download sia per Test/Send).
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
    box.innerHTML = `<div class="q-box q-warning"><strong>Attenzione, controlla questi campi prima di caricare/inviare il file:</strong>\n${warnings.map(escapeHtml).join('\n')}</div>`;
}

// ============================================================
// CONVALIDA (TEST) E INVIO REALE (SEND) — Web Service ufficiale
// ============================================================
async function testWithQuestura() {
    const { records, warnings, selectedGuests } = buildRecordsForSelected();
    if (records.length === 0) {
        showStatus('❌ Nessun ospite selezionato', 'error');
        return;
    }

    document.getElementById('btn-test').disabled = true;
    document.getElementById('questura-result').innerHTML = '<div class="q-box">⏳ Convalida in corso con il sistema della Questura…</div>';

    try {
        const res = await fetch(TEST_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-App-Token': APP_TOKEN },
            body: JSON.stringify({ righe: records }),
        });
        const data = await res.json().catch(() => null);
        renderEsitoQuestura(data, res.ok, warnings, selectedGuests, false);
    } catch (err) {
        document.getElementById('questura-result').innerHTML = `<div class="q-box q-error">Errore di rete: ${escapeHtml(err.message || String(err))}</div>`;
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

    const conferma = confirm(
        `Stai per inviare REALMENTE ${records.length} schedina/e alla Questura tramite il Web Service ufficiale.\n\n` +
        `Questa operazione non è reversibile. Hai già eseguito la Convalida (Test) e controllato che i dati siano corretti?\n\n` +
        `Premi OK solo se sei sicuro di voler procedere con l'invio reale.`
    );
    if (!conferma) return;

    document.getElementById('btn-send').disabled = true;
    document.getElementById('questura-result').innerHTML = '<div class="q-box">⏳ Invio in corso alla Questura…</div>';

    try {
        const res = await fetch(SEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-App-Token': APP_TOKEN },
            body: JSON.stringify({ righe: records, confirm: true }),
        });
        const data = await res.json().catch(() => null);
        renderEsitoQuestura(data, res.ok, warnings, selectedGuests, true);
    } catch (err) {
        document.getElementById('questura-result').innerHTML = `<div class="q-box q-error">Errore di rete: ${escapeHtml(err.message || String(err))}</div>`;
    } finally {
        document.getElementById('btn-send').disabled = false;
    }
}

function renderEsitoQuestura(data, resOk, conversionWarnings, selectedGuests, wasRealSend) {
    const box = document.getElementById('questura-result');
    if (!resOk || !data || !data.ok) {
        const errMsg = (data && (data.error + (data.detail ? ' — ' + data.detail : ''))) || 'Errore sconosciuto';
        box.innerHTML = `<div class="q-box q-error">${escapeHtml(errMsg)}</div>`;
        return;
    }

    let html = '';
    if (conversionWarnings.length) {
        html += `<div class="q-box q-warning"><strong>Avvisi già in fase di conversione (prima della Questura):</strong>\n${conversionWarnings.map(escapeHtml).join('\n')}</div>`;
    }
    if (data.topLevelError) {
        html += `<div class="q-box q-error"><strong>Errore generale restituito dal servizio:</strong> ${escapeHtml(data.topLevelError)}</div>`;
    }

    const tutteValide = data.schedineValide === data.totaleRighe;
    const titolo = wasRealSend ? 'INVIATE REALMENTE alla Questura' : 'valide secondo la convalida (Test, nessun invio reale)';
    html += `<div class="q-box ${tutteValide ? 'q-success' : 'q-warning'}"><strong>${data.schedineValide} su ${data.totaleRighe} schedine ${titolo}.</strong></div>`;

    if (data.perRiga && data.perRiga.length) {
        html += '<div class="q-box"><strong>Dettaglio per ospite</strong><ul class="q-list">';
        data.perRiga.forEach(d => {
            const guest = selectedGuests[d.riga - 1];
            const nome = guest ? `${guest.cognome} ${guest.nome}` : `riga ${d.riga}`;
            const stato = d.errore ? '❌' : '✅';
            html += `<li>${stato} ${escapeHtml(nome)}${d.errore ? ' — ' + escapeHtml(d.errore) : ''}</li>`;
        });
        html += '</ul></div>';
    }

    box.innerHTML = html;
}
