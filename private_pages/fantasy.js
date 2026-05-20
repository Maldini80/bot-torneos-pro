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
let currentUser = null;
let currentLeagueId = sessionStorage.getItem('selected_league_id') || null;
let activeLeague = null;
let myTeam = {
    balance: 50000000,
    players: [],
    lineup: { POR: null, DFC: [], MC: [], DC: [] },
    formation: '4-3-3',
    points: 0,
    teamName: ''
};
let allPlayers = [];
let currentFilteredPlayers = [];
let selectedSlotPos = null; 
let selectedSlotIdx = null; 

// DOM Elements - View Switchers
const leagueSelectorView = document.getElementById('league-selector-view');
const leagueDashboardView = document.getElementById('league-dashboard-view');

// DOM Elements - Selector View
const selectorUserName = document.getElementById('selector-user-name');
const leaguesGrid = document.getElementById('leagues-grid');
const adminCreateLeagueSection = document.getElementById('admin-create-league-section');
const createLeagueForm = document.getElementById('create-league-form');

// DOM Elements - Dashboard View
const activeLeagueName = document.getElementById('active-league-name');
const activeTeamNameBadge = document.getElementById('active-team-name-badge');
const btnChangeLeague = document.getElementById('btn-change-league');
const userBalanceEl = document.getElementById('user-balance');
const squadValueEl = document.getElementById('squad-value');
const totalPointsEl = document.getElementById('total-points');
const squadCountEl = document.getElementById('squad-count');
const soccerField = document.getElementById('soccer-field');
const formationSelect = document.getElementById('formation');
const btnSaveLineup = document.getElementById('btn-save-lineup');
const marketClosedBanner = document.getElementById('market-closed-banner');

// DOM Elements - Market & Squad tabs
const marketList = document.getElementById('market-list');
const squadList = document.getElementById('squad-list');
const marketSearch = document.getElementById('market-search');
const marketPosFilter = document.getElementById('market-pos-filter');

// DOM Elements - Leaderboard tab
const leaderboardList = document.getElementById('leaderboard-list');

// DOM Elements - Pending Approval
const pendingApprovalView = document.getElementById('pending-approval-view');
const pendingTeamNameDisplay = document.getElementById('pending-team-name-display');
const btnPendingRefresh = document.getElementById('btn-pending-refresh');
const btnPendingExit = document.getElementById('btn-pending-exit');

// DOM Elements - Admin Panel tab
const adminUpdateLeagueForm = document.getElementById('admin-update-league-form');
const adminLeagueName = document.getElementById('admin-league-name');
const adminLeagueStatus = document.getElementById('admin-league-status');
const adminLeagueMaxParts = document.getElementById('admin-league-max-parts');
const btnAdminToggleMarket = document.getElementById('btn-admin-toggle-market');
const btnAdminRecalculate = document.getElementById('btn-admin-recalculate');
const btnAdminDeleteLeague = document.getElementById('btn-admin-delete-league');
const adminParticipantsList = document.getElementById('admin-participants-list');

// DOM Elements - Modals
const joinLeagueModal = document.getElementById('join-league-modal');
const joinLeagueForm = document.getElementById('join-league-form');
const joinTeamNameInput = document.getElementById('join-team-name');
const joinLeagueModalName = document.getElementById('join-league-modal-name');
const joinModalCloseBtn = document.getElementById('join-modal-close-btn');

const positionModal = document.getElementById('position-modal');
const modalPlayerList = document.getElementById('modal-player-list');
const modalPositionName = document.getElementById('modal-position-name');
const modalCloseBtn = document.getElementById('modal-close-btn');

const rivalTeamModal = document.getElementById('rival-team-modal');
const rivalTeamNameTitle = document.getElementById('rival-team-name-title');
const rivalPointsVal = document.getElementById('rival-points-val');
const rivalFormationVal = document.getElementById('rival-formation-val');
const rivalSoccerField = document.getElementById('rival-soccer-field');
const rivalModalCloseBtn = document.getElementById('rival-modal-close-btn');

let pendingJoinLeagueId = null;

