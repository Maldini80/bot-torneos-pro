document.addEventListener('DOMContentLoaded', () => {
    // --- REFERENCIAS A ELEMENTOS DEL DOM ---
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

    // --- LÓGICA DE WEBSOCKET Y CARGA INICIAL ---
    const urlParams = new URLSearchParams(window.location.search);
    const tournamentId = urlParams.get('tournamentId');

    if (!tournamentId) {
        loadingEl.textContent = 'Error: No se ha especificado un ID de torneo.';
        return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${window.location.host}`);
    socket.onopen = () => console.log('Conectado al servidor de visualización.');
    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'tournament' && message.id === tournamentId) {
            console.log('Recibida actualización del torneo:', message.data);
            renderTournamentState(message.data);
        }
    };

    let hasLoadedInitialData = false;

    // Conexión WebSocket (la movemos aquí para que se establezca antes)
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${window.location.host}`);
    socket.onopen = () => console.log('Conectado al servidor de visualización.');
    
    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        const entityId = message.type === 'tournament' ? tournamentId : draftId;

        if (message.id === entityId) {
            console.log(`Recibida actualización de ${message.type}:`, message.data);
            
            // Si es la primera vez que recibimos datos, quitamos la pantalla de carga
            if (!hasLoadedInitialData) {
                loadingEl.classList.add('hidden');
                appContainerEl.classList.remove('hidden');
                hasLoadedInitialData = true;
            }

            if (message.type === 'tournament') {
                renderTournamentState(message.data);
            } else if (message.type === 'draft') {
                // Aquí iría la lógica para renderizar el draft si unificamos la página
            }
        }
    };

    // Intentamos cargar los datos iniciales, pero no mostraremos un error si falla,
    // simplemente esperaremos la primera actualización por WebSocket.
    fetch(`/tournament-data/${tournamentId}`)
        .then(response => response.json())
        .then(data => {
            if (data && !hasLoadedInitialData) {
                loadingEl.classList.add('hidden');
                appContainerEl.classList.remove('hidden');
                renderTournamentState(data);
                hasLoadedInitialData = true;
            }
        })
        .catch(error => {
            // No hacemos nada aquí, la pantalla de carga seguirá visible
            console.warn('No se pudieron cargar los datos iniciales, esperando WebSocket.');
        })

    // --- MANEJO DE EVENTOS (PESTAÑAS Y MODAL) ---
    viewButtons.forEach(button => {
        button.addEventListener('click', () => {
            document.querySelector('.view-btn.active').classList.remove('active');
            document.querySelector('.view-pane.active').classList.remove('active');
            button.classList.add('active');
            document.getElementById(button.dataset.view).classList.add('active');
        });
    });

    closeButton.addEventListener('click', () => modalEl.classList.add('hidden'));
    window.addEventListener('click', (event) => {
        if (event.target == modalEl) modalEl.classList.add('hidden');
    });

    // --- FUNCIÓN PRINCIPAL DE RENDERIZADO ---
    function renderTournamentState(tournament) {
        // 1. Renderizar Cabecera
        tournamentNameEl.textContent = tournament.nombre;
        tournamentFormatEl.textContent = `${tournament.config.format.label} | ${Object.keys(tournament.teams.aprobados).length} / ${tournament.config.format.size} Equipos`;

        // 2. Renderizar Equipos
        renderTeams(tournament);

        // 3. Renderizar Clasificación (Fase de Grupos)
        renderClassification(tournament);

        // 4. Renderizar Eliminatorias (Bracket)
        renderBracket(tournament);

        // 5. Renderizar Partidos en Directo
        renderLiveMatches(tournament);
    }

    // --- FUNCIONES AUXILIARES DE RENDERIZADO ---
    function renderTeams(tournament) {
        teamListContainerEl.innerHTML = '';
        const teams = Object.values(tournament.teams.aprobados).sort((a, b) => a.nombre.localeCompare(b.nombre));
        if (teams.length === 0) {
            teamListContainerEl.innerHTML = '<p class="placeholder">Aún no hay equipos aprobados.</p>';
            return;
        }
        teams.forEach(team => {
            const isDraftTeam = team.players && team.players.length > 0;
            const teamEl = document.createElement('div');
            teamEl.className = `team-list-item ${isDraftTeam ? 'is-draft-team' : ''}`;
            teamEl.textContent = team.nombre;
            if (isDraftTeam) {
                teamEl.addEventListener('click', () => showRosterModal(team));
            }
            teamListContainerEl.appendChild(teamEl);
        });
    }

    function renderClassification(tournament) {
        const groups = tournament.structure.grupos;
        if (Object.keys(groups).length === 0) {
            groupsContainerEl.innerHTML = '<p class="placeholder">La fase de grupos no ha comenzado.</p>';
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

            let tableHTML = `<div class="group-table"><h3>${groupName}</h3><table>
                <thead><tr><th>Equipo</th><th>PJ</th><th>PTS</th><th>GF</th><th>GC</th><th>DG</th></tr></thead><tbody>`;
            sortedTeams.forEach(team => {
                tableHTML += `<tr>
                    <td class="team-name">${team.nombre}</td>
                    <td>${team.stats.pj}</td>
                    <td>${team.stats.pts}</td>
                    <td>${team.stats.gf}</td>
                    <td>${team.stats.gc}</td>
                    <td>${team.stats.dg > 0 ? '+' : ''}${team.stats.dg}</td>
                </tr>`;
            });
            tableHTML += '</tbody></table></div>';
            groupsContainerEl.innerHTML += tableHTML;
        });
    }

    function renderBracket(tournament) {
        const stages = tournament.config.format.knockoutStages;
        if (!stages || tournament.status === 'inscripcion_abierta' || tournament.status === 'fase_de_grupos') {
            bracketContainerEl.innerHTML = '<p class="placeholder">Las eliminatorias no han comenzado.</p>';
            return;
        }
        bracketContainerEl.innerHTML = '';
        stages.forEach(stageKey => {
            const matches = tournament.structure.eliminatorias[stageKey];
            if (!matches) return;

            const roundMatches = Array.isArray(matches) ? matches : [matches];
            let roundHTML = `<div class="bracket-round"><h3>${stageKey.replace('_', ' ')}</h3>`;
            roundMatches.forEach(match => {
                const teamA = match.equipoA?.nombre || 'Por definir';
                const teamB = match.equipoB?.nombre || 'Por definir';
                let scoreA = '', scoreB = '';
                let classA = '', classB = '';

                if (match.resultado) {
                    [scoreA, scoreB] = match.resultado.split('-');
                    if (parseInt(scoreA) > parseInt(scoreB)) classA = 'winner';
                    else classB = 'winner';
                }

                roundHTML += `<div class="bracket-match">
                    <div class="bracket-team ${classA}"><span>${teamA}</span><span>${scoreA}</span></div>
                    <div class="bracket-team ${classB}"><span>${teamB}</span><span>${scoreB}</span></div>
                </div>`;
            });
            roundHTML += '</div>';
            bracketContainerEl.innerHTML += roundHTML;
        });
    }

    function renderLiveMatches(tournament) {
        const allMatches = [
            ...Object.values(tournament.structure.calendario).flat(),
            ...Object.values(tournament.structure.eliminatorias).flat()
        ];
        const liveMatches = allMatches.filter(match => match && match.status === 'en_curso');
        
        if (liveMatches.length === 0) {
            liveMatchesListEl.innerHTML = '<p class="placeholder">No hay partidos en juego.</p>';
            return;
        }

        liveMatchesListEl.innerHTML = '';
        liveMatches.forEach(match => {
            const teamA = tournament.teams.aprobados[match.equipoA.capitanId];
            const teamB = tournament.teams.aprobados[match.equipoB.capitanId];
            let linksHTML = '';
            if (teamA?.streamChannel) linksHTML += `<a href="${teamA.streamChannel}" target="_blank">Ver a ${teamA.nombre}</a>`;
            if (teamB?.streamChannel) linksHTML += `<a href="${teamB.streamChannel}" target="_blank">Ver a ${teamB.nombre}</a>`;
            if (!linksHTML) linksHTML = '<p>No hay streams disponibles.</p>';

            const cardHTML = `<div class="live-match-card">
                <div class="live-match-teams">${teamA.nombre} vs ${teamB.nombre}</div>
                <div class="stream-links">${linksHTML}</div>
            </div>`;
            liveMatchesListEl.innerHTML += cardHTML;
        });
    }

    function showRosterModal(team) {
        modalTeamNameEl.textContent = team.nombre;
        modalRosterListEl.innerHTML = '';
        const positionOrder = ['GK', 'DFC', 'CARR', 'MCD', 'MV/MCO', 'DC'];
        const sortedPlayers = [...team.players].sort((a, b) => {
            return positionOrder.indexOf(a.primaryPosition) - positionOrder.indexOf(b.primaryPosition);
        });
        sortedPlayers.forEach(player => {
            const li = document.createElement('li');
            li.textContent = `${player.psnId} (${player.primaryPosition})`;
            modalRosterListEl.appendChild(li);
        });
        modalEl.classList.remove('hidden');
    }
});
