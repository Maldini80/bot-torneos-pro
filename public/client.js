// --- INICIO DEL ARCHIVO client.js (VERSIÓN FINAL Y COMPLETA) ---

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
            const isDraftTeam = team.players && team.players.length > 0;
            let metaHTML = `<div class="team-meta"><span>👑 Capitán: ${team.capitanTag}</span>`;
            if (team.coCaptainTag) {
                metaHTML += `<span>🤝 Co-Capitán: ${team.coCaptainTag}</span>`;
            }
            metaHTML += '</div>';
            const twitterLink = team.twitter ? `<a href="https://twitter.com/${team.twitter.replace('@','')}" target="_blank">Twitter</a>` : '';
            const streamLink = team.streamChannel ? `<a href="${team.streamChannel}" target="_blank">Ver Stream</a>` : '';
            const linksHTML = (twitterLink || streamLink) ? `<div class="team-links">${twitterLink}${streamLink}</div>` : '';
            const card = document.createElement('div');
            card.className = `team-card-info ${isDraftTeam ? 'is-draft-team' : ''}`;
            card.innerHTML = `<h3>${team.nombre}</h3>${metaHTML}${linksHTML}`;
            if (isDraftTeam) {
                card.addEventListener('click', () => showRosterModal(team));
            }
            teamListContainerEl.appendChild(card);
        });
    }

    function renderClassification(tournament) {
        const groups = tournament.structure.grupos;
        if (Object.keys(groups).length === 0) {
            groupsContainerEl.innerHTML = '<p class="placeholder">El sorteo de grupos no se ha realizado.</p>';
            return;
        }
        groupsContainerEl.innerHTML = '';
        const sortedGroupNames = Object.keys(groups).sort();
        sortedGroupNames.forEach(groupName => {
            const group = groups[groupName];
            const sortedTeams = [...group.equipos].sort((a, b) => {
                if (a.stats.pts !== b.stats.pts) return b.stats.pts - a.stats.pts;
                if (a.stats.dg !== b.stats.dg) return b.stats.dg - a.stats.dg;
                return b.stats.gf - a.stats.gf;
            });
            let tableHTML = `<div class="group-table"><h3>${groupName}</h3><table><thead><tr><th>Equipo</th><th>PJ</th><th>PTS</th><th>GF</th><th>GC</th><th>DG</th></tr></thead><tbody>`;
            sortedTeams.forEach(team => {
                tableHTML += `<tr><td class="team-name">${team.nombre}</td><td>${team.stats.pj}</td><td>${team.stats.pts}</td><td>${team.stats.gf}</td><td>${team.stats.gc}</td><td>${team.stats.dg > 0 ? '+' : ''}${team.stats.dg}</td></tr>`;
            });
            tableHTML += '</tbody></table></div>';
            groupsContainerEl.innerHTML += tableHTML;
        });
    }

    function renderCalendar(tournament) {
        const groups = tournament.structure.calendario;
        if (Object.keys(groups).length === 0) {
            calendarContainerEl.innerHTML = '<p class="placeholder">El calendario se mostrará cuando comience el torneo.</p>';
            return;
        }

        calendarContainerEl.innerHTML = '';
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

                    groupHTML += `<div class="calendar-match"><div class="team-info left">${teamA.nombre}</div>${result}<div class="team-info right">${teamB.nombre}</div></div>`;
                });
                groupHTML += `</div>`;
            });

            groupHTML += `</div>`;
            calendarContainerEl.innerHTML += groupHTML;
        });
    }

    function renderBracket(tournament) {
        const stages = tournament.config.format.knockoutStages;
        if (!stages || !tournament.structure.eliminatorias || tournament.status === 'inscripcion_abierta' || tournament.status === 'fase_de_grupos') {
            bracketContainerEl.innerHTML = '<p class="placeholder">Las eliminatorias no han comenzado.</p>';
            return;
        }
        bracketContainerEl.innerHTML = '';
        stages.forEach(stageKey => {
            const matches = tournament.structure.eliminatorias[stageKey];
            if (!matches || (Array.isArray(matches) && matches.length === 0)) return;
            const roundMatches = Array.isArray(matches) ? matches : [matches];
            let roundHTML = `<div class="bracket-round"><div class="bracket-round-title">${stageKey.replace(/_/g, ' ')}</div>`;
            roundMatches.forEach(match => {
                const teamA = match.equipoA?.nombre || 'Por definir';
                const teamB = match.equipoB?.nombre || 'Por definir';
                let scoreA = '', scoreB = '';
                let classA = '', classB = '';
                if (match.resultado) {
                    [scoreA, scoreB] = match.resultado.split('-');
                    if (parseInt(scoreA) > parseInt(scoreB)) classA = 'winner-top';
                    else if (parseInt(scoreB) > parseInt(scoreA)) classB = 'winner-bottom';
                }
                roundHTML += `<div class="bracket-match ${classA} ${classB}"><div class="bracket-team"><span>${teamA}</span><span class="score">${scoreA}</span></div><div class="bracket-team"><span>${teamB}</span><span class="score">${scoreB}</span></div></div>`;
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
        
        if (liveMatches.length === 0) {
            liveMatchesListEl.innerHTML = '<p class="placeholder">No hay partidos en juego.</p>';
            return;
        }
        const groupedMatches = liveMatches.reduce((acc, match) => {
            const groupKey = match.nombreGrupo ? `Jornada ${match.jornada}` : match.jornada;
            if (!acc[groupKey]) acc[groupKey] = [];
            acc[groupKey].push(match);
            return acc;
        }, {});

        liveMatchesListEl.innerHTML = '';
        Object.keys(groupedMatches).sort().forEach(groupKey => {
            let groupHTML = `<div class="live-match-group"><h4>${groupKey}</h4>`;
            groupedMatches[groupKey].forEach(match => {
                const teamA = tournament.teams.aprobados[match.equipoA?.capitanId];
                const teamB = tournament.teams.aprobados[match.equipoB?.capitanId];
                if (!teamA || !teamB) return;
                let linksHTML = '';
                if (teamA.streamChannel) linksHTML += `<a href="${teamA.streamChannel}" target="_blank">Ver a ${teamA.nombre}</a>`;
                if (teamB.streamChannel) linksHTML += `<a href="${teamB.streamChannel}" target="_blank">Ver a ${teamB.nombre}</a>`;
                if (!linksHTML) linksHTML = '<p>No hay streams disponibles.</p>';
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
    const loadingEl = document.getElementById('loading');
    const draftContainerEl = document.getElementById('draft-container');
    const draftNameEl = document.getElementById('draft-name-draftview');
    const roundInfoEl = document.getElementById('round-info-draftview');
    const currentTeamEl = document.getElementById('current-team-draftview');
    const currentPickEl = document.getElementById('current-pick-draftview');
    const teamsContainerEl = document.getElementById('teams-container-draftview');
    const playersTableBodyEl = document.getElementById('players-table-body');
    const positionFiltersEl = document.getElementById('position-filters');
    const roundPickOrderEl = document.getElementById('round-pick-order');
    const pickAlertEl = document.getElementById('pick-alert');
    const pickAlertContentEl = document.getElementById('pick-alert-content');
    const manageTeamTab = document.getElementById('manage-team-tab');
    const rosterManagementContainer = document.getElementById('roster-management-container');
    const managementTeamName = document.getElementById('management-team-name');

    const positionOrder = ['GK', 'DFC', 'CARR', 'MCD', 'MV/MCO', 'DC'];
    let hasLoadedInitialData = false;
    let currentUser = null;
    let currentDraftState = null;
    let lastShownPickData = null; // CAMBIO: Variable para rastrear el último pick mostrado

    setupFilters();
    setupEventListeners();

    async function checkUserSession() {
    try {
        const response = await fetch('/api/user');
        currentUser = await response.json();
        const userSessionEl = document.getElementById('user-session');
        if (currentUser) {
            document.getElementById('user-greeting').textContent = `Hola, ${currentUser.username}`;
            userSessionEl.classList.remove('hidden');
        }
        // --- LÍNEA MOVÍDA AQUÍ ---
        // Nos aseguramos de renderizar todo DE NUEVO una vez que tenemos la info del usuario.
        if (currentDraftState) {
            renderAll();
        }
    } catch (e) { console.error("Error al verificar sesión:", e); }
}

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${window.location.host}`);
    socket.onopen = () => console.log('Conectado al servidor para Draft.');
    // CAMBIO: Lógica de `onmessage` actualizada
    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'draft' && message.id === draftId) {
            currentDraftState = message.data;

            if (!hasLoadedInitialData) {
                loadingEl.classList.add('hidden');
                draftContainerEl.classList.remove('hidden');
                hasLoadedInitialData = true;
                checkUserSession();
            }

            const lastPick = currentDraftState.selection.lastPick;
            if (lastPick && JSON.stringify(lastPick) !== JSON.stringify(lastShownPickData)) {
                showPickAlert(lastPick.pickNumber, {psnId: lastPick.playerPsnId}, {teamName: lastPick.captainTeamName});
                lastShownPickData = lastPick;
            }
            
            renderAll();
        }
        if (message.type === 'pick_error' || message.type === 'strike_error') {
            alert(`Error: ${message.message}`);
            if (currentDraftState) renderAvailablePlayers(currentDraftState);
        }
    };

    fetch(`/draft-data/${draftId}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
            if (data && !hasLoadedInitialData) {
                currentDraftState = data;
                loadingEl.classList.add('hidden');
                draftContainerEl.classList.remove('hidden');
                renderAll();
                hasLoadedInitialData = true;
                checkUserSession();
                // CAMBIO: Añadido filtro por URL
                const urlParams = new URLSearchParams(window.location.search);
                const posFilter = urlParams.get('pos');
                if (posFilter) {
                    const filterBtn = document.querySelector(`#position-filters .filter-btn[data-pos="${posFilter.toUpperCase()}"]`);
                    if (filterBtn) {
                        filterBtn.click();
                    }
                }
            }
        }).catch(err => console.warn('Error en fetch inicial:', err));

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
        teamsGrid.innerHTML = '';
        draft.captains.sort((a,b) => a.teamName.localeCompare(b.teamName)).forEach(captain => {
            const teamPlayers = draft.players.filter(p => p.captainId === captain.userId).sort((a,b) => positionOrder.indexOf(a.primaryPosition) - positionOrder.indexOf(b.primaryPosition));
            let rosterHtml = '';
            teamPlayers.forEach(player => {
                const isCaptainIcon = player.isCaptain ? '👑' : '';
                let positionDisplay = player.pickedForPosition || player.primaryPosition;
                if (player.pickedForPosition && player.pickedForPosition !== player.primaryPosition) {
                    positionDisplay += '*';
                }
                rosterHtml += `<li><span class="player-name">${isCaptainIcon} ${player.psnId}</span><span class="player-pos">${positionDisplay}</span></li>`;
            });
            const teamCardHTML = `<div class="team-card"><h3 class="team-header">${captain.teamName}<span class="captain-psn">Cap: ${captain.psnId}</span></h3><ul class="team-roster">${rosterHtml}</ul></div>`;
            teamsGrid.innerHTML += teamCardHTML;
        });
    }

    // CAMBIO: Función `renderAvailablePlayers` actualizada
    function renderAvailablePlayers(draft) {
        playersTableBodyEl.innerHTML = '';
        const captainIdInTurn = (draft.selection && draft.selection.order?.length > 0) ? draft.selection.order[draft.selection.turn] : null;
        const isMyTurn = currentUser && draft.status === 'seleccion' && String(currentUser.id) === String(captainIdInTurn);
        
        document.getElementById('filter-column-select').style.display = isMyTurn ? 'none' : 'inline-block';
        document.querySelector('.players-table-container .legend').style.display = isMyTurn ? 'none' : 'block';
        
        let availablePlayers = draft.players.filter(p => !p.captainId && !p.isCaptain);
        const activeFilterPos = document.querySelector('#position-filters .filter-btn.active')?.dataset.pos || 'Todos';

        const table = document.getElementById('players-table');
        table.classList.remove('primary-only', 'secondary-only');

        if (activeFilterPos !== 'Todos') {
            if (isMyTurn) {
                let primaryMatches = availablePlayers.filter(p => p.primaryPosition === activeFilterPos);
                if (primaryMatches.length > 0) {
                    availablePlayers = primaryMatches;
                    table.classList.add('primary-only');
                } else {
                    availablePlayers = availablePlayers.filter(p => p.secondaryPosition === activeFilterPos);
                    table.classList.add('secondary-only');
                }
            } else {
                const filterColumn = document.getElementById('filter-column-select').value;
                availablePlayers = availablePlayers.filter(p => (filterColumn === 'primary' ? p.primaryPosition : p.secondaryPosition) === activeFilterPos);
            }
        }
        
        availablePlayers.sort(sortPlayersAdvanced);

        availablePlayers.forEach(player => {
            const row = document.createElement('tr');
            const secPos = player.secondaryPosition && player.secondaryPosition !== 'NONE' ? player.secondaryPosition : '-';
            const actionButton = isMyTurn ? `<button class="pick-btn" data-player-id="${player.userId}" data-position="${activeFilterPos}">Elegir</button>` : '---';
            row.innerHTML = `<td data-label="Strikes">${player.strikes || 0}</td><td data-label="PSN ID">${player.psnId}</td><td data-label="Pos. Primaria" class="col-primary">${player.primaryPosition}</td><td data-label="Pos. Secundaria" class="col-secondary">${secPos}</td><td data-label="Acción" class="col-action">${actionButton}</td>`;
            playersTableBodyEl.appendChild(row);
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
            card.innerHTML = `<div class="player-management-info"><h3>${player.psnId}</h3><p>Posición: ${player.primaryPosition}</p><p>Strikes: <span class="strikes">${strikes}</span></p></div><div class="management-actions"><button class="btn-strike" data-player-id="${player.userId}" ${hasBeenReported ? 'disabled' : ''}>Reportar (Strike)</button><button class="btn-kick" data-player-id="${player.userId}">Solicitar Expulsión</button></div>`;
            rosterManagementContainer.appendChild(card);
        });
    }

    function setupEventListeners() {
        document.querySelectorAll('.draft-view-btn').forEach(btn => btn.addEventListener('click', () => {
            document.querySelector('.draft-view-btn.active')?.classList.remove('active');
            btn.classList.add('active');
            document.querySelector('.draft-view-pane.active')?.classList.remove('active');
            document.getElementById(btn.dataset.view).classList.add('active');
        }));

        playersTableBodyEl.addEventListener('click', (event) => {
            if (event.target.classList.contains('pick-btn')) {
                const playerId = event.target.dataset.playerId;
                const position = event.target.dataset.position;
                socket.send(JSON.stringify({ type: 'execute_draft_pick', draftId, playerId, position }));
                document.querySelectorAll('.pick-btn').forEach(btn => btn.disabled = true);
            }
        });

        rosterManagementContainer.addEventListener('click', (event) => {
            const target = event.target;
            const playerId = target.dataset.playerId;
            if (!playerId) return;

            if (target.classList.contains('btn-strike')) {
                const reason = prompt("Por favor, introduce una razón detallada para aplicar el strike:");
                if (reason && reason.trim() !== "") {
                    const confirmation = prompt("Esta acción es seria y quedará registrada. Para confirmar, escribe 'CONFIRMAR':");
                    if (confirmation === 'CONFIRMAR') {
                        socket.send(JSON.stringify({ type: 'report_player', draftId, playerId, reason }));
                    }
                }
            }

            if (target.classList.contains('btn-kick')) {
                const reason = prompt("Por favor, introduce el motivo para solicitar la expulsión de este jugador:");
                if (reason && reason.trim() !== "") {
                    socket.send(JSON.stringify({ type: 'request_kick', draftId, playerId, reason }));
                    alert("Tu solicitud de expulsión ha sido enviada a los administradores para su revisión.");
                }
            }
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
            const pickIndex = currentRound % 2 === 0 ? i : numCaptains - 1 - i;
            const captainId = draft.selection.order[pickIndex];
            const captain = draft.captains.find(c => c.userId === captainId);
            const item = document.createElement('div');
            item.className = 'pick-order-item';
            if (pickNumber < currentPick) item.classList.add('past-pick');
            if (pickNumber === currentPick) item.classList.add('active-pick');
            item.innerHTML = `<span>#${pickNumber}</span> ${captain ? captain.teamName : 'N/A'}`;
            roundPickOrderEl.appendChild(item);
        }
    }

    function setupFilters() {
        if (positionFiltersEl.innerHTML !== '') return;
        positionFiltersEl.innerHTML = `<select id="filter-column-select"><option value="primary">Filtrar por Pos. Primaria</option><option value="secondary">Filtrar por Pos. Secundaria</option></select>`;
        const select = document.getElementById('filter-column-select');
        select.addEventListener('change', () => {
             const activeFilterPos = document.querySelector('#position-filters .filter-btn.active')?.dataset.pos || 'Todos';
             if (currentDraftState) renderAvailablePlayers(currentDraftState);
        });

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
                if (currentDraftState) renderAvailablePlayers(currentDraftState);
            });
            positionFiltersEl.appendChild(btn);
        });
    }

    // CAMBIO: Función `showPickAlert` actualizada para manejar el banner
    function showPickAlert(pickNumber, player, captain) {
        // Animación popup
        const pickAlertEl = document.getElementById('pick-alert');
        const pickAlertContentEl = document.getElementById('pick-alert-content');
        pickAlertContentEl.innerHTML = `<div class="pick-number">PICK #${pickNumber}</div><div class="player-name">${player.psnId}</div><div class="team-name">${captain.teamName}</div>`;
        pickAlertEl.classList.remove('hidden');
        pickAlertEl.classList.add('visible');
        setTimeout(() => {
            pickAlertEl.classList.remove('visible');
            setTimeout(() => pickAlertEl.classList.add('hidden'), 500);
        }, 4500);

        // Banner persistente
        const bannerEl = document.getElementById('last-pick-banner');
        bannerEl.innerHTML = `<strong>Último Pick:</strong> ${player.psnId} ➔ ${captain.teamName}`;
        bannerEl.classList.add('visible');
    }
}
