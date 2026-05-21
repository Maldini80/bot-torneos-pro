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
let globalActiveLeagues = [];
let globalAllLeagues = [];
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
let marketListings = [];
let currentFilteredPlayers = [];
let selectedSlotPos = null; 
let selectedSlotIdx = null; 

function matchPositionCategory(lastPosition, filterCategory) {
    if (!lastPosition || !filterCategory) return false;
    const pos = lastPosition.toUpperCase();
    const cat = filterCategory.toUpperCase();
    if (cat === 'POR') return pos === 'POR' || pos === 'GK';
    if (cat === 'DFC') return pos === 'DFC' || pos === 'LD' || pos === 'LI';
    if (cat === 'CARR') return pos === 'CARR' || pos === 'CAD' || pos === 'CAI';
    if (cat === 'MC') return pos === 'MC' || pos === 'MCD' || pos === 'MCO' || pos === 'MD' || pos === 'MI';
    if (cat === 'DC') return pos === 'DC' || pos === 'ED' || pos === 'EI' || pos === 'MP';
    return pos === cat;
}

function isPlayerEligibleForSlot(playerPosition, slotKey) {
    if (!playerPosition || !slotKey) return false;
    const pos = playerPosition.toUpperCase();
    const slot = slotKey.toUpperCase();
    if (matchPositionCategory(pos, slot)) return true;
    const isCarrCategory = pos === 'CARR' || pos === 'CAD' || pos === 'CAI';
    if (isCarrCategory && (slot === 'DFC' || slot === 'MC')) return true;
    return false;
}
 

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
const bidsCountBadge = document.getElementById('bids-count-badge');
const userMarketList = document.getElementById('user-market-list');
const bidsReceivedList = document.getElementById('bids-received-list');
const bidsSentList = document.getElementById('bids-sent-list');

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
const adminLeagueAllowClauses = document.getElementById('admin-league-allow-clauses');
const adminLeagueClauseMultiplier = document.getElementById('admin-league-clause-multiplier');
const adminLeagueInitialBudget = document.getElementById('admin-league-initial-budget');
const btnAdminToggleMarket = document.getElementById('btn-admin-toggle-market');
const btnAdminRecalculate = document.getElementById('btn-admin-recalculate');
const btnAdminDeleteLeague = document.getElementById('btn-admin-delete-league');
const btnAdminRebuildStats = document.getElementById('btn-admin-rebuild-stats');
const rebuildStatsProgress = document.getElementById('rebuild-stats-progress');
const btnOwnerRebuildStats = document.getElementById('btn-owner-rebuild-stats');
const ownerRebuildProgress = document.getElementById('owner-rebuild-progress');
const adminParticipantsList = document.getElementById('admin-participants-list');
const adminSearchPlayerInput = document.getElementById('admin-search-player-input');
const adminSearchPlayerPos = document.getElementById('admin-search-player-pos');
const btnAdminSearchPlayer = document.getElementById('btn-admin-search-player');
const adminSearchPlayerResults = document.getElementById('admin-search-player-results');

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

const clauseModal = document.getElementById('clause-modal');
const clauseForm = document.getElementById('clause-form');
const clausePlayerName = document.getElementById('clause-player-name');
const clauseCurrentVal = document.getElementById('clause-current-val');
const clauseBalanceVal = document.getElementById('clause-balance-val');
const clauseNewAmount = document.getElementById('clause-new-amount');
const clauseCostVal = document.getElementById('clause-cost-val');
const clauseModalCloseBtn = document.getElementById('clause-modal-close-btn');

const listMarketModal = document.getElementById('list-market-modal');
const listMarketForm = document.getElementById('list-market-form');
const listMarketPlayerName = document.getElementById('list-market-player-name');
const listMarketPlayerValue = document.getElementById('list-market-player-value');
const listMarketPrice = document.getElementById('list-market-price');
const listMarketModalCloseBtn = document.getElementById('list-market-modal-close-btn');

