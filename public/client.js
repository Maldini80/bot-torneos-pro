// --- INICIO DEL ARCHIVO client.js (VERSIÓN FINAL Y COMPLETA) ---

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tournamentId = urlParams.get('tournamentId');
    const draftId = urlParams.get('draftId');
    const rouletteSessionId = urlParams.get('rouletteSessionId'); // <-- Línea nueva

    if (rouletteSessionId) {
        // Si hay un ID de ruleta, iniciamos esa vista
        document.body.classList.add('draft-view-style'); // Reutilizamos un estilo para el fondo
        initializeRouletteView(rouletteSessionId);
    } else if (tournamentId) {
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
    const viewSwitcherEl = document.querySelector('.view-switcher');
    const finishedViewEl = document.getElementById('finished-view');
    const championNameEl = document.getElementById('champion-name');

    let hasLoadedInitialData = false;
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${window.location.host}`);
    socket.onopen = () => console.log('Conectado al servidor para Torneo.');
    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'tournament' && message.id === tournamentId) {
            if (!hasLoadedInitialData) {
                loadingEl.classList.add('hidden');
                appContainerEl.classList.remove('hidden');
                hasLoadedInitialData = true;
            }
            renderTournamentState(message.data);
        }
    };

    fetch(`/tournament-data/${tournamentId}`)
        .then(response => response.ok ? response.json() : Promise.resolve(null))
        .then(data => {
            if (data && !hasLoadedInitialData) {
                loadingEl.classList.add('hidden');
                appContainerEl.classList.remove('hidden');
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
        });
    });

    mobileViewSelect.addEventListener('change', (event) => {
        const viewId = event.target.value;
        document.querySelector('.view-pane.active')?.classList.remove('active');
        document.getElementById(viewId).classList.add('active');
    });

    if (closeButton) closeButton.addEventListener('click', () => modalEl.classList.add('hidden'));
    window.addEventListener('click', (event) => { if (event.target == modalEl) modalEl.classList.add('hidden'); });

    function renderTournamentState(tournament) {
        if (!tournament) return;
        if (tournament.status === 'finalizado') {
            viewSwitcherEl.style.display = 'none';
            document.querySelector('.mobile-view-switcher').style.display = 'none';
            const activePane = mainPanelEl.querySelector('.view-pane.active');
            if(activePane) activePane.classList.remove('active');
            finishedViewEl.classList.add('active');
            const finalMatch = tournament.structure.eliminatorias.final;
            if (finalMatch && finalMatch.resultado) {
                const [scoreA, scoreB] = finalMatch.resultado.split('-').map(Number);
                const champion = scoreA > scoreB ? finalMatch.equipoA : finalMatch.equipoB;
                championNameEl.textContent = champion.nombre;
            } else {
                championNameEl.textContent = "Por determinar";
            }
            tournamentNameEl.textContent = `${tournament.nombre} (Finalizado)`;
            liveMatchesListEl.innerHTML = '<p class="placeholder">El torneo ha finalizado.</p>';
            return;
        }

        viewSwitcherEl.style.display = 'flex';
        finishedViewEl.classList.remove('active');
        if (!mainPanelEl.querySelector('.view-pane.active')) {
            mainPanelEl.querySelector('[data-view="classification-view"]').click();
        }
        
        tournamentNameEl.textContent = tournament.nombre;
        tournamentFormatEl.textContent = `${tournament.config.format.label} | ${Object.keys(tournament.teams.aprobados).length} / ${tournament.config.format.size} Equipos`;
        renderTeams(tournament);
        renderClassification(tournament);
        renderCalendar(tournament);
        renderBracket(tournament);
        renderLiveMatches(tournament);
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
            let metaHTML = `<div class="team-meta"><span>Capitán: ${team.capitanTag}</span>`;
            if (team.coCaptainTag) {
                metaHTML += `<span>Co-Capitán: ${team.coCaptainTag}</span>`;
            }
            metaHTML += '</div>';
            const twitterLink = team.twitter ? `<a href="https://twitter.com/${team.twitter.replace('@','')}" target="_blank" class="team-link-btn">Twitter</a>` : '';
            const streamLink = team.streamChannel ? `<a href="${team.streamChannel}" target="_blank" class="team-link-btn">Ver Stream</a>` : '';
            const linksHTML = (twitterLink || streamLink) ? `<div class="team-links">${twitterLink}${streamLink}</div>` : '';
            const card = document.createElement('div');
            card.className = `team-card-info ${isDraftTeam ? 'is-draft-team' : ''}`;
            card.innerHTML = `<h3>${logoHtml} ${team.nombre}</h3>${metaHTML}${linksHTML}`;
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

        const sortedGroupNames = Object.keys(groups).sort();
        
        sortedGroupNames.forEach(groupName => {
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
                
                groupHTML += `
                    <div class="team-stat-card">
                        <div class="team-info-classification">
                            <span class="team-position">${index + 1}</span>
                            ${logoHtml}
                            <span class="team-name-classification">${team.nombre}</span>
                        </div>
                        <div class="team-stats-grid">
                            <div class="stat-item"><span class="stat-value">${team.stats.pts}</span><span class="stat-label">PTS</span></div>
                            <div class="stat-item"><span class="stat-value">${team.stats.pj}</span><span class="stat-label">PJ</span></div>
                            <div class="stat-item"><span class="stat-value">${team.stats.gf}</span><span class="stat-label">GF</span></div>
                            <div class="stat-item"><span class="stat-value">${team.stats.gc}</span><span class="stat-label">GC</span></div>
                            <div class="stat-item"><span class="stat-value">${dg}</span><span class="stat-label">DG</span></div>
                        </div>
                    </div>
                `;
            });

            groupHTML += '</div>';
            groupsContainerEl.innerHTML += groupHTML;
        });
    }

    function renderCalendar(tournament) {
        const groups = tournament.structure.calendario;
        calendarContainerEl.innerHTML = '';
        if (Object.keys(groups).length === 0) {
            calendarContainerEl.innerHTML = '<p class="placeholder">El calendario se mostrará cuando comience el torneo.</p>';
            return;
        }

        const sortedGroupNames = Object.keys(groups).sort();

        sortedGroupNames.forEach(groupName => {
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
                    const teamA = match.equipoA;
                    const teamB = match.equipoB;
                    const result = match.resultado ? `<div class="match-result">${match.resultado}</div>` : '<div class="match-vs">vs</div>';
                    const teamALogo = teamA.logoUrl ? `<img src="${teamA.logoUrl}" class="team-logo-small" alt="">` : '<div class="team-logo-placeholder"></div>';
                    const teamBLogo = teamB.logoUrl ? `<img src="${teamB.logoUrl}" class="team-logo-small" alt="">` : '<div class="team-logo-placeholder"></div>';

                    groupHTML += `<div class="calendar-match">
                                    <div class="team-info left"><span>${teamA.nombre}</span>${teamALogo}</div>
                                    ${result}
                                    <div class="team-info right">${teamBLogo}<span>${teamB.nombre}</span></div>
                                  </div>`;
                });
                groupHTML += `</div>`;
            });

            groupHTML += `</div>`;
            calendarContainerEl.innerHTML += groupHTML;
        });
    }

    function renderBracket(tournament) {
        const stages = tournament.config.format.knockoutStages;
        bracketContainerEl.innerHTML = '';
        if (!stages || !tournament.structure.eliminatorias || tournament.status === 'inscripcion_abierta' || tournament.status === 'fase_de_grupos') {
            bracketContainerEl.innerHTML = '<p class="placeholder">Las eliminatorias no han comenzado.</p>';
            return;
        }
        
        stages.forEach(stageKey => {
            const matches = tournament.structure.eliminatorias[stageKey];
            if (!matches || (Array.isArray(matches) && matches.length === 0)) return;
            const roundMatches = Array.isArray(matches) ? matches : [matches];
            let roundHTML = `<div class="bracket-round"><div class="bracket-round-title">${stageKey.replace(/_/g, ' ')}</div>`;
            roundMatches.forEach(match => {
                const teamA = match.equipoA;
                const teamB = match.equipoB;
                const teamAName = teamA?.nombre || 'Por definir';
                const teamBName = teamB?.nombre || 'Por definir';
                const teamALogo = teamA?.logoUrl ? `<img src="${teamA.logoUrl}" class="bracket-team-logo" alt="">` : '<div class="bracket-team-logo-placeholder"></div>';
                const teamBLogo = teamB?.logoUrl ? `<img src="${teamB.logoUrl}" class="bracket-team-logo" alt="">` : '<div class="bracket-team-logo-placeholder"></div>';
                
                let scoreA = '', scoreB = '';
                let classA = '', classB = '';
                if (match.resultado) {
                    [scoreA, scoreB] = match.resultado.split('-');
                    if (parseInt(scoreA) > parseInt(scoreB)) classA = 'winner-top';
                    else if (parseInt(scoreB) > parseInt(scoreA)) classB = 'winner-bottom';
                }
                roundHTML += `<div class="bracket-match ${classA} ${classB}">
                                <div class="bracket-team">
                                    <div class="bracket-team-info">${teamALogo}<span>${teamAName}</span></div>
                                    <span class="score">${scoreA}</span>
                                </div>
                                <div class="bracket-team">
                                    <div class="bracket-team-info">${teamBLogo}<span>${teamBName}</span></div>
                                    <span class="score">${scoreB}</span>
                                </div>
                             </div>`;
            });
            roundHTML += '</div>';
            bracketContainerEl.innerHTML += roundHTML;
        });
    }

    function renderLiveMatches(tournament) {
        const allMatches = [];
        if (tournament.structure.calendario) {
            allMatches.push(...Object.values(tournament.structure.calendario).flat());
        }
        if (tournament.structure.eliminatorias) {
            Object.values(tournament.structure.eliminatorias).forEach(stage => {
                if (Array.isArray(stage)) allMatches.push(...stage);
                else if (stage && typeof stage === 'object' && stage.matchId) allMatches.push(stage);
            });
        }
        const liveMatches = allMatches.filter(match => match && match.status === 'en_curso');
        
        liveMatchesListEl.innerHTML = '';
        if (liveMatches.length === 0) {
            liveMatchesListEl.innerHTML = '<p class="placeholder">No hay partidos en juego.</p>';
            return;
        }

        const groupedMatches = liveMatches.reduce((acc, match) => {
            const groupKey = match.nombreGrupo ? `${match.nombreGrupo} - Jornada ${match.jornada}` : match.jornada.charAt(0).toUpperCase() + match.jornada.slice(1);
            if (!acc[groupKey]) acc[groupKey] = [];
            acc[groupKey].push(match);
            return acc;
        }, {});

        Object.keys(groupedMatches).sort().forEach(groupKey => {
            let groupHTML = `<div class="live-match-group"><h4>${groupKey}</h4>`;
            groupedMatches[groupKey].forEach(match => {
                const teamA = tournament.teams.aprobados[match.equipoA?.capitanId];
                const teamB = tournament.teams.aprobados[match.equipoB?.capitanId];
                if (!teamA || !teamB) return;
                let linksHTML = '';
                if (teamA.streamChannel) linksHTML += `<a href="${teamA.streamChannel}" target="_blank" class="team-link-btn">Ver a ${teamA.nombre}</a>`;
                if (teamB.streamChannel) linksHTML += `<a href="${teamB.streamChannel}" target="_blank" class="team-link-btn">Ver a ${teamB.nombre}</a>`;
                if (!linksHTML) linksHTML = '<p style="font-size: 0.9em; color: #888;">No hay streams disponibles.</p>';
                groupHTML += `<div class="live-match-card"><div class="live-match-teams">${teamA.nombre} vs ${teamB.nombre}</div><div class="stream-links">${linksHTML}</div></div>`;
            });
            groupHTML += '</div>';
            liveMatchesListEl.innerHTML += groupHTML;
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
    // ... (El código de initializeDraftView no necesita cambios)
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
            currentUser = await response.json();
            const userSessionEl = document.getElementById('user-session');
            if (currentUser) {
                document.getElementById('user-greeting').textContent = `Hola, ${currentUser.username}`;
                userSessionEl.classList.remove('hidden');
            }
        } catch (e) {
            console.error("Error al verificar la sesión:", e);
        }
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
                    draftContainerEl.classList.remove('hidden');
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
                    draftContainerEl.classList.remove('hidden');
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
        manageTeamTab.style.display = (draft.status === 'finalizado' || draft.status === 'torneo_generado') && isMyTeamManaged ? 'inline-block' : 'none';
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
            allTeamsHtml += `<div class="team-card"><h3 class="team-header">${captain.teamName}<span class="captain-psn">Cap: ${captain.psnId}</span></h3><ul class="team-roster">${rosterHtml}</ul></div>`;
        });
        teamsGrid.innerHTML = allTeamsHtml;
    }

function renderAvailablePlayers(draft) {
    playersTableBodyEl.innerHTML = '';
    const captainIdInTurn = (draft.selection && draft.selection.order?.length > 0) ? draft.selection.order[draft.selection.turn] : null;
    const isMyTurn = currentUser && draft.status === 'seleccion' && String(currentUser.id) === String(captainIdInTurn);
    
    // --- NUEVA LÓGICA DE VISIBILIDAD DE DETALLES ---
    const canViewDetails = currentUser && (draft.status === 'finalizado' || draft.status === 'torneo_generado');

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
        
        let actionButtonsHTML = isMyTurn ? `<button class="pick-btn" data-player-id="${player.userId}" data-position="${activeFilterPos}">Elegir</button>` : '---';
        
        // Si se cumplen las condiciones, añadimos el botón de ver detalles
        if (canViewDetails) {
            actionButtonsHTML += `<button class="details-btn" data-player-id="${player.userId}" data-draft-id="${draft.shortId}">🪪 Ver Ficha</button>`;
        }

        const statusIcon = player.currentTeam === 'Libre' ? '🔎' : '🛡️';
        
        row.innerHTML = `
            <td data-label="Strikes"><span class="player-data">${player.strikes || 0}</span></td>
            <td data-label="NOMBRE"><span class="player-data">${statusIcon} ${player.psnId}</span></td>
            <td data-label="Pos. Primaria" class="col-primary"><span class="player-data">${player.primaryPosition}</span></td>
            <td data-label="Pos. Secundaria" class="col-secondary"><span class="player-data">${secPos}</span></td>
            <td data-label="Acción" class="col-action">${actionButtonsHTML}</td>
        `;
        playersTableBodyEl.appendChild(row);
    });

    applyTableFilters();
}
    function applyTableFilters() {
        const activeFilterPos = document.querySelector('#position-filters .filter-btn.active')?.dataset.pos || 'Todos';
        const filterColumn = document.getElementById('filter-column-select').value;
        const rows = playersTableBodyEl.querySelectorAll('tr');
        const table = document.getElementById('players-table');

        const captainIdInTurn = (currentDraftState?.selection?.order?.length > 0) ? currentDraftState.selection.order[currentDraftState.selection.turn] : null;
        const isMyTurn = currentUser && currentDraftState?.status === 'seleccion' && String(currentUser.id) === String(captainIdInTurn);

        table.classList.remove('primary-only', 'secondary-only');

        let hasPrimaryMatchesInData = false;
        if (isMyTurn && activeFilterPos !== 'Todos' && currentDraftState) {
            hasPrimaryMatchesInData = currentDraftState.players.some(p => 
                !p.captainId && 
                !p.isCaptain && 
                p.primaryPosition === activeFilterPos
            );

            if (hasPrimaryMatchesInData) {
                table.classList.add('primary-only');
            } else {
                table.classList.add('secondary-only');
            }
        }

        rows.forEach(row => {
            const primaryPos = row.dataset.primaryPos;
            const secondaryPos = row.dataset.secondaryPos;
            
            let isVisible = false;
            if (activeFilterPos === 'Todos') {
                isVisible = true;
            } else {
                if (isMyTurn) {
                    if (hasPrimaryMatchesInData) {
                        if (primaryPos === activeFilterPos) isVisible = true;
                    } else {
                        if (secondaryPos === activeFilterPos) isVisible = true;
                    }
                } else {
                    if (filterColumn === 'primary' && primaryPos === activeFilterPos) {
                        isVisible = true;
                    } else if (filterColumn === 'secondary' && secondaryPos === activeFilterPos) {
                        isVisible = true;
                    }
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
                const playerRow = event.target.closest('tr');
                activeFilterPos = playerRow.dataset.primaryPos;
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
        const draftId = target.dataset.draftId; // Lo necesitamos aquí también

        if (target.classList.contains('btn-strike')) {
            const reason = prompt("Por favor, introduce un motivo breve para el strike (ej: inactividad, toxicidad):");
            if (reason && reason.trim() !== '') {
                socket.send(JSON.stringify({ type: 'report_player', draftId, playerId, reason: reason.trim() }));
                target.disabled = true;
                target.textContent = 'Reportado';
            }
        }

        if (target.classList.contains('btn-kick')) {
            const reason = prompt("Por favor, introduce un motivo breve para solicitar la expulsión:");
            if (reason && reason.trim() !== '') {
                if (confirm(`¿Estás seguro de que quieres solicitar la EXPULSIÓN de este jugador por el motivo "${reason.trim()}"? Un administrador deberá aprobarlo.`)) {
                    socket.send(JSON.stringify({ type: 'request_kick', draftId, playerId, reason: reason.trim() }));
                    target.disabled = true;
                    target.textContent = 'Solicitud Pendiente';
                }
            }
        }
        
        // --- BLOQUE AÑADIDO ---
        if (target.classList.contains('details-btn')) {
            showPlayerDetailsModal(draftId, playerId);
        }
        // --- FIN DEL BLOQUE AÑADIDO ---
    });

    // Lógica para cerrar el nuevo modal
    const detailsModal = document.getElementById('player-details-modal');
    const closeDetailsButton = detailsModal.querySelector('.close-button');
    
    closeDetailsButton.addEventListener('click', () => detailsModal.classList.add('hidden'));
    detailsModal.addEventListener('click', (event) => {
        if (event.target === detailsModal) {
            detailsModal.classList.add('hidden');
        }
    });
        // --- INICIO DEL NUEVO BLOQUE DE ESCUCHA GLOBAL ---
    document.addEventListener('click', function(event) {
        // Solo nos interesa si se hizo clic en un botón con la clase 'details-btn'
        if (event.target.classList.contains('details-btn')) {
            const playerId = event.target.dataset.playerId;
            const draftId = event.target.dataset.draftId;
            
            // Debug log que pediste:
            console.log('Botón de Ficha clickeado, datos:', { draftId, playerId });

            // Si tenemos los datos, mostramos la ventana
            if (draftId && playerId) {
                showPlayerDetailsModal(draftId, playerId);
            } else {
                console.error('Faltan datos en el botón para mostrar la ficha (draftId o playerId).');
            }
        }
    });
    }

    function setupFilters() {
        if (positionFiltersEl.innerHTML !== '') return;
        positionFiltersEl.innerHTML = `<select id="filter-column-select"><option value="primary">Filtrar por Pos. Primaria</option><option value="secondary">Filtrar por Pos. Secundaria</option></select>`;
        const select = document.getElementById('filter-column-select');
        select.addEventListener('change', applyTableFilters);

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
        rosterManagementContainer.innerHTML = '';
        return;
    }
    managementTeamName.textContent = myCaptainData.teamName;
    rosterManagementContainer.innerHTML = '';
    const myTeamPlayers = draft.players.filter(p => p.captainId === currentUser.id && !p.isCaptain);

    myTeamPlayers.forEach(player => {
        const card = document.createElement('div');
        card.className = 'player-management-card';
        const strikes = player.strikes || 0;
        
        const hasBeenReported = player.hasBeenReportedByCaptain || false;
        const kickRequestPending = player.kickRequestPending || false;
        
        const reportButtonText = hasBeenReported ? 'Reportado' : 'Reportar (Strike)';
        const kickButtonText = kickRequestPending ? 'Solicitud Pendiente' : 'Solicitar Expulsión';

        card.innerHTML = `
            <div class="player-management-info">
                <h3>${player.psnId}</h3>
                <p>Posición: ${player.primaryPosition}</p>
                <p>Strikes: <span class="strikes">${strikes}</span></p>
            </div>
            <div class="management-actions">
                <button class="btn-strike" data-player-id="${player.userId}" data-draft-id="${draft.shortId}" ${hasBeenReported ? 'disabled' : ''}>
                    ${reportButtonText}
                </button>
                <button class="btn-kick" data-player-id="${player.userId}" data-draft-id="${draft.shortId}" ${kickRequestPending ? 'disabled' : ''}>
                    ${kickButtonText}
                </button>
                <button class="details-btn" data-player-id="${player.userId}" data-draft-id="${draft.shortId}">🪪 Ver Ficha</button>
            </div>
        `;
        rosterManagementContainer.appendChild(card);
    });
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
            let pickIndexInOrder;

            // Lógica Snake Draft
            if ((currentRound + 1) % 2 !== 0) { // Ronda impar (1, 3, 5...)
                pickIndexInOrder = i;
            } else { // Ronda par (2, 4, 6...)
                pickIndexInOrder = numCaptains - 1 - i;
            }

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
        bannerEl.innerHTML = `<strong>Último Pick:</strong> ${player.psnId} ➔ ${captain.teamName}`;
        bannerEl.classList.add('visible');
    }
async function showPlayerDetailsModal(draftId, playerId) {
    const modal = document.getElementById('player-details-modal');
    const modalPlayerName = document.getElementById('modal-player-name');
    const modalContent = document.getElementById('modal-player-details-content');

    modalPlayerName.textContent = 'Cargando...';
    modalContent.innerHTML = '<p>Obteniendo datos del jugador...</p>';
    modal.classList.remove('hidden');

    try {
        const response = await fetch(`/api/player-details/${draftId}/${playerId}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'No se pudieron obtener los detalles.');
        }
        const data = await response.json();

        modalPlayerName.textContent = `Ficha de: ${data.psnId}`;
        modalContent.innerHTML = `
            <p><span class="detail-label">Discord:</span> <span class="detail-value">${data.discordTag}</span></p>
            <p><span class="detail-label">ID de Juego:</span> <span class="detail-value">${data.psnId}</span></p>
            <p><span class="detail-label">Pos. Primaria:</span> <span class="detail-value">${data.primaryPosition}</span></p>
            <p><span class="detail-label">Pos. Secundaria:</span> <span class="detail-value">${data.secondaryPosition}</span></p>
            <p><span class="detail-label">WhatsApp:</span> <span class="detail-value">${data.whatsapp || 'No registrado'}</span></p>
            <p><span class="detail-label">Twitter:</span> <span class="detail-value">${data.twitter || 'No registrado'}</span></p>
            <p><span class="detail-label">Strikes:</span> <span class="detail-value">${data.strikes}</span></p>
        `;
    } catch (error) {
        modalPlayerName.textContent = 'Error';
        modalContent.innerHTML = `<p style="color: var(--primary-color);">${error.message}</p>`;
    }
}
    
    initialize();
}