// Page Load
window.addEventListener('DOMContentLoaded', async () => {
    setupEventHandlers();
    await checkUserSession();
    
    if (currentLeagueId) {
        await enterLeague(currentLeagueId);
    } else {
        await showLeagueSelector();
    }
});

// User auth session check
async function checkUserSession() {
    try {
        const res = await fetch('/api/fantasy/me');
        if (!res.ok) {
            selectorUserName.innerHTML = `<span class="text-red">Sesión expirada</span>`;
            return;
        }
        currentUser = await res.json();
        
        // Update user elements
        selectorUserName.innerHTML = `<i class="fa-solid fa-user-circle text-blue"></i> ${currentUser.username}`;
        
        // Toggle admin blocks
        if (currentUser.isAdmin) {
            document.querySelectorAll('.admin-only-block').forEach(el => el.style.display = 'block');
        } else {
            document.querySelectorAll('.admin-only-block').forEach(el => el.style.display = 'none');
        }
    } catch (e) {
        console.error('Error fetching user info:', e);
        selectorUserName.innerHTML = `<span class="text-red">Error de Conexión</span>`;
    }
}

// Setup Event Handlers
function setupEventHandlers() {
    // Selector Back/Logout Click
    btnChangeLeague.addEventListener('click', () => {
        sessionStorage.removeItem('selected_league_id');
        currentLeagueId = null;
        activeLeague = null;
        showLeagueSelector();
    });

    // Pending Approval View handlers
    btnPendingRefresh.addEventListener('click', () => {
        if (currentLeagueId) {
            enterLeague(currentLeagueId);
        }
    });

    btnPendingExit.addEventListener('click', () => {
        sessionStorage.removeItem('selected_league_id');
        currentLeagueId = null;
        activeLeague = null;
        showLeagueSelector();
    });

    // Subtabs Switchers inside League dashboard
    const leagueNavBtns = document.querySelectorAll('.nav-tab-btn');
    leagueNavBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            leagueNavBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const tabName = btn.getAttribute('data-league-tab');
            document.querySelectorAll('.league-tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`league-tab-${tabName}`).classList.add('active');
            
            if (tabName === 'leaderboard') {
                loadLeaderboard();
            } else if (tabName === 'admin-panel') {
                loadAdminPanelData();
            }
        });
    });

    // Right Panel Tabs (Market vs Squad)
    const rightPanelTabs = document.querySelectorAll('.tab-btn');
    rightPanelTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            rightPanelTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const tabName = tab.getAttribute('data-tab');
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`tab-${tabName}`).classList.add('active');
        });
    });

    // Formation selector change
    formationSelect.addEventListener('change', (e) => {
        const prevFormation = myTeam.formation;
        myTeam.formation = e.target.value;
        adjustLineupToNewFormation(prevFormation, myTeam.formation);
        renderField();
    });

    // Save Lineup
    btnSaveLineup.addEventListener('click', saveLineupToServer);

    // Search and filters for market
    marketSearch.addEventListener('input', filterAndRenderMarket);
    marketPosFilter.addEventListener('change', filterAndRenderMarket);

    // Modals Close handlers
    modalCloseBtn.addEventListener('click', () => positionModal.classList.remove('open'));
    joinModalCloseBtn.addEventListener('click', () => joinLeagueModal.classList.remove('open'));
    rivalModalCloseBtn.addEventListener('click', () => rivalTeamModal.classList.remove('open'));
    
    window.addEventListener('click', (e) => {
        if (e.target === positionModal) positionModal.classList.remove('open');
        if (e.target === joinLeagueModal) joinLeagueModal.classList.remove('open');
        if (e.target === rivalTeamModal) rivalTeamModal.classList.remove('open');
    });

    // Form handlers
    createLeagueForm.addEventListener('submit', handleCreateLeague);
    joinLeagueForm.addEventListener('submit', handleJoinLeagueSubmit);
    adminUpdateLeagueForm.addEventListener('submit', handleUpdateLeagueSubmit);
    
    // Quick admin buttons
    btnAdminToggleMarket.addEventListener('click', handleAdminToggleMarket);
    btnAdminRecalculate.addEventListener('click', handleAdminRecalculate);
    btnAdminDeleteLeague.addEventListener('click', handleAdminDeleteLeague);
}