const bidModal = document.getElementById('bid-modal');
const bidForm = document.getElementById('bid-form');
const bidPlayerName = document.getElementById('bid-player-name');
const bidSellerTeamVal = document.getElementById('bid-seller-team-val');
const bidAskingPriceVal = document.getElementById('bid-asking-price-val');
const bidBalanceVal = document.getElementById('bid-balance-val');
const bidAmountInput = document.getElementById('bid-amount');
const bidModalCloseBtn = document.getElementById('bid-modal-close-btn');

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
            const selMain = document.querySelector('.selector-main');
            if (selMain) selMain.classList.add('has-admin');
        } else {
            document.querySelectorAll('.admin-only-block').forEach(el => el.style.display = 'none');
            const selMain = document.querySelector('.selector-main');
            if (selMain) selMain.classList.remove('has-admin');
        }
        // Owner-only elements (rebuild stats, etc.) - only visible for the owner, not referees
        if (currentUser.isOwner) {
            document.querySelectorAll('.owner-only-block').forEach(el => el.style.display = 'block');
            await checkActiveRebuild();
        } else {
            document.querySelectorAll('.owner-only-block').forEach(el => el.style.display = 'none');
        }

        // Load admin league configuration if user is admin
        if (currentUser.isAdmin) {
            await loadAdminLeaguesConfig();
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

    // Market Subtabs
    const marketSubBtns = document.querySelectorAll('.market-sub-btn');
    marketSubBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            marketSubBtns.forEach(b => {
                b.classList.remove('active', 'btn-primary');
                b.classList.add('btn-secondary');
                b.style.background = '#334155';
            });
            btn.classList.remove('btn-secondary');
            btn.classList.add('active', 'btn-primary');
            btn.style.background = '';
            
            const subTab = btn.getAttribute('data-sub-tab');
            document.querySelectorAll('.market-sub-content-pane').forEach(p => p.style.display = 'none');
            document.getElementById(`sub-${subTab}`).style.display = 'block';
            
            if (subTab === 'user-market') {
                loadUserMarket();
            } else if (subTab === 'bids-market') {
                loadMarketBids();
            }
        });
    });

    // Modals Close handlers
    modalCloseBtn.addEventListener('click', () => positionModal.classList.remove('open'));
    joinModalCloseBtn.addEventListener('click', () => joinLeagueModal.classList.remove('open'));
    rivalModalCloseBtn.addEventListener('click', () => rivalTeamModal.classList.remove('open'));
    clauseModalCloseBtn.addEventListener('click', () => clauseModal.classList.remove('open'));
    listMarketModalCloseBtn.addEventListener('click', () => listMarketModal.classList.remove('open'));
    bidModalCloseBtn.addEventListener('click', () => bidModal.classList.remove('open'));
    
    window.addEventListener('click', (e) => {
        if (e.target === positionModal) positionModal.classList.remove('open');
        if (e.target === joinLeagueModal) joinLeagueModal.classList.remove('open');
        if (e.target === rivalTeamModal) rivalTeamModal.classList.remove('open');
        if (e.target === clauseModal) clauseModal.classList.remove('open');
        if (e.target === listMarketModal) listMarketModal.classList.remove('open');
        if (e.target === bidModal) bidModal.classList.remove('open');
    });

    // Clause cost input calculator
    clauseNewAmount.addEventListener('input', () => {
        const currentVal = parseInt(clauseNewAmount.getAttribute('data-current-val') || 0);
        const newVal = parseInt(clauseNewAmount.value || 0);
        const diff = newVal - currentVal;
        if (diff > 0) {
            clauseCostVal.textContent = diff.toLocaleString('es-ES') + ' €';
            clauseCostVal.className = 'text-red';
        } else {
            clauseCostVal.textContent = '0 € (Debe ser mayor)';
            clauseCostVal.className = 'text-muted';
        }
    });

    // Form handlers
    createLeagueForm.addEventListener('submit', handleCreateLeague);
    joinLeagueForm.addEventListener('submit', handleJoinLeagueSubmit);
    adminUpdateLeagueForm.addEventListener('submit', handleUpdateLeagueSubmit);
    clauseForm.addEventListener('submit', handleClauseSubmit);
    listMarketForm.addEventListener('submit', handleListMarketSubmit);
    bidForm.addEventListener('submit', handleBidSubmit);
    
    // Quick admin buttons
    btnAdminToggleMarket.addEventListener('click', handleAdminToggleMarket);
    btnAdminRecalculate.addEventListener('click', handleAdminRecalculate);
    btnAdminDeleteLeague.addEventListener('click', handleAdminDeleteLeague);
    if (btnAdminRebuildStats) btnAdminRebuildStats.addEventListener('click', () => executeRebuildStats(btnAdminRebuildStats, rebuildStatsProgress));
    if (btnOwnerRebuildStats) btnOwnerRebuildStats.addEventListener('click', () => executeRebuildStats(btnOwnerRebuildStats, ownerRebuildProgress));

    // Admin player price override handlers
    if (btnAdminSearchPlayer) {
        btnAdminSearchPlayer.addEventListener('click', handleAdminPlayerSearch);
    }
    if (adminSearchPlayerPos) {
        adminSearchPlayerPos.addEventListener('change', handleAdminPlayerSearch);
    }
    if (adminSearchPlayerInput) {
        adminSearchPlayerInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                handleAdminPlayerSearch();
            }
        });
    }

    // Owner Add League click
    const btnOwnerAddLeague = document.getElementById('btn-owner-add-league');
    if (btnOwnerAddLeague) {
        btnOwnerAddLeague.addEventListener('click', async () => {
            const selectEl = document.getElementById('owner-available-leagues-select');
            const customInput = document.getElementById('owner-custom-league-slug');
            let slug = selectEl.value;
            if (customInput && customInput.value.trim()) {
                slug = customInput.value.trim();
            }

            if (!slug) {
                showToast('Por favor, selecciona una liga o introduce un slug.', 'error');
                return;
            }

            // Check if already active
            if (globalActiveLeagues.includes(slug)) {
                showToast('Esta liga ya está habilitada.', 'info');
                return;
            }

            const newActive = [...globalActiveLeagues, slug];
            await updateActiveLeagues(newActive);
            if (customInput) customInput.value = '';
        });
    }
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

    // Collect VPG leagues
    const checkboxes = document.querySelectorAll('#new-league-vpg-checkboxes input[type="checkbox"]:checked');
    const vpgLeagues = Array.from(checkboxes).map(cb => cb.value);
    
    try {
        const res = await fetch('/api/fantasy/leagues', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, maxParticipants, initialBudget, vpgLeagues })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al crear la liga.');
        
        showToast(data.message, 'success');
        createLeagueForm.reset();
        // Reset checkboxes to checked by default
        document.querySelectorAll('#new-league-vpg-checkboxes input[type="checkbox"]').forEach(cb => cb.checked = true);
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
        const playersRes = await fetch(`/api/fantasy/players?leagueId=${leagueId}`);
        if (!playersRes.ok) throw new Error('No se pudieron obtener los jugadores.');
        const playersData = await playersRes.json();
        allPlayers = playersData.players || [];
        
        // Fetch active listings
        try {
            const listingsRes = await fetch(`/api/fantasy/leagues/${leagueId}/market/listings`);
            if (listingsRes.ok) {
                marketListings = await listingsRes.json();
            }
        } catch (e) {
            console.error('Error fetching market listings:', e);
            marketListings = [];
        }

        // Fetch active bids to update badge
        try {
            const bidsRes = await fetch(`/api/fantasy/leagues/${leagueId}/market/bids`);
            if (bidsRes.ok) {
                const bidsData = await bidsRes.json();
                const receivedPending = bidsData.received || [];
                if (receivedPending.length > 0) {
                    bidsCountBadge.textContent = receivedPending.length;
                    bidsCountBadge.style.display = 'inline-block';
                } else {
                    bidsCountBadge.style.display = 'none';
                }
            }
        } catch (e) {
            console.error('Error fetching bids:', e);
        }
        
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
        const matchesPos = !posVal || matchPositionCategory(p.lastPosition, posVal);
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
        
        let priceCol = `<span style="font-weight: 600;">${formatCurrency(p.price)}</span>`;
        let actionCol = '';

        if (isOwned) {
            actionCol = `<button class="btn btn-secondary btn-xs" disabled><i class="fa-solid fa-check"></i> En tu equipo</button>`;
        } else if (p.owner) {
            const clauseVal = p.clause || Math.round(p.price * (activeLeague?.clauseMultiplier || 1.5));
            priceCol = `
                <div style="font-size: 0.8rem; color: #64748b; text-decoration: line-through;">${formatCurrency(p.price)}</div>
                <div class="text-yellow" style="font-weight: 700;">${formatCurrency(clauseVal)}</div>
            `;
            if (activeLeague && activeLeague.allowClauses !== false) {
                actionCol = `<button class="btn btn-warning btn-xs btn-clausulazo" data-name="${p.eaPlayerName}" data-clause="${clauseVal}" data-owner="${p.owner}" ${!activeLeague.marketOpen ? 'disabled' : ''}><i class="fa-solid fa-bolt"></i> Clausulazo</button>`;
            } else {
                actionCol = `<span class="badge badge-info text-xs" style="font-size: 0.75rem; border: none; padding: 4px 8px; border-radius: 4px; display: inline-block;"><i class="fa-solid fa-user-lock"></i> ${p.owner}</span>`;
            }
        } else {
            actionCol = `<button class="btn btn-success btn-xs btn-buy" data-name="${p.eaPlayerName}" ${activeLeague && !activeLeague.marketOpen ? 'disabled' : ''}><i class="fa-solid fa-plus"></i> Fichar</button>`;
        }

        row.innerHTML = `
            <td>
                <div style="font-weight: 700; color: #f8fafc;">${p.eaPlayerName}</div>
            </td>
            <td class="text-muted col-hide-md">${p.lastClub}</td>
            <td><span class="position-badge pos-${p.lastPosition.toLowerCase()}">${p.lastPosition}</span></td>
            <td class="text-center col-hide-sm" style="font-weight: 600;">${p.avgRating.toFixed(2)}</td>
            <td class="text-center text-yellow" style="font-weight: 700;">${p.points}</td>
            <td class="text-right price-text">${priceCol}</td>
            <td class="text-center">
                ${actionCol}
            </td>
        `;

        const buyBtn = row.querySelector('.btn-buy');
        if (buyBtn && activeLeague && activeLeague.marketOpen) {
            buyBtn.addEventListener('click', () => buyPlayer(p));
        }

        const clausulazoBtn = row.querySelector('.btn-clausulazo');
        if (clausulazoBtn && activeLeague && activeLeague.marketOpen) {
            const clauseVal = p.clause || Math.round(p.price * (activeLeague?.clauseMultiplier || 1.5));
            clausulazoBtn.addEventListener('click', () => executeClausulazo(p, clauseVal));
        }

        marketList.appendChild(row);
    });
}

