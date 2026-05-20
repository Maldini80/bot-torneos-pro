// Configuration of tactical formations (relative coordinates in %)
const FORMATIONS = {
    '4-4-2': {
        POR: [{ left: 50, top: 88, label: 'POR' }],
        DFC: [
            { left: 20, top: 68, label: 'DFC L' },
            { left: 40, top: 68, label: 'DFC CL' },
            { left: 60, top: 68, label: 'DFC CR' },
            { left: 80, top: 68, label: 'DFC R' }
        ],
        MC: [
            { left: 20, top: 45, label: 'MC L' },
            { left: 40, top: 45, label: 'MC CL' },
            { left: 60, top: 45, label: 'MC CR' },
            { left: 80, top: 45, label: 'MC R' }
        ],
        DC: [
            { left: 35, top: 20, label: 'DC L' },
            { left: 65, top: 20, label: 'DC R' }
        ]
    },
    '4-3-3': {
        POR: [{ left: 50, top: 88, label: 'POR' }],
        DFC: [
            { left: 20, top: 68, label: 'DFC L' },
            { left: 40, top: 68, label: 'DFC CL' },
            { left: 60, top: 68, label: 'DFC CR' },
            { left: 80, top: 68, label: 'DFC R' }
        ],
        MC: [
            { left: 30, top: 45, label: 'MC L' },
            { left: 50, top: 45, label: 'MC C' },
            { left: 70, top: 45, label: 'MC R' }
        ],
        DC: [
            { left: 25, top: 20, label: 'EI' },
            { left: 50, top: 20, label: 'DC' },
            { left: 75, top: 20, label: 'ED' }
        ]
    },
    '3-5-2': {
        POR: [{ left: 50, top: 88, label: 'POR' }],
        DFC: [
            { left: 30, top: 68, label: 'DFC L' },
            { left: 50, top: 68, label: 'DFC C' },
            { left: 70, top: 68, label: 'DFC R' }
        ],
        MC: [
            { left: 15, top: 45, label: 'MI' },
            { left: 32.5, top: 45, label: 'MCD L' },
            { left: 50, top: 45, label: 'MCO' },
            { left: 67.5, top: 45, label: 'MCD R' },
            { left: 85, top: 45, label: 'MD' }
        ],
        DC: [
            { left: 35, top: 20, label: 'DC L' },
            { left: 65, top: 20, label: 'DC R' }
        ]
    },
    '4-5-1': {
        POR: [{ left: 50, top: 88, label: 'POR' }],
        DFC: [
            { left: 20, top: 68, label: 'DFC L' },
            { left: 40, top: 68, label: 'DFC CL' },
            { left: 60, top: 68, label: 'DFC CR' },
            { left: 80, top: 68, label: 'DFC R' }
        ],
        MC: [
            { left: 15, top: 45, label: 'MI' },
            { left: 32.5, top: 45, label: 'MC L' },
            { left: 50, top: 45, label: 'MCO' },
            { left: 67.5, top: 45, label: 'MC R' },
            { left: 85, top: 45, label: 'MD' }
        ],
        DC: [
            { left: 50, top: 20, label: 'DC' }
        ]
    },
    '5-3-2': {
        POR: [{ left: 50, top: 88, label: 'POR' }],
        DFC: [
            { left: 15, top: 68, label: 'LI' },
            { left: 32.5, top: 68, label: 'DFC L' },
            { left: 50, top: 68, label: 'DFC C' },
            { left: 67.5, top: 68, label: 'DFC R' },
            { left: 85, top: 68, label: 'LD' }
        ],
        MC: [
            { left: 30, top: 45, label: 'MC L' },
            { left: 50, top: 45, label: 'MC C' },
            { left: 70, top: 45, label: 'MC R' }
        ],
        DC: [
            { left: 35, top: 20, label: 'DC L' },
            { left: 65, top: 20, label: 'DC R' }
        ]
    }
};