// VIEW 1: Show Selector and Fetch All Leagues
async function showLeagueSelector() {
    leagueDashboardView.style.display = 'none';
    leagueSelectorView.style.display = 'block';
    
    leaguesGrid.innerHTML = `<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Cargando ligas...</div>`;
    
    try {
        const res = await fetch('/api/fantasy/leagues');
        if (!res.ok) throw new Error('No se pudieron obtener las ligas.');
        const data = await res.json();
        const leagues = data.leagues || [];
        
        leaguesGrid.innerHTML = '';
        
        if (leagues.length === 0) {
            leaguesGrid.innerHTML = `<div class="text-center py-4 text-muted w-100"><i class="fa-solid fa-folder-open"></i> No hay ligas creadas todavía.</div>`;
            return;
        }
        
        leagues.forEach(league => {
            const card = document.createElement('div');
            card.className = 'league-card';
            
            let statusBadge = '';
            if (league.status === 'open') statusBadge = '<span class="badge badge-success">Abierta</span>';
            else if (league.status === 'active') statusBadge = '<span class="badge badge-info">En Curso</span>';
            else statusBadge = '<span class="badge badge-danger">Cerrada</span>';
            
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3>${league.name}</h3>
                    ${statusBadge}
                </div>
                <div class="league-meta">
                    <div><i class="fa-solid fa-users"></i> <span>Mánagers: ${league.participantCount} / ${league.maxParticipants}</span></div>
                    <div><i class="fa-solid fa-wallet"></i> <span>Presupuesto: ${formatCurrency(league.initialBudget)}</span></div>
                    <div><i class="fa-solid fa-store"></i> <span>Mercado: ${league.marketOpen ? 'Abierto' : 'Cerrado'}</span></div>
                </div>
                <button class="btn btn-primary btn-block btn-enter-league" data-id="${league._id}" data-name="${league.name}"><i class="fa-solid fa-circle-play"></i> Entrar / Unirse</button>
            `;
            
            card.querySelector('.btn-enter-league').addEventListener('click', () => {
                enterLeague(league._id);
            });
            
            leaguesGrid.appendChild(card);
        });
    } catch (e) {
        console.error(e);
        leaguesGrid.innerHTML = `<div class="text-center py-4 text-red"><i class="fa-solid fa-triangle-exclamation"></i> Error al cargar las ligas.</div>`;
    }
}

// Create league logic (admin)
async function handleCreateLeague(e) {
    e.preventDefault();
    const name = document.getElementById('new-league-name').value;
    const maxParticipants = document.getElementById('new-league-max-participants').value;
    const initialBudget = document.getElementById('new-league-budget').value;
    
    try {
        const res = await fetch('/api/fantasy/leagues', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, maxParticipants, initialBudget })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al crear la liga.');
        
        showToast(data.message, 'success');
        createLeagueForm.reset();
        await showLeagueSelector();
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

// Enter/Join League logic
async function enterLeague(leagueId) {
    try {
        const res = await fetch(`/api/fantasy/leagues/${leagueId}/my-team`);
        
        if (res.status === 404) {
            // Not joined yet, prompt Modal
            const infoRes = await fetch('/api/fantasy/leagues');
            const infoData = await infoRes.json();
            const league = infoData.leagues.find(l => l._id === leagueId);
            
            pendingJoinLeagueId = leagueId;
            joinLeagueModalName.textContent = league ? league.name : 'Liga';
            joinTeamNameInput.value = '';
            joinLeagueModal.classList.add('open');
            return;
        }
        
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Error al entrar en la liga.');
        }
        
        myTeam = await res.json();
        currentLeagueId = leagueId;
        sessionStorage.setItem('selected_league_id', leagueId);
        
        // Fetch active league details
        const leaguesRes = await fetch('/api/fantasy/leagues');
        const leaguesData = await leaguesRes.json();
        activeLeague = leaguesData.leagues.find(l => l._id === leagueId);
        
        // Initialize dashboard UI
        activeLeagueName.textContent = activeLeague.name;
        activeTeamNameBadge.textContent = myTeam.teamName;
        userBalanceEl.textContent = formatCurrency(myTeam.balance);
        totalPointsEl.textContent = `${myTeam.points} pts`;
        formationSelect.value = myTeam.formation;
        
        // Toggle market open status banner
        if (activeLeague.marketOpen) {
            marketClosedBanner.style.display = 'none';
        } else {
            marketClosedBanner.style.display = 'flex';
        }
        
        // Switch Views
        leagueSelectorView.style.display = 'none';
        leagueDashboardView.style.display = 'block';
        
        const statsArea = document.querySelector('.stats-area');
        const leagueNav = document.querySelector('.league-nav');
        
        if (!myTeam.approved) {
            statsArea.style.display = 'none';
            leagueNav.style.display = 'none';
            pendingApprovalView.style.display = 'block';
            pendingTeamNameDisplay.textContent = myTeam.teamName;
            
            // Hide all tab contents
            document.querySelectorAll('.league-tab-content').forEach(c => c.classList.remove('active'));
            return;
        } else {
            statsArea.style.display = 'flex';
            leagueNav.style.display = 'flex';
            pendingApprovalView.style.display = 'none';
        }
        
        // Reset subtabs to first tab
        document.querySelectorAll('.nav-tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector('[data-league-tab="my-team"]').classList.add('active');
        document.querySelectorAll('.league-tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById('league-tab-my-team').classList.add('active');
        
        // Fetch and load players
        const playersRes = await fetch('/api/fantasy/players');
        if (!playersRes.ok) throw new Error('No se pudieron obtener los jugadores.');
        const playersData = await playersRes.json();
        allPlayers = playersData.players || [];
        
        // Render fields & lists
        renderField();
        filterAndRenderMarket();
        renderSquadList();
        updateSquadStats();
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

// Join Submit
async function handleJoinLeagueSubmit(e) {
    e.preventDefault();
    const teamName = joinTeamNameInput.value;
    if (!teamName || !pendingJoinLeagueId) return;
    
    try {
        const res = await fetch(`/api/fantasy/leagues/${pendingJoinLeagueId}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teamName })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al inscribirse.');
        
        joinLeagueModal.classList.remove('open');
        showToast(data.message, 'success');
        
        await enterLeague(pendingJoinLeagueId);
        pendingJoinLeagueId = null;
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

    // Sort: highest points first
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
                    : `<button class="btn btn-success btn-xs btn-buy" data-name="${p.eaPlayerName}" ${activeLeague && !activeLeague.marketOpen ? 'disabled' : ''}><i class="fa-solid fa-plus"></i> Fichar</button>`
                }
            </td>
        `;

        const buyBtn = row.querySelector('.btn-buy');
        if (buyBtn && activeLeague && activeLeague.marketOpen) {
            buyBtn.addEventListener('click', () => buyPlayer(p));
        }

        marketList.appendChild(row);
    });
}

// Render owned squad list
function renderSquadList() {
    squadList.innerHTML = '';
    
    if (!myTeam.players || myTeam.players.length === 0) {
        squadList.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No tienes jugadores. Ficha en el Mercado.</td></tr>`;
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
                <button class="btn btn-danger btn-xs btn-sell" data-name="${p.eaPlayerName}" ${activeLeague && !activeLeague.marketOpen ? 'disabled' : ''}><i class="fa-solid fa-dollar-sign"></i> Vender</button>
            </td>
        `;

        const sellBtn = row.querySelector('.btn-sell');
        if (sellBtn && activeLeague && activeLeague.marketOpen) {
            sellBtn.addEventListener('click', () => sellPlayer(p));
        }

        squadList.appendChild(row);
    });
}

// Check if player in lineup
function isPlayerInLineup(playerName) {
    const lineup = myTeam.lineup;
    if (lineup.POR === playerName) return true;
    if (lineup.DFC && lineup.DFC.includes(playerName)) return true;
    if (lineup.MC && lineup.MC.includes(playerName)) return true;
    if (lineup.DC && lineup.DC.includes(playerName)) return true;
    return false;
}

// Update squad counts & stats
function updateSquadStats() {
    let totalVal = 0;
    const squadSize = myTeam.players ? myTeam.players.length : 0;
    
    if (myTeam.players) {
        myTeam.players.forEach(playerName => {
            const p = allPlayers.find(x => x.eaPlayerName === playerName);
            if (p) totalVal += p.price;
        });
    }
    
    squadValueEl.textContent = formatCurrency(totalVal);
    squadCountEl.textContent = squadSize;
}

// Render Soccer pitch
function renderField() {
    const markingsHtml = `
        <div class="field-penalty-area-top"></div>
        <div class="field-center-circle"></div>
        <div class="field-penalty-area-bottom"></div>
    `;
    soccerField.innerHTML = markingsHtml;

    const currentLayout = FORMATIONS[myTeam.formation];
    if (!currentLayout) return;
    
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

            node.addEventListener('click', () => openPositionSelector(groupKey, idx));
            soccerField.appendChild(node);
        });
    }
}

// Open modal selection
function openPositionSelector(posKey, idx) {
    selectedSlotPos = posKey;
    selectedSlotIdx = idx;

    modalPositionName.textContent = posKey;
    modalPlayerList.innerHTML = '';

    const matchingPlayers = (myTeam.players || []).filter(name => {
        const p = allPlayers.find(x => x.eaPlayerName === name);
        return p && p.lastPosition === posKey;
    });

    const alignedPlayer = (myTeam.lineup[posKey] && myTeam.lineup[posKey][idx]) || 
                         (posKey === 'POR' ? myTeam.lineup.POR : null);

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
            positionModal.classList.remove('open');
            renderField();
            renderSquadList();
        });
        modalPlayerList.appendChild(removeRow);
    }

    if (matchingPlayers.length === 0) {
        modalPlayerList.innerHTML += `<p class="text-center text-muted py-4">No tienes jugadores de posición ${posKey} en tu plantilla.</p>`;
    } else {
        matchingPlayers.forEach(name => {
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
                    positionModal.classList.remove('open');
                    renderField();
                    renderSquadList();
                });
            }

            modalPlayerList.appendChild(row);
        });
    }

    positionModal.classList.add('open');
}

function alignPlayerToSlot(playerName, posKey, idx) {
    if (posKey === 'POR') {
        myTeam.lineup.POR = playerName;
    } else {
        if (!myTeam.lineup[posKey]) myTeam.lineup[posKey] = [];
        myTeam.lineup[posKey][idx] = playerName;
    }
    showToast(`${playerName} alineado.`, 'success');
}

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

function adjustLineupToNewFormation(oldF, newF) {
    myTeam.lineup = {
        POR: myTeam.lineup.POR,
        DFC: [],
        MC: [],
        DC: []
    };
    showToast(`Formación cambiada a ${newF}. Coloca tus jugadores.`, 'success');
}

// Buy Player Operation
async function buyPlayer(player) {
    if (myTeam.balance < player.price) {
        showToast('Saldo insuficiente.', 'error');
        return;
    }

    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/buy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eaPlayerName: player.eaPlayerName })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al comprar jugador.');

        showToast(data.message, 'success');
        
        myTeam.balance -= player.price;
        if (!myTeam.players) myTeam.players = [];
        myTeam.players.push(player.eaPlayerName);

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
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/sell`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eaPlayerName: player.eaPlayerName })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al vender jugador.');

        showToast(data.message, 'success');

        myTeam.balance += player.price;
        myTeam.players = myTeam.players.filter(name => name !== player.eaPlayerName);

        for (const pos in myTeam.lineup) {
            if (Array.isArray(myTeam.lineup[pos])) {
                myTeam.lineup[pos] = myTeam.lineup[pos].filter(name => name !== player.eaPlayerName);
            } else if (myTeam.lineup[pos] === player.eaPlayerName) {
                myTeam.lineup[pos] = null;
            }
        }

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
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/lineup`, {
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

// VIEW 2.2: Fetch and render Leaderboard
async function loadLeaderboard() {
    leaderboardList.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Cargando clasificación...</td></tr>`;
    
    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/leaderboard`);
        if (!res.ok) throw new Error('Error al cargar la clasificación.');
        const data = await res.json();
        const leaderboard = data.leaderboard || [];
        
        leaderboardList.innerHTML = '';
        
        if (leaderboard.length === 0) {
            leaderboardList.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">No hay equipos en la clasificación.</td></tr>`;
            return;
        }
        
        leaderboard.forEach(manager => {
            const row = document.createElement('tr');
            if (manager.isMe) row.className = 'my-row';
            
            let posBadgeClass = '';
            if (manager.position === 1) posBadgeClass = 'pos-1';
            else if (manager.position === 2) posBadgeClass = 'pos-2';
            else if (manager.position === 3) posBadgeClass = 'pos-3';
            
            // Render avatar fallback
            const avatarUrl = manager.discordAvatar 
                ? `https://cdn.discordapp.com/avatars/${manager.discordId}/${manager.discordAvatar}.png?size=64`
                : '/img/default_avatar.png'; // Fallback
            
            row.innerHTML = `
                <td class="text-center pos-col ${posBadgeClass}">${manager.position}</td>
                <td>
                    <div class="manager-cell">
                        <img class="manager-avatar" src="${avatarUrl}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                        <div class="manager-info">
                            <span class="team-name-text">${manager.teamName}</span>
                            <span class="manager-username">${manager.discordUsername} ${manager.isMe ? '(Tú)' : ''}</span>
                        </div>
                    </div>
                </td>
                <td class="text-center font-weight-bold" style="font-weight: 600;">${manager.playerCount} / 15</td>
                <td class="text-center text-muted">${manager.formation || '4-3-3'}</td>
                <td class="text-right text-yellow" style="font-weight: 700; font-size: 1.05rem;">${manager.points} pts</td>
                <td class="text-center">
                    <button class="btn btn-secondary btn-xs btn-view-rival" data-discord-id="${manager.discordId}"><i class="fa-solid fa-eye"></i> Ver Once</button>
                </td>
            `;
            
            row.querySelector('.btn-view-rival').addEventListener('click', () => {
                showRivalTeam(manager.discordId, manager.teamName);
            });
            
            leaderboardList.appendChild(row);
        });
    } catch (e) {
        console.error(e);
        leaderboardList.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-red">Error al cargar la clasificación.</td></tr>`;
    }
}

