// ============================================
// ALLOGGIATI COMPANION - Vanilla JS App
// ============================================

// Stato globale
let tables = {
    comuni: [],
    stati: [],
    documenti: [],
    tipoAlloggiato: []
};

let guests = [];
let editingGuestId = null;

// ============================================
// PARSING CSV
// ============================================

function parseCSV(text) {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = [];
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());
        
        const row = {};
        headers.forEach((h, idx) => {
            row[h] = values[idx] || '';
        });
        rows.push(row);
    }
    
    return rows;
}

// ============================================
// CARICAMENTO TABELLE
// ============================================

async function loadTables() {
    try {
        const [comuniRes, statiRes, documentiRes, tipoRes] = await Promise.all([
            fetch('data/comuni.csv'),
            fetch('data/stati.csv'),
            fetch('data/documenti.csv'),
            fetch('data/tipo_alloggiato.csv')
        ]);
        
        const [comuniText, statiText, documentiText, tipoText] = await Promise.all([
            comuniRes.text(),
            statiRes.text(),
            documentiRes.text(),
            tipoRes.text()
        ]);
        
        tables.comuni = parseCSV(comuniText);
        tables.stati = parseCSV(statiText);
        tables.documenti = parseCSV(documentiText);
        tables.tipoAlloggiato = parseCSV(tipoText);
        
        console.log('Tabelle caricate:', {
            comuni: tables.comuni.length,
            stati: tables.stati.length,
            documenti: tables.documenti.length,
            tipoAlloggiato: tables.tipoAlloggiato.length
        });
        
        return true;
    } catch (error) {
        console.error('Errore caricamento tabelle:', error);
        return false;
    }
}

// ============================================
// LOOKUP FUNCTIONS
// ============================================

function findTipoAlloggiato(descrizione) {
    const norm = descrizione.toUpperCase().trim();
    return tables.tipoAlloggiato.find(t => t.Descrizione.toUpperCase() === norm);
}

function findDocumento(descrizione) {
    const norm = descrizione.toUpperCase().trim();
    return tables.documenti.find(d => d.Descrizione.toUpperCase() === norm);
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    // Formato: "31/12/2016 00:00:00" o "31/12/2016"
    const parts = dateStr.split(' ')[0].split('/');
    if (parts.length !== 3) return null;
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
}

function findComune(nome, dataRiferimento) {
    const norm = nome.toUpperCase().trim();
    
    // 1. Cerca comune attivo con nome esatto
    let attivo = tables.comuni.find(c => 
        c.Descrizione.toUpperCase() === norm && !c.DataFineVal
    );
    if (attivo) return attivo;
    
    // 2. Se ho una data di riferimento, cerca tra i soppressi
    if (dataRiferimento) {
        const dataRef = parseDate(dataRiferimento);
        if (dataRef) {
            const soppresso = tables.comuni.find(c => {
                if (c.Descrizione.toUpperCase() !== norm) return false;
                if (!c.DataFineVal) return false;
                const dataFine = parseDate(c.DataFineVal);
                return dataFine && dataRef <= dataFine;
            });
            if (soppresso) {
                // Cerca il comune subentrante (nome contiene quello soppresso)
                const subentrante = tables.comuni.find(c => 
                    !c.DataFineVal && 
                    c.Descrizione.toUpperCase().includes(norm)
                );
                return subentrante || soppresso;
            }
        }
    }
    
    // 3. Fuzzy match: cerca comune attivo che contiene il nome
    attivo = tables.comuni.find(c => 
        !c.DataFineVal && c.Descrizione.toUpperCase().includes(norm)
    );
    return attivo || null;
}

