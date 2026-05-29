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
    },
    '3-1-4-2': {
        POR: [{ left: 50, top: 89, label: 'POR' }],
        DFC: [
            { left: 30, top: 71, label: 'DFC L' },
            { left: 50, top: 71, label: 'DFC C' },
            { left: 70, top: 71, label: 'DFC R' }
        ],
        MC: [
            { left: 50, top: 52, label: 'MCD' },
            { left: 15, top: 35, label: 'MI' },
            { left: 35, top: 35, label: 'MC L' },
            { left: 65, top: 35, label: 'MC R' },
            { left: 85, top: 35, label: 'MD' }
        ],
        DC: [
            { left: 35, top: 17, label: 'DC L' },
            { left: 65, top: 17, label: 'DC R' }
        ]
    },
    '3-4-3': {
        POR: [{ left: 50, top: 88, label: 'POR' }],
        DFC: [
            { left: 30, top: 68, label: 'DFC L' },
            { left: 50, top: 68, label: 'DFC C' },
            { left: 70, top: 68, label: 'DFC R' }
        ],
        MC: [
            { left: 15, top: 45, label: 'MI' },
            { left: 38.3, top: 45, label: 'MC L' },
            { left: 61.6, top: 45, label: 'MC R' },
            { left: 85, top: 45, label: 'MD' }
        ],
        DC: [
            { left: 25, top: 20, label: 'EI' },
            { left: 50, top: 20, label: 'DC' },
            { left: 75, top: 20, label: 'ED' }
        ]
    }
};

// Application State
let currentUser = null;
let globalActiveLeagues = [];
let globalAllLeagues = [];
let activeFantasyLeagues = [];
let currentLeaguesFilter = 'joined';
let currentLeagueId = sessionStorage.getItem('selected_league_id') || null;
let activeLeague = null;
let autoRefreshInterval = null;
let myTeam = {
    balance: 100000000,
    players: [],
    lineup: { POR: null, DFC: [], MC: [], DC: [] },
    formation: '4-3-3',
    points: 0,
    teamName: ''
};
let allPlayers = [];
let searchedPlayersList = [];
let marketListings = [];
let mySentBids = [];
let currentFilteredPlayers = [];
let selectedSlotPos = null; 
let selectedSlotIdx = null; 
let activeSaveCount = 0;
let lineupSaveChain = Promise.resolve();

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

function isCentralDefender(pos) {
    return pos === 'DFC';
}

function isLateral(pos) {
    return ['LD', 'LI', 'LTD', 'LTI', 'CARR', 'CAD', 'CAI', 'DFD', 'DFI'].includes(pos);
}

function isMidfielder(pos) {
    return ['MC', 'MCD', 'MCO', 'MD', 'MI'].includes(pos);
}

function isForward(pos) {
    return ['DC', 'ED', 'EI', 'MP'].includes(pos);
}

function isGoalkeeper(pos) {
    return ['POR', 'GK'].includes(pos);
}

function isPlayerEligibleForSlot(playerPosition, slotKey, formation, slotIndex) {
    if (!playerPosition || !slotKey || !formation) return false;
    const pos = playerPosition.toUpperCase();
    const slot = slotKey.toUpperCase();
    
    if (slot === 'POR') {
        return isGoalkeeper(pos);
    }
    
    if (slot === 'DFC') {
        if (!isCentralDefender(pos) && !isLateral(pos)) {
            return false;
        }
        if (['3-5-2', '3-1-4-2', '3-4-3'].includes(formation)) {
            return isCentralDefender(pos);
        }
        if (['4-4-2', '4-3-3', '4-5-1'].includes(formation)) {
            if (slotIndex === 1 || slotIndex === 2) {
                return isCentralDefender(pos);
            }
            return isLateral(pos);
        }
        if (formation === '5-3-2') {
            if (slotIndex === 1 || slotIndex === 2 || slotIndex === 3) {
                return isCentralDefender(pos);
            }
            return isLateral(pos);
        }
        return isCentralDefender(pos) || isLateral(pos);
    }
    
    const layout = FORMATIONS[formation];
    const slotConfig = layout?.[slotKey]?.[slotIndex];
    if (!slotConfig) return false;
    const label = slotConfig.label.toUpperCase();
    
    if (slot === 'MC') {
        if (label === 'MI' || label === 'MD') {
            return isLateral(pos) || ['MI', 'MD'].includes(pos);
        } else {
            return isMidfielder(pos);
        }
    }
    
    if (slot === 'DC') {
        if (label === 'EI' || label === 'ED') {
            return isLateral(pos) || isForward(pos);
        } else {
            return isForward(pos);
        }
    }
    
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
const createLeagueSection = document.getElementById('admin-create-league-section');
const createLeagueTitle = document.getElementById('create-league-title');
const toggleAllowUserLeagues = document.getElementById('toggle-allow-user-leagues');
const btnLeagueAdminTab = document.getElementById('btn-league-admin-tab');
let lockLineupsActive = true;
let lockScheduleConfig = {
    active: true,
    days: [1, 2, 3, 4],
    startTime: "21:30",
    durationHours: 4
};
let marketScheduleConfig = {
    active: true,
    days: [0, 1, 2, 3, 4, 5, 6],
    windows: ["18:00", "", ""]
};
let clauseLockScheduleConfig = {
    active: true,
    days: [1, 2, 3, 4],
    startTime: "18:30",
    durationHours: 5.5
};
let marketLockScheduleConfig = {
    active: false,
    days: [1, 2, 3, 4],
    startTime: "18:00",
    durationHours: 8
};

// DOM Elements - Dashboard View
const activeLeagueName = document.getElementById('active-league-name');
const activeTeamNameBadge = document.getElementById('active-team-name-badge');
const btnChangeLeague = document.getElementById('btn-change-league');
const btnLeaveLeague = document.getElementById('btn-leave-league');
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
const marketSort = document.getElementById('market-sort');
const bidsCountBadge = document.getElementById('bids-count-badge');
const userMarketList = document.getElementById('user-market-list');
const bidsReceivedList = document.getElementById('bids-received-list');
const bidsSentList = document.getElementById('bids-sent-list');

// DOM Elements - Leaderboard tab
const leaderboardList = document.getElementById('leaderboard-list');

// DOM Elements - News Feed
const newsTimelineList = document.getElementById('news-timeline-list');
const btnRefreshNews = document.getElementById('btn-refresh-news');
const miniNewsWidget = document.getElementById('mini-news-widget');
const miniNewsList = document.getElementById('mini-news-list');

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
const adminLeaguePrivacy = document.getElementById('admin-league-privacy');
const adminLeaguePasswordGroup = document.getElementById('admin-league-password-group');
const adminLeaguePassword = document.getElementById('admin-league-password');
const toggleAdminPasswordVisibility = document.getElementById('toggle-admin-password-visibility');
const adminLeagueAllowClauses = document.getElementById('admin-league-allow-clauses');
const adminLeagueClauseMultiplier = document.getElementById('admin-league-clause-multiplier');
const adminLeagueInitialBudget = document.getElementById('admin-league-initial-budget');
const adminLeagueVpgTags = document.getElementById('admin-league-vpg-tags');
const btnAdminToggleMarket = document.getElementById('btn-admin-toggle-market');
const btnAdminToggleStatus = document.getElementById('btn-admin-toggle-status');
const adminLeagueStatusText = document.getElementById('admin-league-status-text');
const btnAdminDeleteLeague = document.getElementById('btn-admin-delete-league');
const btnAdminResetBasePoints = document.getElementById('btn-admin-reset-base-points');
const adminResetBasePointsContainer = document.getElementById('admin-reset-base-points-container');
const btnAdminResetAllSquads = document.getElementById('btn-admin-reset-all-squads');
const btnAdminCancelBidsBelow = document.getElementById('btn-admin-cancel-bids-below');
const btnAdminCancelBidsAll = document.getElementById('btn-admin-cancel-bids-all');
const btnAdminRebuildStats = null; // Removed from league admin panel
const rebuildStatsProgress = null; // Removed from league admin panel
const btnOwnerRebuildStats = document.getElementById('btn-owner-rebuild-stats');
const btnOwnerResetZeroPoints = document.getElementById('btn-owner-reset-zero-points');
const ownerRebuildProgress = document.getElementById('owner-rebuild-progress');
const adminParticipantsList = document.getElementById('admin-participants-list');
const adminSearchPlayerInput = document.getElementById('admin-search-player-input');
const adminSearchPlayerPos = document.getElementById('admin-search-player-pos');
const btnAdminSearchPlayer = document.getElementById('btn-admin-search-player');
const adminSearchPlayerResults = document.getElementById('admin-search-player-results');
const adminSearchPlayerLeague = document.getElementById('admin-search-player-league');
const adminSearchPlayerOnlyNew = document.getElementById('admin-search-player-only-new');

// DOM Elements - Replace Player modal
const replacePlayerModal = document.getElementById('replace-player-modal');
const replacePlayerNameTitle = document.getElementById('replace-player-name-title');
const replacePlayerModalCloseBtn = document.getElementById('replace-player-modal-close-btn');
const replacePlayerSearchInput = document.getElementById('replace-player-search-input');
const replacePlayerAutocompleteResults = document.getElementById('replace-player-autocomplete-results');
const selectedTargetPlayerContainer = document.getElementById('selected-target-player-container');
const selectedTargetPlayerName = document.getElementById('selected-target-player-name');
const btnClearTargetSelection = document.getElementById('btn-clear-target-selection');
const btnConfirmReplacePlayer = document.getElementById('btn-confirm-replace-player');

// DOM Elements - Admin Team Roster modal (MODAL 10)
const adminTeamPlayersModal = document.getElementById('admin-team-players-modal');
const adminTeamPlayersTitle = document.getElementById('admin-team-players-title');
const adminTeamPlayersCloseBtn = document.getElementById('admin-team-players-close-btn');
const adminAddPlayerSearchInput = document.getElementById('admin-add-player-search-input');
const adminAddPlayerAutocompleteResults = document.getElementById('admin-add-player-autocomplete-results');
const adminTeamPlayersListContainer = document.getElementById('admin-team-players-list-container');

let currentAdminEditingTeamId = null;
let selectedNewPlayerName = '';
let selectedOldPlayerName = '';

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

const playerStatsModal = document.getElementById('player-stats-modal');
const playerStatsModalCloseBtn = document.getElementById('player-stats-modal-close-btn');

let pendingJoinLeagueId = null;

// PWA Install Event Capturing
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    // Check if already in standalone mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    
    if (isStandalone) {
        console.log('[PWA] App is running in standalone mode.');
        deferredPrompt = null;
        return;
    }
    
    // Show install buttons
    const selectorBtn = document.getElementById('pwa-install-btn-selector');
    const dashBtn = document.getElementById('pwa-install-btn-dash');
    if (selectorBtn) selectorBtn.style.display = 'inline-flex';
    if (dashBtn) dashBtn.style.display = 'inline-flex';
    
    // Show floating banner if not previously dismissed
    const isDismissed = localStorage.getItem('pwa-dismissed') === 'true';
    if (!isDismissed) {
        setTimeout(showPwaInstallBanner, 3000);
    }
});

window.addEventListener('appinstalled', (evt) => {
    console.log('[PWA] App installed successfully');
    localStorage.setItem('pwa-installed', 'true');
    deferredPrompt = null;
    hidePwaInstallBanner();
    
    const selectorBtn = document.getElementById('pwa-install-btn-selector');
    const dashBtn = document.getElementById('pwa-install-btn-dash');
    if (selectorBtn) selectorBtn.style.display = 'none';
    if (dashBtn) dashBtn.style.display = 'none';
    
    showToast('¡VPG Fantasy se ha instalado con éxito!', 'success');
});

function showPwaInstallBanner() {
    let banner = document.getElementById('pwa-install-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'pwa-install-banner';
        banner.innerHTML = `
            <div class="pwa-banner-content">
                <img src="/logo-192.png" alt="VPG Fantasy Logo" class="pwa-banner-logo">
                <div class="pwa-banner-text">
                    <h4>Instalar VPG Fantasy</h4>
                    <p>Accede al instante desde tu escritorio y disfruta de una experiencia fluida a pantalla completa.</p>
                </div>
            </div>
            <div class="pwa-banner-actions">
                <button class="pwa-banner-btn-close" id="pwa-banner-close">Quizás más tarde</button>
                <button class="pwa-banner-btn-install" id="pwa-banner-install">
                    <i class="fa-solid fa-download"></i> Instalar
                </button>
            </div>
        `;
        document.body.appendChild(banner);
        
        document.getElementById('pwa-banner-close').addEventListener('click', () => {
            hidePwaInstallBanner();
            localStorage.setItem('pwa-dismissed', 'true');
        });
        
        document.getElementById('pwa-banner-install').addEventListener('click', () => {
            triggerPwaInstall();
        });
    }
    
    setTimeout(() => {
        if (banner) banner.classList.add('show');
    }, 50);
}

function hidePwaInstallBanner() {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) {
        banner.classList.remove('show');
        setTimeout(() => banner.remove(), 400);
    }
}