// Show rival Once inicial modal (Read-only)
async function showRivalTeam(discordId, teamName) {
    rivalTeamNameTitle.textContent = teamName;
    rivalPointsVal.textContent = '0 pts';
    rivalFormationVal.textContent = '4-3-3';
    
    // Draw empty markings
    const markingsHtml = `
        <div class="field-penalty-area-top"></div>
        <div class="field-center-circle"></div>
        <div class="field-penalty-area-bottom"></div>
    `;
    rivalSoccerField.innerHTML = markingsHtml;
    
    rivalTeamModal.classList.add('open');
    
    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/team/${discordId}`);
        if (!res.ok) throw new Error('No se pudo cargar el equipo rival.');
        const rivalTeam = await res.json();
        
        rivalPointsVal.textContent = `${rivalTeam.points} pts`;
        rivalFormationVal.textContent = rivalTeam.formation || '4-3-3';
        
        const formation = rivalTeam.formation || '4-3-3';
        const layout = FORMATIONS[formation];
        if (!layout) return;
        
        for (const groupKey in layout) {
            const positions = layout[groupKey];
            positions.forEach((pos, idx) => {
                const node = document.createElement('div');
                node.className = 'field-player-node';
                node.style.left = `${pos.left}%`;
                node.style.top = `${pos.top}%`;

                const alignedPlayer = (rivalTeam.lineup[groupKey] && rivalTeam.lineup[groupKey][idx]) || 
                                     (groupKey === 'POR' ? rivalTeam.lineup.POR : null);

                if (alignedPlayer) {
                    const p = allPlayers.find(x => x.eaPlayerName === alignedPlayer);
                    node.innerHTML = `
                        <div class="player-circle occupied" style="background: linear-gradient(135deg, #1e293b, #0f172a); border-color: rgba(255,255,255,0.2);">
                            <span class="player-jersey-number" style="color: #cbd5e1;">${p ? p.points : '0'}</span>
                        </div>
                        <div class="player-name-plate">${alignedPlayer}</div>
                    `;
                } else {
                    node.innerHTML = `
                        <div class="player-circle" style="opacity: 0.3; pointer-events: none; border-style: dotted;">
                            <span class="player-role-badge">${pos.label}</span>
                        </div>
                        <div class="player-name-plate" style="opacity: 0.4;">Vacio</div>
                    `;
                }
                
                rivalSoccerField.appendChild(node);
            });
        }
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

// VIEW 2.3: Load admin panel settings and participants
async function loadAdminPanelData() {
    if (!currentUser || !currentUser.isAdmin) return;
    
    // Fill Config Form
    adminLeagueName.value = activeLeague.name;
    adminLeagueStatus.value = activeLeague.status;
    adminLeagueMaxParts.value = activeLeague.maxParticipants;
    
    // Set market toggle text
    updateMarketToggleButton(activeLeague.marketOpen);
    
    // Fetch and render managers list
    adminParticipantsList.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Cargando participantes...</td></tr>`;
    
    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/teams`);
        if (!res.ok) throw new Error('No se pudieron obtener los participantes.');
        const data = await res.json();
        const teams = data.teams || [];
        
        adminParticipantsList.innerHTML = '';
        
        if (teams.length === 0) {
            adminParticipantsList.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">No hay participantes inscritos.</td></tr>`;
        } else {
            teams.forEach(team => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>
                        <div style="font-weight: 600; color: #fff;">${team.discordUsername}</div>
                        <div style="font-size: 0.75rem; color: #64748b;">ID: ${team.discordId}</div>
                    </td>
                    <td><div style="font-weight: 600;">${team.teamName}</div></td>
                    <td class="text-center">${(team.players || []).length} jugadores</td>
                    <td class="text-right price-text">${formatCurrency(team.balance)}</td>
                    <td class="text-right text-yellow" style="font-weight: 700;">${team.points} pts</td>
                    <td class="text-center">
                        <button class="btn btn-danger btn-xs btn-kick-manager" data-team-id="${team._id}"><i class="fa-solid fa-user-minus"></i> Expulsar</button>
                    </td>
                `;
                
                const kickBtn = row.querySelector('.btn-kick-manager');
                if (kickBtn) {
                    kickBtn.addEventListener('click', () => {
                        handleKickManager(team._id, team.discordUsername);
                    });
                }
                
                adminParticipantsList.appendChild(row);
            });
        }

        // Fetch pending requests
        const adminPendingRequestsCard = document.getElementById('admin-pending-requests-card');
        const adminPendingList = document.getElementById('admin-pending-list');
        
        const pendingRes = await fetch(`/api/fantasy/leagues/${currentLeagueId}/pending`);
        if (!pendingRes.ok) throw new Error('No se pudieron obtener solicitudes pendientes.');
        const pendingData = await pendingRes.json();
        const pending = pendingData.pending || [];
        
        adminPendingList.innerHTML = '';
        
        if (pending.length === 0) {
            adminPendingRequestsCard.style.display = 'none';
        } else {
            adminPendingRequestsCard.style.display = 'block';
            pending.forEach(team => {
                const row = document.createElement('tr');
                const reqDate = team.joinedAt ? new Date(team.joinedAt).toLocaleDateString('es-ES') : 'N/A';
                
                row.innerHTML = `
                    <td>
                        <div style="font-weight: 600; color: #fff;">${team.discordUsername}</div>
                        <div style="font-size: 0.75rem; color: #64748b;">ID: ${team.discordId}</div>
                    </td>
                    <td><div style="font-weight: 600;">${team.teamName}</div></td>
                    <td class="text-center">${reqDate}</td>
                    <td class="text-center">
                        <button class="btn btn-primary btn-xs btn-approve-manager" style="margin-right: 5px;"><i class="fa-solid fa-check"></i> Aprobar</button>
                        <button class="btn btn-danger btn-xs btn-reject-manager"><i class="fa-solid fa-xmark"></i> Rechazar</button>
                    </td>
                `;
                
                row.querySelector('.btn-approve-manager').addEventListener('click', () => {
                    handleApproveRequest(team._id, team.discordUsername);
                });
                
                row.querySelector('.btn-reject-manager').addEventListener('click', () => {
                    handleRejectRequest(team._id, team.discordUsername);
                });
                
                adminPendingList.appendChild(row);
            });
        }
    } catch (e) {
        console.error(e);
        adminParticipantsList.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-red">Error al cargar participantes.</td></tr>`;
    }
}