function findStato(nome, dataRiferimento) {
    const norm = nome.toUpperCase().trim();
    
    // 1. Cerca stato attivo
    let attivo = tables.stati.find(s => 
        s.Descrizione.toUpperCase() === norm && !s.DataFineVal
    );
    if (attivo) return attivo;
    
    // 2. Cerca tra soppressi con data
    if (dataRiferimento) {
        const dataRef = parseDate(dataRiferimento);
        if (dataRef) {
            const soppresso = tables.stati.find(s => {
                if (s.Descrizione.toUpperCase() !== norm) return false;
                if (!s.DataFineVal) return false;
                const dataFine = parseDate(s.DataFineVal);
                return dataFine && dataRef <= dataFine;
            });
            if (soppresso) {
                // Cerca stato subentrante
                const subentrante = tables.stati.find(s => 
                    !s.DataFineVal && 
                    s.Descrizione.toUpperCase().includes(norm.replace('MACEDONIA', 'MACEDONIA DEL NORD'))
                );
                return subentrante || soppresso;
            }
        }
    }
    
    // 3. Fuzzy match
    attivo = tables.stati.find(s => 
        !s.DataFineVal && s.Descrizione.toUpperCase().includes(norm)
    );
    return attivo || null;
}

// ============================================
// VALIDAZIONE
// ============================================

function validateGuest(guest) {
    const errors = [];
    
    if (!guest.personal.lastName?.trim()) errors.push('Cognome mancante');
    if (!guest.personal.firstName?.trim()) errors.push('Nome mancante');
    if (!guest.personal.gender) errors.push('Sesso mancante');
    else if (!['M', 'F'].includes(guest.personal.gender.toUpperCase())) errors.push('Sesso non valido (M o F)');
    if (!guest.personal.birthDate) errors.push('Data di nascita mancante');
    else if (!/^\d{2}\/\d{2}\/\d{4}$/.test(guest.personal.birthDate)) errors.push('Formato data nascita: gg/mm/aaaa');
    if (!guest.personal.birthPlace?.trim()) errors.push('Luogo di nascita mancante');
    if (!guest.personal.nationality?.trim()) errors.push('Cittadinanza mancante');
    if (!guest.stay.arrivalDate) errors.push('Data di arrivo mancante');
    else if (!/^\d{2}\/\d{2}\/\d{4}$/.test(guest.stay.arrivalDate)) errors.push('Formato data arrivo: gg/mm/aaaa');
    if (!guest.stay.departureDate) errors.push('Data di partenza mancante');
    else if (!/^\d{2}\/\d{2}\/\d{4}$/.test(guest.stay.departureDate)) errors.push('Formato data partenza: gg/mm/aaaa');
    if (!guest.stay.guestType?.trim()) errors.push('Tipo alloggiato mancante');
    
    // Verifica tipo alloggiato
    if (guest.stay.guestType && !findTipoAlloggiato(guest.stay.guestType)) {
        errors.push(`Tipo alloggiato non riconosciuto: "${guest.stay.guestType}"`);
    }
    
    // Verifica luogo di nascita
    if (guest.personal.birthPlace) {
        const comune = findComune(guest.personal.birthPlace, guest.personal.birthDate);
        const stato = findStato(guest.personal.birthPlace, guest.personal.birthDate);
        if (!comune && !stato) {
            errors.push(`Luogo di nascita non trovato: "${guest.personal.birthPlace}"`);
        }
    }
    
    // Verifica cittadinanza
    if (guest.personal.nationality && !findStato(guest.personal.nationality)) {
        errors.push(`Cittadinanza non trovata: "${guest.personal.nationality}"`);
    }
    
    // Verifica documento (obbligatorio per tipi 16, 17, 18)
    const tipoAllog = findTipoAlloggiato(guest.stay.guestType);
    if (tipoAllog && ['16', '17', '18'].includes(tipoAllog.Codice)) {
        if (!guest.document?.type?.trim()) errors.push('Tipo documento mancante');
        else if (!findDocumento(guest.document.type)) errors.push(`Tipo documento non riconosciuto: "${guest.document.type}"`);
        if (!guest.document?.number?.trim()) errors.push('Numero documento mancante');
    }
    
    return errors;
}