// Render owned squad list
function renderSquadList() {
    squadList.innerHTML = '';
    
    if (!myTeam.players || myTeam.players.length === 0) {
        squadList.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">No tienes jugadores. Ficha en el Mercado.</td></tr>`;
        return;
    }

    myTeam.players.forEach(playerName => {
        const p = allPlayers.find(x => x.eaPlayerName === playerName);
        if (!p) return;

        const isAligned = isPlayerInLineup(playerName);
        const row = document.createElement('tr');

        const playerClause = myTeam.clauses?.[playerName] || Math.round(p.price * (activeLeague?.clauseMultiplier || 1.5));
        const isListed = (marketListings || []).some(l => l.eaPlayerName === playerName);

        row.innerHTML = `
            <td><div style="font-weight: 700; color: #f8fafc;">${p.eaPlayerName}</div></td>
            <td class="text-muted col-hide-md">${p.lastClub}</td>
            <td><span class="position-badge pos-${p.lastPosition.toLowerCase()}">${p.lastPosition}</span></td>
            <td class="text-center col-hide-sm" style="font-weight: 600;">${p.avgRating.toFixed(2)}</td>
            <td class="text-center">
                <span class="badge ${isAligned ? 'btn-success' : 'text-muted'}" style="border: none;">
                    ${isAligned ? 'Alineado' : 'Banquillo'}
                </span>
            </td>
            <td class="text-right price-text text-yellow" style="font-weight: 700;">${formatCurrency(playerClause)}</td>
            <td class="text-right price-text">${formatCurrency(p.price)}</td>
            <td class="text-center">
                <div style="display: flex; gap: 4px; justify-content: center;">
                    <button class="btn btn-danger btn-xs btn-sell" data-name="${p.eaPlayerName}" ${activeLeague && !activeLeague.marketOpen ? 'disabled' : ''}><i class="fa-solid fa-dollar-sign"></i> Vender (80%)</button>
                    <button class="btn btn-warning btn-xs btn-clause" data-name="${p.eaPlayerName}" ${activeLeague && (!activeLeague.allowClauses || !activeLeague.marketOpen) ? 'disabled' : ''}><i class="fa-solid fa-arrow-trend-up"></i> Cláusula</button>
                    ${isListed 
                        ? `<button class="btn btn-secondary btn-xs btn-unlist" data-name="${p.eaPlayerName}" ${activeLeague && !activeLeague.marketOpen ? 'disabled' : ''}><i class="fa-solid fa-minus"></i> Quitar Venta</button>`
                        : `<button class="btn btn-info btn-xs btn-list" data-name="${p.eaPlayerName}" ${activeLeague && !activeLeague.marketOpen ? 'disabled' : ''}><i class="fa-solid fa-tag"></i> Vender en Mercado</button>`
                    }
                </div>
            </td>
        `;

        const sellBtn = row.querySelector('.btn-sell');
        if (sellBtn && activeLeague && activeLeague.marketOpen) {
            sellBtn.addEventListener('click', () => sellPlayer(p));
        }

        const clauseBtn = row.querySelector('.btn-clause');
        if (clauseBtn && activeLeague && activeLeague.allowClauses !== false && activeLeague.marketOpen) {
            clauseBtn.addEventListener('click', () => openClauseModal(p, playerClause));
        }

        const listBtn = row.querySelector('.btn-list');
        if (listBtn && activeLeague && activeLeague.marketOpen) {
            listBtn.addEventListener('click', () => openListMarketModal(p));
        }

        const unlistBtn = row.querySelector('.btn-unlist');
        if (unlistBtn && activeLeague && activeLeague.marketOpen) {
            unlistBtn.addEventListener('click', () => handleUnlistMarket(p.eaPlayerName));
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
        if (!p) return false;
        return isPlayerEligibleForSlot(p.lastPosition, posKey);
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

    if (!confirm(`¿Estás seguro de que deseas fichar a ${player.eaPlayerName} como agente libre por ${formatCurrency(player.price)}?`)) {
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
        await enterLeague(currentLeagueId);
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

// Sell Player Operation
async function sellPlayer(player) {
    const saleReimbursement = Math.round(player.price * 0.8);
    if (!confirm(`¿Estás seguro de que deseas vender a ${player.eaPlayerName} a la máquina por el 80% de su valor (${formatCurrency(saleReimbursement)})?`)) {
        return;
    }

    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/sell`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eaPlayerName: player.eaPlayerName })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al vender jugador.');

        showToast(data.message, 'success');
        await enterLeague(currentLeagueId);
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
                <td class="text-center font-weight-bold col-hide-sm" style="font-weight: 600;">${manager.playerCount} / 15</td>
                <td class="text-center text-muted col-hide-md">${manager.formation || '4-3-3'}</td>
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
    adminLeagueAllowClauses.value = activeLeague.allowClauses !== false ? 'true' : 'false';
    adminLeagueClauseMultiplier.value = activeLeague.clauseMultiplier || 1.5;
    adminLeagueInitialBudget.value = activeLeague.initialBudget || 50000000;
    
    // Render/check checkboxes for permitted VPG leagues
    renderAdminLeaguesCheckboxes();
    
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
                        <div style="display: flex; gap: 4px; justify-content: center;">
                            <button class="btn btn-warning btn-xs btn-adjust-budget" data-team-id="${team._id}"><i class="fa-solid fa-coins"></i> Presupuesto</button>
                            <button class="btn btn-danger btn-xs btn-kick-manager" data-team-id="${team._id}"><i class="fa-solid fa-user-minus"></i> Expulsar</button>
                        </div>
                    </td>
                `;
                
                const adjustBtn = row.querySelector('.btn-adjust-budget');
                if (adjustBtn) {
                    adjustBtn.addEventListener('click', () => {
                        handleAdjustBudget(team._id, team.discordUsername, team.balance);
                    });
                }
                
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
    const allowClauses = adminLeagueAllowClauses.value === 'true';
    const clauseMultiplier = parseFloat(adminLeagueClauseMultiplier.value);
    const initialBudget = parseInt(adminLeagueInitialBudget.value);
    
    // Collect selected VPG leagues
    const checkboxes = document.querySelectorAll('#admin-league-vpg-checkboxes input[type="checkbox"]:checked');
    const vpgLeagues = Array.from(checkboxes).map(cb => cb.value);

    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, status, maxParticipants, allowClauses, clauseMultiplier, initialBudget, vpgLeagues })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al actualizar configuración.');
        
        showToast(data.message, 'success');
        
        // Refresh active details locally
        activeLeague.name = name;
        activeLeague.status = status;
        activeLeague.maxParticipants = parseInt(maxParticipants);
        activeLeague.allowClauses = allowClauses;
        activeLeague.clauseMultiplier = clauseMultiplier;
        activeLeague.initialBudget = initialBudget;
        activeLeague.vpgLeagues = vpgLeagues;
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
}// Admin Rebuild Stats
let rebuildPollInterval = null;

async function checkActiveRebuild() {
    if (!currentUser || !currentUser.isOwner) return;
    try {
        const res = await fetch('/api/fantasy/admin/rebuild-stats/status');
        if (!res.ok) return;
        const status = await res.json();
        if (status && status.running) {
            // Sync is running! Set up UI for both possible triggers
            const startPolling = (btn, prog) => {
                if (btn) {
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sincronizando...';
                }
                if (prog) {
                    prog.style.display = 'block';
                    prog.textContent = status.progress || 'Sincronizando...';
                }
            };
            
            startPolling(btnOwnerRebuildStats, ownerRebuildProgress);
            startPolling(btnAdminRebuildStats, rebuildStatsProgress);
            
            if (rebuildPollInterval) clearInterval(rebuildPollInterval);
            rebuildPollInterval = setInterval(async () => {
                try {
                    const statusRes = await fetch('/api/fantasy/admin/rebuild-stats/status');
                    const currentStatus = await statusRes.json();
                    
                    if (ownerRebuildProgress) ownerRebuildProgress.textContent = currentStatus.progress || 'Sincronizando...';
                    if (rebuildStatsProgress) rebuildStatsProgress.textContent = currentStatus.progress || 'Sincronizando...';
                    
                    if (!currentStatus.running) {
                        clearInterval(rebuildPollInterval);
                        rebuildPollInterval = null;
                        
                        const finishPolling = (btn) => {
                            if (btn) {
                                btn.disabled = false;
                                btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Sincronizar';
                            }
                        };
                        finishPolling(btnOwnerRebuildStats);
                        finishPolling(btnAdminRebuildStats);
                        
                        if (currentStatus.error) {
                            showToast(`Error en la sincronización: ${currentStatus.error}`, 'error');
                        } else {
                            showToast('¡Sincronización de estadísticas completada!', 'success');
                            if (currentLeagueId) {
                                await loadAdminPanelData();
                            }
                        }
                    }
                } catch (e) {
                    console.error('Error polling rebuild status:', e);
                }
            }, 5000);
        }
    } catch (e) {
        console.error('Error checking active rebuild status:', e);
    }
}

async function executeRebuildStats(btnEl, progressEl) {
    if (!btnEl || !progressEl) return;
    const confirmText = prompt('ADVERTENCIA: Esta acción iniciará la sincronización inmediata de clasificaciones, leaderboards y jugadores desde la API oficial de VPG España para las ligas habilitadas. El proceso tarda menos de 1 minuto.\n\nEscribe "SINCRONIZAR" para confirmar:');
    if (confirmText !== 'SINCRONIZAR') {
        showToast('Acción cancelada.', 'info');
        return;
    }

    try {
        btnEl.disabled = true;
        btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Iniciando...';
        progressEl.style.display = 'block';
        progressEl.textContent = 'Conectando...';

        const res = await fetch('/api/fantasy/admin/rebuild-stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al iniciar la sincronización.');

        showToast(data.message, 'success');

        // Start polling for progress on both elements
        if (rebuildPollInterval) clearInterval(rebuildPollInterval);
        
        const setInitialProcessing = (btn, prog) => {
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sincronizando...';
            }
            if (prog) {
                prog.style.display = 'block';
                prog.textContent = 'Sincronizando...';
            }
        };
        setInitialProcessing(btnOwnerRebuildStats, ownerRebuildProgress);
        setInitialProcessing(btnAdminRebuildStats, rebuildStatsProgress);

        rebuildPollInterval = setInterval(async () => {
            try {
                const statusRes = await fetch('/api/fantasy/admin/rebuild-stats/status');
                const status = await statusRes.json();
                
                if (ownerRebuildProgress) ownerRebuildProgress.textContent = status.progress || 'Sincronizando...';
                if (rebuildStatsProgress) rebuildStatsProgress.textContent = status.progress || 'Sincronizando...';

                if (!status.running) {
                    clearInterval(rebuildPollInterval);
                    rebuildPollInterval = null;
                    
                    const finishPolling = (btn) => {
                        if (btn) {
                            btn.disabled = false;
                            btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Sincronizar';
                        }
                    };
                    finishPolling(btnOwnerRebuildStats);
                    finishPolling(btnAdminRebuildStats);

                    if (status.error) {
                        showToast(`Error en la sincronización: ${status.error}`, 'error');
                    } else {
                        showToast('¡Sincronización de estadísticas completada!', 'success');
                        if (currentLeagueId) {
                            await loadAdminPanelData();
                        }
                    }
                }
            } catch (e) {
                console.error('Error polling rebuild status:', e);
            }
        }, 5000);
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
        if (btnOwnerRebuildStats) {
            btnOwnerRebuildStats.disabled = false;
            btnOwnerRebuildStats.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Sincronizar';
        }
        if (btnAdminRebuildStats) {
            btnAdminRebuildStats.disabled = false;
            btnAdminRebuildStats.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Sincronizar';
        }
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

// Admin Adjust Manager Budget
async function handleAdjustBudget(teamId, managerName, currentBalance) {
    const input = prompt(
        `Ajustar presupuesto de "${managerName}" (Saldo actual: ${formatCurrency(currentBalance)}):\n\n` +
        `- Introduce una cantidad con "+" o "-" para sumar/restar (ej: +5000000 o -2500000).\n` +
        `- Introduce un valor sin signo para establecerlo de forma fija (ej: 40000000).`
    );
    if (input === null) return;

    let cleanInput = input.trim();
    let action = 'set';
    let amount = 0;

    if (cleanInput.startsWith('+') || cleanInput.startsWith('-')) {
        action = 'add';
        amount = parseInt(cleanInput);
    } else {
        action = 'set';
        amount = parseInt(cleanInput);
    }

    if (isNaN(amount)) {
        showToast('Por favor, introduce un número válido.', 'error');
        return;
    }

    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/teams/${teamId}/budget`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, action })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al ajustar presupuesto.');

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

// --- MARKET ADVANCED OPERATIONS ---

async function executeClausulazo(player, clauseAmount) {
    if (myTeam.balance < clauseAmount) {
        showToast('Saldo insuficiente para ejecutar el clausulazo.', 'error');
        return;
    }

    if (!confirm(`¿Estás seguro de que deseas ejecutar el clausulazo de ${player.eaPlayerName} por ${formatCurrency(clauseAmount)}?\nSe transferirá esta cantidad a ${player.owner} y el jugador pasará a formar parte de tu plantilla.`)) {
        return;
    }

    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/buy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eaPlayerName: player.eaPlayerName })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al ejecutar el clausulazo.');

        showToast(data.message, 'success');
        await enterLeague(currentLeagueId);
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

function openClauseModal(player, currentClause) {
    clausePlayerName.textContent = player.eaPlayerName;
    clauseCurrentVal.textContent = formatCurrency(currentClause);
    clauseBalanceVal.textContent = formatCurrency(myTeam.balance);
    clauseNewAmount.value = currentClause + 500000;
    clauseNewAmount.setAttribute('data-current-val', currentClause);
    clauseNewAmount.min = currentClause + 1;
    clauseCostVal.textContent = '500.000 €';
    clauseCostVal.className = 'text-red';
    clauseForm.setAttribute('data-player-name', player.eaPlayerName);
    clauseModal.classList.add('open');
}

async function handleClauseSubmit(e) {
    e.preventDefault();
    const playerName = clauseForm.getAttribute('data-player-name');
    const newClause = parseInt(clauseNewAmount.value);
    const currentClause = parseInt(clauseNewAmount.getAttribute('data-current-val'));
    const cost = newClause - currentClause;

    if (newClause <= currentClause) {
        showToast('La nueva cláusula debe ser superior a la actual.', 'error');
        return;
    }
    if (myTeam.balance < cost) {
        showToast('No tienes suficiente saldo para subir la cláusula.', 'error');
        return;
    }

    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/players/${playerName}/clause`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newClauseValue: newClause })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al subir la cláusula.');

        showToast(data.message, 'success');
        clauseModal.classList.remove('open');
        await enterLeague(currentLeagueId);
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

function openListMarketModal(player) {
    listMarketPlayerName.textContent = player.eaPlayerName;
    listMarketPlayerValue.textContent = formatCurrency(player.price);
    listMarketPrice.value = player.price;
    listMarketForm.setAttribute('data-player-name', player.eaPlayerName);
    listMarketModal.classList.add('open');
}

async function handleListMarketSubmit(e) {
    e.preventDefault();
    const playerName = listMarketForm.getAttribute('data-player-name');
    const price = parseInt(listMarketPrice.value);

    if (price <= 0) {
        showToast('El precio debe ser superior a 0.', 'error');
        return;
    }

    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/market/list`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eaPlayerName: playerName, askingPrice: price })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al listar jugador.');

        showToast(data.message, 'success');
        listMarketModal.classList.remove('open');
        await enterLeague(currentLeagueId);
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

async function handleUnlistMarket(playerName) {
    if (!confirm(`¿Estás seguro de que deseas retirar a ${playerName} del mercado de transferibles?`)) {
        return;
    }

    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/market/unlist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eaPlayerName: playerName })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al retirar jugador.');

        showToast(data.message, 'success');
        await enterLeague(currentLeagueId);
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

async function handleBidSubmit(e) {
    e.preventDefault();
    const playerName = bidForm.getAttribute('data-player-name');
    const amount = parseInt(bidAmountInput.value);

    if (amount <= 0) {
        showToast('El precio ofertado debe ser mayor que 0.', 'error');
        return;
    }
    if (myTeam.balance < amount) {
        showToast('Saldo insuficiente para enviar esta puja.', 'error');
        return;
    }

    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/market/bid`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eaPlayerName: playerName, bidAmount: amount })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al enviar puja.');

        showToast(data.message, 'success');
        bidModal.classList.remove('open');
        await loadUserMarket(); // Refresh listed users
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

async function loadUserMarket() {
    userMarketList.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Cargando transferibles...</td></tr>`;
    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/market/listings`);
        if (!res.ok) throw new Error('No se pudieron obtener los transferibles.');
        const listings = await res.json();
        marketListings = listings;

        userMarketList.innerHTML = '';
        const othersListings = listings.filter(l => !l.isMine);

        if (othersListings.length === 0) {
            userMarketList.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">No hay jugadores transferibles de otros managers en este momento.</td></tr>`;
            return;
        }

        othersListings.forEach(l => {
            const p = l.playerInfo;
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <div style="font-weight: 700; color: #f8fafc;">${l.eaPlayerName}</div>
                </td>
                <td>${l.sellerTeamName}</td>
                <td><span class="position-badge pos-${p.lastPosition.toLowerCase()}">${p.lastPosition}</span></td>
                <td class="text-right price-text">${formatCurrency(p.price)}</td>
                <td class="text-right price-text text-yellow" style="font-weight: 700;">${formatCurrency(l.askingPrice)}</td>
                <td class="text-center">
                    <button class="btn btn-warning btn-xs btn-open-bid" data-name="${l.eaPlayerName}" data-seller="${l.sellerTeamName}" data-asking="${l.askingPrice}" data-value="${p.price}" ${activeLeague && !activeLeague.marketOpen ? 'disabled' : ''}><i class="fa-solid fa-gavel"></i> Pujar</button>
                </td>
            `;

            row.querySelector('.btn-open-bid').addEventListener('click', () => {
                bidPlayerName.textContent = l.eaPlayerName;
                bidSellerTeamVal.textContent = l.sellerTeamName;
                bidAskingPriceVal.textContent = formatCurrency(l.askingPrice);
                bidBalanceVal.textContent = formatCurrency(myTeam.balance);
                bidAmountInput.value = l.askingPrice;
                bidForm.setAttribute('data-player-name', l.eaPlayerName);
                bidModal.classList.add('open');
            });

            userMarketList.appendChild(row);
        });
    } catch (e) {
        console.error(e);
        userMarketList.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-red">${e.message}</td></tr>`;
    }
}

async function loadMarketBids() {
    bidsReceivedList.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Cargando ofertas...</td></tr>`;
    bidsSentList.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Cargando ofertas...</td></tr>`;
    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/market/bids`);
        if (!res.ok) throw new Error('No se pudieron obtener las ofertas.');
        const { received, sent } = await res.json();

        // Update badge count
        if (received.length > 0) {
            bidsCountBadge.textContent = received.length;
            bidsCountBadge.style.display = 'inline-block';
        } else {
            bidsCountBadge.style.display = 'none';
        }

        // Render Received
        bidsReceivedList.innerHTML = '';
        if (received.length === 0) {
            bidsReceivedList.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-muted">No has recibido ofertas todavía.</td></tr>`;
        } else {
            received.forEach(b => {
                const p = b.playerInfo;
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>
                        <div style="font-weight: 700; color: #f8fafc;">${b.eaPlayerName}</div>
                    </td>
                    <td>${b.bidderTeamName}</td>
                    <td class="text-right price-text">${formatCurrency(p.price)}</td>
                    <td class="text-right price-text text-yellow" style="font-weight: 700;">${formatCurrency(b.bidAmount)}</td>
                    <td class="text-center">
                        <button class="btn btn-success btn-xs btn-accept-bid" data-id="${b._id}" style="margin-right: 4px;"><i class="fa-solid fa-check"></i> Aceptar</button>
                        <button class="btn btn-danger btn-xs btn-reject-bid" data-id="${b._id}"><i class="fa-solid fa-xmark"></i> Rechazar</button>
                    </td>
                `;

                row.querySelector('.btn-accept-bid').addEventListener('click', () => respondBid(b._id, 'accept'));
                row.querySelector('.btn-reject-bid').addEventListener('click', () => respondBid(b._id, 'reject'));
                bidsReceivedList.appendChild(row);
            });
        }

        // Render Sent
        bidsSentList.innerHTML = '';
        if (sent.length === 0) {
            bidsSentList.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-muted">No has enviado ofertas todavía.</td></tr>`;
        } else {
            sent.forEach(b => {
                const p = b.playerInfo;
                const row = document.createElement('tr');
                let statusBadge = '';
                if (b.status === 'pending') {
                    statusBadge = `<span class="badge" style="background: #eab308; color: #1e293b; border: none; font-size: 0.75rem; border-radius: 4px; padding: 2px 6px;">Pendiente</span>`;
                } else if (b.status === 'accepted') {
                    statusBadge = `<span class="badge" style="background: #22c55e; color: #ffffff; border: none; font-size: 0.75rem; border-radius: 4px; padding: 2px 6px;">Aceptada</span>`;
                } else if (b.status === 'rejected') {
                    statusBadge = `<span class="badge" style="background: #ef4444; color: #ffffff; border: none; font-size: 0.75rem; border-radius: 4px; padding: 2px 6px;">Rechazada</span>`;
                }

                row.innerHTML = `
                    <td>
                        <div style="font-weight: 700; color: #f8fafc;">${b.eaPlayerName}</div>
                    </td>
                    <td>${b.sellerTeamName}</td>
                    <td class="text-right price-text">${formatCurrency(p.price)}</td>
                    <td class="text-right price-text text-blue" style="font-weight: 700;">${formatCurrency(b.bidAmount)}</td>
                    <td class="text-center">${statusBadge}</td>
                `;
                bidsSentList.appendChild(row);
            });
        }
    } catch (e) {
        console.error(e);
        bidsReceivedList.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-red">${e.message}</td></tr>`;
    }
}

async function respondBid(bidId, responseType) {
    const actionText = responseType === 'accept' ? 'aceptar' : 'rechazar';
    if (!confirm(`¿Estás seguro de que quieres ${actionText} esta oferta?`)) return;

    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/market/bids/${bidId}/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ response: responseType })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al responder a la puja.');

        showToast(data.message, 'success');
        await enterLeague(currentLeagueId);
        await loadMarketBids();
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

async function handleAdminPlayerSearch() {
    const query = adminSearchPlayerInput.value.trim();
    const position = adminSearchPlayerPos ? adminSearchPlayerPos.value : '';
    
    if (query.length < 2 && !position) {
        alert('Por favor, introduce al menos 2 letras o selecciona una posición.');
        return;
    }
    
    adminSearchPlayerResults.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Buscando jugadores...</td></tr>`;
    
    try {
        let url = `/api/fantasy/admin/players/search?query=${encodeURIComponent(query)}`;
        if (position) {
            url += `&position=${encodeURIComponent(position)}`;
        }
        const res = await fetch(url);
        if (!res.ok) throw new Error('Error al buscar jugadores.');
        const players = await res.json();
        
        adminSearchPlayerResults.innerHTML = '';
        
        if (players.length === 0) {
            adminSearchPlayerResults.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No se encontraron jugadores que coincidan con la búsqueda.</td></tr>`;
            return;
        }
        
        players.forEach(p => {
            const row = document.createElement('tr');
            const isManual = p.manualPrice !== null;
            const priceText = formatCurrency(p.price);
            
            row.innerHTML = `
                <td>
                    <div style="font-weight: 600; color: #fff;">${p.eaPlayerName}</div>
                </td>
                <td><div>${p.lastClub}</div></td>
                <td><span class="badge position-badge">${p.lastPosition}</span></td>
                <td class="text-center">${p.avgRating}</td>
                <td class="text-right ${isManual ? 'text-yellow' : 'price-text'}" style="font-weight: 600;">
                    ${priceText} ${isManual ? '<i class="fa-solid fa-hand-holding-dollar" title="Precio manual establecido"></i>' : ''}
                </td>
                <td class="text-center">
                    <input type="number" class="manual-price-input" data-player-name="${p.eaPlayerName}" value="${p.manualPrice !== null ? p.manualPrice : ''}" placeholder="Ej. 1500000" style="background: #1e293b; border: 1px solid #475569; color: #fff; border-radius: 4px; padding: 4px 8px; width: 120px; box-sizing: border-box;">
                </td>
                <td class="text-center">
                    <div style="display: flex; gap: 4px; justify-content: center;">
                        <button class="btn btn-primary btn-xs btn-save-manual-price" data-player-name="${p.eaPlayerName}"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
                        ${isManual ? `<button class="btn btn-secondary btn-xs btn-reset-manual-price" data-player-name="${p.eaPlayerName}"><i class="fa-solid fa-rotate-left"></i> Restablecer</button>` : ''}
                    </div>
                </td>
            `;
            
            const saveBtn = row.querySelector('.btn-save-manual-price');
            saveBtn.addEventListener('click', async () => {
                const input = row.querySelector('.manual-price-input');
                const priceVal = input.value.trim();
                if (priceVal === '') {
                    alert('Por favor, introduce un precio válido o usa Restablecer para volver a automático.');
                    return;
                }
                await handleUpdatePlayerPrice(p.eaPlayerName, priceVal);
            });
            
            if (isManual) {
                const resetBtn = row.querySelector('.btn-reset-manual-price');
                resetBtn.addEventListener('click', async () => {
                    await handleUpdatePlayerPrice(p.eaPlayerName, null);
                });
            }
            
            adminSearchPlayerResults.appendChild(row);
        });
    } catch (e) {
        console.error(e);
        adminSearchPlayerResults.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-red">Error al realizar la búsqueda.</td></tr>`;
    }
}