async function triggerPwaInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA] User response: ${outcome}`);
    deferredPrompt = null;
    hidePwaInstallBanner();
}

// Page Load
window.addEventListener('DOMContentLoaded', async () => {
    setupEventHandlers();
    await checkUserSession();
    
    if (!currentUser) return;
    
    if (currentLeagueId) {
        await enterLeague(currentLeagueId);
    } else {
        await showLeagueSelector();
    }
    
    startMarketCountdown();
    initPlayerSearchLeagueDropdown();
});

// User auth session check
async function checkUserSession() {
    try {
        const res = await fetch('/api/fantasy/me');
        if (!res.ok) {
            selectorUserName.innerHTML = `<span class="text-red">Sesión expirada</span>`;
            window.location.href = '/login?returnTo=/fantasy';
            return;
        }
        currentUser = await res.json();
        
        // Update user elements
        selectorUserName.innerHTML = `<i class="fa-solid fa-user-circle text-blue"></i> ${currentUser.username}`;
        
        // Toggle admin blocks
        const isAdmin = !!(currentUser && currentUser.isAdmin);
        if (isAdmin) {
            document.querySelectorAll('.admin-only-block').forEach(el => {
                if (el.id === 'allow-user-leagues-row') {
                    el.style.display = 'flex';
                } else {
                    el.style.display = 'block';
                }
            });
            const selMain = document.querySelector('.selector-main');
            if (selMain) selMain.classList.add('has-admin');
        } else {
            document.querySelectorAll('.admin-only-block').forEach(el => el.style.display = 'none');
            const selMain = document.querySelector('.selector-main');
            if (selMain) selMain.classList.remove('has-admin');
        }
        
        // Show/hide admin-only columns in the player search table
        document.querySelectorAll('.admin-only-header').forEach(el => {
            el.style.display = isAdmin ? '' : 'none';
        });
        
        // Adjust colspan of placeholder cell in the player search table
        const placeholderCell = document.getElementById('admin-search-placeholder-cell');
        if (placeholderCell) {
            placeholderCell.setAttribute('colspan', isAdmin ? '7' : '5');
        }

        // Fetch allow-user-leagues config and handle create league visibility
        try {
            const configRes = await fetch('/api/fantasy/admin/config/allow-user-leagues');
            if (configRes.ok) {
                const configData = await configRes.json();
                allowUserLeagueCreation = configData.allowed;
                if (toggleAllowUserLeagues) toggleAllowUserLeagues.checked = allowUserLeagueCreation;
            }
        } catch (e) { console.error('Error fetching allow-user-leagues config:', e); }

        // Fetch lock-lineups config
        try {
            const lockRes = await fetch('/api/fantasy/admin/config/lock-lineups');
            if (lockRes.ok) {
                const lockData = await lockRes.json();
                lockLineupsActive = lockData.locked;
            }
        } catch (e) { console.error('Error fetching lock-lineups config:', e); }

        // Show create league section: always for admins, or for users if allowed
        if (createLeagueSection) {
            if (currentUser.isAdmin) {
                createLeagueSection.style.display = 'block';
                if (createLeagueTitle) createLeagueTitle.innerHTML = '<i class="fa-solid fa-folder-plus text-blue"></i> Crear Nueva Liga';
            } else if (allowUserLeagueCreation) {
                createLeagueSection.style.display = 'block';
                if (createLeagueTitle) createLeagueTitle.innerHTML = '<i class="fa-solid fa-folder-plus text-blue"></i> Solicitar Nueva Liga';
                // Also ensure sidebar is visible for non-admins
                const selMain = document.querySelector('.selector-main');
                if (selMain) selMain.classList.add('has-admin');
            } else {
                createLeagueSection.style.display = 'none';
            }
        }
        // Owner-only elements (rebuild stats, etc.) - only visible for the owner, not referees
        if (currentUser.isOwner) {
            document.querySelectorAll('.owner-only-block').forEach(el => el.style.display = 'block');
            await checkActiveRebuild();
        } else {
            document.querySelectorAll('.owner-only-block').forEach(el => el.style.display = 'none');
        }

        // Load schedules config for all users
        await loadSchedulesConfig();

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
    // PWA Header install buttons click handlers
    const selectorInstallBtn = document.getElementById('pwa-install-btn-selector');
    const dashInstallBtn = document.getElementById('pwa-install-btn-dash');
    if (selectorInstallBtn) {
        selectorInstallBtn.addEventListener('click', triggerPwaInstall);
    }
    if (dashInstallBtn) {
        dashInstallBtn.addEventListener('click', triggerPwaInstall);
    }

    // Selector Back/Logout Click
    btnChangeLeague.addEventListener('click', () => {
        sessionStorage.removeItem('selected_league_id');
        currentLeagueId = null;
        activeLeague = null;
        stopAutoRefresh();
        showLeagueSelector();
    });

    if (btnLeaveLeague) {
        btnLeaveLeague.addEventListener('click', async () => {
            if (!confirm('¿Estás seguro de que quieres abandonar esta liga? Perderás tu equipo, tus jugadores y todas tus ofertas.')) {
                return;
            }
            if (!confirm('¿De verdad quieres borrar tu equipo y abandonar la liga por completo? Esta acción es irreversible.')) {
                return;
            }
            
            try {
                const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/leave`, {
                    method: 'POST'
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Error al abandonar la liga.');
                
                showToast(data.message || 'Has abandonado la liga.', 'success');
                sessionStorage.removeItem('selected_league_id');
                currentLeagueId = null;
                activeLeague = null;
                stopAutoRefresh();
                showLeagueSelector();
            } catch (e) {
                console.error(e);
                showToast(e.message, 'error');
            }
        });
    }

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
        stopAutoRefresh();
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
            } else if (tabName === 'news-feed') {
                loadNewsFeed();
            } else if (tabName === 'admin-panel') {
                loadAdminPanelData();
            }
        });
    });

    if (btnRefreshNews) {
        btnRefreshNews.addEventListener('click', loadNewsFeed);
    }
    const linkGoToNews = document.getElementById('link-go-to-news');
    if (linkGoToNews) {
        linkGoToNews.addEventListener('click', (e) => {
            e.preventDefault();
            const newsTabBtn = document.querySelector('.nav-tab-btn[data-league-tab="news-feed"]');
            if (newsTabBtn) newsTabBtn.click();
        });
    }

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
    marketSort.addEventListener('change', filterAndRenderMarket);

    // League search input listener
    const leagueSearchInput = document.getElementById('league-search-input');
    if (leagueSearchInput) {
        leagueSearchInput.addEventListener('input', (e) => {
            renderLeaguesList(e.target.value);
        });
    }

    // Leagues filter tabs listeners
    const btnLeaguesJoined = document.getElementById('btn-leagues-joined');
    const btnLeaguesAll = document.getElementById('btn-leagues-all');
    if (btnLeaguesJoined && btnLeaguesAll) {
        btnLeaguesJoined.addEventListener('click', () => {
            currentLeaguesFilter = 'joined';
            btnLeaguesJoined.classList.add('active');
            btnLeaguesAll.classList.remove('active');
            const searchInput = document.getElementById('league-search-input');
            renderLeaguesList(searchInput ? searchInput.value : '');
        });
        btnLeaguesAll.addEventListener('click', () => {
            currentLeaguesFilter = 'all';
            btnLeaguesAll.classList.add('active');
            btnLeaguesJoined.classList.remove('active');
            const searchInput = document.getElementById('league-search-input');
            renderLeaguesList(searchInput ? searchInput.value : '');
        });
    }

    // Global listener to close context menu when clicking outside
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('player-context-menu');
        if (menu && !menu.contains(e.target) && !e.target.closest('.rival-player-node')) {
            menu.classList.remove('open');
        }
    });

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
    playerStatsModalCloseBtn.addEventListener('click', () => playerStatsModal.classList.remove('open'));
    
    window.addEventListener('click', (e) => {
        if (e.target === positionModal) positionModal.classList.remove('open');
        if (e.target === joinLeagueModal) joinLeagueModal.classList.remove('open');
        if (e.target === rivalTeamModal) rivalTeamModal.classList.remove('open');
        if (e.target === clauseModal) clauseModal.classList.remove('open');
        if (e.target === listMarketModal) listMarketModal.classList.remove('open');
        if (e.target === bidModal) bidModal.classList.remove('open');
        if (e.target === playerStatsModal) playerStatsModal.classList.remove('open');
    });

    // Clause cost calculator is now handled dynamically in applyNumericMask below

    // Form handlers
    const newLeaguePrivacySelect = document.getElementById('new-league-privacy');
    const newLeaguePasswordGroup = document.getElementById('new-league-password-group');
    if (newLeaguePrivacySelect && newLeaguePasswordGroup) {
        newLeaguePrivacySelect.addEventListener('change', () => {
            if (newLeaguePrivacySelect.value === 'private') {
                newLeaguePasswordGroup.style.display = 'block';
            } else {
                newLeaguePasswordGroup.style.display = 'none';
            }
        });
    }

    const toggleNewPasswordVisibility = document.getElementById('toggle-new-password-visibility');
    const newLeaguePassword = document.getElementById('new-league-password');
    if (toggleNewPasswordVisibility && newLeaguePassword) {
        toggleNewPasswordVisibility.addEventListener('click', () => {
            const isPassword = newLeaguePassword.getAttribute('type') === 'password';
            newLeaguePassword.setAttribute('type', isPassword ? 'text' : 'password');
            toggleNewPasswordVisibility.classList.toggle('fa-eye', isPassword);
            toggleNewPasswordVisibility.classList.toggle('fa-eye-slash', !isPassword);
        });
    }

    const btnJoinLeagueSpectator = document.getElementById('btn-join-league-spectator');
    if (btnJoinLeagueSpectator) {
        btnJoinLeagueSpectator.addEventListener('click', openJoinModalFromSpectator);
    }

    createLeagueForm.addEventListener('submit', handleCreateLeague);
    joinLeagueForm.addEventListener('submit', handleJoinLeagueSubmit);
    adminUpdateLeagueForm.addEventListener('submit', handleUpdateLeagueSubmit);

    // Formulario de Ajuste Manual de Puntos
    const adminAdjustPointsForm = document.getElementById('admin-adjust-points-form');
    if (adminAdjustPointsForm) {
        adminAdjustPointsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const teamId = document.getElementById('adjust-points-team-select').value;
            const action = document.getElementById('adjust-points-action').value;
            const pointsVal = parseFloat(document.getElementById('adjust-points-value').value);
            const reason = document.getElementById('adjust-points-reason').value.trim();

            if (!teamId) {
                showToast('Por favor, selecciona un equipo.', 'error');
                return;
            }
            if (isNaN(pointsVal)) {
                showToast('Por favor, ingresa un valor de puntos válido.', 'error');
                return;
            }

            try {
                const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/teams/${teamId}/points`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ points: pointsVal, action, reason })
                });

                const data = await res.json();
                if (res.ok) {
                    showToast(data.message || 'Puntos ajustados correctamente.', 'success');
                    document.getElementById('adjust-points-value').value = '';
                    document.getElementById('adjust-points-reason').value = '';
                    // Recargar datos para ver la clasificación y puntos actualizados
                    loadAdminPanelData();
                    if (typeof loadLeaderboard === 'function') loadLeaderboard();
                } else {
                    showToast(data.error || 'Error al ajustar puntos.', 'error');
                }
            } catch (err) {
                console.error(err);
                showToast('Error de red al conectar con el servidor.', 'error');
            }
        });
    }

    // Formulario de Tamaño del Mercado
    const adminMarketSizeForm = document.getElementById('admin-market-size-form');
    if (adminMarketSizeForm) {
        adminMarketSizeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const marketSize = parseInt(document.getElementById('admin-market-size-value').value, 10);
            if (isNaN(marketSize) || marketSize < 5 || marketSize > 150) {
                showToast('El tamaño del mercado debe estar entre 5 y 150.', 'error');
                return;
            }

            const confirmRegen = confirm('¿Estás seguro de cambiar el tamaño del mercado? Esto cancelará y reembolsará todas las pujas pendientes e iniciará una nueva tanda de jugadores libres de forma inmediata.');
            if (!confirmRegen) return;

            try {
                const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/market-size`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ marketSize })
                });

                const data = await res.json();
                if (res.ok) {
                    showToast(data.message || 'Tamaño del mercado actualizado y mercado regenerado.', 'success');
                    loadAdminPanelData();
                    // Refrescar el mercado en la UI
                    if (typeof loadMarketPlayers === 'function') loadMarketPlayers();
                } else {
                    showToast(data.error || 'Error al actualizar el mercado.', 'error');
                }
            } catch (err) {
                console.error(err);
                showToast('Error de red al conectar con el servidor.', 'error');
            }
        });
    }

    // NUEVO: Guardar configuración de horarios (Schedules)
    const adminSchedulesForm = document.getElementById('admin-schedules-form');
    if (adminSchedulesForm) {
        adminSchedulesForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const marketActive = document.getElementById('sched-market-active').checked;
            const marketDays = Array.from(document.querySelectorAll('#sched-market-days input[type="checkbox"]:checked')).map(cb => parseInt(cb.value));
            const marketWindows = [
                document.getElementById('sched-market-time1').value.trim(),
                document.getElementById('sched-market-time2').value.trim(),
                document.getElementById('sched-market-time3').value.trim()
            ].filter(Boolean);
            
            if (marketWindows.length === 0) {
                showToast('Debes configurar al menos una ventana horaria para el mercado.', 'error');
                return;
            }
            
            const pointsActive = document.getElementById('sched-points-active').checked;
            const pointsDays = Array.from(document.querySelectorAll('#sched-points-days input[type="checkbox"]:checked')).map(cb => parseInt(cb.value));
            const pointsTime = document.getElementById('sched-points-time').value.trim();
            
            if (!pointsTime) {
                showToast('Debes configurar la hora de sincronización de puntos.', 'error');
                return;
            }
            
            const lockActive = document.getElementById('sched-lock-active').checked;
            const lockDays = Array.from(document.querySelectorAll('#sched-lock-days input[type="checkbox"]:checked')).map(cb => parseInt(cb.value));
            const lockStart = document.getElementById('sched-lock-start').value.trim();
            const lockDuration = parseInt(document.getElementById('sched-lock-duration').value);
            
            if (!lockStart || isNaN(lockDuration) || lockDuration < 1 || lockDuration > 24) {
                showToast('Configuración de bloqueo de alineaciones inválida.', 'error');
                return;
            }

            const clauseActive = document.getElementById('sched-clauseLock-active').checked;
            const clauseDays = Array.from(document.querySelectorAll('#sched-clauseLock-days input[type="checkbox"]:checked')).map(cb => parseInt(cb.value));
            const clauseStart = document.getElementById('sched-clauseLock-start').value.trim();
            const clauseDuration = parseFloat(document.getElementById('sched-clauseLock-duration').value);
            
            if (!clauseStart || isNaN(clauseDuration) || clauseDuration < 0.1 || clauseDuration > 24) {
                showToast('Configuración de bloqueo de clausulazo inválida.', 'error');
                return;
            }

            const marketLockActive = document.getElementById('sched-marketLock-active').checked;
            const marketLockDays = Array.from(document.querySelectorAll('#sched-marketLock-days input[type="checkbox"]:checked')).map(cb => parseInt(cb.value));
            const marketLockStart = document.getElementById('sched-marketLock-start').value.trim();
            const marketLockDuration = parseFloat(document.getElementById('sched-marketLock-duration').value);
            
            if (!marketLockStart || isNaN(marketLockDuration) || marketLockDuration < 0.1 || marketLockDuration > 24) {
                showToast('Configuración de bloqueo de mercado inválida.', 'error');
                return;
            }
            
            const payload = {
                market: {
                    active: marketActive,
                    days: marketDays,
                    windows: marketWindows
                },
                points: {
                    active: pointsActive,
                    days: pointsDays,
                    time: pointsTime
                },
                lock: {
                    active: lockActive,
                    days: lockDays,
                    startTime: lockStart,
                    durationHours: lockDuration
                },
                clauseLock: {
                    active: clauseActive,
                    days: clauseDays,
                    startTime: clauseStart,
                    durationHours: clauseDuration
                },
                marketLock: {
                    active: marketLockActive,
                    days: marketLockDays,
                    startTime: marketLockStart,
                    durationHours: marketLockDuration
                }
            };
            
            try {
                const res = await fetch('/api/fantasy/admin/config/schedules', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (res.ok) {
                    showToast(data.message || 'Configuración de horarios guardada.', 'success');
                    await loadSchedulesConfig();
                    
                    lockLineupsActive = lockActive;
                } else {
                    showToast(data.error || 'Error al guardar horarios.', 'error');
                }
            } catch (err) {
                console.error('Error submitting schedules:', err);
                showToast('Error de red al guardar la configuración.', 'error');
            }
        });
    }
    
    // Admin Privacy / Password listeners
    if (adminLeaguePrivacy && adminLeaguePasswordGroup) {
        adminLeaguePrivacy.addEventListener('change', () => {
            if (adminLeaguePrivacy.value === 'private') {
                adminLeaguePasswordGroup.style.display = '';
            } else {
                adminLeaguePasswordGroup.style.display = 'none';
            }
        });
    }

    if (toggleAdminPasswordVisibility && adminLeaguePassword) {
        toggleAdminPasswordVisibility.addEventListener('click', () => {
            const isPassword = adminLeaguePassword.getAttribute('type') === 'password';
            adminLeaguePassword.setAttribute('type', isPassword ? 'text' : 'password');
            toggleAdminPasswordVisibility.classList.toggle('fa-eye', isPassword);
            toggleAdminPasswordVisibility.classList.toggle('fa-eye-slash', !isPassword);
        });
    }
    
    clauseForm.addEventListener('submit', handleClauseSubmit);
    listMarketForm.addEventListener('submit', handleListMarketSubmit);
    bidForm.addEventListener('submit', handleBidSubmit);
    
    // Quick admin buttons
    btnAdminToggleMarket.addEventListener('click', handleAdminToggleMarket);
    if (btnAdminToggleStatus) btnAdminToggleStatus.addEventListener('click', handleAdminToggleStatus);
    btnAdminDeleteLeague.addEventListener('click', handleAdminDeleteLeague);
    if (btnAdminResetBasePoints) btnAdminResetBasePoints.addEventListener('click', handleAdminResetBasePoints);
    if (btnAdminResetAllSquads) btnAdminResetAllSquads.addEventListener('click', handleAdminResetAllSquads);
    if (btnAdminCancelBidsBelow) btnAdminCancelBidsBelow.addEventListener('click', () => handleAdminCancelBids('below_value'));
    if (btnAdminCancelBidsAll) btnAdminCancelBidsAll.addEventListener('click', () => handleAdminCancelBids('all'));
    if (btnAdminRebuildStats) btnAdminRebuildStats.addEventListener('click', () => executeRebuildStats(btnAdminRebuildStats, rebuildStatsProgress));
    if (btnOwnerRebuildStats) btnOwnerRebuildStats.addEventListener('click', () => executeRebuildStats(btnOwnerRebuildStats, ownerRebuildProgress));
    if (btnOwnerResetZeroPoints) {
        btnOwnerResetZeroPoints.addEventListener('click', async () => {
            if (!confirm('¿Estás absolutamente seguro de que deseas resetear los puntos iniciales de todas las ligas ZERO activas?\nEsto reiniciará los puntos de los mánagers a 0 estableciendo los puntos VPG actuales como la nueva base. Esta acción es irreversible.')) {
                return;
            }
            try {
                btnOwnerResetZeroPoints.disabled = true;
                btnOwnerResetZeroPoints.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Reseteando...';

                const res = await fetch('/api/fantasy/admin/reset-all-zero-points', { method: 'POST' });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Error al resetear puntos.');

                showToast(data.message || 'Puntos reseteados correctamente.', 'success');
            } catch (e) {
                console.error(e);
                showToast(e.message, 'error');
            } finally {
                btnOwnerResetZeroPoints.disabled = false;
                btnOwnerResetZeroPoints.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Resetear Ligas ZERO';
            }
        });
    }

    // Toggle allow user league creation
    if (toggleAllowUserLeagues) {
        toggleAllowUserLeagues.addEventListener('change', async () => {
            try {
                const res = await fetch('/api/fantasy/admin/config/allow-user-leagues', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ allowed: toggleAllowUserLeagues.checked })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Error al cambiar configuración.');
                allowUserLeagueCreation = data.allowed;
                showToast(data.message, 'success');
            } catch (e) {
                console.error(e);
                showToast(e.message, 'error');
                toggleAllowUserLeagues.checked = !toggleAllowUserLeagues.checked; // revert
            }
        });
    }



    // Admin player price override handlers
    if (btnAdminSearchPlayer) {
        btnAdminSearchPlayer.addEventListener('click', handleAdminPlayerSearch);
    }
    if (adminSearchPlayerPos) {
        adminSearchPlayerPos.addEventListener('change', handleAdminPlayerSearch);
    }
    if (adminSearchPlayerLeague) {
        adminSearchPlayerLeague.addEventListener('change', handleAdminPlayerSearch);
    }
    if (adminSearchPlayerOnlyNew) {
        adminSearchPlayerOnlyNew.addEventListener('change', handleAdminPlayerSearch);
    }
    if (adminSearchPlayerInput) {
        adminSearchPlayerInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                handleAdminPlayerSearch();
            }
        });
    }

    // Modal replace player events
    if (replacePlayerModalCloseBtn) {
        replacePlayerModalCloseBtn.addEventListener('click', () => {
            replacePlayerModal.classList.remove('open');
        });
    }
    if (replacePlayerModal) {
        replacePlayerModal.addEventListener('click', (e) => {
            if (e.target === replacePlayerModal) {
                replacePlayerModal.classList.remove('open');
            }
        });
    }

    let autocompleteTimeout = null;
    if (replacePlayerSearchInput) {
        replacePlayerSearchInput.addEventListener('input', () => {
            clearTimeout(autocompleteTimeout);
            const query = replacePlayerSearchInput.value.trim();
            if (query.length < 2) {
                replacePlayerAutocompleteResults.innerHTML = '';
                replacePlayerAutocompleteResults.style.display = 'none';
                return;
            }

            autocompleteTimeout = setTimeout(async () => {
                try {
                    const res = await fetch(`/api/fantasy/admin/players/search?query=${encodeURIComponent(query)}`);
                    if (!res.ok) throw new Error('Error al buscar para autocompletar.');
                    const players = await res.json();

                    replacePlayerAutocompleteResults.innerHTML = '';
                    if (players.length === 0) {
                        replacePlayerAutocompleteResults.innerHTML = '<div style="padding: 10px; color: #64748b; font-size: 0.85rem;">No se encontraron resultados</div>';
                        replacePlayerAutocompleteResults.style.display = 'block';
                        return;
                    }

                    players.forEach(p => {
                        if (p.eaPlayerName.toLowerCase() === selectedNewPlayerName.toLowerCase()) {
                            return;
                        }
                        const item = document.createElement('div');
                        item.className = 'autocomplete-item';
                        item.innerHTML = `
                            <span style="font-weight:600; color: #fff;">${p.eaPlayerName}</span>
                            <span style="font-size:0.75rem; color:#64748b;">${p.lastClub} - ${p.lastPosition}</span>
                        `;
                        item.addEventListener('click', () => {
                            selectedOldPlayerName = p.eaPlayerName;
                            selectedTargetPlayerName.textContent = p.eaPlayerName;
                            selectedTargetPlayerContainer.style.display = 'block';
                            btnConfirmReplacePlayer.disabled = false;
                            replacePlayerAutocompleteResults.style.display = 'none';
                            replacePlayerSearchInput.value = '';
                        });
                        replacePlayerAutocompleteResults.appendChild(item);
                    });
                    replacePlayerAutocompleteResults.style.display = 'block';
                } catch (e) {
                    console.error('Autocomplete search error:', e);
                }
            }, 300);
        });
    }

    if (btnClearTargetSelection) {
        btnClearTargetSelection.addEventListener('click', () => {
            selectedOldPlayerName = '';
            selectedTargetPlayerName.textContent = '-';
            selectedTargetPlayerContainer.style.display = 'none';
            btnConfirmReplacePlayer.disabled = true;
        });
    }

    if (btnConfirmReplacePlayer) {
        btnConfirmReplacePlayer.addEventListener('click', async () => {
            if (!selectedNewPlayerName || !selectedOldPlayerName) return;
            if (!confirm(`¿Confirmas que deseas sustituir permanentemente a ${selectedOldPlayerName} por ${selectedNewPlayerName}?\nEsta acción es irreversible y afectará a todas las ligas, plantillas, alineaciones, transferibles y ofertas.`)) {
                return;
            }

            try {
                btnConfirmReplacePlayer.disabled = true;
                btnConfirmReplacePlayer.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sustituyendo...';

                const res = await fetch(`/api/fantasy/admin/players/${encodeURIComponent(selectedNewPlayerName)}/replace`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ targetName: selectedOldPlayerName })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Error al sustituir jugador.');

                showToast(data.message || 'Sustitución realizada correctamente.', 'success');
                replacePlayerModal.classList.remove('open');
                await handleAdminPlayerSearch();
            } catch (e) {
                console.error(e);
                showToast(e.message, 'error');
            } finally {
                btnConfirmReplacePlayer.disabled = false;
                btnConfirmReplacePlayer.innerHTML = '<i class="fa-solid fa-arrows-spin"></i> Confirmar Sustitución';
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

    // Rival team modal view toggle tabs
    const tabList = document.getElementById('btn-rival-tab-list');
    const tabField = document.getElementById('btn-rival-tab-field');
    const listContainer = document.getElementById('rival-squad-list-container');
    const fieldContainer = document.getElementById('rival-soccer-field-container');
    
    if (tabList && tabField && listContainer && fieldContainer) {
        tabList.addEventListener('click', () => {
            tabList.classList.add('active');
            tabField.classList.remove('active');
            listContainer.style.display = 'block';
            fieldContainer.style.display = 'none';
        });
        tabField.addEventListener('click', () => {
            tabField.classList.add('active');
            tabList.classList.remove('active');
            listContainer.style.display = 'none';
            fieldContainer.style.display = 'block';
        });
    }

    // Modal team roster close handlers
    if (adminTeamPlayersCloseBtn) {
        adminTeamPlayersCloseBtn.addEventListener('click', () => {
            adminTeamPlayersModal.classList.remove('open');
        });
    }
    if (adminTeamPlayersModal) {
        adminTeamPlayersModal.addEventListener('click', (e) => {
            if (e.target === adminTeamPlayersModal) {
                adminTeamPlayersModal.classList.remove('open');
            }
        });
    }

    let adminAutocompleteTimeout = null;
    if (adminAddPlayerSearchInput) {
        adminAddPlayerSearchInput.addEventListener('input', () => {
            clearTimeout(adminAutocompleteTimeout);
            const query = adminAddPlayerSearchInput.value.trim();
            if (query.length < 2) {
                adminAddPlayerAutocompleteResults.innerHTML = '';
                adminAddPlayerAutocompleteResults.style.display = 'none';
                return;
            }

            adminAutocompleteTimeout = setTimeout(async () => {
                try {
                    const res = await fetch(`/api/fantasy/admin/players/search?query=${encodeURIComponent(query)}`);
                    if (!res.ok) throw new Error('Error al buscar para autocompletar.');
                    const players = await res.json();

                    adminAddPlayerAutocompleteResults.innerHTML = '';
                    if (players.length === 0) {
                        adminAddPlayerAutocompleteResults.innerHTML = '<div style="padding: 10px; color: #64748b; font-size: 0.85rem;">No se encontraron resultados</div>';
                        adminAddPlayerAutocompleteResults.style.display = 'block';
                        return;
                    }

                    players.forEach(p => {
                        const item = document.createElement('div');
                        item.className = 'autocomplete-item';
                        item.innerHTML = `
                            <span style="font-weight:600; color: #fff;">${p.eaPlayerName}</span>
                            <span style="font-size:0.75rem; color:#64748b;">${p.lastClub} - ${p.lastPosition}</span>
                        `;
                        item.addEventListener('click', async () => {
                            if (confirm(`¿Estás seguro de que deseas añadir a ${p.eaPlayerName} a este equipo?`)) {
                                await handleAdminAddPlayer(p.eaPlayerName);
                            }
                            adminAddPlayerAutocompleteResults.style.display = 'none';
                            adminAddPlayerSearchInput.value = '';
                        });
                        adminAddPlayerAutocompleteResults.appendChild(item);
                    });
                    adminAddPlayerAutocompleteResults.style.display = 'block';
                } catch (e) {
                    console.error('Admin autocomplete search error:', e);
                }
            }, 300);
        });
    }

    document.addEventListener('click', (e) => {
        if (adminAddPlayerAutocompleteResults && e.target !== adminAddPlayerSearchInput && e.target !== adminAddPlayerAutocompleteResults) {
            adminAddPlayerAutocompleteResults.style.display = 'none';
        }
    });

    // Apply auto-formatting numeric masks to input fields
    applyNumericMask(bidAmountInput);
    applyNumericMask(clauseNewAmount, (newVal) => {
        const currentVal = parseInt(clauseNewAmount.getAttribute('data-current-val') || 0);
        const diff = newVal - currentVal;
        if (diff > 0) {
            clauseCostVal.textContent = diff.toLocaleString('es-ES') + ' €';
            clauseCostVal.className = 'text-red';
        } else {
            clauseCostVal.textContent = '0 € (Debe ser mayor)';
            clauseCostVal.className = 'text-muted';
        }
    });
}

// VIEW 1: Show Selector and Fetch All Leagues
async function showLeagueSelector() {
    stopAutoRefresh();
    leagueDashboardView.style.display = 'none';
    leagueSelectorView.style.display = 'block';
    
    const leagueSearchInput = document.getElementById('league-search-input');
    if (leagueSearchInput) leagueSearchInput.value = '';
    
    leaguesGrid.innerHTML = `<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Cargando ligas...</div>`;
    
    try {
        // Parallelize both API calls for faster loading
        const [_, leaguesRes] = await Promise.all([
            loadCreationVpgLeagues(),
            fetch('/api/fantasy/leagues')
        ]);
        if (!leaguesRes.ok) {
            if (leaguesRes.status === 401) {
                window.location.href = '/login?returnTo=/fantasy';
                return;
            }
            throw new Error('No se pudieron obtener las ligas.');
        }
        const data = await leaguesRes.json();
        activeFantasyLeagues = data.leagues || [];
        
        // Auto-select tab: default to "joined" if user has joined any leagues, else "all"
        const hasJoined = activeFantasyLeagues.some(l => l.isJoined);
        currentLeaguesFilter = hasJoined ? 'joined' : 'all';

        const btnJoined = document.getElementById('btn-leagues-joined');
        const btnAll = document.getElementById('btn-leagues-all');
        if (btnJoined && btnAll) {
            if (currentLeaguesFilter === 'joined') {
                btnJoined.classList.add('active');
                btnAll.classList.remove('active');
            } else {
                btnAll.classList.add('active');
                btnJoined.classList.remove('active');
            }
        }
        
        renderLeaguesList('');
        
        // Load pending league requests for admins (non-blocking)
        if (currentUser && currentUser.isAdmin) {
            loadPendingLeagueRequests();
        }
    } catch (e) {
        console.error(e);
        leaguesGrid.innerHTML = `<div class="text-center py-4 text-red"><i class="fa-solid fa-triangle-exclamation"></i> Error al cargar las ligas.</div>`;
    }
}

// Returns a lightweight CSS gradient + accent color instead of heavy PNG images (~4.8MB saved)
function getLeagueGradientInfo(vpgLeagues) {
    if (!vpgLeagues || !Array.isArray(vpgLeagues) || vpgLeagues.length === 0) {
        return null;
    }
    const divisions = vpgLeagues.map(slug => {
        const s = slug.toLowerCase().trim();
        if (s.includes('quinta')) return 'quinta';
        if (s.includes('cuarta')) return 'cuarta';
        if (s.includes('tercera')) return 'tercera';
        if (s.includes('segunda')) return 'segunda';
        return 'primera';
    });
    const uniqueDivisions = [...new Set(divisions)];
    const gradients = {
        primera:  { bg: 'linear-gradient(135deg, #1a1225 0%, #2d1b4e 40%, #4a2d7a 70%, #1a1225 100%)', accent: '#c9a0ff', icon: '🏆', label: '1ª' },
        segunda:  { bg: 'linear-gradient(135deg, #121a28 0%, #1e3a5f 40%, #2a5080 70%, #121a28 100%)', accent: '#7eb8e0', icon: '🥈', label: '2ª' },
        tercera:  { bg: 'linear-gradient(135deg, #1a1510 0%, #3d2e1a 40%, #5a4528 70%, #1a1510 100%)', accent: '#c9a46c', icon: '🥉', label: '3ª' },
        cuarta:   { bg: 'linear-gradient(135deg, #0f1a14 0%, #1a3d28 40%, #285a3d 70%, #0f1a14 100%)', accent: '#5fd4a0', icon: '⚡', label: '4ª' },
        quinta:   { bg: 'linear-gradient(135deg, #0f141a 0%, #1a2d4e 40%, #284070 70%, #0f141a 100%)', accent: '#5da0e0', icon: '🌟', label: '5ª' },
    };
    if (uniqueDivisions.length > 1) {
        return { bg: 'linear-gradient(135deg, #1a1225 0%, #1a2d4e 35%, #3d2e1a 65%, #1a1225 100%)', accent: '#e0a0ff', icon: '🌐', label: 'Mix' };
    }
    return gradients[uniqueDivisions[0]] || null;
}

// Render the leagues grid with optional name filtering
function renderLeaguesList(filterText = '') {
    leaguesGrid.innerHTML = '';
    
    const query = filterText.toLowerCase().trim();
    let filteredLeagues = activeFantasyLeagues.filter(league => 
        (league.name || '').toLowerCase().includes(query)
    );
    
    if (currentLeaguesFilter === 'joined') {
        filteredLeagues = filteredLeagues.filter(league => league.isJoined);
    }
    
    if (filteredLeagues.length === 0) {
        if (activeFantasyLeagues.length === 0) {
            leaguesGrid.innerHTML = `<div class="text-center py-4 text-muted w-100"><i class="fa-solid fa-folder-open"></i> No hay ligas creadas todavía.</div>`;
        } else if (currentLeaguesFilter === 'joined') {
            leaguesGrid.innerHTML = `<div class="text-center py-4 text-muted w-100"><i class="fa-solid fa-user-slash"></i> No estás inscrito en ninguna liga todavía. Haz clic en "Todas las Ligas" para explorar y unirte.</div>`;
        } else {
            leaguesGrid.innerHTML = `<div class="text-center py-4 text-muted w-100"><i class="fa-solid fa-magnifying-glass"></i> No se encontraron ligas que coincidan con "${filterText}".</div>`;
        }
        return;
    }
    
    filteredLeagues.forEach(league => {
        const card = document.createElement('div');
        card.className = 'league-card';
        
        const gradientInfo = getLeagueGradientInfo(league.vpgLeagues);
        let divisionBadgeHtml = '';
        if (gradientInfo) {
            card.style.setProperty('--card-gradient', gradientInfo.bg);
            card.style.setProperty('--card-accent', gradientInfo.accent);
            card.setAttribute('data-division-icon', gradientInfo.icon);
            card.classList.add('has-cover');
            divisionBadgeHtml = `<span class="division-badge">${gradientInfo.label}</span>`;
        }
        
        let statusBadge = '';
        if (league.status === 'open') statusBadge = '<span class="badge badge-success">Abierta</span>';
        else if (league.status === 'active') statusBadge = '<span class="badge badge-info">En Curso</span>';
        else statusBadge = '<span class="badge badge-danger">Finalizada</span>';
        
        const lockIcon = league.privacy === 'private' ? ' <i class="fa-solid fa-lock text-yellow" title="Liga Privada" style="font-size: 0.95rem; margin-left: 5px;"></i>' : '';
        
        let buttonsHtml = '';
        if (league.isJoined) {
            if (league.isApproved) {
                buttonsHtml = `<button class="btn btn-success btn-block btn-enter-league" data-id="${league._id}"><i class="fa-solid fa-right-to-bracket"></i> Entrar a la Liga</button>`;
            } else {
                buttonsHtml = `<button class="btn btn-warning btn-block btn-enter-league" data-id="${league._id}"><i class="fa-solid fa-clock"></i> Ver Liga (Inscripción Pendiente)</button>`;
            }
        } else {
            const canJoin = league.status === 'open' && (league.participantCount < league.maxParticipants);
            if (canJoin) {
                buttonsHtml = `
                    <div class="league-card-actions">
                        <button class="btn btn-secondary btn-read-league" data-id="${league._id}"><i class="fa-solid fa-eye"></i> Ver (Lectura)</button>
                        <button class="btn btn-success btn-join-league" data-id="${league._id}"><i class="fa-solid fa-plus-circle"></i> Unirse</button>
                    </div>
                `;
            } else {
                buttonsHtml = `<button class="btn btn-secondary btn-block btn-read-league" data-id="${league._id}"><i class="fa-solid fa-eye"></i> Ver Liga (Modo Lectura)</button>`;
            }
        }

        const vpgLg = league.vpgLeagues || [];
        let vpgHtml = '';
        if (vpgLg.length > 0) {
            const tags = vpgLg.map(slug => {
                const matched = globalAllLeagues.find(l => l.slug === slug);
                return `<span class="badge" style="background: rgba(56, 189, 248, 0.1); color: #38bdf8; border: 1px solid rgba(56,189,248,0.2); padding: 1px 6px; font-size: 0.65rem; border-radius: 4px; display: inline-block;">${matched ? (matched.title || slug) : slug}</span>`;
            }).join(' ');
            vpgHtml = `<div style="margin-top: 8px; margin-bottom: 12px; display: flex; flex-wrap: wrap; gap: 4px; align-items: center; font-size: 0.75rem; color: #94a3b8;"><i class="fa-solid fa-link" style="font-size: 0.7rem; color: #64748b;"></i> <strong style="color:#94a3b8;">VPG:</strong> ${tags}</div>`;
        } else {
            vpgHtml = `<div style="margin-top: 8px; margin-bottom: 12px; font-size: 0.75rem; color: #64748b;"><i class="fa-solid fa-link" style="font-size: 0.7rem; color: #64748b;"></i> <strong>VPG:</strong> Sin ligas VPG vinculadas</div>`;
        }

        card.innerHTML = `
            <div class="league-card-header">
                <h3>${league.name}${lockIcon}</h3>
                <div class="league-card-badges">
                    ${divisionBadgeHtml}
                    ${statusBadge}
                </div>
            </div>
            <div class="league-meta">
                <div><i class="fa-solid fa-users"></i> <span>Mánagers: ${league.participantCount} / ${league.maxParticipants}</span></div>
                <div><i class="fa-solid fa-wallet"></i> <span>Presupuesto: ${formatCurrency(league.initialBudget)}</span></div>
                <div><i class="fa-solid fa-store"></i> <span>Mercado: ${league.marketOpen ? 'Abierto' : 'Cerrado'}</span></div>
                <div><i class="fa-solid fa-crown"></i> <span>Creador: ${league.createdByUsername || 'Desconocido'}</span></div>
            </div>
            ${vpgHtml}
            ${buttonsHtml}
        `;
        
        const enterBtn = card.querySelector('.btn-enter-league');
        if (enterBtn) {
            enterBtn.addEventListener('click', () => {
                enterLeague(league._id);
            });
        }

        const readBtns = card.querySelectorAll('.btn-read-league');
        readBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                enterLeague(league._id);
            });
        });
        
        const joinBtn = card.querySelector('.btn-join-league');
        if (joinBtn) {
            joinBtn.addEventListener('click', () => {
                enterLeague(league._id, false, null, true);
            });
        }
        
        leaguesGrid.appendChild(card);
    });
}