// ============================================
// CONVERSIONE IN RECORD POSIZIONALE
// ============================================

function padRight(str, length) {
    return (str || '').padEnd(length, ' ').substring(0, length);
}

function calculateNights(arrival, departure) {
    const parse = (d) => {
        const [day, month, year] = d.split('/').map(Number);
        return new Date(year, month - 1, day);
    };
    const arr = parse(arrival);
    const dep = parse(departure);
    const diff = dep.getTime() - arr.getTime();
    return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function convertGuestToRecord(guest) {
    const record = new Array(168).fill(' ');
    
    // 1. Tipo Alloggiato (pos 0-1, 2 char)
    const tipoAllog = findTipoAlloggiato(guest.stay.guestType);
    if (tipoAllog) {
        record.splice(0, 2, ...padRight(tipoAllog.Codice, 2));
    }
    
    // 2. Data Arrivo (pos 2-11, 10 char)
    record.splice(2, 10, ...padRight(guest.stay.arrivalDate, 10));
    
    // 3. Giorni Permanenza (pos 12-13, 2 char)
    const nights = calculateNights(guest.stay.arrivalDate, guest.stay.departureDate);
    record.splice(12, 2, ...String(nights).padStart(2, '0'));
    
    // 4. Cognome (pos 14-63, 50 char)
    record.splice(14, 50, ...padRight(guest.personal.lastName.toUpperCase(), 50));
    
    // 5. Nome (pos 64-93, 30 char)
    record.splice(64, 30, ...padRight(guest.personal.firstName.toUpperCase(), 30));
    
    // 6. Sesso (pos 94, 1 char)
    record[94] = guest.personal.gender.toUpperCase() === 'M' ? '1' : '2';
    
    // 7. Data Nascita (pos 95-104, 10 char)
    record.splice(95, 10, ...padRight(guest.personal.birthDate, 10));
    
    // 8. Luogo di nascita (pos 105-124)
    const birthPlace = guest.personal.birthPlace;
    const birthDate = guest.personal.birthDate;
    const comune = findComune(birthPlace, birthDate);
    
    if (comune) {
        // Nato in Italia
        record.splice(105, 9, ...padRight(comune.Codice, 9));
        record.splice(114, 2, ...padRight(comune.Provincia, 2));
        const statoItalia = findStato('ITALIA');
        if (statoItalia) {
            record.splice(116, 9, ...padRight(statoItalia.Codice, 9));
        }
    } else {
        // Nato all'estero
        record.splice(105, 9, ...'         ');
        record.splice(114, 2, ...'  ');
        const statoNascita = findStato(birthPlace, birthDate);
        if (statoNascita) {
            record.splice(116, 9, ...padRight(statoNascita.Codice, 9));
        }
    }
    
    // 9. Cittadinanza (pos 125-133, 9 char)
    const cittadinanza = findStato(guest.personal.nationality);
    if (cittadinanza) {
        record.splice(125, 9, ...padRight(cittadinanza.Codice, 9));
    }
    
    // 10. Documento (pos 134-167, 34 char)
    const isFamilyMember = tipoAllog && ['19', '20'].includes(tipoAllog.Codice);
    
    if (!isFamilyMember) {
        // Tipo Documento (pos 134-138, 5 char)
        const docType = findDocumento(guest.document.type);
        if (docType) {
            record.splice(134, 5, ...padRight(docType.Codice, 5));
        }
        
        // Numero Documento (pos 139-158, 20 char)
        record.splice(139, 20, ...padRight(guest.document.number.toUpperCase(), 20));
        
        // Luogo Rilascio (pos 159-167, 9 char)
        const issuePlace = guest.document.issuePlace;
        if (issuePlace) {
            const luogoComune = findComune(issuePlace);
            if (luogoComune) {
                record.splice(159, 9, ...padRight(luogoComune.Codice, 9));
            } else {
                const luogoStato = findStato(issuePlace);
                if (luogoStato) {
                    record.splice(159, 9, ...padRight(luogoStato.Codice, 9));
                }
            }
        }
    } else {
        // Familiare/Membro Gruppo: 34 spazi
        record.splice(134, 34, ...'                                  ');
    }
    
    return record.join('');
}

// ============================================
// GENERAZIONE FILE TXT
// ============================================

function generateTXT() {
    const records = guests.map(g => convertGuestToRecord(g));
    return records.join('\r\n');
}

// ============================================
// UI FUNCTIONS
// ============================================

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}