function initializeRouletteView(sessionId) {
    const loadingEl = document.getElementById('loading');
    const rouletteContainerEl = document.getElementById('roulette-container');
    const canvas = document.getElementById('roulette-canvas');
    const spinButton = document.getElementById('spin-button');
    const statusEl = document.getElementById('roulette-status');
    const ctx = canvas.getContext('2d');

    let teams = [];
    let startAngle = 0;
    let spinTime = 0;
    let spinTimeTotal = 0;
    let spinAngleStart = 0;
    let tournamentShortId = null;

    // Colores para los quesitos de la ruleta (se irán alternando)
    const colors = ["#E62429", "#222222", "#FFFFFF", "#555555"];

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${window.location.host}`);
    socket.onopen = () => console.log('Conectado al servidor para Sorteo con Ruleta.');

    async function fetchTeams() {
        spinButton.disabled = true;
        spinButton.textContent = 'CARGANDO EQUIPOS...';
        try {
            const response = await fetch(`/api/roulette-data/${sessionId}`);
            const data = await response.json();
            
            if (response.ok) {
                teams = data.teams;
                tournamentShortId = data.tournamentShortId; // Guardamos el ID del torneo
                if (teams.length > 0) {
                    drawRoulette();
                    spinButton.disabled = false;
                    spinButton.textContent = 'GIRAR RULETA';
                    statusEl.textContent = `Listos para sortear. ${teams.length} equipos restantes.`;
                } else {
                    statusEl.textContent = '¡SORTEO FINALIZADO!';
                    spinButton.textContent = 'COMPLETADO';
                    spinButton.disabled = true;
                }
            } else {
                statusEl.textContent = `Error: ${data.error}`;
            }
        } catch (error) {
            statusEl.textContent = 'Error al conectar con el servidor.';
        }
    }

    function drawRoulette() {
        const arc = Math.PI * 2 / teams.length;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.font = 'bold 24px Bebas Neue';

        teams.forEach((team, i) => {
            const angle = startAngle + i * arc;
            ctx.fillStyle = colors[i % colors.length];

            // Dibuja el "quesito"
            ctx.beginPath();
            ctx.arc(400, 400, 380, angle, angle + arc, false);
            ctx.arc(400, 400, 0, angle + arc, angle, true);
            ctx.stroke();
            ctx.fill();

            // Dibuja el texto con el nombre del equipo
            ctx.save();
            ctx.fillStyle = (i % colors.length === 2) ? '#000000' : '#FFFFFF'; // Texto negro sobre fondo blanco
            ctx.translate(400 + Math.cos(angle + arc / 2) * 200, 400 + Math.sin(angle + arc / 2) * 200);
            ctx.rotate(angle + arc / 2 + Math.PI / 2);
            const text = team.name;
            ctx.fillText(text, -ctx.measureText(text).width / 2, 0);
            ctx.restore();
        });
    }

    function spin() {
        spinButton.disabled = true;
        statusEl.textContent = 'Girando...';

        spinAngleStart = Math.random() * 10 + 10; // Velocidad inicial
        spinTime = 0;
        spinTimeTotal = Math.random() * 3000 + 5000; // Duración del giro
        animate();
    }

    function animate() {
        spinTime += 30;
        if (spinTime >= spinTimeTotal) {
            stopSpinning();
            return;
        }
        // Fórmula para que la ruleta frene poco a poco
        const spinAngle = spinAngleStart - easeOut(spinTime, 0, spinAngleStart, spinTimeTotal);
        startAngle += (spinAngle * Math.PI / 180);
        drawRoulette();
        requestAnimationFrame(animate);
    }

    function stopSpinning() {
        const degrees = startAngle * 180 / Math.PI + 90;
        const arc = 360 / teams.length;
        const index = Math.floor((360 - degrees % 360) / arc);
        const winner = teams[index];

        statusEl.textContent = `¡Le toca a... ${winner.name}!`;

        // Avisamos al bot del resultado
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'spin_result',
                sessionId: sessionId,
                teamId: winner.id
            }));
        }

        // Después de unos segundos, recargamos la ruleta para el siguiente giro
        setTimeout(() => {
            fetchTeams();
        }, 4000);
    }
    
    function easeOut(t, b, c, d) {
        const ts = (t /= d) * t;
        const tc = ts * t;
        return b + c * (tc + -3 * ts + 3 * t);
    }

    // --- INICIO ---
    loadingEl.classList.add('hidden');
    rouletteContainerEl.classList.remove('hidden');
    fetchTeams(); // Carga los equipos iniciales
    spinButton.addEventListener('click', spin);
}