// Load pending league requests for admin sidebar
async function loadPendingLeagueRequests() {
    const container = document.getElementById('pending-leagues-list');
    const section = document.getElementById('pending-league-requests-section');
    if (!container || !section) return;
    try {
        const res = await fetch('/api/fantasy/leagues/pending-leagues');
        if (!res.ok) return;
        const data = await res.json();
        const pending = data.pending || [];
        if (pending.length === 0) {
            container.innerHTML = '<span class="text-muted" style="font-size: 0.85rem;">No hay solicitudes pendientes.</span>';
            return;
        }
        if (!globalAllLeagues || globalAllLeagues.length === 0) {
            try {
                const res = await fetch('/api/fantasy/active-leagues');
                if (res.ok) {
                    const data = await res.json();
                    globalAllLeagues = data.allLeagues || [];
                }
            } catch (e) {
                console.error('Error loading VPG leagues for pending list:', e);
            }
        }

        container.innerHTML = '';
        pending.forEach(league => {
            const card = document.createElement('div');
            card.style.cssText = 'background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px;';
            const date = new Date(league.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
            
            const vpgLg = league.vpgLeagues || [];
            let vpgHtml = '';
            if (vpgLg.length > 0) {
                const tags = vpgLg.map(slug => {
                    const matched = globalAllLeagues.find(l => l.slug === slug);
                    return `<span class="badge" style="background: rgba(56, 189, 248, 0.1); color: #38bdf8; border: 1px solid rgba(56,189,248,0.2); padding: 1px 6px; font-size: 0.65rem; border-radius: 4px; display: inline-block;">${matched ? (matched.title || slug) : slug}</span>`;
                }).join(' ');
                vpgHtml = `<div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; align-items: center;"><strong style="font-size: 0.75rem; color: #94a3b8;">Ligas VPG:</strong> ${tags}</div>`;
            } else {
                vpgHtml = `<div style="font-size: 0.75rem; color: #64748b; margin-top: 4px;"><strong>Ligas VPG:</strong> Sin ligas VPG vinculadas</div>`;
            }

            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="width: 100%;">
                        <div style="font-weight: 600; color: #fff; font-size: 0.9rem;">${league.name}</div>
                        <div style="font-size: 0.75rem; color: #64748b;">Por: ${league.createdByUsername || 'Desconocido'} • ${date}</div>
                        ${vpgHtml}
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-sm btn-primary btn-approve-league" data-id="${league._id}" style="flex: 1;"><i class="fa-solid fa-check"></i> Aprobar</button>
                    <button class="btn btn-sm btn-danger btn-reject-league" data-id="${league._id}" style="flex: 1;"><i class="fa-solid fa-xmark"></i> Rechazar</button>
                </div>
            `;
            card.querySelector('.btn-approve-league').addEventListener('click', async () => {
                try {
                    const r = await fetch(`/api/fantasy/leagues/${league._id}/approve-league`, { method: 'POST' });
                    const d = await r.json();
                    if (!r.ok) throw new Error(d.error);
                    showToast(d.message, 'success');
                    await showLeagueSelector();
                } catch (err) { showToast(err.message, 'error'); }
            });
            card.querySelector('.btn-reject-league').addEventListener('click', async () => {
                if (!confirm('¿Estás seguro de rechazar esta solicitud? La liga será eliminada.')) return;
                try {
                    const r = await fetch(`/api/fantasy/leagues/${league._id}/reject-league`, { method: 'DELETE' });
                    const d = await r.json();
                    if (!r.ok) throw new Error(d.error);
                    showToast(d.message, 'success');
                    await showLeagueSelector();
                } catch (err) { showToast(err.message, 'error'); }
            });
            container.appendChild(card);
        });
    } catch (e) {
        console.error('Error loading pending leagues:', e);
    }
}

// Create league logic
async function handleCreateLeague(e) {
    e.preventDefault();
    const name = document.getElementById('new-league-name').value;
    const maxParticipants = document.getElementById('new-league-max-participants').value;
    const initialBudget = document.getElementById('new-league-budget').value;
    const pointsMode = document.getElementById('new-league-points-mode').value;
    const privacy = document.getElementById('new-league-privacy').value;
    const password = document.getElementById('new-league-password').value;
    
    // Get checked VPG leagues
    const checkboxesContainer = document.getElementById('new-league-vpg-checkboxes');
    let vpgLeagues = [];
    if (checkboxesContainer) {
        const checkedBoxes = checkboxesContainer.querySelectorAll('input[type="checkbox"]:checked');
        vpgLeagues = Array.from(checkedBoxes).map(cb => cb.value);
    }

    const maxLimit = vpgLeagues.length >= 2 ? 18 : 14;
    
    const maxVal = parseInt(maxParticipants);
    if (isNaN(maxVal) || maxVal < 2 || maxVal > maxLimit) {
        showToast(`El número máximo de participantes permitido es de 2 a ${maxLimit}.`, 'error');
        return;
    }
    
    try {
        const res = await fetch('/api/fantasy/leagues', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, maxParticipants, initialBudget, pointsMode, vpgLeagues, privacy, password })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al crear la liga.');
        
        showToast(data.message, 'success');
        createLeagueForm.reset();
        
        const passwordGroup = document.getElementById('new-league-password-group');
        if (passwordGroup) passwordGroup.style.display = 'none';
        
        // Reset/reload VPG checkboxes
        await loadCreationVpgLeagues();
        
        await showLeagueSelector();
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

// Enter/Join League logic
async function enterLeague(leagueId, keepCurrentTab = false, password = null, openJoinDirectly = false) {
    try {
        const cachedPassword = sessionStorage.getItem('league_password_' + leagueId);
        const passToCheck = password || cachedPassword || '';

        const accessRes = await fetch(`/api/fantasy/leagues/${leagueId}/access`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: passToCheck })
        });

        if (accessRes.status === 401 || accessRes.status === 403) {
            const errData = await accessRes.json().catch(() => ({}));
            if (errData.error === 'Debes iniciar sesión con Discord.') {
                selectorUserName.innerHTML = `<span class="text-red">Sesión expirada</span>`;
                window.location.href = '/login?returnTo=/fantasy';
                return;
            }
            sessionStorage.removeItem('league_password_' + leagueId);
            const promptPassword = prompt('Esta es una liga privada. Introduce la contraseña para acceder:');
            if (promptPassword === null) {
                sessionStorage.removeItem('selected_league_id');
                currentLeagueId = null;
                showLeagueSelector();
                return;
            }
            return enterLeague(leagueId, keepCurrentTab, promptPassword, openJoinDirectly);
        }

        if (!accessRes.ok) {
            const errData = await accessRes.json();
            throw new Error(errData.error || 'Error al comprobar el acceso.');
        }

        const accessData = await accessRes.json();
        if (password) {
            sessionStorage.setItem('league_password_' + leagueId, password);
        }

        let tempMyTeam = null;
        if (accessData.isJoined) {
            const res = await fetch(`/api/fantasy/leagues/${leagueId}/my-team`);
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Error al entrar en la liga.');
            }
            tempMyTeam = await res.json();
            tempMyTeam.isSpectator = false;
        } else {
            tempMyTeam = {
                isSpectator: true,
                teamName: 'Espectador',
                balance: 0,
                points: 0,
                lineup: { POR: null, DFC: [], MC: [], DC: [] },
                players: [],
                approved: true,
                formation: '3-1-4-2'
            };
        }

        myTeam = tempMyTeam;
        currentLeagueId = leagueId;
        sessionStorage.setItem('selected_league_id', leagueId);
        
        // Use already-loaded leagues data instead of redundant API call
        activeLeague = activeFantasyLeagues.find(l => l._id === leagueId);
        if (!activeLeague) {
            // Fallback: fetch from server if local data is stale
            const leaguesRes = await fetch('/api/fantasy/leagues');
            const leaguesData = await leaguesRes.json();
            activeFantasyLeagues = leaguesData.leagues || [];
            activeLeague = activeFantasyLeagues.find(l => l._id === leagueId);
            if (!activeLeague) {
                throw new Error('No se pudo encontrar la información de la liga activa.');
            }
        }
        
        // Initialize dashboard UI
        const lockIcon = activeLeague.privacy === 'private' ? ' <i class="fa-solid fa-lock text-yellow" title="Liga Privada" style="font-size: 0.95rem; margin-left: 5px;"></i>' : '';
        activeLeagueName.innerHTML = activeLeague.name + lockIcon;
        
        if (myTeam.isSpectator) {
            activeTeamNameBadge.textContent = 'Espectador (Modo Lectura)';
        } else if (!myTeam.approved) {
            activeTeamNameBadge.textContent = `${myTeam.teamName} (Inscripción Pendiente)`;
        } else {
            activeTeamNameBadge.textContent = myTeam.teamName;
        }
        
        const btnJoinLeagueSpectator = document.getElementById('btn-join-league-spectator');
        if (myTeam.isSpectator || !myTeam.approved) {
            userBalanceEl.textContent = '-';
            squadValueEl.textContent = '-';
            totalPointsEl.textContent = '-';
            if (formationSelect) formationSelect.disabled = true;
            if (btnSaveLineup) btnSaveLineup.style.display = 'none';
            
            if (myTeam.isSpectator) {
                if (btnJoinLeagueSpectator) btnJoinLeagueSpectator.style.display = 'inline-block';
                if (btnLeaveLeague) btnLeaveLeague.style.display = 'none';
            } else {
                if (btnJoinLeagueSpectator) btnJoinLeagueSpectator.style.display = 'none';
                if (btnLeaveLeague) btnLeaveLeague.style.display = 'inline-block'; // Allow pending team to cancel/leave
            }
        } else {
            userBalanceEl.textContent = formatCurrency(myTeam.balance);
            totalPointsEl.textContent = `${Math.round((myTeam.points || 0) * 10) / 10} pts`;
            if (formationSelect) {
                formationSelect.value = myTeam.formation;
                formationSelect.disabled = isLineupLocked();
            }
            if (btnSaveLineup) {
                btnSaveLineup.style.display = 'inline-block';
                if (isLineupLocked()) {
                    btnSaveLineup.disabled = true;
                    btnSaveLineup.innerHTML = '<i class="fa-solid fa-lock"></i> Bloqueado';
                    btnSaveLineup.title = getLineupLockErrorText();
                    btnSaveLineup.style.opacity = '0.6';
                    btnSaveLineup.style.cursor = 'not-allowed';
                } else {
                    btnSaveLineup.disabled = false;
                    btnSaveLineup.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar Once';
                    btnSaveLineup.title = '';
                    btnSaveLineup.style.opacity = '1';
                    btnSaveLineup.style.cursor = 'pointer';
                }
            }
            if (typeof updateLineupLockStatusUI === 'function') {
                updateLineupLockStatusUI();
            }
            if (btnJoinLeagueSpectator) btnJoinLeagueSpectator.style.display = 'none';
            if (btnLeaveLeague) btnLeaveLeague.style.display = 'inline-block';
        }
        
        // Toggle market open status banner
        if (activeLeague.marketOpen) {
            marketClosedBanner.style.display = 'none';
        } else {
            marketClosedBanner.style.display = 'flex';
        }
        
        if (typeof updateClauseLockStatusUI === 'function') updateClauseLockStatusUI();
        if (typeof updateMarketLockStatusUI === 'function') updateMarketLockStatusUI();
        
        // Switch Views
        leagueSelectorView.style.display = 'none';
        leagueDashboardView.style.display = 'block';
        
        const statsArea = document.querySelector('.stats-area');
        const leagueNav = document.querySelector('.league-nav');
        
        // Always display statsArea and navigation tabs so pending/spectators can view league leaderboard/market
        statsArea.style.display = 'flex';
        leagueNav.style.display = 'flex';
        pendingApprovalView.style.display = 'none'; // we will show overlay on pitch instead of blocking view
        
        // Show/hide admin tab based on permissions
        const canAdmin = currentUser && (currentUser.isAdmin || (activeLeague && (activeLeague.createdBy === currentUser.discordId || activeLeague.coAdmin === currentUser.discordId)));
        if (btnLeagueAdminTab) {
            btnLeagueAdminTab.style.display = canAdmin ? '' : 'none';
        }

        if (!keepCurrentTab) {
            // Reset left subtabs to first tab
            document.querySelectorAll('.nav-tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelector('[data-league-tab="my-team"]').classList.add('active');
            document.querySelectorAll('.league-tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById('league-tab-my-team').classList.add('active');

            // Reset right panel tabs (Market vs Squad)
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            const defaultRightTab = document.querySelector('[data-tab="market"]');
            if (defaultRightTab) defaultRightTab.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            const defaultRightPane = document.getElementById('tab-market');
            if (defaultRightPane) defaultRightPane.classList.add('active');

            // Reset market sub-tabs (Libres, Transferibles, Ofertas)
            document.querySelectorAll('.market-sub-btn').forEach(btn => {
                btn.classList.remove('active', 'btn-primary');
                btn.classList.add('btn-secondary');
                btn.style.background = '#334155';
            });
            const defaultMarketSubBtn = document.querySelector('[data-sub-tab="pc-market"]');
            if (defaultMarketSubBtn) {
                defaultMarketSubBtn.classList.remove('btn-secondary');
                defaultMarketSubBtn.classList.add('active', 'btn-primary');
                defaultMarketSubBtn.style.background = '';
            }
            document.querySelectorAll('.market-sub-content-pane').forEach(p => p.style.display = 'none');
            const defaultMarketSubPane = document.getElementById('sub-pc-market');
            if (defaultMarketSubPane) defaultMarketSubPane.style.display = 'block';
        }
        
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
            bidsCountBadge.style.display = 'none';
            if (!myTeam.isSpectator) {
                const bidsRes = await fetch(`/api/fantasy/leagues/${leagueId}/market/bids`);
                if (bidsRes.ok) {
                    const bidsData = await bidsRes.json();
                    mySentBids = bidsData.sent || [];
                    const receivedPending = bidsData.received || [];
                    if (receivedPending.length > 0) {
                        bidsCountBadge.textContent = receivedPending.length;
                        bidsCountBadge.style.display = 'inline-block';
                    }
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
        loadMiniNewsWidget();

        if (keepCurrentTab) {
            const activeLeftBtn = document.querySelector('.nav-tab-btn.active');
            const activeLeftTab = activeLeftBtn ? activeLeftBtn.getAttribute('data-league-tab') : null;
            if (activeLeftTab === 'leaderboard') {
                await loadLeaderboard();
            } else if (activeLeftTab === 'news-feed') {
                await loadNewsFeed();
            } else if (activeLeftTab === 'admin-panel') {
                await loadAdminPanelData();
            }
            
            const activeSubBtn = document.querySelector('.market-sub-btn.active');
            const activeSubTab = activeSubBtn ? activeSubBtn.getAttribute('data-sub-tab') : null;
            if (activeSubTab === 'user-market') {
                await loadUserMarket();
            } else if (activeSubTab === 'bids-market') {
                await loadMarketBids();
            }
        }
        startAutoRefresh();
        if (openJoinDirectly && myTeam.isSpectator) {
            openJoinModalFromSpectator();
        }
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
        sessionStorage.removeItem('selected_league_id');
        sessionStorage.removeItem('league_password_' + leagueId);
        currentLeagueId = null;
        showLeagueSelector();
    }
}

// Join Submit
async function handleJoinLeagueSubmit(e) {
    e.preventDefault();
    const teamName = joinTeamNameInput.value;
    if (!teamName || !pendingJoinLeagueId) return;
    
    try {
        const password = sessionStorage.getItem('league_password_' + pendingJoinLeagueId) || '';
        const res = await fetch(`/api/fantasy/leagues/${pendingJoinLeagueId}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teamName, password })
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

function openJoinModalFromSpectator() {
    pendingJoinLeagueId = currentLeagueId;
    joinLeagueModalName.textContent = activeLeague ? activeLeague.name : 'Liga';
    joinTeamNameInput.value = '';
    joinLeagueModal.classList.add('open');
}
window.openJoinModalFromSpectator = openJoinModalFromSpectator;

// Filter and Render Player Market list
function filterAndRenderMarket() {
    const searchVal = marketSearch.value.toLowerCase().trim();
    const posVal = marketPosFilter.value;
    const sortVal = marketSort.value;

    currentFilteredPlayers = allPlayers.filter(p => {
        const matchesSearch = !searchVal || 
            p.eaPlayerName.toLowerCase().includes(searchVal) || 
            p.lastClub.toLowerCase().includes(searchVal);
        const matchesPos = !posVal || matchPositionCategory(p.lastPosition, posVal);
        
        if (!searchVal && p.owner) {
            return false;
        }
        
        return matchesSearch && matchesPos;
    });

    // Sort based on selection
    if (sortVal === 'points-asc') {
        currentFilteredPlayers.sort((a, b) => a.points - b.points);
    } else if (sortVal === 'price-desc') {
        currentFilteredPlayers.sort((a, b) => b.price - a.price);
    } else if (sortVal === 'price-asc') {
        currentFilteredPlayers.sort((a, b) => a.price - b.price);
    } else { // 'points-desc' or default
        currentFilteredPlayers.sort((a, b) => b.points - a.points);
    }

    marketList.innerHTML = '';
    
    if (currentFilteredPlayers.length === 0) {
        marketList.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No se encontraron jugadores.</td></tr>`;
        return;
    }

    currentFilteredPlayers.forEach(p => {
        const isOwned = myTeam.players.includes(p.eaPlayerName);
        const row = document.createElement('tr');
        
        const tableCardHtml = getTableCardHtml(p);

        let priceCol = `<span style="font-weight: 600;">${formatCurrency(p.price)}</span>`;
        let actionCol = '';

        if (myTeam.isSpectator) {
            actionCol = `<button class="btn btn-secondary btn-xs" disabled style="opacity: 0.6; cursor: not-allowed;"><i class="fa-solid fa-eye"></i> Espectador</button>`;
        } else if (!myTeam.approved) {
            actionCol = `<button class="btn btn-secondary btn-xs" disabled style="opacity: 0.6; cursor: not-allowed;"><i class="fa-solid fa-clock"></i> Pendiente Aprobación</button>`;
        } else if (isOwned) {
            actionCol = `<button class="btn btn-secondary btn-xs" disabled><i class="fa-solid fa-check"></i> En tu equipo</button>`;
        } else if (p.owner) {
            const clauseVal = Math.max(p.clause || 0, Math.round(p.price * (activeLeague?.clauseMultiplier || 1.5)));
            let isProtected = false;
            let timeStr = '';
            if (p.protectedUntil) {
                const protDate = new Date(p.protectedUntil);
                if (protDate > new Date()) {
                    isProtected = true;
                    const diffMs = protDate.getTime() - Date.now();
                    const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
                    const hours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                    const mins = Math.max(1, Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000)));
                    if (days > 0) timeStr += `${days}d `;
                    if (hours > 0 || days > 0) timeStr += `${hours}h `;
                    timeStr += `${mins}m`;
                }
            }

            if (isProtected) {
                priceCol = `
                    <div style="font-size: 0.8rem; color: #64748b; text-decoration: line-through;">${formatCurrency(p.price)}</div>
                    <div class="text-yellow" style="font-weight: 700; display: flex; align-items: center; justify-content: flex-end; gap: 4px;">
                        <i class="fa-solid fa-lock" style="color: #ef4444; font-size: 0.85rem;" title="Protección de clausulazo restante: ${timeStr}"></i>
                        <span>${formatCurrency(clauseVal)}</span>
                    </div>
                    <div style="font-size: 0.7rem; color: #ef4444; margin-top: 2px;">Lock: ${timeStr}</div>
                `;
                actionCol = `<button class="btn btn-warning btn-xs btn-clausulazo" disabled style="opacity: 0.6; cursor: not-allowed;" title="Protegido durante ${timeStr}"><i class="fa-solid fa-lock"></i> Protegido</button>`;
            } else {
                priceCol = `
                    <div style="font-size: 0.8rem; color: #64748b; text-decoration: line-through;">${formatCurrency(p.price)}</div>
                    <div class="text-yellow" style="font-weight: 700;">${formatCurrency(clauseVal)}</div>
                `;
                if (activeLeague && activeLeague.allowClauses !== false) {
                    const buyoutErr = getBuyoutLockError();
                    const marketLockErr = getMarketLockError();
                    if (marketLockErr) {
                        actionCol = `<button class="btn btn-warning btn-xs btn-clausulazo" disabled style="opacity: 0.6; cursor: not-allowed;" title="${marketLockErr}"><i class="fa-solid fa-lock"></i> Lock</button>`;
                    } else if (buyoutErr) {
                        actionCol = `<button class="btn btn-warning btn-xs btn-clausulazo" disabled style="opacity: 0.6; cursor: not-allowed;" title="${buyoutErr}"><i class="fa-solid fa-lock"></i> Lock</button>`;
                    } else {
                        actionCol = `<button class="btn btn-warning btn-xs btn-clausulazo" data-name="${p.eaPlayerName}" data-clause="${clauseVal}" data-owner="${p.owner}" ${(!activeLeague.marketOpen || activeLeague.status === 'closed') ? 'disabled' : ''}><i class="fa-solid fa-bolt"></i> Clausulazo</button>`;
                    }
                } else {
                    actionCol = `<span class="badge badge-info text-xs" style="font-size: 0.75rem; border: none; padding: 4px 8px; border-radius: 4px; display: inline-block;"><i class="fa-solid fa-user-lock"></i> ${p.owner}</span>`;
                }
            }
        } else {
            const bidCount = p.bidCount || 0;
            const bidCountText = bidCount > 0 ? `${bidCount} ${bidCount === 1 ? 'puja' : 'pujas'}` : 'Sin pujas';
            const isMarketLck = isMarketLocked();
            const marketLockErr = getMarketLockError();
            actionCol = `
                <button class="btn btn-success btn-xs btn-open-free-agent-bid" data-name="${p.eaPlayerName}" ${(activeLeague && (!activeLeague.marketOpen || activeLeague.status === 'closed') || isMarketLck) ? 'disabled' : ''} ${isMarketLck ? `title="${marketLockErr}" style="opacity: 0.6; cursor: not-allowed;"` : ''}>
                    <i class="fa-solid fa-gavel"></i> Pujar
                </button>
                <div class="text-center" style="font-size: 0.7rem; color: ${bidCount > 0 ? '#38bdf8' : '#64748b'}; margin-top: 4px; font-weight: 500;">
                    ${bidCountText}
                </div>
            `;
        }

        row.innerHTML = `
            <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                    ${tableCardHtml}
                    <div>
                        <div class="clickable-player-name" style="font-weight: 700; color: #38bdf8; cursor: pointer; text-decoration: underline;" onclick="openPlayerStatsModalByName('${p.eaPlayerName.replace(/'/g, "\\'")}')">${p.eaPlayerName}</div>
                        <div class="mobile-only-details" style="display: none; font-size: 0.75rem; color: #64748b; margin-top: 2px;">
                            ${p.lastClub} • <span class="text-yellow" style="font-weight: 600;">${formatPlayerPoints(p)} pts</span>
                        </div>
                    </div>
                </div>
            </td>
            <td class="text-muted col-hide-md">${p.lastClub}</td>
            <td><span class="position-badge pos-${p.lastPosition.toLowerCase()}">${p.lastPosition}</span></td>
            <td class="text-center text-yellow col-hide-sm" style="font-weight: 700;">${formatPlayerPoints(p)}</td>
            <td class="text-right price-text">${priceCol}</td>
            <td class="text-center">
                ${actionCol}
            </td>
        `;

        if (!myTeam.isSpectator && myTeam.approved) {
            const buyBtn = row.querySelector('.btn-buy');
            if (buyBtn && activeLeague && activeLeague.marketOpen) {
                buyBtn.addEventListener('click', () => buyPlayer(p));
            }

            const freeAgentBidBtn = row.querySelector('.btn-open-free-agent-bid');
            if (freeAgentBidBtn && activeLeague && activeLeague.marketOpen) {
                freeAgentBidBtn.addEventListener('click', () => {
                    bidPlayerName.textContent = p.eaPlayerName;
                    bidSellerTeamVal.textContent = 'Agente Libre (SYSTEM)';
                    bidAskingPriceVal.textContent = formatCurrency(p.price);
                    bidBalanceVal.textContent = formatCurrency(myTeam.balance);
                    bidAmountInput.value = new Intl.NumberFormat('es-ES').format(p.price);
                    bidForm.setAttribute('data-player-name', p.eaPlayerName);
                    bidForm.setAttribute('data-seller-id', 'SYSTEM');
                    bidForm.setAttribute('data-market-price', p.price);
                    bidModal.classList.add('open');
                });
            }

            const clausulazoBtn = row.querySelector('.btn-clausulazo');
            if (clausulazoBtn && activeLeague && activeLeague.marketOpen && !clausulazoBtn.disabled) {
                const clauseVal = Math.max(p.clause || 0, Math.round(p.price * (activeLeague?.clauseMultiplier || 1.5)));
                clausulazoBtn.addEventListener('click', () => executeClausulazo(p, clauseVal));
            }
        }

        marketList.appendChild(row);
    });
}

// Render owned squad list
function renderSquadList() {
    squadList.innerHTML = '';
    
    if (myTeam.isSpectator) {
        squadList.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted"><i class="fa-solid fa-eye"></i> Modo Espectador. Únete a la liga para crear tu plantilla.</td></tr>`;
        return;
    }

    if (!myTeam.approved) {
        squadList.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-warning"><i class="fa-solid fa-clock"></i> Inscripción pendiente de aprobación. Podrás gestionar tu plantilla una vez seas aprobado.</td></tr>`;
        return;
    }
    
    if (!myTeam.players || myTeam.players.length === 0) {
        squadList.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">No tienes jugadores. Ficha en el Mercado.</td></tr>`;
        return;
    }

    myTeam.players.forEach(playerName => {
        const p = allPlayers.find(x => x.eaPlayerName && x.eaPlayerName.toLowerCase() === playerName.toLowerCase());
        if (!p) return;

        const isAligned = isPlayerInLineup(playerName);
        const row = document.createElement('tr');

        const playerClause = Math.max(myTeam.clauses?.[playerName] || 0, Math.round(p.price * (activeLeague?.clauseMultiplier || 1.5)));
        const isListed = (marketListings || []).some(l => l.eaPlayerName === playerName);

        let protectionHtml = '';
        if (myTeam.clausesProtectedUntil && myTeam.clausesProtectedUntil[playerName]) {
            const protDate = new Date(myTeam.clausesProtectedUntil[playerName]);
            if (protDate > new Date()) {
                const diffMs = protDate.getTime() - Date.now();
                const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
                const hours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                const mins = Math.max(1, Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000)));
                let timeStr = '';
                if (days > 0) timeStr += `${days}d `;
                if (hours > 0 || days > 0) timeStr += `${hours}h `;
                timeStr += `${mins}m`;
                protectionHtml = `<div style="font-size: 0.7rem; color: #22c55e; margin-top: 2px; display: flex; align-items: center; justify-content: flex-end; gap: 4px;"><i class="fa-solid fa-lock" title="Protección de clausulazo restante: ${timeStr}"></i> <span>Lock: ${timeStr}</span></div>`;
            }
        }

        const tableCardHtml = getTableCardHtml(p);

        row.innerHTML = `
            <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                    ${tableCardHtml}
                    <div>
                        <div style="font-weight: 700; color: #f8fafc;">
                            <span class="clickable-player-name" style="color: #38bdf8; cursor: pointer; text-decoration: underline;" onclick="openPlayerStatsModalByName('${p.eaPlayerName.replace(/'/g, "\\'")}')">${p.eaPlayerName}</span>
                            <span class="mobile-only-inline-block badge ${isAligned ? 'btn-success' : 'text-muted'}" style="display: none; border: none; font-size: 0.65rem; padding: 2px 4px; margin-left: 4px;">
                                ${isAligned ? 'Alineado' : 'Banquillo'}
                            </span>
                        </div>
                        <div class="mobile-only-details" style="display: none; font-size: 0.75rem; color: #64748b; margin-top: 2px;">
                            ${p.lastClub} • <span class="text-yellow" style="font-weight: 600;">${formatPlayerPoints(p)} pts</span> • <span>Valor: ${formatCurrency(p.price)}</span>
                        </div>
                    </div>
                </div>
            </td>
            <td class="text-muted col-hide-md">${p.lastClub}</td>
            <td><span class="position-badge pos-${p.lastPosition.toLowerCase()}">${p.lastPosition}</span></td>
            <td class="text-center text-yellow col-hide-sm" style="font-weight: 700;">${formatPlayerPoints(p)}</td>
            <td class="text-center col-hide-sm">
                <span class="badge ${isAligned ? 'btn-success' : 'text-muted'}" style="border: none;">
                    ${isAligned ? 'Alineado' : 'Banquillo'}
                </span>
            </td>
            <td class="text-right price-text text-yellow" style="font-weight: 700;">
                <div>${formatCurrency(playerClause)}</div>
                ${protectionHtml}
            </td>
            <td class="text-right price-text col-hide-sm">${formatCurrency(p.price)}</td>
            <td class="text-center">
                <div style="display: flex; gap: 4px; justify-content: center;">
                    <button class="btn btn-danger btn-xs btn-sell" data-name="${p.eaPlayerName}" ${activeLeague && (!activeLeague.marketOpen || activeLeague.status === 'closed') ? 'disabled' : ''}><i class="fa-solid fa-dollar-sign"></i> Vender (65%)</button>
                    <button class="btn btn-warning btn-xs btn-clause" data-name="${p.eaPlayerName}" ${activeLeague && (!activeLeague.allowClauses || !activeLeague.marketOpen || activeLeague.status === 'closed') ? 'disabled' : ''}><i class="fa-solid fa-arrow-trend-up"></i> Cláusula</button>
                    ${isListed 
                        ? `<button class="btn btn-secondary btn-xs btn-unlist" data-name="${p.eaPlayerName}" ${activeLeague && (!activeLeague.marketOpen || activeLeague.status === 'closed') ? 'disabled' : ''}><i class="fa-solid fa-minus"></i> Quitar Venta</button>`
                        : `<button class="btn btn-info btn-xs btn-list" data-name="${p.eaPlayerName}" ${activeLeague && (!activeLeague.marketOpen || activeLeague.status === 'closed') ? 'disabled' : ''}><i class="fa-solid fa-tag"></i> Vender en Mercado</button>`
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
    if (myTeam.isSpectator || !myTeam.approved) {
        squadValueEl.textContent = '-';
        if (squadCountEl) squadCountEl.textContent = '0';
        return;
    }
    let totalVal = 0;
    const squadSize = myTeam.players ? myTeam.players.length : 0;
    
    if (myTeam.players) {
        myTeam.players.forEach(playerName => {
            const p = allPlayers.find(x => x.eaPlayerName && x.eaPlayerName.toLowerCase() === playerName.toLowerCase());
            if (p) totalVal += p.price;
        });
    }
    
    squadValueEl.textContent = formatCurrency(totalVal);
    squadCountEl.textContent = squadSize;
}

function getCardTierClass(price) {
    const prc = parseFloat(price) || 0;
    if (prc < 5000000) return 'bronze';
    if (prc < 10000000) return 'silver';
    if (prc < 20000000) return 'gold';
    if (prc < 35000000) return 'burgundy';
    if (prc < 55000000) return 'diamond';
    if (prc < 76000000) return 'prismatic';
    if (prc < 95000000) return 'icon';
    return 'thunder';
}

function getTableCardHtml(p) {
    if (!p) return '';
    const tierClass = getCardTierClass(p.price);
    const displayedPoints = Math.round(p.points * 10) / 10;
    const lastName = p.eaPlayerName.trim().split(' ').pop();
    
    // Dynamic sizing for long names to avoid truncation
    const nameLength = lastName.length;
    let nameStyle = '';
    if (nameLength > 12) {
        nameStyle = 'style="--name-scale: 0.65; letter-spacing: -0.04em;"';
    } else if (nameLength > 10) {
        nameStyle = 'style="--name-scale: 0.72; letter-spacing: -0.03em;"';
    } else if (nameLength > 8) {
        nameStyle = 'style="--name-scale: 0.80; letter-spacing: -0.02em;"';
    } else if (nameLength > 6) {
        nameStyle = 'style="--name-scale: 0.88; letter-spacing: -0.01em;"';
    } else if (nameLength > 5) {
        nameStyle = 'style="--name-scale: 0.95; letter-spacing: -0.005em;"';
    }
    
    const hasAvatar = !!p.avatar;
    const avatarHtml = hasAvatar ? 
        `<img src="https://virtualprogaming.com/cdn-cgi/imagedelivery/cl8ocWLdmZDs72LEaQYaYw/${p.avatar}/smThumb" alt="" class="player-avatar-img">` : 
        `<i class="fa-solid fa-shield-halved avatar-shield-back"></i><i class="fa-solid fa-user"></i>`;
    const avatarClass = hasAvatar ? 'player-card-ut-avatar' : 'player-card-ut-avatar no-avatar';
    const logoHtml = p.clubLogo ? 
        `<img src="${p.clubLogo}" alt="" class="player-club-logo-img">` : 
        `<i class="fa-solid fa-shield-halved"></i>`;
    const posLabel = p.lastPosition ? p.lastPosition.split(' ')[0] : 'MC';

    const thunderBoltsHtml = tierClass === 'thunder' ? `
        <div class="thunder-bolt thunder-bolt-1"></div>
        <div class="thunder-bolt thunder-bolt-2"></div>
        <div class="thunder-bolt-3"></div>
        <div class="thunder-bolt-4"></div>
        <div class="thunder-flash-overlay"></div>
    ` : '';

    return `
        <div class="table-player-card-wrapper">
            <div class="player-card-ut occupied ${tierClass} table-player-card">
                <div class="player-card-ut-inner">
                    <div class="player-card-ut-rating-pos">
                        <span class="player-card-ut-rating">${displayedPoints}</span>
                        <span class="player-card-ut-position">${posLabel}</span>
                    </div>
                    <div class="player-card-ut-club-logo">
                        ${logoHtml}
                    </div>
                    <div class="${avatarClass}">
                        ${avatarHtml}
                    </div>
                    <div class="player-card-ut-name" ${nameStyle}>${lastName}</div>
                    ${thunderBoltsHtml}
                </div>
            </div>
        </div>
    `;
}

// Render Soccer pitch
function renderField() {
    const markingsHtml = `
        <div class="field-penalty-area-top"></div>
        <div class="field-center-circle"></div>
        <div class="field-penalty-area-bottom"></div>
    `;
    soccerField.innerHTML = markingsHtml;

    if (myTeam.isSpectator || !myTeam.approved) {
        const overlay = document.createElement('div');
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.background = 'rgba(10, 25, 15, 0.65)';
        overlay.style.backdropFilter = 'blur(10px)';
        overlay.style.webkitBackdropFilter = 'blur(10px)';
        overlay.style.zIndex = '10';
        overlay.style.padding = '20px';
        overlay.style.textAlign = 'center';
        
        if (myTeam.isSpectator) {
            overlay.innerHTML = `
                <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; padding: 30px; box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37); max-width: 90%; backdrop-filter: blur(4px);">
                    <i class="fa-solid fa-eye text-green" style="font-size: 3rem; margin-bottom: 15px; filter: drop-shadow(0 0 10px rgba(34, 197, 94, 0.4));"></i>
                    <h3 style="color: #f8fafc; font-size: 1.5rem; margin-bottom: 10px; font-weight: 700;">Modo Espectador</h3>
                    <p style="color: #cbd5e1; font-size: 0.95rem; margin-bottom: 20px; line-height: 1.5;">Estás viendo esta liga en modo de sólo lectura. Para poder gestionar tu plantilla y participar en el mercado, necesitas unirte.</p>
                    <button class="btn btn-success" onclick="openJoinModalFromSpectator()" style="padding: 10px 20px; font-size: 1rem; border-radius: 8px; font-weight: 600; display: inline-flex; align-items: center; gap: 8px; transition: all 0.3s ease; box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);">
                        <i class="fa-solid fa-plus-circle"></i> Unirse a la Liga
                    </button>
                </div>
            `;
        } else {
            overlay.innerHTML = `
                <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; padding: 30px; box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37); max-width: 90%; backdrop-filter: blur(4px);">
                    <i class="fa-solid fa-clock-rotate-left text-yellow fa-spin-pulse" style="font-size: 3rem; margin-bottom: 15px; filter: drop-shadow(0 0 10px rgba(234, 179, 8, 0.4));"></i>
                    <h3 style="color: #f8fafc; font-size: 1.5rem; margin-bottom: 10px; font-weight: 700;">Inscripción Pendiente</h3>
                    <p style="color: #cbd5e1; font-size: 0.95rem; margin-bottom: 20px; line-height: 1.5;">Tu equipo <strong>${myTeam.teamName}</strong> está registrado y pendiente de aprobación por el administrador de la liga. Podrás gestionar tu plantilla una vez seas aprobado.</p>
                </div>
            `;
        }
        soccerField.appendChild(overlay);
        return;
    }

    const currentLayout = FORMATIONS[myTeam.formation];
    if (!currentLayout) return;
    
    for (const groupKey in currentLayout) {
        const positions = currentLayout[groupKey];
        positions.forEach((pos, idx) => {
            const node = document.createElement('div');
            node.className = 'field-player-node';
            node.style.left = `${pos.left}%`;
            node.style.top = `${pos.top}%`;

            const alignedPlayer = groupKey === 'POR' ? myTeam.lineup.POR : (myTeam.lineup[groupKey] && myTeam.lineup[groupKey][idx]);

            if (alignedPlayer) {
                const p = allPlayers.find(x => x.eaPlayerName && x.eaPlayerName.toLowerCase() === alignedPlayer.toLowerCase());
                const displayedPoints = p ? Math.round(p.points * 10) / 10 : 0;
                const tierPoints = p ? Math.round((p.points + (p.basePoints || 0)) * 10) / 10 : 0;
                const lastName = alignedPlayer.trim().split(' ').pop();


                // Dynamic sizing for long names to avoid truncation
                const nameLength = lastName.length;
                let nameStyle = '';
                if (nameLength > 12) {
                    nameStyle = 'style="--name-scale: 0.65; letter-spacing: -0.04em;"';
                } else if (nameLength > 10) {
                    nameStyle = 'style="--name-scale: 0.72; letter-spacing: -0.03em;"';
                } else if (nameLength > 8) {
                    nameStyle = 'style="--name-scale: 0.80; letter-spacing: -0.02em;"';
                } else if (nameLength > 6) {
                    nameStyle = 'style="--name-scale: 0.88; letter-spacing: -0.01em;"';
                } else if (nameLength > 5) {
                    nameStyle = 'style="--name-scale: 0.95; letter-spacing: -0.005em;"';
                }

                const hasAvatar = p && p.avatar;
                const avatarHtml = hasAvatar ? 
                    `<img src="https://virtualprogaming.com/cdn-cgi/imagedelivery/cl8ocWLdmZDs72LEaQYaYw/${p.avatar}/smThumb" alt="" class="player-avatar-img">` : 
                    `<i class="fa-solid fa-shield-halved avatar-shield-back"></i><i class="fa-solid fa-user"></i>`;
                const avatarClass = hasAvatar ? 'player-card-ut-avatar' : 'player-card-ut-avatar no-avatar';

                const logoHtml = p && p.clubLogo ? 
                    `<img src="${p.clubLogo}" alt="" class="player-club-logo-img">` : 
                    `<i class="fa-solid fa-shield-halved"></i>`;

                const pitchTierClass = getCardTierClass(p ? p.price : 0);
                const pitchThunderHtml = pitchTierClass === 'thunder' ? `
                    <div class="thunder-bolt thunder-bolt-1"></div>
                    <div class="thunder-bolt thunder-bolt-2"></div>
                    <div class="thunder-bolt-3"></div>
                    <div class="thunder-bolt-4"></div>
                    <div class="thunder-flash-overlay"></div>
                ` : '';

                node.innerHTML = `
                    <div class="player-card-ut occupied ${pitchTierClass}">
                        <div class="player-card-ut-inner">
                            <div class="player-card-ut-rating-pos">
                                <span class="player-card-ut-rating">${displayedPoints}</span>
                                <span class="player-card-ut-position">${pos.label.split(' ')[0]}</span>
                            </div>
                            <div class="player-card-ut-club-logo">
                                ${logoHtml}
                            </div>
                            <div class="${avatarClass}">
                                ${avatarHtml}
                            </div>
                            <div class="player-card-ut-name" ${nameStyle}>${lastName}</div>
                            ${pitchThunderHtml}
                        </div>
                    </div>
                `;
            } else {
                node.innerHTML = `
                    <div class="player-card-ut vacant">
                        <div class="player-card-ut-inner">
                            <div class="player-card-ut-add">
                                <i class="fa-solid fa-plus"></i>
                            </div>
                            <div class="player-card-ut-position-label">${pos.label.split(' ')[0]}</div>
                        </div>
                    </div>
                `;
            }

            node.addEventListener('click', () => openPositionSelector(groupKey, idx));
            soccerField.appendChild(node);
        });
    }

    // Aviso visual: 11 titulares requeridos para puntuar
    const lineupWarning = document.getElementById('lineup-incomplete-warning');
    if (lineupWarning) {
        let filledCount = 0;
        if (myTeam.lineup) {
            if (myTeam.lineup.POR) filledCount++;
            if (Array.isArray(myTeam.lineup.DFC)) filledCount += myTeam.lineup.DFC.filter(p => p).length;
            if (Array.isArray(myTeam.lineup.MC)) filledCount += myTeam.lineup.MC.filter(p => p).length;
            if (Array.isArray(myTeam.lineup.DC)) filledCount += myTeam.lineup.DC.filter(p => p).length;
        }
        if (filledCount < 11) {
            lineupWarning.style.display = 'flex';
            lineupWarning.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span><strong>Once incompleto (${filledCount}/11):</strong> Tu equipo no puntuará en la próxima jornada. Necesitas tener los 11 puestos ocupados.</span>`;
        } else {
            lineupWarning.style.display = 'none';
        }
    }
}