async function handleApproveRequest(teamId, discordUsername) {
    if (!confirm(`¿Estás seguro de que quieres aprobar e inscribir a ${discordUsername}?`)) return;
    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teamId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al aprobar equipo.');
        showToast(data.message, 'success');
        await loadAdminPanelData();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function handleRejectRequest(teamId, discordUsername) {
    if (!confirm(`¿Estás seguro de que quieres rechazar la solicitud de ${discordUsername}?`)) return;
    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/teams/${teamId}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al rechazar solicitud.');
        showToast('Solicitud rechazada y eliminada.', 'success');
        await loadAdminPanelData();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// Admin Update League settings submit
async function handleUpdateLeagueSubmit(e) {
    e.preventDefault();
    const name = adminLeagueName.value;
    const status = adminLeagueStatus.value;
    const maxParticipants = adminLeagueMaxParts.value;
    
    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, status, maxParticipants })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al actualizar configuración.');
        
        showToast(data.message, 'success');
        
        // Refresh active details locally
        activeLeague.name = name;
        activeLeague.status = status;
        activeLeague.maxParticipants = parseInt(maxParticipants);
        activeLeagueName.textContent = name;
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

// Admin Toggle Market Status
async function handleAdminToggleMarket() {
    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/toggle-market`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al cambiar estado de mercado.');
        
        showToast(data.message, 'success');
        activeLeague.marketOpen = data.marketOpen;
        updateMarketToggleButton(data.marketOpen);
        
        // Toggle market banner
        if (data.marketOpen) {
            marketClosedBanner.style.display = 'none';
        } else {
            marketClosedBanner.style.display = 'flex';
        }
        
        // Refresh market and squad buttons disabled state
        filterAndRenderMarket();
        renderSquadList();
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

function updateMarketToggleButton(isOpen) {
    if (isOpen) {
        btnAdminToggleMarket.className = 'btn btn-sm btn-danger';
        btnAdminToggleMarket.innerHTML = '<i class="fa-solid fa-lock"></i> Cerrar Mercado';
    } else {
        btnAdminToggleMarket.className = 'btn btn-sm btn-success';
        btnAdminToggleMarket.innerHTML = '<i class="fa-solid fa-lock-open"></i> Abrir Mercado';
    }
}

// Admin Recalculate Points
async function handleAdminRecalculate() {
    try {
        btnAdminRecalculate.disabled = true;
        btnAdminRecalculate.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Recalculando...';
        
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/recalculate`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al recalcular.');
        
        showToast(data.message, 'success');
        await loadAdminPanelData();
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    } finally {
        btnAdminRecalculate.disabled = false;
        btnAdminRecalculate.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Recalcular';
    }
}

// Admin Delete League
async function handleAdminDeleteLeague() {
    const confirmText = prompt('ADVERTENCIA: Esta acción es irreversible. Todos los equipos inscritos serán eliminados permanentemente.\n\nEscribe "ELIMINAR" para confirmar:');
    if (confirmText !== 'ELIMINAR') {
        showToast('Cancelado.', 'success');
        return;
    }
    
    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al eliminar liga.');
        
        showToast(data.message, 'success');
        
        // Reset state & selector
        sessionStorage.removeItem('selected_league_id');
        currentLeagueId = null;
        activeLeague = null;
        showLeagueSelector();
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

// Admin Kick Manager
async function handleKickManager(teamId, managerName) {
    const confirmKick = confirm(`¿Estás seguro de que quieres expulsar a "${managerName}" de esta liga?`);
    if (!confirmKick) return;
    
    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/teams/${teamId}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al expulsar.');
        
        showToast(data.message, 'success');
        await loadAdminPanelData();
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
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${msg}</span>`;
    
    container.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 50);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}