function updateStats() {
    const total = guests.length;
    const withErrors = guests.filter(g => validateGuest(g).length > 0).length;
    const valid = total - withErrors;
    
    document.getElementById('totalGuests').textContent = total;
    document.getElementById('validGuests').textContent = valid;
    document.getElementById('errorGuests').textContent = withErrors;
    
    document.getElementById('stats').style.display = total > 0 ? 'flex' : 'none';
    document.getElementById('generateBtn').style.display = total > 0 ? 'block' : 'none';
    document.getElementById('generateBtn').disabled = withErrors > 0;
}

function renderGuestList() {
    const list = document.getElementById('guestList');
    list.innerHTML = '';
    
    guests.forEach((guest, index) => {
        const errors = validateGuest(guest);
        const card = document.createElement('div');
        card.className = `guest-card ${errors.length > 0 ? 'has-error' : ''}`;
        
        card.innerHTML = `
            <div class="guest-info">
                <h4>${guest.personal.lastName} ${guest.personal.firstName}</h4>
                <p>📄 ${guest.document?.type || 'N/D'} • ${guest.document?.number || 'N/D'}</p>
                <p>📅 Arrivo: ${guest.stay.arrivalDate || 'N/D'} • Tipo: ${guest.stay.guestType || 'N/D'}</p>
                ${errors.length > 0 ? `
                    <div class="guest-errors">
                        <ul>
                            ${errors.map(e => `<li>${e}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
            <div class="guest-actions">
                <button class="btn-icon" onclick="editGuest(${index})" title="Modifica">✏️</button>
                <button class="btn-icon delete" onclick="deleteGuest(${index})" title="Elimina">🗑️</button>
            </div>
        `;
        
        list.appendChild(card);
    });
    
    updateStats();
}

function editGuest(index) {
    editingGuestId = index;
    const guest = guests[index];
    
    document.getElementById('editLastName').value = guest.personal.lastName || '';
    document.getElementById('editFirstName').value = guest.personal.firstName || '';
    document.getElementById('editGender').value = guest.personal.gender || 'M';
    document.getElementById('editBirthDate').value = guest.personal.birthDate || '';
    document.getElementById('editBirthPlace').value = guest.personal.birthPlace || '';
    document.getElementById('editNationality').value = guest.personal.nationality || '';
    document.getElementById('editArrivalDate').value = guest.stay.arrivalDate || '';
    document.getElementById('editDepartureDate').value = guest.stay.departureDate || '';
    document.getElementById('editGuestType').value = guest.stay.guestType || 'OSPITE SINGOLO';
    document.getElementById('editDocType').value = guest.document?.type || '';
    document.getElementById('editDocNumber').value = guest.document?.number || '';
    document.getElementById('editDocPlace').value = guest.document?.issuePlace || '';
    
    document.getElementById('editModal').style.display = 'flex';
}

function deleteGuest(index) {
    if (confirm('Sei sicuro di voler eliminare questo ospite?')) {
        guests.splice(index, 1);
        renderGuestList();
        showToast('Ospite eliminato', 'success');
    }
}

function populateDatalists() {
    const comuniList = document.getElementById('comuniList');
    const statiList = document.getElementById('statiList');
    const documentiList = document.getElementById('documentiList');
    
    // Comuni (primi 500 per performance)
    const comuniNames = [...new Set(tables.comuni.map(c => c.Descrizione))].slice(0, 500);
    comuniList.innerHTML = comuniNames.map(n => `<option value="${n}">`).join('');
    
    // Stati
    const statiNames = [...new Set(tables.stati.map(s => s.Descrizione))];
    statiList.innerHTML = statiNames.map(n => `<option value="${n}">`).join('');
    
    // Documenti
    const docNames = tables.documenti.map(d => d.Descrizione);
    documentiList.innerHTML = docNames.map(n => `<option value="${n}">`).join('');
}

// ============================================
// FILE HANDLING
// ============================================

async function handleFiles(files) {
    for (const file of files) {
        if (!file.name.endsWith('.json')) continue;
        
        try {
            const text = await file.text();
            const json = JSON.parse(text);
            
            if (json.guests && Array.isArray(json.guests)) {
                guests.push(...json.guests);
                showToast(`Caricati ${json.guests.length} ospiti da ${file.name}`, 'success');
            } else {
                showToast(`Formato non valido: ${file.name}`, 'error');
            }
        } catch (error) {
            console.error('Errore parsing JSON:', error);
            showToast(`Errore nel file: ${file.name}`, 'error');
        }
    }
    
    renderGuestList();
}

// ============================================
// EVENT LISTENERS
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    // Carica tabelle
    const loaded = await loadTables();
    
    if (loaded) {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        populateDatalists();
        showToast('Tabelle caricate con successo!', 'success');
    } else {
        document.getElementById('loading').innerHTML = `
            <p style="color: #f56565;">❌ Errore nel caricamento delle tabelle.</p>
            <p style="margin-top: 10px; font-size: 0.9em;">Verifica che i file CSV siano nella cartella data/</p>
        `;
    }
    
    // Drop zone
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    
    dropZone.addEventListener('click', () => fileInput.click());
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
    
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
        fileInput.value = '';
    });
    
    // Modal
    document.getElementById('closeModal').addEventListener('click', () => {
        document.getElementById('editModal').style.display = 'none';
    });
    
    document.getElementById('cancelEdit').addEventListener('click', () => {
        document.getElementById('editModal').style.display = 'none';
    });
    
    document.getElementById('editForm').addEventListener('submit', (e) => {
        e.preventDefault();
        
        if (editingGuestId !== null) {
            guests[editingGuestId] = {
                id: guests[editingGuestId].id || `guest-${Date.now()}`,
                document: {
                    type: document.getElementById('editDocType').value,
                    number: document.getElementById('editDocNumber').value,
                    issueDate: '',
                    issuePlace: document.getElementById('editDocPlace').value,
                    expiryDate: ''
                },
                personal: {
                    lastName: document.getElementById('editLastName').value,
                    firstName: document.getElementById('editFirstName').value,
                    gender: document.getElementById('editGender').value,
                    birthDate: document.getElementById('editBirthDate').value,
                    birthPlace: document.getElementById('editBirthPlace').value,
                    birthCountry: document.getElementById('editBirthPlace').value,
                    nationality: document.getElementById('editNationality').value
                },
                stay: {
                    arrivalDate: document.getElementById('editArrivalDate').value,
                    departureDate: document.getElementById('editDepartureDate').value,
                    guestType: document.getElementById('editGuestType').value
                }
            };
            
            renderGuestList();
            document.getElementById('editModal').style.display = 'none';
            showToast('Ospite aggiornato!', 'success');
        }
    });
    
    // Generate TXT
    document.getElementById('generateBtn').addEventListener('click', () => {
        const errors = guests.filter(g => validateGuest(g).length > 0).length;
        if (errors > 0) {
            showToast(`Ci sono ${errors} ospiti con errori. Correggili prima di generare.`, 'error');
            return;
        }
        
        const txt = generateTXT();
        const blob = new Blob([txt], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `alloggiati_${new Date().toISOString().split('T')[0]}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        
        showToast('File TXT generato con successo!', 'success');
    });
});

// Rendi le funzioni globali per gli onclick inline
window.editGuest = editGuest;
window.deleteGuest = deleteGuest;