// Open modal selection
function openPositionSelector(posKey, idx) {
    if (isLineupLocked()) {
        showToast(getLineupLockErrorText(), 'error');
        return;
    }
    selectedSlotPos = posKey;
    selectedSlotIdx = idx;

    modalPositionName.textContent = posKey;

    const modalBody = positionModal.querySelector('.modal-body');
    if (!modalBody) return;

    const matchingPlayers = (myTeam.players || []).filter(name => {
        const p = allPlayers.find(x => x.eaPlayerName && x.eaPlayerName.toLowerCase() === name.toLowerCase());
        if (!p) return false;
        return isPlayerEligibleForSlot(p.lastPosition, posKey, myTeam.formation, idx);
    });

    const alignedPlayer = posKey === 'POR' ? myTeam.lineup.POR : (myTeam.lineup[posKey] && myTeam.lineup[posKey][idx]);
    const alignedPlayerProfile = alignedPlayer ? allPlayers.find(x => x.eaPlayerName && x.eaPlayerName.toLowerCase() === alignedPlayer.toLowerCase()) : null;

    if (alignedPlayer && alignedPlayerProfile) {
        const p = alignedPlayerProfile;
        const clauseVal = Math.max(myTeam.clauses?.[alignedPlayer] || 0, Math.round(p.price * (activeLeague?.clauseMultiplier || 1.5)));
        const displayedPoints = p ? Math.round(p.points * 10) / 10 : 0;
        const tierPoints = p ? Math.round((p.points + (p.basePoints || 0)) * 10) / 10 : 0;

        // Dynamic rating font scaling
        const pointsStr = String(displayedPoints);
        let ratingStyle = '';
        if (pointsStr.length >= 5) {
            ratingStyle = 'style="font-size: 1.05rem; margin-top: 3px;"';
        } else if (pointsStr.length >= 4) {
            ratingStyle = 'style="font-size: 1.25rem; margin-top: 2px;"';
        }

        const avatarUrl = p.avatar ? `https://virtualprogaming.com/cdn-cgi/imagedelivery/cl8ocWLdmZDs72LEaQYaYw/${p.avatar}/smThumb` : null;
        const avatarHtml = avatarUrl ? `<img src="${avatarUrl}" alt="" class="fut-card-player-avatar-img">` : `<i class="fa-solid fa-user-ninja"></i>`;
        const clubLogoHtml = p.clubLogo ? `<img src="${p.clubLogo}" alt="" class="fut-card-club-logo-img">` : `<i class="fa-solid fa-shield-halved"></i>`;

        const modalTierClass = getCardTierClass(p ? p.price : 0);
        const modalThunderHtml = modalTierClass === 'thunder' ? `
            <div class="thunder-bolt thunder-bolt-1"></div>
            <div class="thunder-bolt thunder-bolt-2"></div>
            <div class="thunder-bolt-3"></div>
            <div class="thunder-bolt-4"></div>
            <div class="thunder-flash-overlay"></div>
        ` : '';

        modalBody.innerHTML = `
            <div class="modal-split-layout">
                <div class="modal-card-column">
                    <div class="fut-card ${modalTierClass}">
                        <div class="fut-card-inner">
                            <div class="fut-card-top-section">
                                <div class="fut-card-left-col">
                                    <div class="fut-card-rating" ${ratingStyle}>${displayedPoints}</div>
                                    <div class="fut-card-pos">${posKey}</div>
                                    <div class="fut-card-flag">
                                        <img src="${getFlagUrl(p.nationality)}" alt="${p.nationality || 'es'}" class="fut-card-flag-img">
                                    </div>
                                    <div class="fut-card-club-badge">
                                        ${clubLogoHtml}
                                    </div>
                                </div>
                                <div class="fut-card-player-avatar-container">
                                    ${avatarHtml}
                                </div>
                            </div>
                            <div class="fut-card-player-name">${p.eaPlayerName.trim().split(' ').pop()}</div>
                            <div class="fut-card-stats-grid">
                                <div class="fut-card-stat-item">
                                    <span class="fut-card-stat-value">${p.matchesPlayed || 0}</span>
                                    <span class="fut-card-stat-label">PJ</span>
                                </div>
                                <div class="fut-card-stat-item">
                                    <span class="fut-card-stat-value">${parseFloat(p.avgRating || 0).toFixed(2)}</span>
                                    <span class="fut-card-stat-label">RAT</span>
                                </div>
                                <div class="fut-card-stat-item">
                                    <span class="fut-card-stat-value">${p.goals || 0}</span>
                                    <span class="fut-card-stat-label">G</span>
                                </div>
                                <div class="fut-card-stat-item">
                                    <span class="fut-card-stat-value">${p.assists || 0}</span>
                                    <span class="fut-card-stat-label">A</span>
                                </div>
                                <div class="fut-card-stat-item">
                                    <span class="fut-card-stat-value value-highlight">${formatCompactVal(p.price)}</span>
                                    <span class="fut-card-stat-label">VAL</span>
                                </div>
                                <div class="fut-card-stat-item">
                                    <span class="fut-card-stat-value clause-highlight">${formatCompactVal(clauseVal)}</span>
                                    <span class="fut-card-stat-label">CLA</span>
                                </div>
                            </div>
                            ${modalThunderHtml}
                        </div>
                    </div>
                </div>
                <div class="modal-actions-column">
                    <div class="modal-initial-actions">
                        <button class="btn btn-primary btn-block btn-substitute">
                            <i class="fa-solid fa-arrows-rotate"></i> Sustituir Jugador
                        </button>
                        <button class="btn btn-danger btn-block btn-remove">
                            <i class="fa-solid fa-trash-can"></i> Quitar de alineación
                        </button>
                    </div>
                    <div class="modal-replacements-section" style="display: none;">
                        <button class="btn btn-secondary btn-xs btn-back-actions" style="margin-bottom: 12px; display: inline-flex; align-items: center; gap: 4px;">
                            <i class="fa-solid fa-arrow-left"></i> Atrás
                        </button>
                        <p class="modal-instruction" style="margin-bottom: 8px; font-size: 0.85rem;">Sustituir por:</p>
                        <div class="modal-player-list replacement-list"></div>
                    </div>
                </div>
            </div>
        `;

        const btnSubstitute = modalBody.querySelector('.btn-substitute');
        const btnRemove = modalBody.querySelector('.btn-remove');
        const initialActions = modalBody.querySelector('.modal-initial-actions');
        const replacementsSection = modalBody.querySelector('.modal-replacements-section');
        const btnBackActions = modalBody.querySelector('.btn-back-actions');
        const replacementListEl = modalBody.querySelector('.replacement-list');

        btnSubstitute.addEventListener('click', () => {
            initialActions.style.display = 'none';
            replacementsSection.style.display = 'flex';
        });

        btnBackActions.addEventListener('click', () => {
            replacementsSection.style.display = 'none';
            initialActions.style.display = 'flex';
        });

        btnRemove.addEventListener('click', () => {
            removePlayerFromSlot(posKey, idx);
            positionModal.classList.remove('open');
            renderField();
            renderSquadList();
        });

        populatePlayerListElements(replacementListEl, matchingPlayers, alignedPlayer);

    } else {
        // If vacant or profile not found
        modalBody.innerHTML = `
            <p class="modal-instruction">Selecciona un jugador disponible para esta posición:</p>
            <div class="modal-player-list" id="modal-player-list"></div>
        `;
        const listEl = modalBody.querySelector('.modal-player-list');
        populatePlayerListElements(listEl, matchingPlayers, alignedPlayer);
    }

    positionModal.classList.add('open');
}

function populatePlayerListElements(listEl, matchingPlayers, alignedPlayer) {
    listEl.innerHTML = '';
    if (matchingPlayers.length === 0) {
        listEl.innerHTML = `<p class="text-center text-muted py-4">No tienes jugadores de posición ${selectedSlotPos} en tu plantilla.</p>`;
        return;
    }

    matchingPlayers.forEach(name => {
        const isUsed = isPlayerInLineup(name) && name !== alignedPlayer;
        const p = allPlayers.find(x => x.eaPlayerName && x.eaPlayerName.toLowerCase() === name.toLowerCase());
        if (!p) return;

        const row = document.createElement('div');
        row.className = 'modal-player-row';
        if (isUsed) {
            row.style.opacity = '0.5';
            row.style.pointerEvents = 'none';
        }

        const tableCardHtml = getTableCardHtml(p);

        row.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                ${tableCardHtml}
                <div class="modal-player-info">
                    <div class="modal-player-name">${name} ${isUsed ? '(Ya alineado)' : ''}</div>
                    <div class="modal-player-club">${p.lastClub} | Puntos VPG: ${formatPlayerPoints(p)}</div>
                </div>
            </div>
            <i class="fa-solid fa-check text-green"></i>
        `;

        if (!isUsed) {
            row.addEventListener('click', () => {
                alignPlayerToSlot(name, selectedSlotPos, selectedSlotIdx);
                positionModal.classList.remove('open');
                renderField();
                renderSquadList();
            });
        }

        listEl.appendChild(row);
    });
}

function alignPlayerToSlot(playerName, posKey, idx) {
    if (posKey === 'POR') {
        myTeam.lineup.POR = playerName;
    } else {
        if (!myTeam.lineup[posKey]) myTeam.lineup[posKey] = [];
        myTeam.lineup[posKey][idx] = playerName;
    }
    showToast(`${playerName} alineado.`, 'success');
    saveLineupToServer(true);
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
    saveLineupToServer(true);
}

function adjustLineupToNewFormation(oldF, newF) {
    const alignedPlayers = [];
    if (myTeam.lineup) {
        if (Array.isArray(myTeam.lineup.DFC)) {
            myTeam.lineup.DFC.forEach(p => p && alignedPlayers.push(p));
        }
        if (Array.isArray(myTeam.lineup.MC)) {
            myTeam.lineup.MC.forEach(p => p && alignedPlayers.push(p));
        }
        if (Array.isArray(myTeam.lineup.DC)) {
            myTeam.lineup.DC.forEach(p => p && alignedPlayers.push(p));
        }
    }

    const layout = FORMATIONS[newF];
    if (!layout) {
        showToast('Formación no válida.', 'error');
        return;
    }

    const newDFC = new Array(layout.DFC ? layout.DFC.length : 0).fill(null);
    const newMC = new Array(layout.MC ? layout.MC.length : 0).fill(null);
    const newDC = new Array(layout.DC ? layout.DC.length : 0).fill(null);

    const playerPositionMap = {};
    alignedPlayers.forEach(pName => {
        const p = allPlayers.find(x => x.eaPlayerName && x.eaPlayerName.toLowerCase() === pName.toLowerCase());
        if (p) {
            playerPositionMap[pName] = p.lastPosition;
        }
    });

    function fillSlot(slotKey, slotIndex) {
        const foundIndex = alignedPlayers.findIndex(pName => {
            const pos = playerPositionMap[pName];
            return pos && isPlayerEligibleForSlot(pos, slotKey, newF, slotIndex);
        });
        if (foundIndex !== -1) {
            const pName = alignedPlayers[foundIndex];
            alignedPlayers.splice(foundIndex, 1);
            return pName;
        }
        return null;
    }

    for (let i = 0; i < newDFC.length; i++) {
        newDFC[i] = fillSlot('DFC', i);
    }
    for (let i = 0; i < newMC.length; i++) {
        newMC[i] = fillSlot('MC', i);
    }
    for (let i = 0; i < newDC.length; i++) {
        newDC[i] = fillSlot('DC', i);
    }

    myTeam.lineup = {
        POR: myTeam.lineup ? myTeam.lineup.POR : null,
        DFC: newDFC,
        MC: newMC,
        DC: newDC
    };

    saveLineupToServer();
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
        await enterLeague(currentLeagueId, true);
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

// Sell Player Operation
async function sellPlayer(player) {
    const marketLockErr = getMarketLockError();
    if (marketLockErr) {
        showToast(marketLockErr, 'error');
        return;
    }

    const saleReimbursement = Math.round(player.price * 0.65);
    if (!confirm(`¿Estás seguro de que deseas vender a ${player.eaPlayerName} a la máquina por el 65% de su valor (${formatCurrency(saleReimbursement)})?`)) {
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
        await enterLeague(currentLeagueId, true);
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

// Save Current Lineup Setup to Database
async function saveLineupToServer(silent = false) {
    activeSaveCount++;
    lineupSaveChain = lineupSaveChain.then(async () => {
        await executeSaveLineup(silent);
    }).catch(err => {
        console.error('Error in lineup save chain:', err);
    }).finally(() => {
        activeSaveCount--;
    });
    return lineupSaveChain;
}

async function executeSaveLineup(silent = false) {
    const isSilent = silent === true;
    if (myTeam.isSpectator) return;
    if (isLineupLocked()) {
        showToast(getLineupLockErrorText(), 'error');
        return;
    }
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

        if (!isSilent) {
            showToast(data.message, 'success');
        }
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}

function formatNewsMessage(msg) {
    if (!msg) return '';
    let escaped = escapeHTML(msg);
    return escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

// VIEW 2.2.5: Fetch and render News Feed
async function loadNewsFeed() {
    if (!newsTimelineList) return;
    newsTimelineList.innerHTML = `<div class="text-center py-4 text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Cargando noticias del mercado...</div>`;
    
    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/news?limit=40`);
        if (!res.ok) throw new Error('Error al cargar las noticias.');
        const data = await res.json();
        const news = data.news || [];
        
        newsTimelineList.innerHTML = '';
        
        if (news.length === 0) {
            newsTimelineList.innerHTML = `<div class="text-center py-4 text-muted">No hay noticias o transacciones registradas todavía en esta liga.</div>`;
            return;
        }
        
        news.forEach(item => {
            const date = new Date(item.createdAt);
            const timeStr = date.toLocaleString('es-ES', { 
                day: '2-digit', 
                month: '2-digit', 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            
            let icon = 'fa-newspaper';
            if (item.type === 'clausulazo') icon = 'fa-fire';
            else if (item.type === 'fichaje') icon = 'fa-handshake';
            else if (item.type === 'venta') icon = 'fa-coins';
            else if (item.type === 'oferta') icon = 'fa-tag';
            else if (item.type === 'reward') icon = 'fa-sack-dollar';
            
            const div = document.createElement('div');
            div.className = `news-timeline-item type-${item.type || 'fichaje'}`;
            div.innerHTML = `
                <div class="news-icon-wrapper">
                    <i class="fa-solid ${icon}"></i>
                </div>
                <div class="news-content-wrapper">
                    <div class="news-meta">
                        <span class="news-type-badge">${item.type || 'evento'}</span>
                        <span class="news-time"><i class="fa-regular fa-clock"></i> ${timeStr}</span>
                    </div>
                    <div class="news-message">${formatNewsMessage(item.message)}</div>
                </div>
            `;
            newsTimelineList.appendChild(div);
        });
    } catch (e) {
        console.error(e);
        newsTimelineList.innerHTML = `<div class="text-center py-4 text-danger"><i class="fa-solid fa-triangle-exclamation"></i> ${e.message}</div>`;
    }
}

// Fetch and render top 3 news for mini widget
async function loadMiniNewsWidget() {
    if (!miniNewsList || !miniNewsWidget) return;
    
    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/news?limit=3`);
        if (!res.ok) throw new Error('Error al cargar mini noticias.');
        const data = await res.json();
        const news = data.news || [];
        
        if (news.length === 0) {
            miniNewsWidget.style.display = 'none';
            return;
        }
        
        miniNewsList.innerHTML = '';
        
        news.forEach(item => {
            const date = new Date(item.createdAt);
            const timeStr = date.toLocaleTimeString('es-ES', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            
            let icon = 'fa-newspaper';
            if (item.type === 'clausulazo') icon = 'fa-fire';
            else if (item.type === 'fichaje') icon = 'fa-handshake';
            else if (item.type === 'venta') icon = 'fa-coins';
            else if (item.type === 'oferta') icon = 'fa-tag';
            else if (item.type === 'reward') icon = 'fa-sack-dollar';
            
            const itemDiv = document.createElement('div');
            itemDiv.className = `mini-news-item type-${item.type || 'fichaje'}`;
            itemDiv.innerHTML = `
                <div class="mini-news-icon">
                    <i class="fa-solid ${icon}"></i>
                </div>
                <div class="mini-news-text" title="${escapeHTML(item.message)}">${formatNewsMessage(item.message)}</div>
                <div class="mini-news-time">${timeStr}</div>
            `;
            miniNewsList.appendChild(itemDiv);
        });
        
        miniNewsWidget.style.display = 'block';
    } catch (e) {
        console.error(e);
        miniNewsWidget.style.display = 'none';
    }
}

// VIEW 2.2: Fetch and render Leaderboard
async function loadLeaderboard() {
    leaderboardList.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Cargando clasificación...</td></tr>`;
    
    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/leaderboard`);
        if (!res.ok) throw new Error('Error al cargar la clasificación.');
        const data = await res.json();
        const leaderboard = data.leaderboard || [];
        
        leaderboardList.innerHTML = '';
        
        if (leaderboard.length === 0) {
            leaderboardList.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No hay equipos en la clasificación.</td></tr>`;
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
            
            // Badges in leaderboard
            let roleBadge = '';
            if (activeLeague) {
                if (manager.discordId === activeLeague.createdBy) {
                    roleBadge = ' <span class="role-badge creator-badge" title="Creador">👑</span>';
                } else if (manager.discordId === activeLeague.coAdmin) {
                    roleBadge = ' <span class="role-badge helper-badge" title="Ayudante">⭐</span>';
                }
            }
            
            const lineupValMillions = (manager.lineupValue || 0) / 1000000;
            const formattedLineupValue = lineupValMillions.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'M €';
            
            row.innerHTML = `
                <td class="text-center pos-col ${posBadgeClass}">${manager.position}</td>
                <td>
                    <div class="manager-cell">
                        <img class="manager-avatar" src="${avatarUrl}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                        <div class="manager-info">
                            <span class="team-name-text">${manager.teamName}</span>
                            <span class="manager-username">${manager.discordUsername}${roleBadge} ${manager.isMe ? '(Tú)' : ''}</span>
                        </div>
                    </div>
                </td>
                <td class="text-center font-weight-bold col-hide-sm" style="font-weight: 600;">${manager.playerCount}</td>
                <td class="text-center text-muted col-hide-md">${manager.formation || '4-3-3'}</td>
                <td class="text-right text-white" style="font-weight: 600;">${formattedLineupValue}</td>
                <td class="text-right text-yellow" style="font-weight: 700; font-size: 1.05rem;">${Math.round((manager.points || 0) * 10) / 10} pts</td>
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
        leaderboardList.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-red">Error al cargar la clasificación.</td></tr>`;
    }
}