// Application State
let myTeam = {
    balance: 50000000,
    players: [],
    lineup: { POR: null, DFC: [], MC: [], DC: [] },
    formation: '4-3-3',
    points: 0,
    teamName: 'Mi Equipo Fantasy'
};
let allPlayers = [];
let currentFilteredPlayers = [];
let selectedSlotPos = null; // e.g., 'DFC'
let selectedSlotIdx = null; // e.g., 1

// DOM Elements
const userBalanceEl = document.getElementById('user-balance');
const squadValueEl = document.getElementById('squad-value');
const totalPointsEl = document.getElementById('total-points');
const squadCountEl = document.getElementById('squad-count');
const soccerField = document.getElementById('soccer-field');
const formationSelect = document.getElementById('formation');
const btnSaveLineup = document.getElementById('btn-save-lineup');
const marketList = document.getElementById('market-list');
const squadList = document.getElementById('squad-list');
const marketSearch = document.getElementById('market-search');
const marketPosFilter = document.getElementById('market-pos-filter');
const positionModal = document.getElementById('position-modal');
const modalPlayerList = document.getElementById('modal-player-list');
const modalPositionName = document.getElementById('modal-position-name');
const modalCloseBtn = document.getElementById('modal-close-btn');

// Page Load
window.addEventListener('DOMContentLoaded', async () => {
    initTabNavigation();
    setupEventHandlers();
    
    // Fetch initial data
    showToast('Iniciando Fantasy...', 'success');
    await loadInitialData();
});

// Setup Tab Navigation
function initTabNavigation() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const tabName = tab.getAttribute('data-tab');
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`tab-${tabName}`).classList.add('active');
        });
    });
}

// Setup Event Handlers
function setupEventHandlers() {
    // Formation selector change
    formationSelect.addEventListener('change', (e) => {
        const prevFormation = myTeam.formation;
        myTeam.formation = e.target.value;
        adjustLineupToNewFormation(prevFormation, myTeam.formation);
        renderField();
    });

    // Save Lineup
    btnSaveLineup.addEventListener('click', saveLineupToServer);

    // Search and filters
    marketSearch.addEventListener('input', filterAndRenderMarket);
    marketPosFilter.addEventListener('change', filterAndRenderMarket);

    // Close Modal
    modalCloseBtn.addEventListener('click', closeModal);
    positionModal.addEventListener('click', (e) => {
        if (e.target === positionModal) closeModal();
    });
}

