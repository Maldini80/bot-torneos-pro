// --- INICIO DEL ARCHIVO client.js ---

document.addEventListener('DOMContentLoaded', () => {
    // Punto de entrada principal. Detecta el tipo de evento desde la URL.
    const urlParams = new URLSearchParams(window.location.search);
    const tournamentId = urlParams.get('tournamentId');
    const draftId = urlParams.get('draftId');

    if (tournamentId) {
        // Si es un torneo, inicializa la vista de torneo.
        initializeTournamentView(tournamentId);
    } else if (draftId) {
        // Si es un draft, aplica estilos específicos y inicializa la vista de draft.
        document.body.classList.add('draft-view-style');
        initializeDraftView(draftId);
    } else {
        // Si no hay ID, muestra un error.
        document.getElementById('loading').textContent = 'Error: No se ha especificado un ID de evento en la URL.';
    }
});

// =================================================================
// --- MÓDULO DEL VISUALIZADOR DE TORNEOS ---
// =================================================================
function initializeTournamentView(tournamentId) {
    // --- REFERENCIAS A ELEMENTOS DEL DOM (TORNEO) ---
    const loadingEl = document.getElementById('loading');
    const appContainerEl = document.getElementById('app-container');
    const tournamentNameEl = document.getElementById('tournament-name');
    const tournamentFormatEl = document.getElementById('tournament-format');
    const groupsContainerEl = document.getElementById('groups-container');
    const bracketContainerEl = document.getElementById('bracket-container');
    const teamListContainerEl = document.getElementById('team-list-container');
    const liveMatchesListEl = document.getElementById('live-matches-list');
    const modalEl = document.getElementById('roster-modal');
    const modalTeamNameEl = document.getElementById('modal-team-name');
    const modalRosterListEl = document.getElementById('modal-roster-list');
    const closeButton = document.querySelector('.close-button');
    const viewButtons = document.querySelectorAll('.view-btn');
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

    closeButton.addEventListener('click', () => modalEl.classList.add('hidden'));
    window.addEventListener('click', (event) => { if (event.target == modalEl) modalEl.classList.add('hidden'); });

    function renderTournamentState(tournament) {
        if (tournament.status === 'finalizado') {
            viewSwitcherEl.style.display = 'none';
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
            for (let i = 0; i < roundMatches.length; i += 2) {
                roundHTML += '<div class="match-wrapper">';
                for (let j = i; j < i + 2 && j < roundMatches.length; j++) {
                    const match = roundMatches[j];
                    const teamA = match.equipoA?.nombre || 'Por definir';
                    const teamB = match.equipoB?.nombre || 'Por definir';
                    let scoreA = '', scoreB = '';
                    let classA = '', classB = '';
                    if (match.resultado) {
                        [scoreA, scoreB] = match.resultado.split('-');
                        if (parseInt(scoreA) > parseInt(scoreB)) classA = 'winner-top';
                        else if (parseInt(scoreB) > parseInt(scoreA)) classB = 'winner-bottom';
                    }
                    roundHTML += `<div class="bracket-match ${classA} ${classB}"><div class="bracket-team"><span class="team-name">${teamA}</span><span class="score">${scoreA}</span></div><div class="bracket-team"><span class="team-name">${teamB}</span><span class="score">${scoreB}</span></div></div>`;
                }
                roundHTML += '</div>';
            }
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

// =================================================================
// --- MÓDULO DEL VISUALIZADOR DE DRAFTS ---
// =================================================================
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

    const positionOrder = ['GK', 'DFC', 'CARR', 'MCD', 'MV/MCO', 'DC'];
    let hasLoadedInitialData = false;
    let teamPlayersBefore = []; // Para detectar el nuevo pick

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${window.location.host}`);
    socket.onopen = () => console.log('Conectado al servidor para Draft.');
    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'draft' && message.id === draftId) {
            if (!hasLoadedInitialData) {
                loadingEl.classList.add('hidden');
                draftContainerEl.classList.remove('hidden');
                hasLoadedInitialData = true;
                setupFilters();
            }
            renderDraftState(message.data);
        }
    };

    fetch(`/draft-data/${draftId}`)
        .then(response => response.ok ? response.json() : Promise.resolve(null))
        .then(data => {
            if (data && !hasLoadedInitialData) {
                loadingEl.classList.add('hidden');
                draftContainerEl.classList.remove('hidden');
                renderDraftState(data);
                hasLoadedInitialData = true;
                setupFilters();
            }
        }).catch(err => console.warn('No se pudieron cargar datos iniciales de draft, esperando WebSocket.'));

    function renderDraftState(draft) {
        if (hasLoadedInitialData) {
            const currentPickedPlayers = draft.players.filter(p => p.captainId);
            const newPick = currentPickedPlayers.find(p => !teamPlayersBefore.some(op => op.userId === p.userId));
            if (newPick) {
                const captain = draft.captains.find(c => c.userId === newPick.captainId);
                showPickAlert(draft.selection.currentPick - 1, newPick, captain);
            }
            teamPlayersBefore = currentPickedPlayers.map(p => ({userId: p.userId})); // Guardamos solo IDs para comparar
        } else {
            teamPlayersBefore = draft.players.filter(p => p.captainId).map(p => ({userId: p.userId}));
        }
        
        draftNameEl.textContent = draft.name;
        if ((draft.status === 'finalizado' || draft.status === 'torneo_generado')) {
             roundInfoEl.textContent = 'Selección Finalizada';
             currentTeamEl.textContent = '---';
             currentPickEl.textContent = '---';
        } else if (draft.status === 'seleccion' && draft.captains.length > 0) {
            const numCaptains = draft.captains.length;
            const currentRound = Math.floor((draft.selection.currentPick - 1) / numCaptains) + 1;
            const totalRounds = 10;
            roundInfoEl.textContent = `Ronda ${currentRound} de ${totalRounds}`;
            const currentCaptain = draft.captains.find(c => c.userId === draft.selection.order[draft.selection.turn]);
            currentTeamEl.textContent = currentCaptain ? currentCaptain.teamName : 'N/A';
            currentPickEl.textContent = draft.selection.currentPick;
        }

        renderRoundPickOrder(draft);
        renderTeams(draft);
        renderAvailablePlayers(draft);
        
        // Reactivar filtro después de renderizar
        const activeFilter = document.querySelector('#position-filters .filter-btn.active')?.dataset.pos || 'Todos';
        filterTable(activeFilter);
    }

    function renderTeams(draft) {
        teamsContainerEl.innerHTML = '';
        draft.captains.sort((a,b) => a.teamName.localeCompare(b.teamName)).forEach(captain => {
            const teamPlayers = draft.players.filter(p => p.captainId === captain.userId).sort((a,b) => positionOrder.indexOf(a.primaryPosition) - positionOrder.indexOf(b.primaryPosition));
            let rosterHtml = '';
            teamPlayers.forEach(player => {
                rosterHtml += `<li><span class="player-name">${player.psnId}</span><span class="player-pos">${player.primaryPosition}</span></li>`;
            });
            const teamCard = `<div class="team-card"><h3 class="team-header">${captain.teamName}<span class="captain-psn">Cap: ${captain.psnId}</span></h3><ul class="team-roster">${rosterHtml}</ul></div>`;
            teamsContainerEl.innerHTML += teamCard;
        });
    }

    function renderAvailablePlayers(draft) {
        playersTableBodyEl.innerHTML = '';
        const availablePlayers = draft.players.filter(p => !p.captainId && !p.isCaptain);
        availablePlayers.forEach(player => {
            const statusEmoji = player.currentTeam === 'Libre' ? '🔎' : '🛡️';
            const secPos = player.secondaryPosition && player.secondaryPosition !== 'NONE' ? player.secondaryPosition : '-';
            const row = document.createElement('tr');
            row.dataset.posPrimary = player.primaryPosition;
            row.innerHTML = `<td>${statusEmoji}</td><td>${player.psnId}</td><td>${player.primaryPosition}</td><td>${secPos}</td>`;
            playersTableBodyEl.appendChild(row);
        });
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
        positionFiltersEl.innerHTML = '';
        const allPositions = ['Todos', ...positionOrder];
        allPositions.forEach(pos => {
            const btn = document.createElement('button');
            btn.className = 'filter-btn';
            btn.dataset.pos = pos;
            btn.textContent = pos;
            if (pos === 'Todos') btn.classList.add('active');
            btn.addEventListener('click', () => filterTable(pos));
            positionFiltersEl.appendChild(btn);
        });
    }

    function filterTable(position) {
        document.querySelectorAll('#position-filters .filter-btn').forEach(btn => btn.classList.remove('active'));
        const currentFilterBtn = document.querySelector(`#position-filters .filter-btn[data-pos="${position}"]`);
        if (currentFilterBtn) currentFilterBtn.classList.add('active');
        
        const rows = playersTableBodyEl.querySelectorAll('tr');
        rows.forEach(row => {
            if (position === 'Todos' || row.dataset.posPrimary === position) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }

    function showPickAlert(pickNumber, player, captain) {
        pickAlertContentEl.innerHTML = `<div class="pick-number">PICK #${pickNumber}</div><div class="player-name">${player.psnId}</div><div class="team-name">${captain.teamName}</div>`;
        pickAlertEl.classList.add('visible');
        setTimeout(() => {
            pickAlertEl.classList.remove('visible');
            setTimeout(() => pickAlertEl.classList.add('hidden'), 300);
        }, 5000);
    }
}

// --- FIN DEL ARCHIVO client.js ---