// Show rival Once inicial modal (Read-only)
// Show rival Once inicial modal (Read-only)
async function showRivalTeam(discordId, teamName) {
    rivalTeamNameTitle.textContent = teamName;
    rivalPointsVal.textContent = '0 pts';
    rivalFormationVal.textContent = '4-3-3';
    
    // Reset view tabs to default list view
    const tabList = document.getElementById('btn-rival-tab-list');
    const tabField = document.getElementById('btn-rival-tab-field');
    const listContainer = document.getElementById('rival-squad-list-container');
    const fieldContainer = document.getElementById('rival-soccer-field-container');
    if (tabList && tabField && listContainer && fieldContainer) {
        tabList.classList.add('active');
        tabField.classList.remove('active');
        listContainer.style.display = 'block';
        fieldContainer.style.display = 'none';
    }

    const listBody = document.getElementById('rival-squad-list');
    if (listBody) {
        listBody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Cargando jugadores...</td></tr>';
    }

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
        
        rivalPointsVal.textContent = `${Math.round((rivalTeam.points || 0) * 10) / 10} pts`;
        rivalFormationVal.textContent = rivalTeam.formation || '4-3-3';
        
        // Render tabular list
        if (listBody) {
            listBody.innerHTML = '';
            if (!rivalTeam.players || rivalTeam.players.length === 0) {
                listBody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">El rival no tiene jugadores asignados.</td></tr>';
            } else {
                rivalTeam.players.forEach(name => {
                    let p = allPlayers.find(x => x.eaPlayerName.toLowerCase() === name.toLowerCase());
                    if (!p) {
                        p = {
                            eaPlayerName: name,
                            lastPosition: 'MC',
                            lastClub: 'Desconocido',
                            price: 80000,
                            points: 0
                        };
                    }
                    
                    const clauseVal = Math.max((rivalTeam.clauses && rivalTeam.clauses[p.eaPlayerName]) || 0, Math.round(p.price * (activeLeague?.clauseMultiplier || 1.5)));
                    let isProtected = false;
                    let timeStr = '';
                    if (rivalTeam.clausesProtectedUntil && rivalTeam.clausesProtectedUntil[p.eaPlayerName]) {
                        const protDate = new Date(rivalTeam.clausesProtectedUntil[p.eaPlayerName]);
                        if (protDate > new Date()) {
                            isProtected = true;
                            const diffMs = protDate.getTime() - Date.now();
                            const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
                            const hours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                            const mins = Math.max(1, Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000)));
                            if (days > 0) timeStr += `${days}d `;
                            if (hours > 0 || days > 0) timeStr += `${hours}h `;
                            timeStr += `${mins}m`;
                        }
                    }

                    let priceCol = '';
                    if (isProtected) {
                        priceCol = `
                            <div style="font-size: 0.8rem; color: #64748b; text-decoration: line-through;">${formatCurrency(p.price)}</div>
                            <div class="text-yellow" style="font-weight: 700; display: flex; align-items: center; justify-content: flex-end; gap: 4px;">
                                <i class="fa-solid fa-lock" style="color: #ef4444; font-size: 0.85rem;" title="Protección de clausulazo restante: ${timeStr}"></i>
                                <span>${formatCurrency(clauseVal)}</span>
                            </div>
                            <div style="font-size: 0.7rem; color: #ef4444; margin-top: 2px;">Lock: ${timeStr}</div>
                        `;
                    } else {
                        priceCol = `
                            <div style="font-size: 0.8rem; color: #64748b; text-decoration: line-through;">${formatCurrency(p.price)}</div>
                            <div class="text-yellow" style="font-weight: 700;">${formatCurrency(clauseVal)}</div>
                        `;
                    }

                    const isMyTeam = (discordId === currentUser.discordId);
                    const canTransact = !myTeam.isSpectator && myTeam.approved && !isMyTeam;
                    let actionCol = '';
                    if (!canTransact) {
                        if (isMyTeam) {
                            actionCol = `<span class="badge badge-secondary text-xs" style="padding: 4px 8px; border-radius: 4px;"><i class="fa-solid fa-user"></i> Tu equipo</span>`;
                        } else if (myTeam.isSpectator) {
                            actionCol = `<span class="text-muted" style="font-size: 0.75rem;"><i class="fa-solid fa-eye"></i> Espectador</span>`;
                        } else {
                            actionCol = `<span class="text-muted" style="font-size: 0.75rem;"><i class="fa-solid fa-clock"></i> Pendiente</span>`;
                        }
                    } else {
                        const isMarketLck = isMarketLocked();
                        const marketLockErr = getMarketLockError();
                        let bidButton = `<button class="btn btn-success btn-xs btn-rival-bid" data-name="${p.eaPlayerName}" style="padding: 3px 8px; font-size: 0.7rem; font-weight: 600;" ${isMarketLck ? `disabled style="opacity: 0.6; cursor: not-allowed;" title="${marketLockErr}"` : ''}><i class="fa-solid fa-gavel"></i> Pujar</button>`;
                        let clauseButton = '';
                        if (activeLeague && activeLeague.allowClauses !== false) {
                            if (isProtected) {
                                clauseButton = `<button class="btn btn-warning btn-xs btn-rival-clausulazo" disabled style="opacity: 0.6; cursor: not-allowed; padding: 3px 8px; font-size: 0.7rem; font-weight: 600;" title="Protegido durante ${timeStr}"><i class="fa-solid fa-lock"></i> Lock</button>`;
                            } else {
                                const buyoutErr = getBuyoutLockError();
                                if (marketLockErr) {
                                    clauseButton = `<button class="btn btn-warning btn-xs btn-rival-clausulazo" disabled style="opacity: 0.6; cursor: not-allowed; padding: 3px 8px; font-size: 0.7rem; font-weight: 600;" title="${marketLockErr}"><i class="fa-solid fa-lock"></i> Lock</button>`;
                                } else if (buyoutErr) {
                                    clauseButton = `<button class="btn btn-warning btn-xs btn-rival-clausulazo" disabled style="opacity: 0.6; cursor: not-allowed; padding: 3px 8px; font-size: 0.7rem; font-weight: 600;" title="${buyoutErr}"><i class="fa-solid fa-lock"></i> Lock</button>`;
                                } else {
                                    clauseButton = `<button class="btn btn-warning btn-xs btn-rival-clausulazo" data-name="${p.eaPlayerName}" data-clause="${clauseVal}" style="padding: 3px 8px; font-size: 0.7rem; font-weight: 600;"><i class="fa-solid fa-bolt"></i> Robo</button>`;
                                }
                            }
                        }
                        actionCol = `<div style="display: flex; gap: 5px; justify-content: center; align-items: center;">${bidButton}${clauseButton}</div>`;
                    }

                    const tableCardHtml = getTableCardHtml(p);

                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                ${tableCardHtml}
                                <div>
                                    <div class="clickable-player-name" style="font-weight: 700; color: #38bdf8; cursor: pointer; text-decoration: underline;" onclick="openPlayerStatsModalByName('${p.eaPlayerName.replace(/'/g, "\\'")}')">${p.eaPlayerName}</div>
                                    <div class="mobile-only-details" style="display: none; font-size: 0.75rem; color: #64748b; margin-top: 2px;">
                                        ${p.lastClub} • <span class="text-yellow" style="font-weight: 600;">${formatPlayerPoints(p)} pts</span>
                                    </div>
                                </div>
                            </div>
                        </td>
                        <td class="text-muted col-hide-md">${p.lastClub}</td>
                        <td><span class="position-badge pos-${p.lastPosition.toLowerCase()}">${p.lastPosition}</span></td>
                        <td class="text-center text-yellow col-hide-sm" style="font-weight: 700;">${formatPlayerPoints(p)}</td>
                        <td class="text-right price-text">${priceCol}</td>
                        <td class="text-center">
                            ${actionCol}
                        </td>
                    `;

                    const bidBtn = row.querySelector('.btn-rival-bid');
                    if (bidBtn) {
                        const cachedP = p;
                        bidBtn.addEventListener('click', () => {
                            bidPlayerName.textContent = cachedP.eaPlayerName;
                            bidSellerTeamVal.textContent = teamName;
                            bidAskingPriceVal.textContent = formatCurrency(cachedP.price);
                            bidBalanceVal.textContent = formatCurrency(myTeam.balance);
                            bidAmountInput.value = new Intl.NumberFormat('es-ES').format(cachedP.price);
                            bidForm.setAttribute('data-player-name', cachedP.eaPlayerName);
                            bidForm.setAttribute('data-seller-id', discordId);
                            bidModal.classList.add('open');
                        });
                    }

                    const clauseBtn = row.querySelector('.btn-rival-clausulazo');
                    if (clauseBtn && !clauseBtn.disabled) {
                        const cachedP = p;
                        clauseBtn.addEventListener('click', () => {
                            const pToBuy = {
                                eaPlayerName: cachedP.eaPlayerName,
                                owner: teamName
                            };
                            executeClausulazo(pToBuy, clauseVal);
                        });
                    }

                    listBody.appendChild(row);
                });
            }
        }
        
        // Render tactical field
        const formation = rivalTeam.formation || '4-3-3';
        const layout = FORMATIONS[formation];
        if (layout) {
            for (const groupKey in layout) {
                const positions = layout[groupKey];
                positions.forEach((pos, idx) => {
                    const node = document.createElement('div');
                    node.className = 'field-player-node rival-player-node';
                    node.style.left = `${pos.left}%`;
                    node.style.top = `${pos.top}%`;

                    const alignedPlayer = groupKey === 'POR' ? rivalTeam.lineup.POR : (rivalTeam.lineup[groupKey] && rivalTeam.lineup[groupKey][idx]);

                    if (alignedPlayer) {
                        const p = allPlayers.find(x => x.eaPlayerName && x.eaPlayerName.toLowerCase() === alignedPlayer.toLowerCase());
                        const displayedPoints = p ? Math.round(p.points * 10) / 10 : 0;
                        const tierPoints = p ? Math.round((p.points + (p.basePoints || 0)) * 10) / 10 : 0;
                        const lastName = alignedPlayer.trim().split(' ').pop();


                        // Dynamic sizing for long names to avoid truncation
                        const nameLength = lastName.length;
                        let nameStyle = '';
                        if (nameLength > 12) {
                            nameStyle = 'style="--name-scale: 0.65; letter-spacing: -0.04em;"';
                        } else if (nameLength > 10) {
                            nameStyle = 'style="--name-scale: 0.72; letter-spacing: -0.03em;"';
                        } else if (nameLength > 8) {
                            nameStyle = 'style="--name-scale: 0.80; letter-spacing: -0.02em;"';
                        } else if (nameLength > 6) {
                            nameStyle = 'style="--name-scale: 0.88; letter-spacing: -0.01em;"';
                        } else if (nameLength > 5) {
                            nameStyle = 'style="--name-scale: 0.95; letter-spacing: -0.005em;"';
                        }

                        const hasAvatar = p && p.avatar;
                        const avatarHtml = hasAvatar ? 
                            `<img src="https://virtualprogaming.com/cdn-cgi/imagedelivery/cl8ocWLdmZDs72LEaQYaYw/${p.avatar}/smThumb" alt="" class="player-avatar-img">` : 
                            `<i class="fa-solid fa-shield-halved avatar-shield-back"></i><i class="fa-solid fa-user"></i>`;
                        const avatarClass = hasAvatar ? 'player-card-ut-avatar' : 'player-card-ut-avatar no-avatar';

                        const logoHtml = p && p.clubLogo ? 
                            `<img src="${p.clubLogo}" alt="" class="player-club-logo-img">` : 
                            `<i class="fa-solid fa-shield-halved"></i>`;

                        const rivalPitchTierClass = getCardTierClass(p ? p.price : 0);
                        const rivalThunderHtml = rivalPitchTierClass === 'thunder' ? `
                            <div class="thunder-bolt thunder-bolt-1"></div>
                            <div class="thunder-bolt thunder-bolt-2"></div>
                            <div class="thunder-bolt-3"></div>
                            <div class="thunder-bolt-4"></div>
                            <div class="thunder-flash-overlay"></div>
                        ` : '';

                        node.innerHTML = `
                            <div class="player-card-ut occupied ${rivalPitchTierClass}" style="pointer-events: none;">
                                <div class="player-card-ut-inner">
                                    <div class="player-card-ut-rating-pos">
                                        <span class="player-card-ut-rating">${displayedPoints}</span>
                                        <span class="player-card-ut-position">${pos.label.split(' ')[0]}</span>
                                    </div>
                                    <div class="player-card-ut-club-logo">
                                        ${logoHtml}
                                    </div>
                                    <div class="${avatarClass}">
                                        ${avatarHtml}
                                    </div>
                                    <div class="player-card-ut-name" ${nameStyle}>${lastName}</div>
                                    ${rivalThunderHtml}
                                </div>
                            </div>
                        `;

                        if (p) {
                            const clauseVal = Math.max((rivalTeam.clauses && rivalTeam.clauses[p.eaPlayerName]) || 0, Math.round(p.price * (activeLeague?.clauseMultiplier || 1.5)));
                            let isProtected = false;
                            if (rivalTeam.clausesProtectedUntil && rivalTeam.clausesProtectedUntil[p.eaPlayerName]) {
                                const protDate = new Date(rivalTeam.clausesProtectedUntil[p.eaPlayerName]);
                                if (protDate > new Date()) {
                                    isProtected = true;
                                }
                            }

                            node.addEventListener('click', (event) => {
                                event.stopPropagation();
                                showPlayerContextMenu(event, p, teamName, discordId, clauseVal, isProtected);
                            });
                        }
                    } else {
                        node.innerHTML = `
                            <div class="player-card-ut vacant" style="opacity: 0.4; pointer-events: none;">
                                <div class="player-card-ut-inner">
                                    <div class="player-card-ut-add">
                                        <i class="fa-solid fa-minus" style="font-size: 0.7rem;"></i>
                                    </div>
                                    <div class="player-card-ut-position-label">${pos.label.split(' ')[0]}</div>
                                </div>
                            </div>
                        `;
                    }
                    
                    rivalSoccerField.appendChild(node);
                });
            }
        }
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
        rivalTeamModal.classList.remove('open');
    }
}

// VIEW 2.3: Load admin panel settings and participants
// VIEW 2.3: Load admin panel settings and participants
async function loadAdminPanelData() {
    // Refresh active league details from server first to get latest coAdmin
    try {
        const leaguesRes = await fetch('/api/fantasy/leagues');
        if (leaguesRes.ok) {
            const leaguesData = await leaguesRes.json();
            const updatedLeague = leaguesData.leagues.find(l => l._id === currentLeagueId);
            if (updatedLeague) {
                activeLeague = updatedLeague;
            }
        }
    } catch (e) {
        console.error('Error refreshing active league details:', e);
    }

    const canAdmin = currentUser && (currentUser.isAdmin || (activeLeague && (activeLeague.createdBy === currentUser.discordId || activeLeague.coAdmin === currentUser.discordId)));
    if (!canAdmin) return;
    
    // Fill Config Form
    adminLeagueName.value = activeLeague.name;
    adminLeagueStatus.value = activeLeague.status;
    // Set dynamic max limit on input participants
    if (adminLeagueMaxParts) {
        const currentVpgLeagues = activeLeague.vpgLeagues || [];
        const maxLimit = currentVpgLeagues.length >= 2 ? 18 : 14;
        adminLeagueMaxParts.setAttribute('max', maxLimit);
    }
    adminLeagueMaxParts.value = activeLeague.maxParticipants;
    if (adminLeaguePrivacy) {
        adminLeaguePrivacy.value = activeLeague.privacy || 'public';
    }
    if (adminLeaguePasswordGroup && adminLeaguePassword) {
        if (activeLeague.privacy === 'private') {
            adminLeaguePasswordGroup.style.display = '';
            adminLeaguePassword.value = activeLeague.password || '';
        } else {
            adminLeaguePasswordGroup.style.display = 'none';
            adminLeaguePassword.value = '';
        }
        // Always reset type to password and set class back to fa-eye-slash when loading
        adminLeaguePassword.setAttribute('type', 'password');
        if (toggleAdminPasswordVisibility) {
            toggleAdminPasswordVisibility.classList.add('fa-eye-slash');
            toggleAdminPasswordVisibility.classList.remove('fa-eye');
        }
    }
    adminLeagueAllowClauses.value = activeLeague.allowClauses !== false ? 'true' : 'false';
    adminLeagueClauseMultiplier.value = activeLeague.clauseMultiplier || 1.5;
    adminLeagueInitialBudget.value = activeLeague.initialBudget || 100000000;
    
    // Render linked VPG leagues
    if (adminLeagueVpgTags) {
        adminLeagueVpgTags.innerHTML = '<span class="text-muted" style="font-size: 0.8rem;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando ligas...</span>';
        let allLeagues = globalAllLeagues || [];
        if (allLeagues.length === 0) {
            try {
                const res = await fetch('/api/fantasy/active-leagues');
                if (res.ok) {
                    const data = await res.json();
                    allLeagues = data.allLeagues || [];
                    globalAllLeagues = allLeagues;
                }
            } catch (e) {
                console.error('Error fetching VPG leagues for names mapping:', e);
            }
        }

        adminLeagueVpgTags.innerHTML = '';
        const linkedLeagues = activeLeague.vpgLeagues || [];
        if (linkedLeagues.length === 0) {
            adminLeagueVpgTags.innerHTML = '<span class="text-muted" style="font-size: 0.8rem;">Ninguna liga VPG vinculada</span>';
        } else {
            linkedLeagues.forEach(slug => {
                const matched = allLeagues.find(l => l.slug === slug);
                const title = matched ? (matched.title || slug) : slug;
                const badge = document.createElement('span');
                badge.className = 'badge';
                badge.style.margin = '2px';
                badge.innerText = title;
                adminLeagueVpgTags.appendChild(badge);
            });
        }
    }
    
    // Hide/show delete card for helpers
    const deleteCard = btnAdminDeleteLeague ? btnAdminDeleteLeague.closest('.action-card') : null;
    const isOwnerOrCreator = currentUser.isAdmin || (activeLeague && activeLeague.createdBy === currentUser.discordId);
    if (deleteCard) {
        deleteCard.style.display = isOwnerOrCreator ? '' : 'none';
    }

    // Hide/show reset all squads card only for global admins/referees (not creators unless they are global admins/referees)
    const resetSquadsBtn = document.getElementById('btn-admin-reset-all-squads');
    const resetSquadsCard = resetSquadsBtn ? resetSquadsBtn.closest('.action-card') : null;
    if (resetSquadsCard) {
        resetSquadsCard.style.display = currentUser.isAdmin ? '' : 'none';
    }

    if (adminResetBasePointsContainer) {
        adminResetBasePointsContainer.style.display = (activeLeague && activeLeague.pointsMode === 'zero') ? '' : 'none';
    }
    
    // Set market toggle text
    updateMarketToggleButton(activeLeague.marketOpen);
    if (adminLeagueStatusText && btnAdminToggleStatus) {
        updateStatusToggleButton(activeLeague.status);
    }
    
    // Fetch and render managers list
    adminParticipantsList.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Cargando participantes...</td></tr>`;
    
    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/teams`);
        if (!res.ok) throw new Error('No se pudieron obtener los participantes.');
        const data = await res.json();
        const teams = data.teams || [];

        // Populate adjust points team select dropdown
        const teamSelect = document.getElementById('adjust-points-team-select');
        if (teamSelect) {
            teamSelect.innerHTML = '<option value="">-- Seleccionar Equipo --</option>';
            teams.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t._id;
                opt.textContent = `${t.teamName} (${t.discordUsername})`;
                teamSelect.appendChild(opt);
            });
        }

        // Show/hide market size settings for global admin/referee only
        const isGlobalAdminOrReferee = currentUser && (currentUser.isAdmin || (Array.isArray(currentUser.roles) && currentUser.roles.includes('1393505777443930183')));
        const marketSizeSection = document.getElementById('admin-market-size-section');
        if (marketSizeSection) {
            if (isGlobalAdminOrReferee) {
                marketSizeSection.style.display = 'block';
                const marketSizeValueInput = document.getElementById('admin-market-size-value');
                if (marketSizeValueInput) {
                    marketSizeValueInput.value = activeLeague.marketSize || 30;
                }
            } else {
                marketSizeSection.style.display = 'none';
            }
        }
        
        adminParticipantsList.innerHTML = '';
        
        if (teams.length === 0) {
            adminParticipantsList.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">No hay participantes inscritos.</td></tr>`;
        } else {
            teams.forEach(team => {
                const row = document.createElement('tr');
                
                // Badges
                let roleBadge = '';
                if (team.discordId === activeLeague.createdBy) {
                    roleBadge = ' <span class="role-badge creator-badge" title="Creador">👑</span>';
                } else if (team.discordId === activeLeague.coAdmin) {
                    roleBadge = ' <span class="role-badge helper-badge" title="Ayudante">⭐</span>';
                }

                // Helper action button
                let helperBtnHtml = '';
                if (isOwnerOrCreator && team.discordId !== activeLeague.createdBy) {
                    if (activeLeague.coAdmin === team.discordId) {
                        helperBtnHtml = `<button class="btn btn-info btn-xs btn-toggle-helper" data-discord-id="${team.discordId}"><i class="fa-solid fa-star-slash"></i> Quitar Ayudante</button>`;
                    } else {
                        helperBtnHtml = `<button class="btn btn-primary btn-xs btn-toggle-helper" data-discord-id="${team.discordId}"><i class="fa-solid fa-star"></i> Hacer Ayudante</button>`;
                    }
                }

                row.innerHTML = `
                    <td>
                        <div style="font-weight: 600; color: #fff;">${team.discordUsername}${roleBadge}</div>
                        <div style="font-size: 0.75rem; color: #64748b;">ID: ${team.discordId}</div>
                        <div class="mobile-only-details" style="display: none; font-size: 0.75rem; color: #64748b; margin-top: 2px;">
                            <span>Equipo: <span class="rival-team-link" style="cursor: pointer; text-decoration: underline; color: #3b82f6;">${team.teamName}</span></span> • <span>${(team.players || []).length} jug.</span> • <span class="text-yellow" style="font-weight: 600;">${Math.round((team.points || 0) * 10) / 10} pts</span> • <span>Presupuesto: ${formatCurrency(team.balance)}</span>
                        </div>
                    </td>
                    <td class="col-hide-md"><div class="rival-team-link" style="font-weight: 600; cursor: pointer; text-decoration: underline; color: #3b82f6;">${team.teamName}</div></td>
                    <td class="text-center col-hide-sm">${(team.players || []).length} jugadores</td>
                    <td class="text-right price-text col-hide-sm">${formatCurrency(team.balance)}</td>
                    <td class="text-right text-yellow col-hide-sm" style="font-weight: 700;">${Math.round((team.points || 0) * 10) / 10} pts</td>
                    <td class="text-center">
                        <div style="display: flex; gap: 4px; justify-content: center; align-items: center; flex-wrap: wrap;">
                            <button class="btn btn-primary btn-xs btn-manage-players" data-team-id="${team._id}"><i class="fa-solid fa-users"></i> Jugadores</button>
                            <button class="btn btn-warning btn-xs btn-adjust-budget" data-team-id="${team._id}"><i class="fa-solid fa-coins"></i> Presupuesto</button>
                            <button class="btn btn-danger btn-xs btn-kick-manager" data-team-id="${team._id}"><i class="fa-solid fa-user-minus"></i> Expulsar</button>
                            ${helperBtnHtml}
                        </div>
                    </td>
                `;
                
                // Click on rival-team-link opens showRivalTeam
                row.querySelectorAll('.rival-team-link').forEach(link => {
                    link.addEventListener('click', () => {
                        showRivalTeam(team.discordId, team.teamName);
                    });
                });

                const managePlayersBtn = row.querySelector('.btn-manage-players');
                if (managePlayersBtn) {
                    managePlayersBtn.addEventListener('click', () => {
                        openAdminTeamPlayersModal(team._id, team.teamName);
                    });
                }

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

                const toggleHelperBtn = row.querySelector('.btn-toggle-helper');
                if (toggleHelperBtn) {
                    toggleHelperBtn.addEventListener('click', () => {
                        handleToggleCoAdmin(team.discordId, team.discordUsername);
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
                        <div class="mobile-only-details" style="display: none; font-size: 0.75rem; color: #64748b; margin-top: 2px;">
                            <span>Equipo: ${team.teamName}</span> • <span>Fecha: ${reqDate}</span>
                        </div>
                    </td>
                    <td class="col-hide-md"><div style="font-weight: 600;">${team.teamName}</div></td>
                    <td class="text-center col-hide-sm">${reqDate}</td>
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
    const privacy = adminLeaguePrivacy ? adminLeaguePrivacy.value : 'public';
    const password = adminLeaguePassword ? adminLeaguePassword.value : '';
    
    const currentVpgLeagues = activeLeague ? activeLeague.vpgLeagues : [];
    const maxLimit = (Array.isArray(currentVpgLeagues) ? currentVpgLeagues.length : 0) >= 2 ? 18 : 14;

    const maxVal = parseInt(maxParticipants);
    if (isNaN(maxVal) || maxVal < 2 || maxVal > maxLimit) {
        showToast(`El número máximo de participantes permitido es de 2 a ${maxLimit}.`, 'error');
        return;
    }

    if (privacy === 'private' && (!password || password.trim() === '') && (!activeLeague || !activeLeague.password)) {
        showToast('Debes configurar una contraseña para una liga privada.', 'error');
        return;
    }
    
    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, status, maxParticipants, allowClauses, clauseMultiplier, initialBudget, privacy, password })
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
        activeLeague.privacy = privacy;
        if (privacy === 'private') {
            if (password && password.trim() !== '') {
                activeLeague.password = password.trim();
            }
        } else {
            activeLeague.password = null;
        }

        const lockIcon = activeLeague.privacy === 'private' ? ' <i class="fa-solid fa-lock text-yellow" title="Liga Privada" style="font-size: 0.95rem; margin-left: 5px;"></i>' : '';
        activeLeagueName.innerHTML = name + lockIcon;
        if (typeof updateClauseLockStatusUI === 'function') updateClauseLockStatusUI();
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
        
        if (typeof updateClauseLockStatusUI === 'function') updateClauseLockStatusUI();
        if (typeof updateMarketLockStatusUI === 'function') updateMarketLockStatusUI();
        
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

// Admin Toggle League Status
async function handleAdminToggleStatus() {
    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/toggle-status`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al cambiar estado de la liga.');
        
        showToast(data.message, 'success');
        activeLeague.status = data.status;
        
        // Update select input value to keep in sync
        if (adminLeagueStatus) {
            adminLeagueStatus.value = data.status;
        }
        
        updateStatusToggleButton(data.status);
        
        // Refresh market and squad buttons disabled state
        filterAndRenderMarket();
        renderSquadList();
        
        // Refresh other lists if needed (e.g. user market or bids)
        const activeSubBtn = document.querySelector('.market-sub-btn.active');
        const activeSubTab = activeSubBtn ? activeSubBtn.getAttribute('data-sub-tab') : null;
        if (activeSubTab === 'user-market') {
            await loadUserMarket();
        } else if (activeSubTab === 'bids-market') {
            await loadMarketBids();
        }
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

function updateStatusToggleButton(status) {
    if (status === 'closed') {
        adminLeagueStatusText.textContent = 'Finalizada';
        adminLeagueStatusText.style.color = '#ef4444'; // Red
        btnAdminToggleStatus.className = 'btn btn-sm btn-success';
        btnAdminToggleStatus.innerHTML = '<i class="fa-solid fa-lock-open"></i> Reactivar Liga';
    } else {
        const text = status === 'open' ? 'Abierta' : 'Activa';
        adminLeagueStatusText.textContent = text;
        adminLeagueStatusText.style.color = status === 'open' ? '#10b981' : '#06b6d4'; // Green vs Blue/Cyan
        btnAdminToggleStatus.className = 'btn btn-sm btn-danger';
        btnAdminToggleStatus.innerHTML = '<i class="fa-solid fa-lock"></i> Finalizar Liga';
    }
}

// Admin Assign/Remove Co-Admin Helper
async function handleToggleCoAdmin(targetDiscordId, discordUsername) {
    const isRemoving = activeLeague && activeLeague.coAdmin === targetDiscordId;
    const confirmMessage = isRemoving
        ? `¿Estás seguro de que quieres quitar el rol de Ayudante a ${discordUsername}?`
        : `¿Estás seguro de que quieres asignar a ${discordUsername} como Ayudante de la liga?`;

    if (!confirm(confirmMessage)) return;

    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/co-admin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetDiscordId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al actualizar el ayudante.');
        showToast(data.message, 'success');
        
        // Refresh admin data dynamically without reloading the whole page
        await loadAdminPanelData();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// Admin Recalculate Points (Removed)// Admin Rebuild Stats
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

// Admin Reset Base Points
async function handleAdminResetBasePoints() {
    if (!confirm('¿Estás seguro de que quieres resetear los puntos iniciales a los puntos actuales de VPG? Esto reiniciará a 0 los puntos de todos los jugadores y equipos en esta liga. Esta acción no se puede deshacer.')) {
        return;
    }
    
    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/reset-base-points`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al resetear puntos iniciales.');
        
        showToast(data.message || 'Puntos iniciales reseteados correctamente.', 'success');
        // Refresh league data
        await enterLeague(currentLeagueId, true);
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

// Admin Reset All Squads and Free Agent Market
async function handleAdminResetAllSquads() {
    if (!confirm('¿Estás seguro de que quieres REHACER las plantillas de TODOS los participantes de esta liga y regenerar el mercado de agentes libres? Se eliminarán todas las pujas actuales con sus reembolsos correspondientes, y todos los equipos recibirán una plantilla aleatoria nueva de Once + 4 suplentes por valor aproximado de 100M €. Esta acción no se puede deshacer.')) {
        return;
    }
    
    const btn = document.getElementById('btn-admin-reset-all-squads');
    const originalText = btn ? btn.innerText : 'Rehacer Todo';
    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Procesando...';
    }
    
    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/reset-all-squads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al restablecer plantillas y mercado.');
        
        showToast(data.message || 'Plantillas y mercado restablecidos correctamente.', 'success');
        // Refresh league data
        await enterLeague(currentLeagueId, true);
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = originalText;
        }
    }
}

// Admin Cancel Bids
async function handleAdminCancelBids(mode) {
    const isBelow = mode === 'below_value';
    const confirmMsg = isBelow 
        ? '¿Estás seguro de que deseas cancelar y reembolsar SOLO las pujas que sean inferiores al valor de mercado actual de su respectivo jugador?'
        : '¿Estás seguro de que deseas cancelar y reembolsar ABSOLUTAMENTE TODAS las pujas activas de esta liga? Esta acción no se puede deshacer.';
        
    if (!confirm(confirmMsg)) return;

    const btnId = isBelow ? 'btn-admin-cancel-bids-below' : 'btn-admin-cancel-bids-all';
    const btn = document.getElementById(btnId);
    const originalText = btn ? btn.innerHTML : (isBelow ? 'Deshacer &lt; Valor' : 'Deshacer Todas');
    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Procesando...';
    }

    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/cancel-bids`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al cancelar pujas.');

        showToast(data.message || 'Pujas canceladas y reembolsadas correctamente.', 'success');
        await enterLeague(currentLeagueId, true);
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
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

    let cleanInput = input.trim().replace(/\./g, '');
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

function getMadridTime() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Madrid',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false
    });
    const parts = formatter.formatToParts(now);
    const dateParts = {};
    for (const p of parts) {
        dateParts[p.type] = p.value;
    }
    const year = parseInt(dateParts.year, 10);
    const month = parseInt(dateParts.month, 10) - 1;
    const day = parseInt(dateParts.day, 10);
    const hour = parseInt(dateParts.hour, 10);
    const minute = parseInt(dateParts.minute, 10);
    const second = parseInt(dateParts.second, 10);
    
    const localMadrid = new Date(year, month, day, hour, minute, second);
    return {
        day: localMadrid.getDay(),
        hours: localMadrid.getHours(),
        minutes: localMadrid.getMinutes()
    };
}

function formatDaysList(days) {
    if (!days || days.length === 0) return 'ningún día';
    const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const sorted = [...days].sort((a, b) => a - b);
    
    let contiguous = true;
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] !== sorted[i-1] + 1) {
            contiguous = false;
            break;
        }
    }
    
    if (contiguous && sorted.length > 1) {
        return `${dayNames[sorted[0]]} a ${dayNames[sorted[sorted.length - 1]]}`;
    }
    if (sorted.length === 1) return dayNames[sorted[0]];
    if (sorted.length === 2) return `${dayNames[sorted[0]]} y ${dayNames[sorted[1]]}`;
    
    const formatted = sorted.map(d => dayNames[d]);
    const last = formatted.pop();
    return `${formatted.join(', ')} y ${last}`;
}

function isLineupLocked() {
    if (!lockLineupsActive) return false;
    if (!lockScheduleConfig || !lockScheduleConfig.active) return false;

    const { day, hours, minutes } = getMadridTime();
    const totalMinutes = hours * 60 + minutes;

    const [startH, startM] = lockScheduleConfig.startTime.split(':').map(Number);
    const startMin = startH * 60 + startM;
    const durationMin = Number(lockScheduleConfig.durationHours || 4) * 60;
    const days = lockScheduleConfig.days || [1, 2, 3, 4];

    // Case 1: Today is active, and time is within lock window starting today
    const diffToday = totalMinutes - startMin;
    if (days.includes(day) && diffToday >= 0 && diffToday < durationMin) {
        return true;
    }

    // Case 2: Yesterday was active, and time is within lock window starting yesterday (crossover midnight)
    const yesterday = (day === 0) ? 6 : day - 1;
    const diffYesterday = (totalMinutes + 1440) - startMin;
    if (days.includes(yesterday) && diffYesterday >= 0 && diffYesterday < durationMin) {
        return true;
    }

    return false;
}

function getLineupLockErrorText() {
    if (!lockLineupsActive || !lockScheduleConfig || !lockScheduleConfig.active) return "";
    
    const [startH, startM] = lockScheduleConfig.startTime.split(':').map(Number);
    const duration = Number(lockScheduleConfig.durationHours || 4);
    const startMin = startH * 60 + startM;
    const endMinTotal = startMin + duration * 60;
    const endH = Math.floor(endMinTotal / 60) % 24;
    const endM = endMinTotal % 60;
    const startStr = lockScheduleConfig.startTime;
    const endStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    const crossesMidnight = endMinTotal >= 1440;
    const suffix = crossesMidnight ? ' del día siguiente' : '';
    
    const daysText = formatDaysList(lockScheduleConfig.days);
    return `No puedes modificar tu alineación. Está bloqueada ${daysText} desde las ${startStr} hasta las ${endStr}${suffix} (hora de Madrid).`;
}

function updateLineupLockStatusUI() {
    const indicator = document.getElementById('lineup-lock-status-indicator');
    if (!indicator) return;

    if (!lockLineupsActive || !lockScheduleConfig || !lockScheduleConfig.active) {
        indicator.style.display = 'flex';
        indicator.style.background = 'rgba(56, 189, 248, 0.1)';
        indicator.style.border = '1px solid rgba(56, 189, 248, 0.3)';
        indicator.style.color = '#38bdf8';
        indicator.innerHTML = '<i class="fa-solid fa-lock-open"></i> <span><strong>Bloqueo de alineación:</strong> Desactivado por el administrador. Puedes guardar tu once a cualquier hora.</span>';
        return;
    }

    // Calculate end time
    const [startH, startM] = lockScheduleConfig.startTime.split(':').map(Number);
    const duration = Number(lockScheduleConfig.durationHours || 4);
    const startMin = startH * 60 + startM;
    const endMinTotal = startMin + duration * 60;
    const endH = Math.floor(endMinTotal / 60) % 24;
    const endM = endMinTotal % 60;
    const startStr = lockScheduleConfig.startTime;
    const endStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    const crossesMidnight = endMinTotal >= 1440;
    const suffix = crossesMidnight ? 'del día siguiente' : '';
    
    const daysText = formatDaysList(lockScheduleConfig.days);
    const timeRangeText = `${startStr} a ${endStr} ${suffix}`.trim();

    const locked = isLineupLocked();
    if (locked) {
        indicator.style.display = 'flex';
        indicator.style.background = 'rgba(239, 68, 68, 0.1)';
        indicator.style.border = '1px solid rgba(239, 68, 68, 0.3)';
        indicator.style.color = '#fca5a5';
        indicator.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> <span><strong>Alineación Bloqueada:</strong> No puedes guardar tu alineación ahora (${daysText} de ${timeRangeText} hora Madrid).</span>`;
    } else {
        indicator.style.display = 'flex';
        indicator.style.background = 'rgba(0, 245, 155, 0.1)';
        indicator.style.border = '1px solid rgba(0, 245, 155, 0.3)';
        indicator.style.color = '#00f59b';
        indicator.innerHTML = `<i class="fa-solid fa-lock"></i> <span><strong>Bloqueo programado:</strong> Activo ${daysText} de ${timeRangeText} (hora de Madrid). Actualmente puedes editar tu once.</span>`;
    }
}

function getBuyoutLockError() {
    const lockConfig = clauseLockScheduleConfig || {
        active: true,
        days: [1, 2, 3, 4],
        startTime: "18:30",
        durationHours: 5.5
    };

    if (!lockConfig.active) return null;

    const { day, hours, minutes } = getMadridTime();
    const totalMinutes = hours * 60 + minutes;

    const [startH, startM] = lockConfig.startTime.split(':').map(Number);
    const startMin = startH * 60 + startM;
    const durationMin = Number(lockConfig.durationHours || 5.5) * 60;
    const days = lockConfig.days || [1, 2, 3, 4];

    let locked = false;
    const diffToday = totalMinutes - startMin;
    if (days.includes(day) && diffToday >= 0 && diffToday < durationMin) {
        locked = true;
    }

    const yesterday = (day === 0) ? 6 : day - 1;
    const diffYesterday = (totalMinutes + 1440) - startMin;
    if (days.includes(yesterday) && diffYesterday >= 0 && diffYesterday < durationMin) {
        locked = true;
    }

    if (locked) {
        const endTotalMin = Math.round(startMin + durationMin) % 1440;
        const endH = String(Math.floor(endTotalMin / 60)).padStart(2, '0');
        const endM = String(endTotalMin % 60).padStart(2, '0');
        const daysNames = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];
        
        let daysText = "";
        if (days.length === 4 && days.includes(1) && days.includes(2) && days.includes(3) && days.includes(4)) {
            daysText = "de lunes a jueves";
        } else if (days.length === 7) {
            daysText = "todos los días";
        } else {
            daysText = "los " + days.map(d => daysNames[d]).join(', ');
        }
        
        const crossesMidnight = (startMin + durationMin) >= 1440;
        const suffix = crossesMidnight ? ' del día siguiente' : '';
        return `Clausulazos bloqueados ${daysText} desde las ${lockConfig.startTime} hasta las ${endH}:${endM}${suffix} (hora de Madrid).`;
    }

    return null;
}

