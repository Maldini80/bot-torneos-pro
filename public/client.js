// ==========================================================
// ▼▼▼ DATOS DE PRUEBA PARA LOS MODOS DEMO (VERSIÓN CORREGIDA) ▼▼▼
// ==========================================================
const sampleTournamentData = {
    nombre: "TORNEO DE PRUEBA VISUAL",
    config: { format: { label: "8 Equipos (Clásico - Semifinales)", size: 8 } },
    teams: {
        aprobados: {
            "001": { capitanId: "001", nombre: "Thunderbolts FC", capitanTag: "CapitanBolt#1111", coCaptainTag: "CoCapitan#1112", logoUrl: "https://i.imgur.com/gJ33hmJ.png", twitter: "vpg_spain", streamChannel: "https://twitch.tv/example" },
            "002": { capitanId: "002", nombre: "Vipers AC", capitanTag: "SnakePlayer#2222", coCaptainTag: "Venom#2223", logoUrl: "https://i.imgur.com/S3y6uHk.png", twitter: "vpg_spain", streamChannel: "https://twitch.tv/example" },
            "003": { capitanId: "003", nombre: "Titans United", capitanTag: "TitanChief#3333", coCaptainTag: "Giant#3334", logoUrl: "https://i.imgur.com/r6yA02A.png", twitter: "vpg_spain", streamChannel: "https://twitch.tv/example" },
            "004": { capitanId: "004", nombre: "Red Dragons", capitanTag: "DragonLord#4444", coCaptainTag: "Flame#4445", logoUrl: "https://i.imgur.com/v82aXfH.png", twitter: "vpg_spain", streamChannel: "https://twitch.tv/example" },
            "005": { capitanId: "005", nombre: "Aqua Marines", capitanTag: "Neptune#5555", coCaptainTag: "Wave#5556", logoUrl: "https://i.imgur.com/3Z0aF8S.png", twitter: "vpg_spain", streamChannel: "https://twitch.tv/example" },
            "006": { capitanId: "006", nombre: "Eclipse Gaming", capitanTag: "Shadow#6666", coCaptainTag: "Moon#6667", logoUrl: "https://i.imgur.com/JqkL3G9.png", twitter: "vpg_spain", streamChannel: "https://twitch.tv/example" },
            "007": { capitanId: "007", nombre: "Atomic Esports", capitanTag: "Nuclear#7777", coCaptainTag: "Fallout#7778", logoUrl: "https://i.imgur.com/U8E6f75.png", twitter: "vpg_spain", streamChannel: "https://twitch.tv/example" },
            "008": { capitanId: "008", nombre: "Project Phoenix", capitanTag: "Ashes#8888", coCaptainTag: "Rebirth#8889", logoUrl: "https://i.imgur.com/2Y5A7A2.png", twitter: "vpg_spain", streamChannel: "https://twitch.tv/example" },
        }
    },
    structure: {
        grupos: {
            // CORRECCIÓN: Añadido 'logoUrl' a cada equipo aquí
            "Grupo A": { equipos: [ { id: "001", nombre: "Thunderbolts FC", logoUrl: "https://i.imgur.com/gJ33hmJ.png", stats: { pj: 3, pts: 9, gf: 10, gc: 2, dg: 8 } }, { id: "002", nombre: "Vipers AC", logoUrl: "https://i.imgur.com/S3y6uHk.png", stats: { pj: 3, pts: 6, gf: 5, gc: 5, dg: 0 } }, { id: "003", nombre: "Titans United", logoUrl: "https://i.imgur.com/r6yA02A.png", stats: { pj: 3, pts: 3, gf: 4, gc: 8, dg: -4 } }, { id: "004", nombre: "Red Dragons", logoUrl: "https://i.imgur.com/v82aXfH.png", stats: { pj: 3, pts: 0, gf: 3, gc: 7, dg: -4 } } ] },
            "Grupo B": { equipos: [ { id: "005", nombre: "Aqua Marines", logoUrl: "https://i.imgur.com/3Z0aF8S.png", stats: { pj: 3, pts: 7, gf: 6, gc: 2, dg: 4 } }, { id: "006", nombre: "Eclipse Gaming", logoUrl: "https://i.imgur.com/JqkL3G9.png", stats: { pj: 3, pts: 5, gf: 4, gc: 3, dg: 1 } }, { id: "007", nombre: "Atomic Esports", logoUrl: "https://i.imgur.com/U8E6f75.png", stats: { pj: 3, pts: 2, gf: 5, gc: 7, dg: -2 } }, { id: "008", nombre: "Project Phoenix", logoUrl: "https://i.imgur.com/2Y5A7A2.png", stats: { pj: 3, pts: 1, gf: 2, gc: 5, dg: -3 } } ] }
        },
        calendario: {
             "Grupo A": [ { jornada: 1, status: 'en_curso', equipoA: { capitanId: "001", nombre: "Thunderbolts FC" }, equipoB: { capitanId: "002", nombre: "Vipers AC" } } ],
        },
        eliminatorias: {
             // CORRECCIÓN: Añadido 'logoUrl' a cada equipo aquí
             semifinales: [
                { equipoA: { nombre: "Thunderbolts FC", logoUrl: "https://i.imgur.com/gJ33hmJ.png" }, equipoB: { nombre: "Eclipse Gaming", logoUrl: "https://i.imgur.com/JqkL3G9.png" }, resultado: "2-1" }
            ],
             final: 
                { equipoA: { nombre: "Aqua Marines", logoUrl: "https://i.imgur.com/3Z0aF8S.png" }, equipoB: { nombre: "Thunderbolts FC", logoUrl: "https://i.imgur.com/gJ33hmJ.png" }, resultado: null }
        },
    },
    status: "semifinales"
};

