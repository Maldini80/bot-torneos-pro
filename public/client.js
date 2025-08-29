// --- INICIO DEL ARCHIVO client.js (VERSIÓN FINAL Y UNIFICADA) ---

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tournamentId = urlParams.get('tournamentId');
    const draftId = urlParams.get('draftId');

    if (tournamentId) {
        document.body.classList.remove('draft-view-style');
        initializeTournamentView(tournamentId);
    } else if (draftId) {
        document.body.classList.add('draft-view-style');
        initializeDraftView(draftId);
    } else {
        document.getElementById('loading').textContent = 'Error: No se ha especificado un ID de evento en la URL.';
    }
});

function initializeTournamentView(tournamentId) {
    const loadingEl = document.getElementById('loading');
    const appContainerEl = document.getElementById('app-container');
    const tournamentNameEl = document.getElementById('tournament-name');
    const tournamentFormatEl = document.getElementById('tournament-format');
    const groupsContainerEl = document.getElementById('groups-container');
    const calendarContainerEl = document.getElementById('calendar-container');
    const bracketContainerEl = document.getElementById('bracket-container');
    const teamListContainerEl = document.getElementById('team-list-container');
    const liveMatchesListEl = document.getElementById('live-matches-list');
    const modalEl = document.getElementById('roster-modal');
    const modalTeamNameEl = document.getElementById('modal-team-name');
    const modalRosterListEl = document.getElementById('modal-roster-list');
    const closeButton = document.querySelector('.close-button');
    const viewButtons = document.querySelectorAll('.view-btn');
    const mobileViewSelect = document.getElementById('mobile-view-select');
    const mainPanelEl = document.getElementById('main-panel');
    const finishedViewEl = document.getElementById('finished-view');
    const championNameEl = document.getElementById('champion-name');

    let hasLoadedInitialData = false;
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    let socket;

    function connect() {
        socket = new WebSocket(`${protocol}://${window.location.host}`);
        socket.onopen = () => console.log('Conectado al servidor para Torneo.');
        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'tournament' && message.id === tournamentId) {
                if (!hasLoadedInitialData) {
                    loadingEl.classList.add('hidden');
                    appContainerEl.style.display = 'flex';
                    hasLoadedInitialData = true;
                }
                renderTournamentState(message.data);
            }
        };
        socket.onclose = () => setTimeout(connect, 3000);
        socket.onerror = (error) => { console.error('Error de WebSocket:', error); socket.close(); };
    }

    connect();

    fetch(`/tournament-data/${tournamentId}`)
        .then(response => response.ok ? response.json() : null)
        .then(data => {
            if (data && !hasLoadedInitialData) {
                loadingEl.classList.add('hidden');
                appContainerEl.style.display = 'flex';
                renderTournamentState(data);
                hasLoadedInitialData = true;
            }
        }).catch(err => console.warn('No se pudieron cargar datos iniciales, esperando WebSocket.'));

    viewButtons.forEach(button => {
        button.addEventListener('click', () => {
            document.querySelector('.view-btn.active')?.classList.remove('active');
            document.querySelector('.view-pane.active')?.classList.remove('active');
            button.classList.add('active');
            document.getElementById(button.dataset.view).classList.add('active');
            mobileViewSelect.value = button.dataset.view;
        });
    });

    mobileViewSelect.addEventListener('change', (event) => {
        const viewId = event.target.value;
        document.querySelector(`.view-btn[data-view="${viewId}"]`).click();
    });

    if (closeButton) closeButton.addEventListener('click', () => modalEl.classList.add('hidden'));
    window.addEventListener('click', (event) => { if (event.target === modalEl) modalEl.classList.add('hidden'); });

    function renderTournamentState(tournament) {
        if (!tournament) return;
        
        tournamentNameEl.textContent = tournament.nombre;
        tournamentFormatEl.textContent = `${tournament.config.format.label} | ${Object.keys(tournament.teams.aprobados).length} / ${tournament.config.format.size} Equipos`;

        if (tournament.status === 'finalizado') {
            document.querySelector('.view-switcher').style.display = 'none';
            document.querySelector('.mobile-view-switcher').style.display = 'none';
            document.querySelector('.view-pane.active')?.classList.remove('active');
            finishedViewEl.classList.add('active');
            const finalMatch = tournament.structure.eliminatorias.final;
            if (finalMatch?.resultado) {
                const [scoreA, scoreB] = finalMatch.resultado.split('-').map(Number);
                const champion = scoreA > scoreB ? finalMatch.equipoA : finalMatch.equipoB;
                championNameEl.textContent = champion.nombre;
            }
            liveMatchesListEl.innerHTML = '<p class="placeholder">El torneo ha finalizado.</p>';
        } else {
            if (!mainPanelEl.querySelector('.view-pane.active')) {
                 mainPanelEl.querySelector('[data-view="classification-view"]').click();
            }
            renderTeams(tournament);
            renderClassification(tournament);
            renderCalendar(tournament);
            renderBracket(tournament);
            renderLiveMatches(tournament);
        }
    }

    function renderTeams(tournament) {
        teamListContainerEl.innerHTML = '';
        const teams = Object.values(tournament.teams.aprobados).sort((a, b) => a.nombre.localeCompare(b.nombre));
        if (teams.length === 0) {
            teamListContainerEl.innerHTML = '<p class="placeholder">Aún no hay equipos aprobados.</p>';
            return;
        }
        teams.forEach(team => {
            const logoHtml = team.logoUrl ? `<img src="${team.logoUrl}" class="team-logo-large" alt="Logo de ${team.nombre}">` : '';
            const isDraftTeam = team.players && team.players.length > 0;
            let metaHTML = `<div class="team-meta"><span>Capitán: ${team.capitanTag}</span></div>`;
            const card = document.createElement('div');
            card.className = `team-card-info ${isDraftTeam ? 'is-draft-team' : ''}`;
            card.innerHTML = `<h3>${logoHtml} ${team.nombre}</h3>${metaHTML}`;
            if (isDraftTeam) {
                card.addEventListener('click', () => showRosterModal(team));
            }
            teamListContainerEl.appendChild(card);
        });
    }

    function renderClassification(tournament) {
        const groups = tournament.structure.grupos;
        groupsContainerEl.innerHTML = '';
        if (Object.keys(groups).length === 0) {
            groupsContainerEl.innerHTML = '<p class="placeholder">El sorteo de grupos no se ha realizado.</p>';
            return;
        }
        Object.keys(groups).sort().forEach(groupName => {
            const group = groups[groupName];
            const sortedTeams = [...group.equipos].sort((a, b) => {
                if (a.stats.pts !== b.stats.pts) return b.stats.pts - a.stats.pts;
                if (a.stats.dg !== b.stats.dg) return b.stats.dg - a.stats.dg;
                return b.stats.gf - a.stats.gf;
            });
            let groupHTML = `<div class="group-container"><h3 class="group-title">${groupName}</h3>`;
            sortedTeams.forEach((team, index) => {
                const dg = team.stats.dg > 0 ? `+${team.stats.dg}` : team.stats.dg;
                const logoHtml = team.logoUrl ? `<img src="${team.logoUrl}" class="team-logo-small" alt="">` : '<div class="team-logo-placeholder"></div>';
                groupHTML += `<div class="team-stat-card"><div class="team-info-classification"><span class="team-position">${index + 1}</span>${logoHtml}<span class="team-name-classification">${team.nombre}</span></div><div class="team-stats-grid"><div class="stat-item"><span class="stat-value">${team.stats.pts}</span><span class="stat-label">PTS</span></div><div class="stat-item"><span class="stat-value">${team.stats.pj}</span><span class="stat-label">PJ</span></div><div class="stat-item"><span class="stat-value">${team.stats.gf}</span><span class="stat-label">GF</span></div><div class="stat-item"><span class="stat-value">${team.stats.gc}</span><span class="stat-label">GC</span></div><div class="stat-item"><span class="stat-value">${dg}</span><span class="stat-label">DG</span></div></div></div>`;
            });
            groupHTML += '</div>';
            groupsContainerEl.innerHTML += groupHTML;
        });
    }

    function renderCalendar(tournament) {
        calendarContainerEl.innerHTML = '';
        const groups = tournament.structure.calendario;
        if (!groups || Object.keys(groups).length === 0) {
            calendarContainerEl.innerHTML = '<p class="placeholder">El calendario se mostrará aquí.</p>';
            return;
        }
        Object.keys(groups).sort().forEach(groupName => {
            const matches = groups[groupName];
            const matchesByRound = matches.reduce((acc, match) => {
                const round = `Jornada ${match.jornada}`;
                if (!acc[round]) acc[round] = [];
                acc[round].push(match);
                return acc;
            }, {});
            let groupHTML = `<div class="calendar-group"><h3>${groupName}</h3>`;
            Object.keys(matchesByRound).sort().forEach(roundName => {
                groupHTML += `<div class="calendar-round"><h4>${roundName}</h4>`;
                matchesByRound[roundName].forEach(match => {
                    const result = match.resultado ? `<div class="match-result">${match.resultado}</div>` : '<div class="match-vs">vs</div>';
                    const logoA = match.equipoA.logoUrl ? `<img src="${match.equipoA.logoUrl}" class="team-logo-small">` : `<div class="team-logo-placeholder"></div>`;
                    const logoB = match.equipoB.logoUrl ? `<img src="${match.equipoB.logoUrl}" class="team-logo-small">` : `<div class="team-logo-placeholder"></div>`;
                    groupHTML += `<div class="calendar-match"><div class="team-info left">${logoA}<span>${match.equipoA.nombre}</span></div>${result}<div class="team-info right"><span>${match.equipoB.nombre}</span>${logoB}</div></div>`;
                });
                groupHTML += `</div>`;
            });
            groupHTML += `</div>`;
            calendarContainerEl.innerHTML += groupHTML;
        });
    }

    function renderBracket(tournament) {
        bracketContainerEl.innerHTML = '';
        const stages = tournament.config.format.knockoutStages;
        if (!stages || !tournament.structure.eliminatorias || stages.every(s => !tournament.structure.eliminatorias[s])) {
            bracketContainerEl.innerHTML = '<p class="placeholder">Las eliminatorias no han comenzado.</p>';
            return;
        }
        stages.forEach(stageKey => {
            const matches = tournament.structure.eliminatorias[stageKey];
            if (!matches || (Array.isArray(matches) && matches.length === 0)) return;
            const roundMatches = Array.isArray(matches) ? matches : [matches];
            let roundHTML = `<div class="bracket-round"><div class="bracket-round-title">${stageKey.replace(/_/g, ' ')}</div>`;
            roundMatches.forEach(match => {
                let [scoreA, scoreB] = match.resultado ? match.resultado.split('-') : ['', ''];
                let classA = '', classB = '';
                if (match.resultado) {
                    if (parseInt(scoreA) > parseInt(scoreB)) classA = 'winner-top';
                    else if (parseInt(scoreB) > parseInt(scoreA)) classB = 'winner-bottom';
                }
                const logoA = match.equipoA?.logoUrl ? `<img src="${match.equipoA.logoUrl}" class="bracket-team-logo">` : `<div class="bracket-team-logo-placeholder"></div>`;
                const logoB = match.equipoB?.logoUrl ? `<img src="${match.equipoB.logoUrl}" class="bracket-team-logo">` : `<div class="bracket-team-logo-placeholder"></div>`;
                roundHTML += `<div class="bracket-match ${classA} ${classB}"><div class="bracket-team"><div class="bracket-team-info">${logoA}<span>${match.equipoA?.nombre || 'Por definir'}</span></div><span class="score">${scoreA}</span></div><div class="bracket-team"><div class="bracket-team-info">${logoB}<span>${match.equipoB?.nombre || 'Por definir'}</span></div><span class="score">${scoreB}</span></div></div>`;
            });
            roundHTML += '</div>';
            bracketContainerEl.innerHTML += roundHTML;
        });
    }

    function renderLiveMatches(tournament) {
        const allMatches = [ ...Object.values(tournament.structure.calendario).flat(), ...Object.values(tournament.structure.eliminatorias).flat().filter(m => m && m.matchId) ];
        const liveMatches = allMatches.filter(match => match && match.status === 'en_curso');
        liveMatchesListEl.innerHTML = '';
        if (liveMatches.length === 0) {
            liveMatchesListEl.innerHTML = '<p class="placeholder">No hay partidos en juego.</p>';
            return;
        }
        liveMatches.forEach(match => {
            const teamA = tournament.teams.aprobados[match.equipoA.capitanId];
            const teamB = tournament.teams.aprobados[match.equipoB.capitanId];
            if (!teamA || !teamB) return;
            let linksHTML = '';
            if (teamA.streamChannel) linksHTML += `<a href="${teamA.streamChannel}" target="_blank" class="team-link-btn">Ver a ${teamA.nombre}</a>`;
            if (teamB.streamChannel) linksHTML += `<a href="${teamB.streamChannel}" target="_blank" class="team-link-btn">Ver a ${teamB.nombre}</a>`;
            if (!linksHTML) linksHTML = '<p style="font-size: 0.9em; color: #888;">No hay streams disponibles.</p>';
            liveMatchesListEl.innerHTML += `<div class="live-match-card"><div class="live-match-teams">${teamA.nombre} vs ${teamB.nombre}</div><div class="stream-links">${linksHTML}</div></div>`;
        });
    }

    function showRosterModal(team) {
        modalTeamNameEl.textContent = team.nombre;
        modalRosterListEl.innerHTML = '';
        const positionOrder = ['GK', 'DFC', 'CARR', 'MCD', 'MV/MCO', 'DC'];
        const sortedPlayers = [...team.players].sort((a, b) => positionOrder.indexOf(a.primaryPosition) - positionOrder.indexOf(b.primaryPosition));
        sortedPlayers.forEach(player => {
            const li = document.createElement('li');
            li.textContent = `${player.psnId} (${player.primaryPosition})`;
            modalRosterListEl.appendChild(li);
        });
        modalEl.classList.remove('hidden');
    }
}