function getMarketLockError() {
    const lockConfig = marketLockScheduleConfig || {
        active: false,
        days: [1, 2, 3, 4],
        startTime: "18:00",
        durationHours: 8
    };

    if (!lockConfig.active) return null;

    const { day, hours, minutes } = getMadridTime();
    const totalMinutes = hours * 60 + minutes;

    const [startH, startM] = lockConfig.startTime.split(':').map(Number);
    const startMin = startH * 60 + startM;
    const durationMin = Number(lockConfig.durationHours || 8) * 60;
    const days = lockConfig.days || [1, 2, 3, 4];

    let locked = false;
    const diffToday = totalMinutes - startMin;
    if (days.includes(day) && diffToday >= 0 && diffToday < durationMin) {
        locked = true;
    }

    const yesterday = (day === 0) ? 6 : day - 1;
    const diffYesterday = (totalMinutes + 1440) - startMin;
    if (days.includes(yesterday) && diffYesterday >= 0 && diffYesterday < durationMin) {
        locked = true;
    }

    if (locked) {
        const endTotalMin = Math.round(startMin + durationMin) % 1440;
        const endH = String(Math.floor(endTotalMin / 60)).padStart(2, '0');
        const endM = String(endTotalMin % 60).padStart(2, '0');
        const daysNames = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];
        
        let daysText = "";
        if (days.length === 4 && days.includes(1) && days.includes(2) && days.includes(3) && days.includes(4)) {
            daysText = "de lunes a jueves";
        } else if (days.length === 7) {
            daysText = "todos los días";
        } else {
            daysText = "los " + days.map(d => daysNames[d]).join(', ');
        }
        
        const crossesMidnight = (startMin + durationMin) >= 1440;
        const suffix = crossesMidnight ? ' del día siguiente' : '';
        return `Mercado bloqueado ${daysText} desde las ${lockConfig.startTime} hasta las ${endH}:${endM}${suffix} (hora de Madrid).`;
    }

    return null;
}

function isBuyoutLocked() {
    return getBuyoutLockError() !== null;
}

function isMarketLocked() {
    return getMarketLockError() !== null;
}

function updateClauseLockStatusUI() {
    const indicator = document.getElementById('clause-lock-status-indicator');
    if (!indicator) return;

    // Solo mostrar el banner si la liga activa permite cláusulas
    if (!activeLeague || activeLeague.allowClauses === false) {
        indicator.style.display = 'none';
        return;
    }

    if (!clauseLockScheduleConfig || !clauseLockScheduleConfig.active) {
        indicator.style.display = 'none';
        return;
    }

    const [startH, startM] = clauseLockScheduleConfig.startTime.split(':').map(Number);
    const duration = Number(clauseLockScheduleConfig.durationHours || 5.5);
    const startMin = startH * 60 + startM;
    const endMinTotal = startMin + duration * 60;
    const endH = Math.floor(endMinTotal / 60) % 24;
    const endM = Math.round(endMinTotal % 60);
    const startStr = clauseLockScheduleConfig.startTime;
    const endStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    const crossesMidnight = endMinTotal >= 1440;
    const suffix = crossesMidnight ? 'del día siguiente' : '';
    
    const daysText = formatDaysList(clauseLockScheduleConfig.days);
    const timeRangeText = `${startStr} a ${endStr} ${suffix}`.trim();

    const locked = isBuyoutLocked();
    if (locked) {
        indicator.style.display = 'flex';
        indicator.style.background = 'rgba(239, 68, 68, 0.1)';
        indicator.style.border = '1px solid rgba(239, 68, 68, 0.3)';
        indicator.style.color = '#fca5a5';
        indicator.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> <span><strong>Clausulazos Bloqueados:</strong> No se pueden realizar robos de cláusula ahora (${daysText} de ${timeRangeText} hora Madrid).</span>`;
    } else {
        indicator.style.display = 'flex';
        indicator.style.background = 'rgba(0, 245, 155, 0.1)';
        indicator.style.border = '1px solid rgba(0, 245, 155, 0.3)';
        indicator.style.color = '#00f59b';
        indicator.innerHTML = `<i class="fa-solid fa-lock"></i> <span><strong>Bloqueo programado (Clausulazo):</strong> Activo ${daysText} de ${timeRangeText} (hora de Madrid). Actualmente puedes robar jugadores.</span>`;
    }
}

function updateMarketLockStatusUI() {
    const indicator = document.getElementById('market-lock-status-indicator');
    if (!indicator) return;

    // Solo mostrar el banner si el mercado de esta liga está abierto
    if (!activeLeague || activeLeague.marketOpen === false) {
        indicator.style.display = 'none';
        return;
    }

    if (!marketLockScheduleConfig || !marketLockScheduleConfig.active) {
        indicator.style.display = 'none';
        return;
    }

    const [startH, startM] = marketLockScheduleConfig.startTime.split(':').map(Number);
    const duration = Number(marketLockScheduleConfig.durationHours || 8);
    const startMin = startH * 60 + startM;
    const endMinTotal = startMin + duration * 60;
    const endH = Math.floor(endMinTotal / 60) % 24;
    const endM = Math.round(endMinTotal % 60);
    const startStr = marketLockScheduleConfig.startTime;
    const endStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    const crossesMidnight = endMinTotal >= 1440;
    const suffix = crossesMidnight ? 'del día siguiente' : '';
    
    const daysText = formatDaysList(marketLockScheduleConfig.days);
    const timeRangeText = `${startStr} a ${endStr} ${suffix}`.trim();

    const locked = isMarketLocked();
    if (locked) {
        indicator.style.display = 'flex';
        indicator.style.background = 'rgba(239, 68, 68, 0.1)';
        indicator.style.border = '1px solid rgba(239, 68, 68, 0.3)';
        indicator.style.color = '#fca5a5';
        indicator.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> <span><strong>Mercado Bloqueado:</strong> No se pueden realizar pujas u ofertas ahora (${daysText} de ${timeRangeText} hora Madrid).</span>`;
    } else {
        indicator.style.display = 'flex';
        indicator.style.background = 'rgba(0, 245, 155, 0.1)';
        indicator.style.border = '1px solid rgba(0, 245, 155, 0.3)';
        indicator.style.color = '#00f59b';
        indicator.innerHTML = `<i class="fa-solid fa-lock"></i> <span><strong>Bloqueo programado (Mercado):</strong> Activo ${daysText} de ${timeRangeText} (hora de Madrid). Actualmente puedes realizar pujas y ofertas.</span>`;
    }
}

// Utility Helpers
function getFlagUrl(nationality) {
    if (!nationality) return 'https://flagcdn.com/w40/es.png';
    const clean = nationality.trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // remove accents
    
    // Map of common names to 2-letter codes (or specific codes)
    const map = {
        'espana': 'es',
        'spain': 'es',
        'espanol': 'es',
        'spanish': 'es',
        'portugal': 'pt',
        'portuguese': 'pt',
        'francia': 'fr',
        'france': 'fr',
        'french': 'fr',
        'italia': 'it',
        'italy': 'it',
        'italian': 'it',
        'alemania': 'de',
        'germany': 'de',
        'german': 'de',
        'inglaterra': 'gb-eng',
        'england': 'gb-eng',
        'united kingdom': 'gb',
        'uk': 'gb',
        'reino unido': 'gb',
        'argentina': 'ar',
        'argentine': 'ar',
        'brasil': 'br',
        'brazil': 'br',
        'brazilian': 'br',
        'colombia': 'co',
        'colombian': 'co',
        'mexico': 'mx',
        'mexican': 'mx',
        'uruguay': 'uy',
        'uruguayan': 'uy',
        'marruecos': 'ma',
        'morocco': 'ma',
        'moroccan': 'ma',
        'rumania': 'ro',
        'romania': 'ro',
        'romanian': 'ro',
        'ucrania': 'ua',
        'ukraine': 'ua',
        'ukrainian': 'ua',
        'venezuela': 've',
        'venezuelan': 've',
        'belgica': 'be',
        'belgium': 'be',
        'belgian': 'be',
        'paises bajos': 'nl',
        'netherlands': 'nl',
        'holanda': 'nl',
        'dutch': 'nl',
        'senegal': 'sn',
        'senegalese': 'sn',
        'camerun': 'cm',
        'cameroon': 'cm',
        'nigeria': 'ng',
        'nigerian': 'ng',
        'ghana': 'gh',
        'ghanaian': 'gh',
        'croacia': 'hr',
        'croatia': 'hr',
        'belarus': 'by',
        'bielorrusia': 'by',
        'bulgaria': 'bg',
        'chile': 'cl',
        'ecuador': 'ec',
        'peru': 'pe',
        'paraguay': 'py',
        'bolivia': 'bo',
        'albania': 'al',
        'andorra': 'ad',
        'austria': 'at',
        'argelia': 'dz',
        'algeria': 'dz',
        'egipto': 'eg',
        'egypt': 'eg',
        'suecia': 'se',
        'sweden': 'se',
        'suiza': 'ch',
        'switzerland': 'ch',
        'turquia': 'tr',
        'turkey': 'tr',
        'rusia': 'ru',
        'russia': 'ru',
        'polonia': 'pl',
        'poland': 'pl',
        'noruega': 'no',
        'norway': 'no',
        'dinamarca': 'dk',
        'denmark': 'dk',
        'finlandia': 'fi',
        'finland': 'fi',
        'grecia': 'gr',
        'greece': 'gr',
        'irlanda': 'ie',
        'ireland': 'ie',
        'escocia': 'gb-sct',
        'scotland': 'gb-sct',
        'gales': 'gb-wls',
        'wales': 'gb-wls',
        'rumano': 'ro',
        'ucraniano': 'ua',
        'italiano': 'it',
        'frances': 'fr',
        'aleman': 'de',
        'ingles': 'gb-eng',
        'portugues': 'pt',
        'argentino': 'ar',
        'brasileno': 'br',
        'colombiano': 'co',
        'mexicano': 'mx',
        'uruguayo': 'uy',
        'venezolano': 've',
        'belga': 'be',
        'marroqui': 'ma'
    };

    const code = map[clean] || (clean.length === 2 ? clean : 'es');
    return `https://flagcdn.com/w40/${code}.png`;
}

function formatCompactVal(val) {
    if (val === null || val === undefined || isNaN(val)) return '0';
    if (val >= 1000000) {
        const millions = val / 1000000;
        return millions.toFixed(1).replace('.', ',').replace(',0', '') + 'M';
    }
    if (val >= 1000) {
        const thousands = val / 1000;
        return thousands.toFixed(1).replace('.', ',').replace(',0', '') + 'K';
    }
    return val.toString();
}

function formatCurrency(val) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);
}