const sampleDraftData = {
    name: "DRAFT DE PRUEBA VISUAL",
    status: "seleccion",
    captains: [
        { userId: "c1", teamName: "Neon Knights", psnId: "KnightCapi" },
        { userId: "c2", teamName: "Cyber Stallions", psnId: "StallionCapi" },
        { userId: "c3", teamName: "Quantum Quakes", psnId: "QuakeCapi" },
        { userId: "c4", teamName: "Solar Flares", psnId: "FlareCapi" }
    ],
    players: [
        { userId: "c1", psnId: "KnightCapi", primaryPosition: "MCD", isCaptain: true, captainId: "c1" },
        { userId: "c2", psnId: "StallionCapi", primaryPosition: "DC", isCaptain: true, captainId: "c2" },
        { userId: "c3", psnId: "QuakeCapi", primaryPosition: "DFC", isCaptain: true, captainId: "c3" },
        { userId: "c4", psnId: "FlareCapi", primaryPosition: "MV/MCO", isCaptain: true, captainId: "c4" },
        { userId: "p1", psnId: "Player_GK_Alpha", primaryPosition: "GK", captainId: "c1", currentTeam: "Equipo" },
        { userId: "p2", psnId: "Player_DC_Beta", primaryPosition: "DC", captainId: "c2", currentTeam: "Equipo" },
        { userId: "p3", psnId: "Player_DFC_Gamma", primaryPosition: "DFC", captainId: "c3", currentTeam: "Equipo" },
        { userId: "p4", psnId: "Player_CARR_Delta", primaryPosition: "CARR", captainId: "c4", currentTeam: "Equipo" },
        { userId: "p5", psnId: "FreeAgent_GK_1", primaryPosition: "GK", captainId: null, currentTeam: "Libre" },
        { userId: "p6", psnId: "FreeAgent_GK_2", primaryPosition: "GK", captainId: null, currentTeam: "Libre" },
        { userId: "p7", psnId: "FreeAgent_DFC_1", primaryPosition: "DFC", captainId: null, currentTeam: "Libre" },
        { userId: "p8", psnId: "FreeAgent_DFC_2", primaryPosition: "DFC", captainId: null, currentTeam: "Libre" },
        { userId: "p9", psnId: "FreeAgent_CARR_1", primaryPosition: "CARR", captainId: null, currentTeam: "Libre" },
        { userId: "p10", psnId: "FreeAgent_MCD_1", primaryPosition: "MCD", captainId: null, currentTeam: "Equipo" },
        { userId: "p11", psnId: "FreeAgent_MV_1", primaryPosition: "MV/MCO", captainId: null, currentTeam: "Libre" },
        { userId: "p12", psnId: "FreeAgent_DC_1", primaryPosition: "DC", captainId: null, currentTeam: "Equipo" },
    ],
    selection: {
        currentPick: 5,
        turn: 0,
        order: ["c1", "c2", "c3", "c4"]
    }
};
// ==========================================================

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tournamentId = urlParams.get('tournamentId');
    const draftId = urlParams.get('draftId');
    const demoMode = urlParams.get('demo');

    // --- LÓGICA PARA ACTIVAR EL MODO DEMO ---
    if (demoMode) {
        console.log(`MODO DEMO ACTIVADO: ${demoMode}`);
        if (demoMode === 'draft') {
            document.body.classList.add('draft-view-style');
            initializeDraftView(null);
        } else {
            initializeTournamentView(null);
        }
        return; 
    }
    // --- FIN DEL MODO DEMO ---

    if (tournamentId) {
        initializeTournamentView(tournamentId);
    } else if (draftId) {
        document.body.classList.add('draft-view-style');
        initializeDraftView(draftId);
    } else {
        const loadingEl = document.getElementById('loading');
        if(loadingEl) loadingEl.innerHTML = '<p>Error: No se ha especificado un ID de evento en la URL.</p>';
    }
});