function initializeDraftView(draftId) {
    const loadingEl = document.getElementById('loading');
    const draftContainerEl = document.getElementById('draft-container');
    const draftNameEl = document.getElementById('draft-name-draftview');
    const roundInfoEl = document.getElementById('round-info-draftview');
    const currentTeamEl = document.getElementById('current-team-draftview');
    const currentPickEl = document.getElementById('current-pick-draftview');
    const playersTableBodyEl = document.getElementById('players-table-body');
    const positionFiltersEl = document.getElementById('position-filters');
    const roundPickOrderEl = document.getElementById('round-pick-order');
    const manageTeamTab = document.getElementById('manage-team-tab');
    const rosterManagementContainer = document.getElementById('roster-management-container');
    const managementTeamName = document.getElementById('management-team-name');

    const positionOrder = ['GK', 'DFC', 'CARR', 'MCD', 'MV/MCO', 'DC'];
    let hasLoadedInitialData = false;
    let currentUser = null;
    let currentDraftState = null;
    let lastShownPickData = null;
    let socket;

    async function initialize() {
        await checkUserSession();
        connectWebSocket();
        fetchInitialData();
        setupEventListeners();
        setupFilters();
    }

    async function checkUserSession() {
        try {
            const response = await fetch('/api/user');
            if(response.ok) {
                currentUser = await response.json();
                if (currentUser) {
                    document.getElementById('user-greeting').textContent = `Hola, ${currentUser.username}`;
                    document.getElementById('user-session').classList.remove('hidden');
                }
            }
        } catch (e) { console.error("Error al verificar la sesión:", e); }
    }
    
    function connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        socket = new WebSocket(`${protocol}://${window.location.host}`);
        socket.onopen = () => console.log('Conectado al servidor para Draft.');

        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'draft' && message.id === draftId) {
                currentDraftState = message.data;
                if (!hasLoadedInitialData) {
                    loadingEl.classList.add('hidden');
                    draftContainerEl.style.display = 'flex';
                    hasLoadedInitialData = true;
                }
                const lastPick = currentDraftState.selection.lastPick;
                if (lastPick && JSON.stringify(lastPick) !== JSON.stringify(lastShownPickData)) {
                    showPickAlert(lastPick.pickNumber, { psnId: lastPick.playerPsnId }, { teamName: lastPick.captainTeamName });
                    lastShownPickData = lastPick;
                }
                renderAll();
            }
            if (message.type === 'pick_error' || message.type === 'strike_error') {
                alert(`Error: ${message.message}`);
                if (currentDraftState) renderAll();
            }
        };
    }

    function fetchInitialData() {
        fetch(`/draft-data/${draftId}`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data && !hasLoadedInitialData) {
                    currentDraftState = data;
                    loadingEl.classList.add('hidden');
                    draftContainerEl.style.display = 'flex';
                    hasLoadedInitialData = true;
                    renderAll();
                }
            }).catch(err => console.warn('Error en fetch inicial:', err));
    }

    function renderAll() {
        if (!currentDraftState) return;
        renderHeader(currentDraftState);
        renderTeams(currentDraftState);
        renderAvailablePlayers(currentDraftState);
        renderTeamManagementView(currentDraftState);
    }

    function renderHeader(draft) {
        draftNameEl.textContent = draft.name;
        if ((draft.status === 'finalizado' || draft.status === 'torneo_generado')) {
            roundInfoEl.textContent = 'Selección Finalizada';
            currentTeamEl.textContent = '---';
            currentPickEl.textContent = '---';
            roundPickOrderEl.innerHTML = '';
        } else if (draft.status === 'seleccion' && draft.captains.length > 0 && draft.selection.order.length > 0) {
            const numCaptains = draft.captains.length;
            const currentRound = Math.floor((draft.selection.currentPick - 1) / numCaptains) + 1;
            const totalRounds = 10;
            roundInfoEl.textContent = `Ronda ${currentRound} de ${totalRounds}`;
            const currentCaptain = draft.captains.find(c => c.userId === draft.selection.order[draft.selection.turn]);
            currentTeamEl.textContent = currentCaptain ? currentCaptain.teamName : 'N/A';
            currentPickEl.textContent = draft.selection.currentPick;
            renderRoundPickOrder(draft);
        }
        const isMyTeamManaged = currentUser && draft.captains.some(c => c.userId === currentUser.id);
        const isDraftActiveOrFinished = ['seleccion', 'finalizado', 'torneo_generado'].includes(draft.status);
        manageTeamTab.style.display = isDraftActiveOrFinished && isMyTeamManaged ? 'inline-block' : 'none';
    }

    function renderTeams(draft) {
        const teamsGrid = document.getElementById('teams-grid');
        if (!teamsGrid) return;
        let allTeamsHtml = '';
        draft.captains.sort((a, b) => a.teamName.localeCompare(b.teamName)).forEach(captain => {
            const teamPlayers = draft.players.filter(p => p.captainId === captain.userId).sort((a, b) => positionOrder.indexOf(a.primaryPosition) - positionOrder.indexOf(b.primaryPosition));
            let rosterHtml = '';
            teamPlayers.forEach(player => {
                const isCaptainIcon = player.isCaptain ? '👑' : '';
                let positionDisplay = player.pickedForPosition || player.primaryPosition;
                if (player.pickedForPosition && player.pickedForPosition !== player.primaryPosition) {
                    positionDisplay += '*';
                }
                rosterHtml += `<li><span class="player-name">${isCaptainIcon} ${player.psnId}</span><span class="player-pos">${positionDisplay}</span></li>`;
            });
            allTeamsHtml += `<div class="team-card"><h3 class="team-header">${captain.teamName} <span class="captain-psn">(Cap: ${captain.psnId})</span></h3><ul class="team-roster">${rosterHtml}</ul></div>`;
        });
        teamsGrid.innerHTML = allTeamsHtml;
    }

    function renderAvailablePlayers(draft) {
        playersTableBodyEl.innerHTML = '';
        const captainIdInTurn = (draft.selection && draft.selection.order?.length > 0) ? draft.selection.order[draft.selection.turn] : null;
        const isMyTurn = currentUser && draft.status === 'seleccion' && String(currentUser.id) === String(captainIdInTurn);

        const filterSelect = document.getElementById('filter-column-select');
        if (filterSelect) {
            filterSelect.style.display = isMyTurn ? 'none' : 'inline-block';
        }
        const legendEl = document.querySelector('#available-players-container-draftview .legend');
        if (legendEl) {
            legendEl.style.display = isMyTurn ? 'none' : 'block';
        }

        let availablePlayers = draft.players.filter(p => (p.captainId === null || p.captainId === undefined) && p.isCaptain === false);
        
        availablePlayers.sort(sortPlayersAdvanced);

        availablePlayers.forEach(player => {
            const row = document.createElement('tr');
            row.dataset.primaryPos = player.primaryPosition;
            row.dataset.secondaryPos = player.secondaryPosition || 'NONE';

            const secPos = player.secondaryPosition && player.secondaryPosition !== 'NONE' ? player.secondaryPosition : '-';
            const activeFilterPos = document.querySelector('#position-filters .filter-btn.active')?.dataset.pos || 'Todos';
            const actionButton = isMyTurn ? `<button class="pick-btn" data-player-id="${player.userId}" data-position="${activeFilterPos}">Elegir</button>` : '---';
            const statusIcon = player.currentTeam === 'Libre' ? '🔎' : '🛡️';
            
            row.innerHTML = `
                <td data-label="Strikes">${player.strikes || 0}</td>
                <td data-label="NOMBRE">${statusIcon} ${player.psnId}</td>
                <td data-label="Pos. Primaria" class="col-primary">${player.primaryPosition}</td>
                <td data-label="Pos. Secundaria" class="col-secondary">${secPos}</td>
                <td data-label="Acción" class="col-action">${actionButton}</td>
            `;
            playersTableBodyEl.appendChild(row);
        });

        applyTableFilters();
    }

    function applyTableFilters() {
        const activeFilterPos = document.querySelector('#position-filters .filter-btn.active')?.dataset.pos || 'Todos';
        const filterColumn = document.getElementById('filter-column-select')?.value || 'primary';
        const rows = playersTableBodyEl.querySelectorAll('tr');
        const table = document.getElementById('players-table');

        const captainIdInTurn = (currentDraftState?.selection?.order?.length > 0) ? currentDraftState.selection.order[currentDraftState.selection.turn] : null;
        const isMyTurn = currentUser && currentDraftState?.status === 'seleccion' && String(currentUser.id) === String(captainIdInTurn);

        table.classList.remove('primary-only', 'secondary-only');

        let hasPrimaryMatchesInData = false;
        if (isMyTurn && activeFilterPos !== 'Todos' && currentDraftState) {
            hasPrimaryMatchesInData = currentDraftState.players.some(p => !p.captainId && !p.isCaptain && p.primaryPosition === activeFilterPos);
            if (hasPrimaryMatchesInData) table.classList.add('primary-only');
            else table.classList.add('secondary-only');
        }

        rows.forEach(row => {
            const primaryPos = row.dataset.primaryPos;
            const secondaryPos = row.dataset.secondaryPos;
            let isVisible = false;
            if (activeFilterPos === 'Todos') isVisible = true;
            else {
                if (isMyTurn) {
                    if (hasPrimaryMatchesInData) { if (primaryPos === activeFilterPos) isVisible = true; } 
                    else { if (secondaryPos === activeFilterPos) isVisible = true; }
                } else {
                    if (filterColumn === 'primary' && primaryPos === activeFilterPos) isVisible = true;
                    else if (filterColumn === 'secondary' && secondaryPos === activeFilterPos) isVisible = true;
                }
            }
            row.style.display = isVisible ? '' : 'none';
        });
    }

    function setupEventListeners() {
        document.querySelectorAll('.draft-view-btn').forEach(btn => btn.addEventListener('click', (e) => {
            document.querySelector('.draft-view-btn.active')?.classList.remove('active');
            e.currentTarget.classList.add('active');
            document.querySelector('.draft-view-pane.active')?.classList.remove('active');
            document.getElementById(e.currentTarget.dataset.view).classList.add('active');
        }));

        playersTableBodyEl.addEventListener('click', (event) => {
            if (event.target.classList.contains('pick-btn')) {
                const playerId = event.target.dataset.playerId;
                let activeFilterPos = document.querySelector('#position-filters .filter-btn.active')?.dataset.pos;
                if (!activeFilterPos || activeFilterPos === 'Todos') {
                    activeFilterPos = event.target.closest('tr').dataset.primaryPos;
                }
                if (socket && socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({ type: 'execute_draft_pick', draftId, playerId, position: activeFilterPos }));
                    document.querySelectorAll('.pick-btn').forEach(btn => btn.disabled = true);
                }
            }
        });
        
        rosterManagementContainer.addEventListener('click', (event) => {
            const target = event.target;
            const playerId = target.dataset.playerId;
            if (target.classList.contains('btn-strike')) {
                const reason = prompt("Motivo del strike (ej: inactividad, toxicidad):");
                if (reason?.trim()) {
                    socket.send(JSON.stringify({ type: 'report_player', draftId, playerId, reason: reason.trim() }));
                    target.disabled = true;
                    target.textContent = 'Reportado';
                }
            }
            if (target.classList.contains('btn-kick')) {
                const reason = prompt("Motivo de la solicitud de expulsión:");
                if (reason?.trim()) {
                    socket.send(JSON.stringify({ type: 'request_kick', draftId, playerId, reason: reason.trim() }));
                    target.disabled = true;
                    target.textContent = 'Solicitado';
                }
            }
        });
    }

    function setupFilters() {
        if (positionFiltersEl.querySelector('.filter-btn')) return;
        const select = document.createElement('select');
        select.id = 'filter-column-select';
        select.innerHTML = `<option value="primary">Filtrar por Pos. Primaria</option><option value="secondary">Filtrar por Pos. Secundaria</option>`;
        select.addEventListener('change', applyTableFilters);
        positionFiltersEl.appendChild(select);

        const allPositions = ['Todos', ...positionOrder];
        allPositions.forEach(pos => {
            const btn = document.createElement('button');
            btn.className = 'filter-btn';
            btn.dataset.pos = pos;
            btn.textContent = pos;
            if (pos === 'Todos') btn.classList.add('active');
            btn.addEventListener('click', () => {
                document.querySelectorAll('#position-filters .filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                applyTableFilters();
            });
            positionFiltersEl.appendChild(btn);
        });
    }
    
    function renderTeamManagementView(draft) {
        const myCaptainData = draft.captains.find(c => c.userId === currentUser?.id);
        if (!myCaptainData) {
            rosterManagementContainer.innerHTML = '<p class="placeholder">No se encontraron datos de tu equipo.</p>';
            return;
        }
        managementTeamName.textContent = myCaptainData.teamName;
        rosterManagementContainer.innerHTML = '';
        const myTeamPlayers = draft.players.filter(p => p.captainId === currentUser.id).sort((a, b) => positionOrder.indexOf(a.primaryPosition) - positionOrder.indexOf(b.primaryPosition));

        if (draft.status === 'seleccion') {
            let rosterHtml = myTeamPlayers.map(player => {
                const isCaptainIcon = player.isCaptain ? '👑' : '';
                return `<li><span class="player-name">${isCaptainIcon} ${player.psnId}</span><span class="player-pos">${player.pickedForPosition || player.primaryPosition}</span></li>`;
            }).join('');
            rosterManagementContainer.innerHTML = `<div class="team-roster-simple"><h2>Plantilla en Progreso</h2><ul>${rosterHtml || '<li>Aún no has seleccionado jugadores.</li>'}</ul></div>`;
        } else {
            const playersToManage = myTeamPlayers.filter(p => !p.isCaptain);
            if (playersToManage.length > 0) {
                playersToManage.forEach(player => {
                    const card = document.createElement('div');
                    card.className = 'player-management-card';
                    card.innerHTML = `<div class="player-management-info"><h3>${player.psnId}</h3><p>Posición: ${player.primaryPosition}</p><p>Strikes: <span class="strikes">${player.strikes || 0}</span></p></div><div class="management-actions"><button class="btn-strike" data-player-id="${player.userId}" ${player.hasBeenReportedByCaptain ? 'disabled' : ''}>Reportar (Strike)</button><button class="btn-kick" data-player-id="${player.userId}">Solicitar Expulsión</button></div>`;
                    rosterManagementContainer.appendChild(card);
                });
            } else {
                rosterManagementContainer.innerHTML = '<p class="placeholder">Tu plantilla final no tiene jugadores para gestionar.</p>';
            }
        }
    }

    function sortPlayersAdvanced(a, b) {
        const posIndexA = positionOrder.indexOf(a.primaryPosition);
        const posIndexB = positionOrder.indexOf(b.primaryPosition);
        if (posIndexA !== posIndexB) return posIndexA - posIndexB;
        return a.psnId.localeCompare(b.psnId);
    }
    
    function renderRoundPickOrder(draft) {
        roundPickOrderEl.innerHTML = '';
        if (draft.status !== 'seleccion') return;
        const numCaptains = draft.captains.length;
        if (numCaptains === 0) return;
        const currentPick = draft.selection.currentPick;
        const currentRound = Math.floor((currentPick - 1) / numCaptains);
        const startPickOfRound = currentRound * numCaptains;
        for (let i = 0; i < numCaptains; i++) {
            const pickNumber = startPickOfRound + i + 1;
            let pickIndexInOrder = (currentRound % 2 === 0) ? i : numCaptains - 1 - i;
            const captainId = draft.selection.order[pickIndexInOrder];
            const captain = draft.captains.find(c => c.userId === captainId);
            const item = document.createElement('div');
            item.className = 'pick-order-item';
            if (pickNumber < currentPick) item.classList.add('past-pick');
            if (pickNumber === currentPick) item.classList.add('active-pick');
            item.innerHTML = `<span>#${pickNumber}</span> ${captain ? captain.teamName : 'N/A'}`;
            roundPickOrderEl.appendChild(item);
        }
    }

    function showPickAlert(pickNumber, player, captain) {
        const pickAlertEl = document.getElementById('pick-alert');
        const pickAlertContentEl = document.getElementById('pick-alert-content');
        pickAlertContentEl.innerHTML = `<div class="pick-number">PICK #${pickNumber}</div><div class="player-name">${player.psnId}</div><div class="team-name">${captain.teamName}</div>`;
        pickAlertEl.classList.remove('hidden');
        pickAlertEl.classList.add('visible');
        setTimeout(() => {
            pickAlertEl.classList.remove('visible');
            setTimeout(() => pickAlertEl.classList.add('hidden'), 500);
        }, 4500);

        const bannerEl = document.getElementById('last-pick-banner');
        bannerEl.textContent = `Último Pick: ${player.psnId} ➔ ${captain.teamName}`;
        bannerEl.classList.add('visible');
    }

    initialize();
}