function applyNumericMask(inputElement, onUpdate) {
    if (!inputElement) return;
    inputElement.addEventListener('input', (e) => {
        let cursorPosition = e.target.selectionStart;
        let originalLen = e.target.value.length;

        // Keep only digits
        let rawVal = e.target.value.replace(/\D/g, '');
        
        if (rawVal === '') {
            e.target.value = '';
            if (onUpdate) onUpdate(0);
            return;
        }

        // Format with thousands separator
        let formattedVal = new Intl.NumberFormat('es-ES').format(parseInt(rawVal));
        e.target.value = formattedVal;

        // Restore cursor position dynamically to avoid jumping
        let newLen = formattedVal.length;
        cursorPosition = cursorPosition + (newLen - originalLen);
        e.target.setSelectionRange(cursorPosition, cursorPosition);

        if (onUpdate) onUpdate(parseInt(rawVal));
    });
}

function formatPlayerPoints(p) {
    if (!activeLeague) return Math.round((p.points || 0) * 10) / 10;
    if (activeLeague.pointsMode === 'zero') {
        const base = Math.round((p.basePoints || 0) * 10) / 10;
        const pts = Math.round((p.points || 0) * 10) / 10;
        return `${pts} <span class="points-base-label">(+${base}<span class="hide-mobile"> iniciales</span>)</span>`;
    }
    return Math.round((p.points || 0) * 10) / 10;
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
    const marketLockErr = getMarketLockError();
    if (marketLockErr) {
        showToast(marketLockErr, 'error');
        return;
    }

    const buyoutErr = getBuyoutLockError();
    if (buyoutErr) {
        showToast(buyoutErr, 'error');
        return;
    }

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
        if (rivalTeamModal) {
            rivalTeamModal.classList.remove('open');
        }
        await enterLeague(currentLeagueId, true);
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

function openClauseModal(player, currentClause) {
    clausePlayerName.textContent = player.eaPlayerName;
    clauseCurrentVal.textContent = formatCurrency(currentClause);
    clauseBalanceVal.textContent = formatCurrency(myTeam.balance);
    clauseNewAmount.value = new Intl.NumberFormat('es-ES').format(currentClause + 500000);
    clauseNewAmount.setAttribute('data-current-val', currentClause);
    clauseCostVal.textContent = '500.000 €';
    clauseCostVal.className = 'text-red';
    clauseForm.setAttribute('data-player-name', player.eaPlayerName);
    clauseModal.classList.add('open');
}

async function handleClauseSubmit(e) {
    e.preventDefault();
    const playerName = clauseForm.getAttribute('data-player-name');
    const newClause = parseInt(clauseNewAmount.value.replace(/\D/g, '') || 0);
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
        await enterLeague(currentLeagueId, true);
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
    const marketLockErr = getMarketLockError();
    if (marketLockErr) {
        showToast(marketLockErr, 'error');
        return;
    }

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
        await enterLeague(currentLeagueId, true);
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

async function handleUnlistMarket(playerName) {
    const marketLockErr = getMarketLockError();
    if (marketLockErr) {
        showToast(marketLockErr, 'error');
        return;
    }

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
        await enterLeague(currentLeagueId, true);
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

async function handleBidSubmit(e) {
    e.preventDefault();
    const marketLockErr = getMarketLockError();
    if (marketLockErr) {
        showToast(marketLockErr, 'error');
        return;
    }
    const playerName = bidForm.getAttribute('data-player-name');
    const sellerId = bidForm.getAttribute('data-seller-id');
    const amount = parseInt(bidAmountInput.value.replace(/\D/g, '') || 0);
    const marketPrice = parseInt(bidForm.getAttribute('data-market-price')) || 0;

    if (amount <= 0) {
        showToast('El precio ofertado debe ser mayor que 0.', 'error');
        return;
    }

    if (amount < marketPrice) {
        showToast(`La puja mínima para este jugador debe ser su valor de mercado (${formatCurrency(marketPrice)}).`, 'error');
        return;
    }

    // Lookup if we already have a pending bid for this player
    const existingBid = mySentBids.find(b => b.eaPlayerName.toLowerCase() === playerName.toLowerCase() && b.status === 'pending');
    const oldBidAmount = existingBid ? existingBid.bidAmount : 0;
    const diff = amount - oldBidAmount;

    if (myTeam.balance < diff) {
        showToast(`Saldo insuficiente. Esta puja requiere un incremento de ${formatCurrency(diff)} en tu balance, y tu saldo actual es ${formatCurrency(myTeam.balance)}.`, 'error');
        return;
    }

    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/market/bid`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eaPlayerName: playerName, bidAmount: amount, sellerDiscordId: sellerId })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al enviar puja.');

        showToast(data.message, 'success');
        bidModal.classList.remove('open');
        await enterLeague(currentLeagueId, true);
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
            
            let buttonHtml = `<button class="btn btn-warning btn-xs btn-open-bid" data-name="${l.eaPlayerName}" data-seller="${l.sellerTeamName}" data-asking="${l.askingPrice}" data-value="${p.price}" ${activeLeague && (!activeLeague.marketOpen || activeLeague.status === 'closed') ? 'disabled' : ''}><i class="fa-solid fa-gavel"></i> Pujar</button>`;
            if (myTeam.isSpectator) {
                buttonHtml = `<button class="btn btn-secondary btn-xs" disabled style="opacity: 0.6; cursor: not-allowed;"><i class="fa-solid fa-eye"></i> Espectador</button>`;
            }

            row.innerHTML = `
                <td>
                    <div class="clickable-player-name" style="font-weight: 700; color: #38bdf8; cursor: pointer; text-decoration: underline;" onclick="openPlayerStatsModalByName('${l.eaPlayerName.replace(/'/g, "\\'")}')">${l.eaPlayerName}</div>
                    <div class="mobile-only-details" style="display: none; font-size: 0.75rem; color: #64748b; margin-top: 2px;">
                        <span style="color: #38bdf8;">${l.sellerTeamName}</span> • <span>Valor: ${formatCurrency(p.price)}</span>
                    </div>
                </td>
                <td class="col-hide-md">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <img src="${l.sellerAvatar ? `https://cdn.discordapp.com/avatars/${l.sellerDiscordId}/${l.sellerAvatar}.png?size=32` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'" class="team-shield">
                        <span>${l.sellerTeamName}</span>
                    </div>
                </td>
                <td><span class="position-badge pos-${p.lastPosition.toLowerCase()}">${p.lastPosition}</span></td>
                <td class="text-right price-text col-hide-sm">${formatCurrency(p.price)}</td>
                <td class="text-right price-text text-yellow" style="font-weight: 700;">${formatCurrency(l.askingPrice)}</td>
                <td class="text-center">
                    ${buttonHtml}
                </td>
            `;

            if (!myTeam.isSpectator) {
                row.querySelector('.btn-open-bid').addEventListener('click', () => {
                    bidPlayerName.textContent = l.eaPlayerName;
                    bidSellerTeamVal.textContent = l.sellerTeamName;
                    bidAskingPriceVal.textContent = formatCurrency(l.askingPrice);
                    bidBalanceVal.textContent = formatCurrency(myTeam.balance);
                    bidAmountInput.value = new Intl.NumberFormat('es-ES').format(l.askingPrice);
                    bidForm.setAttribute('data-player-name', l.eaPlayerName);
                    bidForm.setAttribute('data-seller-id', l.sellerDiscordId);
                    bidForm.setAttribute('data-market-price', p.price);
                    bidModal.classList.add('open');
                });
            }

            userMarketList.appendChild(row);
        });
    } catch (e) {
        console.error(e);
        userMarketList.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-red">${e.message}</td></tr>`;
    }
}

async function loadMarketBids() {
    if (myTeam.isSpectator) {
        bidsReceivedList.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-muted"><i class="fa-solid fa-eye"></i> Modo Espectador. Únete para recibir ofertas.</td></tr>`;
        bidsSentList.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-muted"><i class="fa-solid fa-eye"></i> Modo Espectador. Únete para enviar ofertas.</td></tr>`;
        bidsCountBadge.style.display = 'none';
        return;
    }
    if (!myTeam.approved) {
        bidsReceivedList.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-warning"><i class="fa-solid fa-clock"></i> Inscripción pendiente de aprobación. Podrás ver tus ofertas recibidas una vez seas aprobado.</td></tr>`;
        bidsSentList.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-warning"><i class="fa-solid fa-clock"></i> Inscripción pendiente de aprobación. Podrás ver tus ofertas enviadas una vez seas aprobado.</td></tr>`;
        bidsCountBadge.style.display = 'none';
        return;
    }
    bidsReceivedList.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Cargando ofertas...</td></tr>`;
    bidsSentList.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Cargando ofertas...</td></tr>`;
    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/market/bids`);
        if (!res.ok) throw new Error('No se pudieron obtener las ofertas.');
        const { received, sent } = await res.json();
        mySentBids = sent;

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
                        <div class="clickable-player-name" style="font-weight: 700; color: #38bdf8; cursor: pointer; text-decoration: underline;" onclick="openPlayerStatsModalByName('${b.eaPlayerName.replace(/'/g, "\\'")}')">${b.eaPlayerName}</div>
                        <div class="mobile-only-details" style="display: none; font-size: 0.75rem; color: #64748b; margin-top: 2px;">
                            <span style="color: #38bdf8;">${b.bidderDiscordId === 'liga' ? 'La Liga' : b.bidderTeamName}</span> • <span>Valor: ${formatCurrency(p.price)}</span>
                        </div>
                    </td>
                    <td class="col-hide-md">
                        ${b.bidderDiscordId === 'liga' 
                            ? `<span class="badge" style="background: linear-gradient(135deg, #4f46e5, #06b6d4); color: white; border: none; font-size: 0.75rem; border-radius: 4px; padding: 3px 6px; font-weight: 600; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.3);">La Liga (Oferta Auto)</span>` 
                            : `
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <img src="${b.bidderAvatar ? `https://cdn.discordapp.com/avatars/${b.bidderDiscordId}/${b.bidderAvatar}.png?size=32` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'" class="team-shield">
                                    <span>${b.bidderTeamName}</span>
                                </div>
                            `
                        }
                    </td>
                    <td class="text-right price-text col-hide-sm">${formatCurrency(p.price)}</td>
                    <td class="text-right price-text text-yellow" style="font-weight: 700;">${formatCurrency(b.bidAmount)}</td>
                    <td class="text-center">
                        <button class="btn btn-success btn-xs btn-accept-bid" data-id="${b._id}" style="margin-right: 4px;" ${activeLeague && activeLeague.status === 'closed' ? 'disabled' : ''}><i class="fa-solid fa-check"></i> Aceptar</button>
                        <button class="btn btn-danger btn-xs btn-reject-bid" data-id="${b._id}" ${activeLeague && activeLeague.status === 'closed' ? 'disabled' : ''}><i class="fa-solid fa-xmark"></i> Rechazar</button>
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
                let retractBtnHtml = '';
                if (b.status === 'pending') {
                    statusBadge = `<span class="badge" style="background: #eab308; color: #1e293b; border: none; font-size: 0.75rem; border-radius: 4px; padding: 2px 6px;">Pendiente</span>`;
                    retractBtnHtml = `<button class="btn btn-danger btn-xs btn-retract-bid" style="margin-left: 8px;"><i class="fa-solid fa-trash-can"></i> Retirar</button>`;
                } else if (b.status === 'accepted') {
                    statusBadge = `<span class="badge" style="background: #22c55e; color: #ffffff; border: none; font-size: 0.75rem; border-radius: 4px; padding: 2px 6px;">Aceptada</span>`;
                } else if (b.status === 'rejected') {
                    statusBadge = `<span class="badge" style="background: #ef4444; color: #ffffff; border: none; font-size: 0.75rem; border-radius: 4px; padding: 2px 6px;">Rechazada</span>`;
                }

                row.innerHTML = `
                    <td>
                        <div class="clickable-player-name" style="font-weight: 700; color: #38bdf8; cursor: pointer; text-decoration: underline;" onclick="openPlayerStatsModalByName('${b.eaPlayerName.replace(/'/g, "\\'")}')">${b.eaPlayerName}</div>
                        <div class="mobile-only-details" style="display: none; font-size: 0.75rem; color: #64748b; margin-top: 2px;">
                            <span style="color: #38bdf8;">${b.sellerTeamName}</span> • <span>Valor: ${formatCurrency(p.price)}</span>
                        </div>
                    </td>
                    <td class="col-hide-md">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <img src="${b.sellerAvatar ? `https://cdn.discordapp.com/avatars/${b.sellerDiscordId}/${b.sellerAvatar}.png?size=32` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'" class="team-shield">
                            <span>${b.sellerTeamName}</span>
                        </div>
                    </td>
                    <td class="text-right price-text col-hide-sm">${formatCurrency(p.price)}</td>
                    <td class="text-right price-text text-blue" style="font-weight: 700;">${formatCurrency(b.bidAmount)}</td>
                    <td class="text-center">${statusBadge}${retractBtnHtml}</td>
                `;

                const retractBtn = row.querySelector('.btn-retract-bid');
                if (retractBtn) {
                    retractBtn.addEventListener('click', () => cancelBid(b._id));
                }
                bidsSentList.appendChild(row);
            });
        }
    } catch (e) {
        console.error(e);
        bidsReceivedList.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-red">${e.message}</td></tr>`;
    }
}

async function respondBid(bidId, responseType) {
    const marketLockErr = getMarketLockError();
    if (marketLockErr) {
        showToast(marketLockErr, 'error');
        return;
    }

    const actionText = responseType === 'accept' ? 'aceptar' : 'rechazar';
    if (!confirm(`¿Estás seguro de que quieres ${actionText} esta oferta?`)) return;

    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/market/bids/${bidId}/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ response: responseType })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al responder a la oferta.');

        showToast(data.message, 'success');
        await enterLeague(currentLeagueId, true);
        await loadMarketBids();
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

async function cancelBid(bidId) {
    const marketLockErr = getMarketLockError();
    if (marketLockErr) {
        showToast(marketLockErr, 'error');
        return;
    }

    if (!confirm('¿Estás seguro de que deseas retirar esta puja? Se reembolsará el importe a tu balance de inmediato.')) return;

    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/market/bids/${bidId}/cancel`, {
            method: 'POST'
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al retirar la puja.');

        showToast(data.message, 'success');
        await enterLeague(currentLeagueId, true);
        await loadMarketBids();
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

async function handleAdminPlayerSearch() {
    const query = adminSearchPlayerInput.value.trim();
    const position = adminSearchPlayerPos ? adminSearchPlayerPos.value : '';
    const vpgLeagueSlug = adminSearchPlayerLeague ? adminSearchPlayerLeague.value : '';
    const onlyNew = adminSearchPlayerOnlyNew ? adminSearchPlayerOnlyNew.checked : false;
    
    if (query.length < 2 && !position && !onlyNew) {
        alert('Por favor, introduce al menos 2 letras, selecciona una posición o activa "Solo nuevos".');
        return;
    }
    
    const isAdmin = !!(currentUser && currentUser.isAdmin);
    const colspanVal = isAdmin ? 7 : 5;
    
    adminSearchPlayerResults.innerHTML = `<tr><td colspan="${colspanVal}" class="text-center py-4 text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Buscando jugadores...</td></tr>`;
    
    try {
        let url = `/api/fantasy/admin/players/search?query=${encodeURIComponent(query)}`;
        if (position) {
            url += `&position=${encodeURIComponent(position)}`;
        }
        if (vpgLeagueSlug) {
            url += `&vpgLeagueSlug=${encodeURIComponent(vpgLeagueSlug)}`;
        }
        if (onlyNew) {
            url += `&onlyNew=true`;
        }
        if (typeof currentLeagueId !== 'undefined' && currentLeagueId) {
            url += `&leagueId=${currentLeagueId}`;
        }
        const res = await fetch(url);
        if (!res.ok) throw new Error('Error al buscar jugadores.');
        const players = await res.json();
        
        searchedPlayersList = players || [];
        adminSearchPlayerResults.innerHTML = '';
        
        if (players.length === 0) {
            adminSearchPlayerResults.innerHTML = `<tr><td colspan="${colspanVal}" class="text-center py-4 text-muted">No se encontraron jugadores que coincidan con la búsqueda.</td></tr>`;
            return;
        }
        
        players.forEach(p => {
            const row = document.createElement('tr');
            const isManual = p.manualPrice !== null || p.manualPosition !== null;
            const hasManualPrice = p.manualPrice !== null;
            const hasManualPosition = p.manualPosition !== null;
            const priceText = formatCurrency(p.price);
            const newBadgeHtml = p.isNew ? ` <span class="new-player-badge"><i class="fa-solid fa-sparkles"></i> NUEVO</span>` : '';

            if (isAdmin) {
                // Build options for position select
                const positionsList = ['POR', 'DFC', 'LD', 'LI', 'CARR', 'MC', 'MCD', 'MCO', 'MI', 'MD', 'DC', 'ED', 'EI', 'MP'];
                let selectOptionsHtml = `<option value="">Por defecto (${p.lastPosition})</option>`;
                positionsList.forEach(pos => {
                    const isSelected = p.manualPosition === pos;
                    selectOptionsHtml += `<option value="${pos}" ${isSelected ? 'selected' : ''}>${pos}</option>`;
                });
                
                row.innerHTML = `
                    <td>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <div class="clickable-player-name" style="font-weight: 700; color: #38bdf8; cursor: pointer; text-decoration: underline;" onclick="openPlayerStatsModalByName('${p.eaPlayerName.replace(/'/g, "\\'")}')">${p.eaPlayerName}</div>
                            ${newBadgeHtml}
                        </div>
                        <div class="mobile-only-details" style="display: none; font-size: 0.75rem; color: #64748b; margin-top: 2px;">
                            ${p.lastClub} • <span class="text-yellow" style="font-weight: 600;">${Math.round((p.points || 0) * 10) / 10} pts</span>
                        </div>
                    </td>
                    <td class="col-hide-md"><div>${p.lastClub}</div></td>
                    <td>
                        <select class="manual-pos-select" data-player-name="${p.eaPlayerName}" style="background: #1e293b; border: 1px solid #475569; color: #fff; border-radius: 4px; padding: 4px; width: 90px; box-sizing: border-box; font-size: 0.8rem; cursor: pointer; ${hasManualPosition ? 'border-color: #f59e0b; color: #f59e0b; font-weight: 600;' : ''}">
                            ${selectOptionsHtml}
                        </select>
                    </td>
                    <td class="text-center col-hide-sm" style="font-weight: 600;">${Math.round((p.points || 0) * 10) / 10}</td>
                    <td class="text-right ${hasManualPrice ? 'text-yellow' : 'price-text'}" style="font-weight: 600;">
                        ${priceText} ${hasManualPrice ? '<i class="fa-solid fa-hand-holding-dollar" title="Precio manual establecido"></i>' : ''}
                    </td>
                    <td class="text-center">
                        <input type="number" class="manual-price-input" data-player-name="${p.eaPlayerName}" value="${p.manualPrice !== null ? p.manualPrice : ''}" placeholder="Ej. 1500000" style="background: #1e293b; border: 1px solid #475569; color: #fff; border-radius: 4px; padding: 4px 8px; width: 120px; box-sizing: border-box; ${hasManualPrice ? 'border-color: #f59e0b; color: #f59e0b; font-weight: 600;' : ''}">
                    </td>
                    <td class="text-center">
                        <div style="display: flex; gap: 4px; justify-content: center; flex-wrap: wrap;">
                            <button class="btn btn-primary btn-xs btn-save-manual-price" data-player-name="${p.eaPlayerName}"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
                            ${isManual ? `<button class="btn btn-secondary btn-xs btn-reset-manual-price" data-player-name="${p.eaPlayerName}"><i class="fa-solid fa-rotate-left"></i> Restablecer</button>` : ''}
                            <button class="btn btn-warning btn-xs btn-replace-player" data-player-name="${p.eaPlayerName}"><i class="fa-solid fa-arrows-spin"></i> Sustituir</button>
                            <button class="btn btn-danger btn-xs btn-delete-player" data-player-name="${p.eaPlayerName}"><i class="fa-solid fa-trash"></i> Eliminar</button>
                        </div>
                    </td>
                `;
                
                const saveBtn = row.querySelector('.btn-save-manual-price');
                saveBtn.addEventListener('click', async () => {
                    const input = row.querySelector('.manual-price-input');
                    const select = row.querySelector('.manual-pos-select');
                    const priceVal = input.value.trim();
                    const posVal = select.value;
                    
                    await handleUpdatePlayer(p.eaPlayerName, priceVal || null, posVal || null);
                });
                
                if (isManual) {
                    const resetBtn = row.querySelector('.btn-reset-manual-price');
                    resetBtn.addEventListener('click', async () => {
                        await handleUpdatePlayer(p.eaPlayerName, null, null);
                    });
                }

                const replaceBtn = row.querySelector('.btn-replace-player');
                replaceBtn.addEventListener('click', () => {
                    openReplacePlayerModal(p.eaPlayerName);
                });

                const deleteBtn = row.querySelector('.btn-delete-player');
                deleteBtn.addEventListener('click', async () => {
                    if (confirm(`¿Estás seguro de que deseas eliminar permanentemente a ${p.eaPlayerName}?\nSe sacará del mercado, plantillas y alineaciones de todas las ligas, y quedará excluido de futuras sincronizaciones.`)) {
                        await handleExcludePlayer(p.eaPlayerName);
                    }
                });
            } else {
                const displayPos = p.manualPosition || p.lastPosition || 'MC';
                row.innerHTML = `
                    <td>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <div class="clickable-player-name" style="font-weight: 700; color: #38bdf8; cursor: pointer; text-decoration: underline;" onclick="openPlayerStatsModalByName('${p.eaPlayerName.replace(/'/g, "\\'")}')">${p.eaPlayerName}</div>
                            ${newBadgeHtml}
                        </div>
                        <div class="mobile-only-details" style="display: none; font-size: 0.75rem; color: #64748b; margin-top: 2px;">
                            ${p.lastClub} • <span class="text-yellow" style="font-weight: 600;">${Math.round((p.points || 0) * 10) / 10} pts</span>
                        </div>
                    </td>
                    <td class="col-hide-md"><div>${p.lastClub}</div></td>
                    <td>
                        <span style="${hasManualPosition ? 'color: #f59e0b; font-weight: 600;' : ''}" title="${hasManualPosition ? 'Posición modificada por el administrador' : 'Posición de juego'}">
                            ${displayPos} ${hasManualPosition ? '<i class="fa-solid fa-circle-info" style="font-size:0.75rem; margin-left:2px;"></i>' : ''}
                        </span>
                    </td>
                    <td class="text-center col-hide-sm" style="font-weight: 600;">${Math.round((p.points || 0) * 10) / 10}</td>
                    <td class="text-right ${hasManualPrice ? 'text-yellow' : 'price-text'}" style="font-weight: 600;">
                        ${priceText} ${hasManualPrice ? '<i class="fa-solid fa-hand-holding-dollar" title="Precio manual establecido por el administrador"></i>' : ''}
                    </td>
                `;
            }
            
            adminSearchPlayerResults.appendChild(row);
        });
    } catch (e) {
        console.error(e);
        adminSearchPlayerResults.innerHTML = `<tr><td colspan="${colspanVal}" class="text-center py-4 text-red">Error al realizar la búsqueda.</td></tr>`;
    }
}

function openReplacePlayerModal(playerName) {
    selectedNewPlayerName = playerName;
    selectedOldPlayerName = '';
    replacePlayerNameTitle.textContent = playerName;
    replacePlayerSearchInput.value = '';
    replacePlayerAutocompleteResults.innerHTML = '';
    replacePlayerAutocompleteResults.style.display = 'none';
    selectedTargetPlayerContainer.style.display = 'none';
    btnConfirmReplacePlayer.disabled = true;
    replacePlayerModal.classList.add('open');
}