async function handleUpdatePlayerPrice(eaPlayerName, price) {
    try {
        const res = await fetch('/api/fantasy/admin/players/price', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eaPlayerName, price })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al guardar precio manual.');
        
        // Mostrar mensaje de éxito
        alert(data.message || 'Precio actualizado correctamente.');
        
        // Volver a buscar para reflejar el estado actual
        await handleAdminPlayerSearch();
        
        // Refrescar los jugadores y el mercado si está cargada una liga
        if (currentLeagueId) {
            const playersRes = await fetch(`/api/fantasy/players?leagueId=\${currentLeagueId}`);
            if (playersRes.ok) {
                const playersData = await playersRes.json();
                allPlayers = playersData.players || [];
                filterAndRenderMarket();
                renderSquadList();
                updateSquadStats();
            }
        }
    } catch (e) {
        console.error(e);
        alert('Error: ' + e.message);
    }
}

async function loadAdminLeaguesConfig() {
    if (!currentUser || !currentUser.isAdmin) return;
    try {
        const res = await fetch('/api/fantasy/admin/config/leagues');
        if (!res.ok) throw new Error('Error al cargar la configuración de ligas.');
        const { activeLeagues, allLeagues } = await res.json();
        globalActiveLeagues = activeLeagues || [];
        globalAllLeagues = allLeagues || [];
        renderAdminLeaguesCheckboxes();

        if (currentUser.isOwner) {
            const selectEl = document.getElementById('owner-available-leagues-select');
            if (selectEl) {
                selectEl.innerHTML = '<option value="">-- Seleccionar liga VPG --</option>';
                allLeagues.forEach(league => {
                    if (!globalActiveLeagues.includes(league.slug)) {
                        const opt = document.createElement('option');
                        opt.value = league.slug;
                        opt.textContent = `${league.title} (${league.slug})`;
                        selectEl.appendChild(opt);
                    }
                });
            }
            const chipsEl = document.getElementById('owner-active-leagues-chips');
            if (chipsEl) {
                chipsEl.innerHTML = '';
                if (globalActiveLeagues.length === 0) {
                    chipsEl.innerHTML = '<span class="text-muted" style="font-size: 0.8rem;">No hay ligas habilitadas.</span>';
                } else {
                    globalActiveLeagues.forEach(slug => {
                        const matched = allLeagues.find(l => l.slug === slug);
                        const title = matched ? matched.title : slug;
                        const chip = document.createElement('span');
                        chip.className = 'vpg-date-chip active';
                        chip.style.cssText = 'display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 12px; font-size: 0.8rem; background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.4); font-weight: 600;';
                        chip.innerHTML = `${title} <i class="fa-solid fa-circle-xmark remove-btn" style="cursor: pointer; opacity: 0.7; transition: opacity 0.2s;"></i>`;
                        const cross = chip.querySelector('.remove-btn');
                        cross.addEventListener('click', async () => {
                            if (confirm(`¿Estás seguro de que deseas deshabilitar la liga "${title}"?`)) {
                                const newActive = globalActiveLeagues.filter(s => s !== slug);
                                await updateActiveLeagues(newActive);
                            }
                        });
                        chipsEl.appendChild(chip);
                    });
                }
            }
        }
    } catch (e) {
        console.error(e);
    }
}