// Load My Team and Market Players
async function loadInitialData() {
    try {
        // Load user team
        const teamRes = await fetch('/api/fantasy/my-team');
        if (!teamRes.ok) throw new Error('No se pudo cargar el equipo.');
        myTeam = await teamRes.json();
        
        // Load market players
        const playersRes = await fetch('/api/fantasy/players');
        if (!playersRes.ok) throw new Error('No se pudo cargar los jugadores del mercado.');
        const playersData = await playersRes.json();
        allPlayers = playersData.players || [];
        
        // Set UI values
        formationSelect.value = myTeam.formation;
        userBalanceEl.textContent = formatCurrency(myTeam.balance);
        totalPointsEl.textContent = `${myTeam.points} pts`;
        
        // Render
        renderField();
        filterAndRenderMarket();
        renderSquadList();
        updateSquadStats();
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

// Filter and Render Player Market list
function filterAndRenderMarket() {
    const searchVal = marketSearch.value.toLowerCase().trim();
    const posVal = marketPosFilter.value;

    currentFilteredPlayers = allPlayers.filter(p => {
        const matchesSearch = !searchVal || 
            p.eaPlayerName.toLowerCase().includes(searchVal) || 
            p.lastClub.toLowerCase().includes(searchVal);
        const matchesPos = !posVal || p.lastPosition === posVal;
        return matchesSearch && matchesPos;
    });

    // Sort: highest points/price first
    currentFilteredPlayers.sort((a, b) => b.points - a.points);

    marketList.innerHTML = '';
    
    if (currentFilteredPlayers.length === 0) {
        marketList.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No se encontraron jugadores.</td></tr>`;
        return;
    }

    currentFilteredPlayers.forEach(p => {
        const isOwned = myTeam.players.includes(p.eaPlayerName);
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td>
                <div style="font-weight: 700; color: #f8fafc;">${p.eaPlayerName}</div>
            </td>
            <td class="text-muted">${p.lastClub}</td>
            <td><span class="position-badge pos-${p.lastPosition.toLowerCase()}">${p.lastPosition}</span></td>
            <td class="text-center" style="font-weight: 600;">${p.avgRating.toFixed(2)}</td>
            <td class="text-center text-yellow" style="font-weight: 700;">${p.points}</td>
            <td class="text-right price-text">${formatCurrency(p.price)}</td>
            <td class="text-center">
                ${isOwned 
                    ? `<button class="btn btn-secondary btn-xs" disabled><i class="fa-solid fa-check"></i> Fichado</button>`
                    : `<button class="btn btn-success btn-xs btn-buy" data-name="${p.eaPlayerName}"><i class="fa-solid fa-plus"></i> Fichar</button>`
                }
            </td>
        `;

        // Buy button handler
        const buyBtn = row.querySelector('.btn-buy');
        if (buyBtn) {
            buyBtn.addEventListener('click', () => buyPlayer(p));
        }

        marketList.appendChild(row);
    });
}

// Render owned squad list
function renderSquadList() {
    squadList.innerHTML = '';
    
    if (myTeam.players.length === 0) {
        squadList.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No tienes jugadores en tu plantilla. ¡Ficha algunos en el Mercado!</td></tr>`;
        return;
    }

    myTeam.players.forEach(playerName => {
        const p = allPlayers.find(x => x.eaPlayerName === playerName);
        if (!p) return;

        const isAligned = isPlayerInLineup(playerName);
        const row = document.createElement('tr');

        row.innerHTML = `
            <td><div style="font-weight: 700; color: #f8fafc;">${p.eaPlayerName}</div></td>
            <td class="text-muted">${p.lastClub}</td>
            <td><span class="position-badge pos-${p.lastPosition.toLowerCase()}">${p.lastPosition}</span></td>
            <td class="text-center" style="font-weight: 600;">${p.avgRating.toFixed(2)}</td>
            <td class="text-center">
                <span class="badge ${isAligned ? 'btn-success' : 'text-muted'}" style="border: none;">
                    ${isAligned ? 'Alineado' : 'Banquillo'}
                </span>
            </td>
            <td class="text-right price-text">${formatCurrency(p.price)}</td>
            <td class="text-center">
                <button class="btn btn-danger btn-xs btn-sell" data-name="${p.eaPlayerName}"><i class="fa-solid fa-dollar-sign"></i> Vender</button>
            </td>
        `;

        // Sell handler
        row.querySelector('.btn-sell').addEventListener('click', () => sellPlayer(p));

        squadList.appendChild(row);
    });
}

// Check if player is placed on the soccer pitch
function isPlayerInLineup(playerName) {
    const lineup = myTeam.lineup;
    if (lineup.POR === playerName) return true;
    if (lineup.DFC && lineup.DFC.includes(playerName)) return true;
    if (lineup.MC && lineup.MC.includes(playerName)) return true;
    if (lineup.DC && lineup.DC.includes(playerName)) return true;
    return false;
}

// Calculate total squad value and update headers
function updateSquadStats() {
    let totalVal = 0;
    myTeam.players.forEach(playerName => {
        const p = allPlayers.find(x => x.eaPlayerName === playerName);
        if (p) totalVal += p.price;
    });
    squadValueEl.textContent = formatCurrency(totalVal);
    squadCountEl.textContent = myTeam.players.length;
}

// Render tactical pitch & player nodes
function renderField() {
    // Keep reference of existing markings
    const markingsHtml = `
        <div class="field-penalty-area-top"></div>
        <div class="field-center-circle"></div>
        <div class="field-penalty-area-bottom"></div>
    `;
    soccerField.innerHTML = markingsHtml;

    const currentLayout = FORMATIONS[myTeam.formation];
    
    // Position groupings: POR, DFC, MC, DC
    for (const groupKey in currentLayout) {
        const positions = currentLayout[groupKey];
        positions.forEach((pos, idx) => {
            const node = document.createElement('div');
            node.className = 'field-player-node';
            node.style.left = `${pos.left}%`;
            node.style.top = `${pos.top}%`;

            const alignedPlayer = (myTeam.lineup[groupKey] && myTeam.lineup[groupKey][idx]) || 
                                 (groupKey === 'POR' ? myTeam.lineup.POR : null);

            if (alignedPlayer) {
                const p = allPlayers.find(x => x.eaPlayerName === alignedPlayer);
                node.innerHTML = `
                    <div class="player-circle occupied">
                        <span class="player-jersey-number">${p ? p.points : '0'}</span>
                        <span class="player-role-badge">${pos.label}</span>
                    </div>
                    <div class="player-name-plate">${alignedPlayer}</div>
                `;
            } else {
                node.innerHTML = `
                    <div class="player-circle">
                        <i class="fa-solid fa-plus"></i>
                        <span class="player-role-badge">${pos.label}</span>
                    </div>
                    <div class="player-name-plate">${pos.label}</div>
                `;
            }

            // Click node to select a player for this spot
            node.addEventListener('click', () => openPositionSelector(groupKey, idx));

            soccerField.appendChild(node);
        });
    }
}

// Open modal to select player for pitch slot
function openPositionSelector(posKey, idx) {
    selectedSlotPos = posKey;
    selectedSlotIdx = idx;

    modalPositionName.textContent = posKey;
    modalPlayerList.innerHTML = '';

    // Find owned players matching this position
    const matchingPlayers = myTeam.players.filter(name => {
        const p = allPlayers.find(x => x.eaPlayerName === name);
        return p && p.lastPosition === posKey;
    });

    const alignedPlayer = (myTeam.lineup[posKey] && myTeam.lineup[posKey][idx]) || 
                         (posKey === 'POR' ? myTeam.lineup.POR : null);

    // If a player is already aligned here, offer a "Remove" option
    if (alignedPlayer) {
        const removeRow = document.createElement('div');
        removeRow.className = 'modal-player-row';
        removeRow.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        removeRow.style.background = 'rgba(239, 68, 68, 0.05)';
        removeRow.innerHTML = `
            <div class="modal-player-info">
                <div class="modal-player-name" style="color: #ef4444;"><i class="fa-solid fa-circle-minus"></i> Quitar de alineación</div>
                <div class="modal-player-club">${alignedPlayer}</div>
            </div>
            <i class="fa-solid fa-chevron-right text-muted"></i>
        `;
        removeRow.addEventListener('click', () => {
            removePlayerFromSlot(posKey, idx);
            closeModal();
            renderField();
            renderSquadList();
        });
        modalPlayerList.appendChild(removeRow);
    }

    if (matchingPlayers.length === 0) {
        modalPlayerList.innerHTML += `<p class="text-center text-muted py-4">No tienes jugadores de posición ${posKey} en tu plantilla.</p>`;
    } else {
        matchingPlayers.forEach(name => {
            // Check if player is already aligned somewhere else
            const isUsed = isPlayerInLineup(name) && name !== alignedPlayer;
            const p = allPlayers.find(x => x.eaPlayerName === name);
            if (!p) return;

            const row = document.createElement('div');
            row.className = 'modal-player-row';
            if (isUsed) {
                row.style.opacity = '0.5';
                row.style.pointerEvents = 'none';
            }

            row.innerHTML = `
                <div class="modal-player-info">
                    <div class="modal-player-name">${name} ${isUsed ? '(Ya alineado)' : ''}</div>
                    <div class="modal-player-club">${p.lastClub} | Media: ${p.avgRating.toFixed(2)} | Puntos: ${p.points}</div>
                </div>
                <i class="fa-solid fa-check text-green"></i>
            `;

            if (!isUsed) {
                row.addEventListener('click', () => {
                    alignPlayerToSlot(name, posKey, idx);
                    closeModal();
                    renderField();
                    renderSquadList();
                });
            }

            modalPlayerList.appendChild(row);
        });
    }

    positionModal.classList.add('open');
}

// Place player inside tactial slot
function alignPlayerToSlot(playerName, posKey, idx) {
    if (posKey === 'POR') {
        myTeam.lineup.POR = playerName;
    } else {
        if (!myTeam.lineup[posKey]) myTeam.lineup[posKey] = [];
        myTeam.lineup[posKey][idx] = playerName;
    }
    showToast(`${playerName} alineado.`, 'success');
}

// Remove player from tactical slot
function removePlayerFromSlot(posKey, idx) {
    if (posKey === 'POR') {
        myTeam.lineup.POR = null;
    } else {
        if (myTeam.lineup[posKey]) {
            myTeam.lineup[posKey][idx] = null;
        }
    }
    showToast('Jugador desalineado.', 'success');
}

// Adjust existing squad list positions when switching formations
function adjustLineupToNewFormation(oldF, newF) {
    // Simple reset of lineup when switching formation to prevent index collisions
    myTeam.lineup = {
        POR: myTeam.lineup.POR,
        DFC: [],
        MC: [],
        DC: []
    };
    showToast(`Formación cambiada a ${newF}. Coloca a tus jugadores.`, 'success');
}

function closeModal() {
    positionModal.classList.remove('open');
}

// Buy Player Operation
async function buyPlayer(player) {
    if (myTeam.balance < player.price) {
        showToast('Saldo insuficiente para fichar a este jugador.', 'error');
        return;
    }

    try {
        const res = await fetch('/api/fantasy/market/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eaPlayerName: player.eaPlayerName })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al comprar jugador.');

        showToast(data.message, 'success');
        
        // Update local team state
        myTeam.balance -= player.price;
        myTeam.players.push(player.eaPlayerName);

        // Update headers & lists
        userBalanceEl.textContent = formatCurrency(myTeam.balance);
        filterAndRenderMarket();
        renderSquadList();
        updateSquadStats();
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

// Sell Player Operation
async function sellPlayer(player) {
    try {
        const res = await fetch('/api/fantasy/market/sell', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eaPlayerName: player.eaPlayerName })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al vender jugador.');

        showToast(data.message, 'success');

        // Update local team state
        myTeam.balance += player.price;
        myTeam.players = myTeam.players.filter(name => name !== player.eaPlayerName);

        // Remove from lineup
        for (const pos in myTeam.lineup) {
            if (Array.isArray(myTeam.lineup[pos])) {
                myTeam.lineup[pos] = myTeam.lineup[pos].filter(name => name !== player.eaPlayerName);
            } else if (myTeam.lineup[pos] === player.eaPlayerName) {
                myTeam.lineup[pos] = null;
            }
        }

        // Update headers & lists
        userBalanceEl.textContent = formatCurrency(myTeam.balance);
        filterAndRenderMarket();
        renderSquadList();
        renderField();
        updateSquadStats();
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

// Save Current Lineup Setup to Database
async function saveLineupToServer() {
    try {
        const res = await fetch('/api/fantasy/my-team/lineup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lineup: myTeam.lineup,
                formation: myTeam.formation
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al guardar alineación.');

        showToast(data.message, 'success');
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

// Utility Helpers
function formatCurrency(val) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);
}

function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${msg}</span>`;
    
    container.appendChild(toast);
    
    // Trigger transition
    setTimeout(() => toast.classList.add('show'), 50);
    
    // Auto-destroy after 3.5s
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}