async function handleExcludePlayer(playerName) {
    try {
        const res = await fetch(`/api/fantasy/admin/players/${encodeURIComponent(playerName)}/exclude`, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al eliminar jugador.');

        showToast(data.message || 'Jugador eliminado correctamente.', 'success');
        await handleAdminPlayerSearch();
    } catch (e) {
        console.error(e);
        showToast('Error: ' + e.message, 'error');
    }
}

async function initPlayerSearchLeagueDropdown() {
    if (!adminSearchPlayerLeague) return;
    try {
        const res = await fetch('/api/fantasy/active-leagues');
        if (res.ok) {
            const data = await res.json();
            const activeLeaguesSlugs = data.activeLeagues || [];
            const allLeagues = data.allLeagues || [];

            adminSearchPlayerLeague.innerHTML = '<option value="">Divisiones (Todas)</option>';
            activeLeaguesSlugs.forEach(slug => {
                const matched = allLeagues.find(l => l.slug === slug);
                const title = matched ? (matched.title || slug) : slug;
                const opt = document.createElement('option');
                opt.value = slug;
                opt.textContent = title;
                adminSearchPlayerLeague.appendChild(opt);
            });
        }
    } catch (e) {
        console.error('Error loading search league filter:', e);
    }
}

async function handleUpdatePlayer(eaPlayerName, price, position) {
    try {
        const res = await fetch('/api/fantasy/admin/players/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eaPlayerName, price, position })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al actualizar jugador.');
        
        showToast(data.message || 'Jugador actualizado correctamente.', 'success');
        
        // Volver a buscar para reflejar el estado actual
        await handleAdminPlayerSearch();
        
        // Refrescar los jugadores y el mercado si está cargada una liga
        if (currentLeagueId) {
            const playersRes = await fetch(`/api/fantasy/players?leagueId=${currentLeagueId}`);
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
        showToast('Error: ' + e.message, 'error');
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
    // Left empty or unmodified as the admin league checkbox list is unused
}

// Toggle VPG dropdown open/close
function toggleVpgDropdown(event) {
    event.stopPropagation();
    const multiselect = document.getElementById('vpg-leagues-multiselect');
    if (multiselect) {
        multiselect.classList.toggle('active');
    }
}

// Close dropdown if clicking outside
document.addEventListener('click', (event) => {
    const multiselect = document.getElementById('vpg-leagues-multiselect');
    if (multiselect && !multiselect.contains(event.target)) {
        multiselect.classList.remove('active');
    }
});

// Update the select box label with the count of selected VPG leagues
function updateSelectedVpgCount() {
    const container = document.getElementById('new-league-vpg-checkboxes');
    const countLabel = document.getElementById('selected-vpg-count');
    if (!container || !countLabel) return;

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    const checked = Array.from(checkboxes).filter(cb => cb.checked);

    if (checked.length === 0) {
        countLabel.innerText = 'Ninguna liga seleccionada';
    } else if (checked.length === checkboxes.length) {
        countLabel.innerText = 'Todas las ligas seleccionadas';
    } else if (checked.length === 1) {
        const labelSpan = checked[0].nextElementSibling;
        const labelText = labelSpan ? labelSpan.innerText : checked[0].value;
        countLabel.innerText = labelText;
    } else {
        countLabel.innerText = `${checked.length} ligas seleccionadas`;
    }

    // Dynamically adjust maximum participants allowed based on selected divisions
    const maxPartsInput = document.getElementById('new-league-max-participants');
    if (maxPartsInput) {
        const checkedValues = checked.map(cb => cb.value);
        let maxLimit = 14;
        if (checkedValues.length === 1) {
            maxLimit = 8;
        } else if (checkedValues.length >= 2) {
            maxLimit = 18;
        }
        maxPartsInput.setAttribute('max', maxLimit);
        const currentVal = parseInt(maxPartsInput.value);
        if (!isNaN(currentVal) && currentVal > maxLimit) {
            maxPartsInput.value = maxLimit;
        }
    }
}

// Load active VPG leagues and populate the creation form dropdown
async function loadCreationVpgLeagues() {
    const container = document.getElementById('new-league-vpg-checkboxes');
    if (!container) return;

    try {
        const res = await fetch('/api/fantasy/active-leagues');
        if (!res.ok) throw new Error('No se pudieron obtener las ligas VPG activas.');
        const data = await res.json();
        
        const activeLeagues = data.activeLeagues || [];
        const allLeagues = data.allLeagues || [];

        // Update global variables for compatibility
        if (currentUser && currentUser.isAdmin) {
            globalActiveLeagues = activeLeagues;
            globalAllLeagues = allLeagues;
        }

        if (activeLeagues.length === 0) {
            container.innerHTML = '<span class="text-muted" style="font-size: 0.8rem; padding: 8px; display: block;">No hay ligas VPG habilitadas.</span>';
            const countLabel = document.getElementById('selected-vpg-count');
            if (countLabel) countLabel.innerText = 'Ninguna liga habilitada';
            return;
        }

        let html = '';
        activeLeagues.forEach(slug => {
            const matched = allLeagues.find(l => l.slug === slug);
            const title = matched ? (matched.title || slug) : slug;
            html += `
                <label>
                    <input type="checkbox" value="${slug}" onchange="updateSelectedVpgCount()">
                    <span>${title}</span>
                </label>
            `;
        });
        container.innerHTML = html;
        updateSelectedVpgCount();

    } catch (e) {
        console.error('Error al cargar ligas VPG para creación:', e);
        container.innerHTML = '<span class="text-red" style="font-size: 0.8rem; padding: 8px; display: block;">Error al cargar ligas VPG.</span>';
        const countLabel = document.getElementById('selected-vpg-count');
        if (countLabel) countLabel.innerText = 'Error al cargar';
    }
}

function startAutoRefresh() {
    if (autoRefreshInterval) return;
    autoRefreshInterval = setInterval(async () => {
        if (!currentLeagueId) return;
        
        // Skip auto-refresh if a lineup save is in progress or queued
        if (activeSaveCount > 0) {
            console.log('[AUTO-REFRESH] Guardado de alineación en progreso, omitiendo refresco.');
            return;
        }

        // Skip auto-refresh if any modal is currently open
        if (document.querySelector('.modal-overlay.open') !== null) {
            console.log('[AUTO-REFRESH] Modal abierto, omitiendo refresco.');
            return;
        }
        
        // Don't auto refresh if user is focusing or typing in any input element to avoid losing focus/state
        const active = document.activeElement;
        if (active) {
            const tagName = active.tagName.toLowerCase();
            const isEditable = active.hasAttribute('contenteditable') || active.getAttribute('contenteditable') === 'true';
            if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || isEditable) {
                // User is actively editing or selecting, skip this tick
                return;
            }
        }
        
        try {
            await enterLeague(currentLeagueId, true);
        } catch (e) {
            console.error('Auto refresh error:', e);
        }
    }, 20000);
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

async function openPlayerStatsModalByName(playerName) {
    if (!playerName) return;
    
    // Find player in allPlayers, falling back to searchedPlayersList
    let p = allPlayers.find(x => x.eaPlayerName && x.eaPlayerName.toLowerCase() === playerName.toLowerCase());
    if (!p) {
        p = searchedPlayersList.find(x => x.eaPlayerName && x.eaPlayerName.toLowerCase() === playerName.toLowerCase());
    }
    if (!p) {
        showToast('No se encontró información de este jugador.', 'error');
        return;
    }

    // Determine clauseVal
    let clauseVal = Math.max(p.clause || 0, Math.round(p.price * (activeLeague?.clauseMultiplier || 1.5)));
    
    // If not set on player profile directly, look if any team owns him to fetch their customized clause
    if (!p.clause && currentLeagueId) {
        try {
            const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/teams`);
            if (res.ok) {
                const data = await res.json();
                const teams = data.teams || [];
                const ownerTeam = teams.find(t => t.players && t.players.includes(p.eaPlayerName));
                if (ownerTeam) {
                    clauseVal = Math.max(ownerTeam.clauses?.[p.eaPlayerName] || 0, Math.round(p.price * (activeLeague?.clauseMultiplier || 1.5)));
                }
            }
        } catch (e) {
            console.error('Error fetching owner team clause:', e);
        }
    }

    const displayedPoints = p ? Math.round(p.points * 10) / 10 : 0;
    const tierPoints = p ? Math.round((p.points + (p.basePoints || 0)) * 10) / 10 : 0;

    // Dynamic rating font scaling
    const pointsStr = String(displayedPoints);
    let ratingStyle = '';
    if (pointsStr.length >= 5) {
        ratingStyle = 'style="font-size: 1.05rem; margin-top: 3px;"';
    } else if (pointsStr.length >= 4) {
        ratingStyle = 'style="font-size: 1.25rem; margin-top: 2px;"';
    }

    const avatarUrl = p.avatar ? `https://virtualprogaming.com/cdn-cgi/imagedelivery/cl8ocWLdmZDs72LEaQYaYw/${p.avatar}/smThumb` : null;
    const avatarHtml = avatarUrl ? `<img src="${avatarUrl}" alt="" class="player-avatar-img">` : `<i class="fa-solid fa-shield-halved avatar-shield-back" style="font-size: 4rem; opacity: 0.1; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);"></i><i class="fa-solid fa-user" style="font-size: 4rem; color: #64748b; margin-top: 15px;"></i>`;
    const clubLogoHtml = p.clubLogo ? `<img src="${p.clubLogo}" alt="" class="player-club-logo-img">` : `<i class="fa-solid fa-shield-halved"></i>`;
    const posKey = p.lastPosition ? p.lastPosition.split(' ')[0] : 'MC';

    const modalBody = document.getElementById('player-stats-modal-body');
    if (!modalBody) return;

    const statsTierClass = getCardTierClass(p ? p.price : 0);
    const statsThunderHtml = statsTierClass === 'thunder' ? `
        <div class="thunder-bolt thunder-bolt-1"></div>
        <div class="thunder-bolt thunder-bolt-2"></div>
        <div class="thunder-bolt-3"></div>
        <div class="thunder-bolt-4"></div>
        <div class="thunder-flash-overlay"></div>
    ` : '';

    modalBody.innerHTML = `
        <div class="fut-card ${statsTierClass}" style="margin: 0 auto; transform: scale(1.15); transform-origin: center; box-shadow: 0 8px 24px rgba(0,0,0,0.3);">
            <div class="fut-card-inner">
                <div class="fut-card-top-section">
                    <div class="fut-card-left-col">
                        <div class="fut-card-rating" ${ratingStyle}>${displayedPoints}</div>
                        <div class="fut-card-pos">${posKey}</div>
                        <div class="fut-card-flag">
                            <img src="${getFlagUrl(p.nationality)}" alt="${p.nationality || 'es'}" class="fut-card-flag-img">
                        </div>
                        <div class="fut-card-club-badge">
                            ${clubLogoHtml}
                        </div>
                    </div>
                    <div class="fut-card-player-avatar-container">
                        ${avatarHtml}
                    </div>
                </div>
                <div class="fut-card-player-name">${p.eaPlayerName.trim().split(' ').pop()}</div>
                <div class="fut-card-stats-grid">
                    <div class="fut-card-stat-item">
                        <span class="fut-card-stat-value">${p.matchesPlayed || 0}</span>
                        <span class="fut-card-stat-label">PJ</span>
                    </div>
                    <div class="fut-card-stat-item">
                        <span class="fut-card-stat-value">${parseFloat(p.avgRating || 0).toFixed(2)}</span>
                        <span class="fut-card-stat-label">RAT</span>
                    </div>
                    <div class="fut-card-stat-item">
                        <span class="fut-card-stat-value">${p.goals || 0}</span>
                        <span class="fut-card-stat-label">G</span>
                    </div>
                    <div class="fut-card-stat-item">
                        <span class="fut-card-stat-value">${p.assists || 0}</span>
                        <span class="fut-card-stat-label">A</span>
                    </div>
                    <div class="fut-card-stat-item">
                        <span class="fut-card-stat-value value-highlight">${formatCompactVal(p.price)}</span>
                        <span class="fut-card-stat-label">VAL</span>
                    </div>
                    <div class="fut-card-stat-item">
                        <span class="fut-card-stat-value clause-highlight">${formatCompactVal(clauseVal)}</span>
                        <span class="fut-card-stat-label">CLA</span>
                    </div>
                </div>
                ${statsThunderHtml}
            </div>
        </div>
    `;

    playerStatsModal.classList.add('open');

    // Fetch and display player points history
    const historySection = document.getElementById('player-history-section');
    const historyList = document.getElementById('player-history-list');
    if (historySection && historyList) {
        historySection.style.display = 'none'; // hide by default
        historyList.innerHTML = '<div style="text-align: center; color: #64748b; font-size: 0.8rem; padding: 10px;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando historial...</div>';

        if (currentLeagueId) {
            try {
                const res = await fetch(`/api/fantasy/players/${encodeURIComponent(p.eaPlayerName)}/history?leagueId=${currentLeagueId}`);
                if (res.ok) {
                    const data = await res.json();
                    const history = data.history || [];
                    if (history.length > 0) {
                        historyList.innerHTML = '';
                        historySection.style.display = 'block';

                        // Group by calendar date string
                        const grouped = [];
                        const groupedMap = {};

                        // Since server returns history sorted descending (newest first),
                        // the first entry we encounter for a given date is the latest one.
                        history.forEach(item => {
                            const dateStr = new Date(item.date).toLocaleDateString('es-ES', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric'
                            });

                            if (!groupedMap[dateStr]) {
                                groupedMap[dateStr] = {
                                    dateStr,
                                    points: 0,
                                    wasStarter: item.wasStarter,
                                    teamName: item.teamName
                                };
                                grouped.push(groupedMap[dateStr]);
                            }

                            // Sum points earned in this day
                            groupedMap[dateStr].points += item.points;
                        });

                        grouped.forEach(item => {
                            const alignBadge = item.wasStarter
                                ? '<span style="font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.2); font-weight: 600;">Titular</span>'
                                : '<span style="font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; background: rgba(148, 163, 184, 0.15); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.2); font-weight: 600;">Suplente</span>';

                            const itemEl = document.createElement('div');
                            itemEl.style.cssText = `
                                display: flex;
                                justify-content: space-between;
                                align-items: center;
                                padding: 8px 10px;
                                background: rgba(30, 41, 59, 0.5);
                                border: 1px solid rgba(255,255,255,0.03);
                                border-radius: 8px;
                                font-size: 0.8rem;
                                width: 100%;
                                box-sizing: border-box;
                            `;
                            
                            itemEl.innerHTML = `
                                <div style="display: flex; flex-direction: column; gap: 3px;">
                                    <div style="font-weight: 600; color: #f8fafc; text-align: left;">${item.teamName}</div>
                                    <div style="font-size: 0.7rem; color: #64748b; text-align: left;">${item.dateStr}</div>
                                </div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    ${alignBadge}
                                    <span style="font-weight: 700; color: #facc15; font-size: 0.85rem;">+${Math.round(item.points * 10) / 10} pts</span>
                                </div>
                            `;
                            historyList.appendChild(itemEl);
                        });
                    } else {
                        historyList.innerHTML = '<div style="text-align: center; color: #64748b; font-size: 0.8rem; padding: 10px;">Sin historial de jornadas en esta liga.</div>';
                        historySection.style.display = 'block';
                    }
                } else {
                    historySection.style.display = 'none';
                }
            } catch (err) {
                console.error('Error fetching player history:', err);
                historySection.style.display = 'none';
            }
        }
    }
}

window.openPlayerStatsModalByName = openPlayerStatsModalByName;

function getNextMarketWindowDate(schedule) {
    if (!schedule || !schedule.active || !schedule.windows) return null;
    const windows = schedule.windows.filter(w => w && w.trim() !== '');
    if (windows.length === 0) return null;

    const now = new Date();
    let nextDate = null;

    for (let dayOffset = 0; dayOffset <= 8; dayOffset++) {
        const targetDay = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Europe/Madrid',
            year: 'numeric',
            month: 'numeric',
            day: 'numeric'
        });
        const parts = formatter.formatToParts(targetDay);
        const dateParts = {};
        for (const p of parts) {
            dateParts[p.type] = p.value;
        }
        const y = parseInt(dateParts.year, 10);
        const m = parseInt(dateParts.month, 10);
        const d = parseInt(dateParts.day, 10);

        const localMadridDate = new Date(y, m - 1, d, 12, 0, 0);
        const dayOfWeek = localMadridDate.getDay();
        const days = schedule.days || [0, 1, 2, 3, 4, 5, 6];
        if (!days.includes(dayOfWeek)) continue;

        for (const timeStr of windows) {
            const [hoursStr, minutesStr] = timeStr.split(':');
            const hr = parseInt(hoursStr, 10);
            const min = parseInt(minutesStr, 10);

            const pad2 = (n) => String(n).padStart(2, '0');
            const isoString = `${y}-${pad2(m)}-${pad2(d)}T${pad2(hr)}:${pad2(min)}:00`;
            const targetDate = madridTimeStringToDate(isoString);

            if (targetDate > now) {
                if (!nextDate || targetDate < nextDate) {
                    nextDate = targetDate;
                }
            }
        }
        if (nextDate && nextDate < new Date(now.getTime() + (dayOffset + 1) * 24 * 60 * 60 * 1000)) {
            break;
        }
    }
    return nextDate;
}

function madridTimeStringToDate(isoStr) {
    const dateLocal = new Date(isoStr);
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Madrid',
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hour12: false
    });
    const parts = formatter.formatToParts(dateLocal);
    const dp = {};
    for (const p of parts) dp[p.type] = p.value;

    const dateInMadrid = new Date(
        parseInt(dp.year),
        parseInt(dp.month) - 1,
        parseInt(dp.day),
        parseInt(dp.hour),
        parseInt(dp.minute),
        parseInt(dp.second)
    );

    const diff = dateLocal.getTime() - dateInMadrid.getTime();
    return new Date(dateLocal.getTime() + diff);
}

function startMarketCountdown() {
    const timerEl = document.getElementById('market-countdown-timer');
    if (!timerEl) return;

    function updateTimer() {
        const now = new Date();
        let target = null;

        if (marketScheduleConfig && marketScheduleConfig.active) {
            target = getNextMarketWindowDate(marketScheduleConfig);
        }

        if (!target) {
            target = new Date();
            target.setHours(18, 0, 0, 0);
            if (now >= target) {
                target.setDate(target.getDate() + 1);
            }
        }

        const diffMs = target.getTime() - now.getTime();
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

        const pad = (num) => String(num).padStart(2, '0');
        timerEl.textContent = `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;

        if (typeof updateLineupLockStatusUI === 'function') {
            updateLineupLockStatusUI();
        }
    }

    updateTimer();
    setInterval(updateTimer, 1000);
}

async function loadSchedulesConfig() {
    try {
        const res = await fetch('/api/fantasy/config/schedules');
        if (res.ok) {
            const data = await res.json();
            
            if (data.lock) lockScheduleConfig = data.lock;
            if (data.market) marketScheduleConfig = data.market;
            if (data.clauseLock) clauseLockScheduleConfig = data.clauseLock;
            if (data.marketLock) marketLockScheduleConfig = data.marketLock;
            
            const form = document.getElementById('admin-schedules-form');
            if (form) {
                // 1. Mercado
                const marketActive = document.getElementById('sched-market-active');
                if (marketActive && data.market) {
                    marketActive.checked = !!data.market.active;
                }
                if (data.market && Array.isArray(data.market.days)) {
                    document.querySelectorAll('#sched-market-days input[type="checkbox"]').forEach(cb => {
                        cb.checked = data.market.days.includes(parseInt(cb.value));
                    });
                }
                if (data.market && Array.isArray(data.market.windows)) {
                    const t1 = document.getElementById('sched-market-time1');
                    const t2 = document.getElementById('sched-market-time2');
                    const t3 = document.getElementById('sched-market-time3');
                    if (t1) t1.value = data.market.windows[0] || "";
                    if (t2) t2.value = data.market.windows[1] || "";
                    if (t3) t3.value = data.market.windows[2] || "";
                }
                
                // 2. Puntos
                const pointsActive = document.getElementById('sched-points-active');
                const pointsTime = document.getElementById('sched-points-time');
                if (pointsActive && data.points) {
                    pointsActive.checked = !!data.points.active;
                }
                if (pointsTime && data.points) {
                    pointsTime.value = data.points.time || "18:00";
                }
                if (data.points && Array.isArray(data.points.days)) {
                    document.querySelectorAll('#sched-points-days input[type="checkbox"]').forEach(cb => {
                        cb.checked = data.points.days.includes(parseInt(cb.value));
                    });
                }
                
                // 3. Bloqueo
                const lockActive = document.getElementById('sched-lock-active');
                const lockStart = document.getElementById('sched-lock-start');
                const lockDuration = document.getElementById('sched-lock-duration');
                if (lockActive && data.lock) {
                    lockActive.checked = !!data.lock.active;
                }
                if (lockStart && data.lock) {
                    lockStart.value = data.lock.startTime || "21:30";
                }
                if (lockDuration && data.lock) {
                    lockDuration.value = data.lock.durationHours || 4;
                }
                if (data.lock && Array.isArray(data.lock.days)) {
                    document.querySelectorAll('#sched-lock-days input[type="checkbox"]').forEach(cb => {
                        cb.checked = data.lock.days.includes(parseInt(cb.value));
                    });
                }

                // 4. Bloqueo de Clausulazo
                const clauseActive = document.getElementById('sched-clauseLock-active');
                const clauseStart = document.getElementById('sched-clauseLock-start');
                const clauseDuration = document.getElementById('sched-clauseLock-duration');
                if (clauseActive && data.clauseLock) {
                    clauseActive.checked = !!data.clauseLock.active;
                }
                if (clauseStart && data.clauseLock) {
                    clauseStart.value = data.clauseLock.startTime || "18:30";
                }
                if (clauseDuration && data.clauseLock) {
                    clauseDuration.value = data.clauseLock.durationHours || 5.5;
                }
                if (data.clauseLock && Array.isArray(data.clauseLock.days)) {
                    document.querySelectorAll('#sched-clauseLock-days input[type="checkbox"]').forEach(cb => {
                        cb.checked = data.clauseLock.days.includes(parseInt(cb.value));
                    });
                }

                // 5. Bloqueo de Mercado
                const marketLockActive = document.getElementById('sched-marketLock-active');
                const marketLockStart = document.getElementById('sched-marketLock-start');
                const marketLockDuration = document.getElementById('sched-marketLock-duration');
                if (marketLockActive && data.marketLock) {
                    marketLockActive.checked = !!data.marketLock.active;
                }
                if (marketLockStart && data.marketLock) {
                    marketLockStart.value = data.marketLock.startTime || "18:00";
                }
                if (marketLockDuration && data.marketLock) {
                    marketLockDuration.value = data.marketLock.durationHours || 8;
                }
                if (data.marketLock && Array.isArray(data.marketLock.days)) {
                    document.querySelectorAll('#sched-marketLock-days input[type="checkbox"]').forEach(cb => {
                        cb.checked = data.marketLock.days.includes(parseInt(cb.value));
                    });
                }
            }
            
            updateLineupLockStatusUI();
            if (typeof updateClauseLockStatusUI === 'function') updateClauseLockStatusUI();
            if (typeof updateMarketLockStatusUI === 'function') updateMarketLockStatusUI();
        }
    } catch (e) {
        console.error('Error fetching schedules config:', e);
    }
}

// MODAL 10 - Admin Team Players Modal Logic
async function openAdminTeamPlayersModal(teamId, teamName) {
    currentAdminEditingTeamId = teamId;
    adminTeamPlayersTitle.textContent = teamName;
    adminAddPlayerSearchInput.value = '';
    adminAddPlayerAutocompleteResults.innerHTML = '';
    adminTeamPlayersListContainer.innerHTML = '<div class="text-center py-3 text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Cargando plantilla...</div>';
    
    adminTeamPlayersModal.classList.add('open');
    
    await refreshAdminTeamPlayersList();
}

async function refreshAdminTeamPlayersList() {
    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/teams`);
        if (!res.ok) throw new Error('No se pudieron obtener los participantes.');
        const data = await res.json();
        const teams = data.teams || [];
        const targetTeam = teams.find(t => t._id === currentAdminEditingTeamId);
        
        if (!targetTeam) {
            adminTeamPlayersListContainer.innerHTML = '<div class="text-center py-3 text-red">Equipo no encontrado.</div>';
            return;
        }
        
        const playersList = targetTeam.players || [];
        if (playersList.length === 0) {
            adminTeamPlayersListContainer.innerHTML = '<div class="text-center py-3 text-muted">Este equipo no tiene jugadores asignados.</div>';
            return;
        }
        
        let html = '<table class="fantasy-table" style="width: 100%; border-collapse: collapse;">';
        html += '<thead><tr><th>Jugador</th><th>Pos</th><th>Club</th><th class="text-center">Acción</th></tr></thead>';
        html += '<tbody>';
        
        playersList.forEach(name => {
            let p = allPlayers.find(x => x.eaPlayerName.toLowerCase() === name.toLowerCase());
            if (!p) {
                p = {
                    eaPlayerName: name,
                    lastPosition: 'MC',
                    lastClub: 'Desconocido'
                };
            }
            
            html += `
                <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
                    <td style="padding: 8px 4px; font-weight: 600; color: #fff;">${p.eaPlayerName}</td>
                    <td style="padding: 8px 4px;"><span class="pos-badge pos-${p.lastPosition}">${p.lastPosition}</span></td>
                    <td style="padding: 8px 4px; color: #94a3b8; font-size: 0.85rem;">${p.lastClub}</td>
                    <td class="text-center" style="padding: 8px 4px;">
                        <button class="btn btn-danger btn-xs btn-remove-player-action" data-player-name="${p.eaPlayerName}">
                            <i class="fa-solid fa-user-minus"></i> Quitar
                        </button>
                    </td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
        adminTeamPlayersListContainer.innerHTML = html;
        
        // Attach delete action listener
        adminTeamPlayersListContainer.querySelectorAll('.btn-remove-player-action').forEach(btn => {
            btn.addEventListener('click', async () => {
                const pName = btn.getAttribute('data-player-name');
                if (confirm(`¿Estás seguro de que deseas retirar a ${pName} de este equipo?`)) {
                    await handleAdminRemovePlayer(pName);
                }
            });
        });
        
    } catch (err) {
        console.error(err);
        adminTeamPlayersListContainer.innerHTML = '<div class="text-center py-3 text-red">Error al cargar jugadores de la plantilla.</div>';
    }
}

async function handleAdminRemovePlayer(playerName) {
    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/teams/${currentAdminEditingTeamId}/players/remove`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ playerName })
        });
        const data = await res.json();
        if (!res.ok) {
            showToast(data.error || 'Error al retirar jugador', 'error');
            return;
        }
        showToast(data.message || 'Jugador retirado con éxito', 'success');
        
        await refreshAdminTeamPlayersList();
        await loadLeagueAdminTeams();
    } catch (err) {
        console.error(err);
        showToast('Error de red al retirar jugador', 'error');
    }
}

async function handleAdminAddPlayer(playerName) {
    try {
        const res = await fetch(`/api/fantasy/leagues/${currentLeagueId}/teams/${currentAdminEditingTeamId}/players/add`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ playerName })
        });
        const data = await res.json();
        if (!res.ok) {
            showToast(data.error || 'Error al añadir jugador', 'error');
            return;
        }
        showToast(data.message || 'Jugador añadido con éxito', 'success');
        
        await refreshAdminTeamPlayersList();
        await loadLeagueAdminTeams();
    } catch (err) {
        console.error(err);
        showToast('Error de red al añadir jugador', 'error');
    }
}

// Show floating context menu when clicking on a rival player card on the tactical field
function showPlayerContextMenu(event, player, ownerTeamName, ownerDiscordId, clauseVal, isProtected) {
    let menu = document.getElementById('player-context-menu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'player-context-menu';
        menu.className = 'player-context-menu';
        document.body.appendChild(menu);
    }
    
    const isLocked = isBuyoutLocked();
    const isMyOwn = currentUser && (ownerDiscordId === currentUser.discordId);
    const isSpectator = !!myTeam.isSpectator;
    
    let clauseTitle = '';
    if (isSpectator) {
        clauseTitle = 'No puedes realizar operaciones en modo lectura';
    } else if (isProtected) {
        clauseTitle = 'Protegido por cláusula reciente';
    } else if (isLocked) {
        clauseTitle = 'Clausulazos bloqueados temporalmente';
    }
    
    // Add custom buttons
    menu.innerHTML = `
        <button class="player-context-item btn-bid" ${isMyOwn || isSpectator ? 'disabled' : ''} title="${isSpectator ? 'No puedes pujar en modo lectura' : ''}">
            <i class="fa-solid fa-gavel"></i> Pujar
        </button>
        <button class="player-context-item btn-clause" ${isMyOwn || isProtected || isLocked || isSpectator ? 'disabled' : ''} title="${clauseTitle}">
            <i class="fa-solid fa-bolt"></i> Clausulazo (${formatCurrency(clauseVal)})
        </button>
    `;
    
    // Position menu near the clicked card
    const rect = event.currentTarget.getBoundingClientRect();
    menu.style.top = `${window.scrollY + rect.bottom + 5}px`;
    menu.style.left = `${window.scrollX + rect.left}px`;
    
    // Bind action listeners
    const bidBtn = menu.querySelector('.btn-bid');
    if (bidBtn && !bidBtn.disabled) {
        bidBtn.addEventListener('click', () => {
            menu.classList.remove('open');
            // Open bidding modal
            bidPlayerName.textContent = player.eaPlayerName;
            bidSellerTeamVal.textContent = ownerTeamName;
            bidAskingPriceVal.textContent = formatCurrency(player.price);
            bidBalanceVal.textContent = formatCurrency(myTeam.balance);
            bidAmountInput.value = new Intl.NumberFormat('es-ES').format(player.price);
            bidForm.setAttribute('data-player-name', player.eaPlayerName);
            bidForm.setAttribute('data-seller-id', ownerDiscordId);
            bidModal.classList.add('open');
        });
    }
    
    const clauseBtn = menu.querySelector('.btn-clause');
    if (clauseBtn && !clauseBtn.disabled) {
        clauseBtn.addEventListener('click', () => {
            menu.classList.remove('open');
            // Execute clause buyout
            const pToBuy = {
                eaPlayerName: player.eaPlayerName,
                owner: ownerTeamName
            };
            executeClausulazo(pToBuy, clauseVal);
        });
    }
    
    // Show menu
    menu.classList.add('open');
}