async function updateActiveLeagues(newActiveSlugs) {
    try {
        const res = await fetch('/api/fantasy/admin/config/leagues', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activeLeagues: newActiveSlugs })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al guardar la configuración.');
        showToast('Configuración de ligas guardada.', 'success');
        await loadAdminLeaguesConfig();
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

function renderAdminLeaguesCheckboxes() {
    const newLeagueContainer = document.getElementById('new-league-vpg-checkboxes');
    const adminLeagueContainer = document.getElementById('admin-league-vpg-checkboxes');
    if (!newLeagueContainer && !adminLeagueContainer) return;
    let html = '';
    if (globalActiveLeagues.length === 0) {
        html = '<span class="text-muted" style="font-size: 0.8rem;">No hay ligas VPG habilitadas en el panel del Owner.</span>';
    } else {
        globalActiveLeagues.forEach(slug => {
            const matched = globalAllLeagues.find(l => l.slug === slug);
            const title = matched ? (matched.title || slug) : slug;
            html += `
                <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; cursor: pointer; color: #fff; margin: 0; padding: 2px 0;">
                    <input type="checkbox" value="${slug}" checked style="accent-color: #10b981; cursor: pointer; width: 15px; height: 15px;">
                    <span>${title}</span>
                </label>
            `;
        });
    }
    if (newLeagueContainer) newLeagueContainer.innerHTML = html;
    if (adminLeagueContainer) {
        adminLeagueContainer.innerHTML = html;
        if (activeLeague) {
            const activeVpgLeagues = activeLeague.vpgLeagues;
            const adminCheckboxes = adminLeagueContainer.querySelectorAll('input[type="checkbox"]');
            adminCheckboxes.forEach(cb => {
                cb.checked = !activeVpgLeagues || activeVpgLeagues.includes(cb.value);
            });
        }
    }
}