// =================================================================
// --- MÓDULO DEL VISUALIZADOR DE TORNEOS ---
// =================================================================
function initializeTournamentView(tournamentId) {
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
    const closeButton = modalEl ? modalEl.querySelector('.close-button') : null;
    const viewButtons = document.querySelectorAll('.view-btn');
    const mainPanelEl = document.getElementById('main-panel');
    const viewSwitcherEl = document.querySelector('.view-switcher');
    const finishedViewEl = document.getElementById('finished-view');
    const championNameEl = document.getElementById('champion-name');

    // --- LÓGICA PARA CARGAR DATOS DE DEMO ---
    if (tournamentId === null) {
        if(loadingEl) loadingEl.classList.add('hidden');
        if(appContainerEl) appContainerEl.classList.remove('hidden');
        renderTournamentState(sampleTournamentData);
        if(viewSwitcherEl) viewSwitcherEl.style.pointerEvents = 'none';
        return; 
    }
    // --- FIN LÓGICA DEMO ---
    
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
            const viewId = button.dataset.view;
            if (viewId) {
                document.getElementById(viewId).classList.add('active');
            }
        });
    });

    if (closeButton) {
        closeButton.addEventListener('click', () => modalEl.classList.add('hidden'));
    }
    window.addEventListener('click', (event) => { if (event.target === modalEl) modalEl.classList.add('hidden'); });

    function renderTournamentState(tournament) {
        if (!tournament) return;

        if (tournament.status === 'finalizado') {
            if(viewSwitcherEl) viewSwitcherEl.style.display = 'none';
            const activePane = mainPanelEl ? mainPanelEl.querySelector('.view-pane.active') : null;
            if(activePane) activePane.classList.remove('active');
            if(finishedViewEl) finishedViewEl.classList.add('active');
            const finalMatch = tournament.structure.eliminatorias.final;
            if (finalMatch && finalMatch.resultado) {
                const [scoreA, scoreB] = finalMatch.resultado.split('-').map(Number);
                const champion = scoreA > scoreB ? finalMatch.equipoA : finalMatch.equipoB;
                if(championNameEl) championNameEl.textContent = champion.nombre;
            } else {
                if(championNameEl) championNameEl.textContent = "Por determinar";
            }
            if(tournamentNameEl) tournamentNameEl.textContent = `${tournament.nombre}`;
            if(liveMatchesListEl) liveMatchesListEl.innerHTML = '<p class="placeholder">El torneo ha finalizado.</p>';
            return;
        }

        if(viewSwitcherEl) viewSwitcherEl.style.display = 'flex';
        if(finishedViewEl) finishedViewEl.classList.remove('active');
        if (mainPanelEl && !mainPanelEl.querySelector('.view-pane.active')) {
            const firstButton = mainPanelEl.querySelector('[data-view="classification-view"]');
            if (firstButton) firstButton.click();
        }
        
        if(tournamentNameEl) tournamentNameEl.textContent = tournament.nombre;
        if(tournamentFormatEl) tournamentFormatEl.textContent = `${tournament.config.format.label} | ${Object.keys(tournament.teams.aprobados).length} / ${tournament.config.format.size} Equipos`;
        
        renderTeams(tournament);
        renderClassification(tournament);
        renderBracket(tournament);
        renderLiveMatches(tournament);
    }

    function renderTeams(tournament) {
        if(!teamListContainerEl) return;
        teamListContainerEl.innerHTML = '';
        const teams = Object.values(tournament.teams.aprobados).sort((a, b) => a.nombre.localeCompare(b.nombre));
        if (teams.length === 0) {
            teamListContainerEl.innerHTML = '<p class="placeholder">Aún no hay equipos aprobados.</p>';
            return;
        }
        teams.forEach(team => {
            const isDraftTeam = team.players && team.players.length > 0;
            const logoHtml = `<div class="logo-container"><img src="${team.logoUrl || 'https://i.imgur.com/E6obnvO.png'}" alt="${team.nombre} logo" class="logo-image"></div>`;
            
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
            
            card.innerHTML = `
                ${logoHtml}
                <div class="team-details">
                    <h3>${team.nombre}</h3>
                    ${metaHTML}
                    ${linksHTML}
                </div>`;

            if (isDraftTeam) {
                card.addEventListener('click', () => showRosterModal(team));
            }
            teamListContainerEl.appendChild(card);
        });
    }

    function renderClassification(tournament) {
        if(!groupsContainerEl) return;
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
                const logoHtml = `<div class="logo-container"><img src="${team.logoUrl || 'https://i.imgur.com/E6obnvO.png'}" alt="${team.nombre} logo" class="logo-image"></div>`;
                tableHTML += `<tr><td class="team-cell">${logoHtml}<span>${team.nombre}</span></td><td>${team.stats.pj}</td><td>${team.stats.pts}</td><td>${team.stats.gf}</td><td>${team.stats.gc}</td><td>${team.stats.dg > 0 ? '+' : ''}${team.stats.dg}</td></tr>`;
            });
            tableHTML += '</tbody></table></div>';
            groupsContainerEl.innerHTML += tableHTML;
        });
    }

    function renderBracket(tournament) {
        if(!bracketContainerEl) return;
        const stages = ['semifinales', 'final'];
        if (!stages || !tournament.structure.eliminatorias) {
            bracketContainerEl.innerHTML = '<p class="placeholder">Las eliminatorias no han comenzado.</p>';
            return;
        }
        bracketContainerEl.innerHTML = '';
        stages.forEach(stageKey => {
            const matches = tournament.structure.eliminatorias[stageKey];
            if (!matches || (Array.isArray(matches) && matches.length === 0)) return;
            const roundMatches = Array.isArray(matches) ? matches : [matches];
            let roundHTML = `<div class="bracket-round"><div class="pane-title">${stageKey.replace(/_/g, ' ')}</div>`;
            for (let i = 0; i < roundMatches.length; i++) {
                const match = roundMatches[i];
                const teamA = match.equipoA;
                const teamB = match.equipoB;
                const teamAName = teamA?.nombre || 'Por definir';
                const teamBName = teamB?.nombre || 'Por definir';
                const logoA = `<div class="logo-container"><img src="${teamA?.logoUrl || 'https://i.imgur.com/E6obnvO.png'}" class="logo-image" alt="logo"></div>`;
                const logoB = `<div class="logo-container"><img src="${teamB?.logoUrl || 'https://i.imgur.com/E6obnvO.png'}" class="logo-image" alt="logo"></div>`;

                let scoreA = '', scoreB = '';
                let classA = '', classB = '';
                if (match.resultado) {
                    [scoreA, scoreB] = match.resultado.split('-');
                    if (parseInt(scoreA) > parseInt(scoreB)) classA = 'winner';
                    else if (parseInt(scoreB) > parseInt(scoreA)) classB = 'winner';
                }
                roundHTML += `<div class="bracket-match"><div class="bracket-team ${classA}"><span>${logoA}<span class="team-name">${teamAName}</span></span><span class="score">${scoreA}</span></div><div class="bracket-team ${classB}"><span>${logoB}<span class="team-name">${teamBName}</span></span><span class="score">${scoreB}</span></div></div>`;
            }
            roundHTML += '</div>';
            bracketContainerEl.innerHTML += roundHTML;
        });
    }

    function renderLiveMatches(tournament) {
        if(!liveMatchesListEl) return;
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
        if(!modalEl || !modalTeamNameEl || !modalRosterListEl) return;
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

    // --- LÓGICA PARA CARGAR DATOS DE DEMO ---
    if (draftId === null) {
        if(loadingEl) loadingEl.classList.add('hidden');
        if(draftContainerEl) draftContainerEl.classList.remove('hidden');
        renderDraftState(sampleDraftData);
        setupFilters();
        return; 
    }
    // --- FIN LÓGICA DEMO ---

    const positionOrder = ['GK', 'DFC', 'CARR', 'MCD', 'MV/MCO', 'DC'];
    let hasLoadedInitialData = false;
    let playersBefore = [];

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
        if (!draft) return;
        if (hasLoadedInitialData) {
            const newPick = draft.players.find(p => p.captainId && !playersBefore.find(op => op.userId === p.userId)?.captainId);
            if (newPick) {
                const captain = draft.captains.find(c => c.userId === newPick.captainId);
                showPickAlert(draft.selection.currentPick - 1, newPick, captain);
            }
        }
        playersBefore = draft.players.map(p => ({ userId: p.userId, captainId: p.captainId }));
        
        if(draftNameEl) draftNameEl.textContent = draft.name;
        if ((draft.status === 'finalizado' || draft.status === 'torneo_generado')) {
             if(roundInfoEl) roundInfoEl.textContent = 'Selección Finalizada';
             if(currentTeamEl) currentTeamEl.textContent = '---';
             if(currentPickEl) currentPickEl.textContent = '---';
             if(roundPickOrderEl) roundPickOrderEl.innerHTML = '';
        } else if (draft.status === 'seleccion' && draft.captains.length > 0) {
            const numCaptains = draft.captains.length;
            const currentRound = Math.floor((draft.selection.currentPick - 1) / numCaptains) + 1;
            const totalRounds = 10;
            if(roundInfoEl) roundInfoEl.textContent = `Ronda ${currentRound} de ${totalRounds}`;
            const currentCaptain = draft.captains.find(c => c.userId === draft.selection.order[draft.selection.turn]);
            if(currentTeamEl) currentTeamEl.textContent = currentCaptain ? currentCaptain.teamName : 'N/A';
            if(currentPickEl) currentPickEl.textContent = draft.selection.currentPick;
            renderRoundPickOrder(draft);
        }

        renderTeams(draft);
        renderAvailablePlayers(draft);
    }
    
    function sortPlayersAdvanced(a, b) {
        const posIndexA = positionOrder.indexOf(a.primaryPosition);
        const posIndexB = positionOrder.indexOf(b.primaryPosition);
        if (posIndexA !== posIndexB) return posIndexA - posIndexB;
        const secPosA = a.secondaryPosition === 'NONE' || !a.secondaryPosition ? 'zzz' : a.secondaryPosition;
        const secPosB = b.secondaryPosition === 'NONE' || !b.secondaryPosition ? 'zzz' : b.secondaryPosition;
        const secPosIndexA = positionOrder.indexOf(secPosA);
        const secPosIndexB = positionOrder.indexOf(secPosB);
        if (secPosIndexA !== secPosIndexB) return secPosIndexA - secPosIndexB;
        return a.psnId.localeCompare(b.psnId);
    }

    function renderTeams(draft) {
        if(!teamsContainerEl) return;
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
        if(!playersTableBodyEl) return;
        playersTableBodyEl.innerHTML = '';
        const availablePlayers = draft.players.filter(p => !p.captainId && !p.isCaptain).sort(sortPlayersAdvanced);
        availablePlayers.forEach(player => {
            const statusEmoji = player.currentTeam === 'Libre' ? '🔎' : '🛡️';
            const secPos = player.secondaryPosition && player.secondaryPosition !== 'NONE' ? player.secondaryPosition : '-';
            const row = document.createElement('tr');
            row.dataset.posPrimary = player.primaryPosition;
            row.dataset.posSecondary = secPos;
            row.innerHTML = `<td>${statusEmoji}</td><td>${player.psnId}</td><td>${player.primaryPosition}</td><td>${secPos}</td>`;
            playersTableBodyEl.appendChild(row);
        });
        const activeFilter = document.querySelector('#position-filters .filter-btn.active')?.dataset.pos || 'Todos';
        filterTable(activeFilter);
    }

    function renderRoundPickOrder(draft) {
        if(!roundPickOrderEl) return;
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
        if (!positionFiltersEl) return;
        positionFiltersEl.innerHTML = `
            <select id="filter-column-select">
                <option value="primary">Filtrar por Pos. Primaria</option>
                <option value="secondary">Filtrar por Pos. Secundaria</option>
            </select>`;
        const select = document.getElementById('filter-column-select');
        select.addEventListener('change', () => filterTable(document.querySelector('#position-filters .filter-btn.active')?.dataset.pos || 'Todos'));
    
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
        if (!playersTableBodyEl) return;
        document.querySelectorAll('#position-filters .filter-btn').forEach(btn => btn.classList.remove('active'));
        const currentFilterBtn = document.querySelector(`#position-filters .filter-btn[data-pos="${position}"]`);
        if (currentFilterBtn) currentFilterBtn.classList.add('active');
        
        const filterColumnSelect = document.getElementById('filter-column-select');
        const filterColumn = filterColumnSelect ? filterColumnSelect.value : 'primary';
        const rows = playersTableBodyEl.querySelectorAll('tr');
        rows.forEach(row => {
            const rowPos = filterColumn === 'primary' ? row.dataset.posPrimary : row.dataset.posSecondary;
            if (position === 'Todos' || rowPos === position) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }

    function showPickAlert(pickNumber, player, captain) {
        if (!pickAlertEl || !pickAlertContentEl) return;
        pickAlertContentEl.innerHTML = `<div class="pick-number">PICK #${pickNumber}</div><div class="player-name">${player.psnId}</div><div class="team-name">${captain.teamName}</div>`;
        pickAlertEl.classList.add('visible');
        setTimeout(() => {
            pickAlertEl.classList.remove('visible');
            setTimeout(() => pickAlertEl.classList.add('hidden'), 300);
        }, 5000);
    }
}
