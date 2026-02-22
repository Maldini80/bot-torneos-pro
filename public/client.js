// ===== TRADUCCIONES =====
const translations = {
    es: {
        backBtn: '← Dashboard',
        classification: 'Clasificación',
        calendar: 'Calendario',
        brackets: 'Eliminatorias',
        teams: 'Equipos',
        finishedTitle: '🏆 TORNEO FINALIZADO',
        finishedText: '¡Gracias por participar y seguir la retransmisión!',
        champion: '🏆 Campeón:',
        noMatches: 'No hay partidos en juego.',
        tournamentFinished: 'El torneo ha finalizado.',
        noTeams: 'Aún no hay equipos aprobados.',
        noGroups: 'El sorteo de grupos no se ha realizado.',
        noCalendar: 'El calendario se mostrará cuando comience el torneo.',
        noBrackets: 'Las eliminatorias no han comenzado.',
        captain: 'Capitán:',
        coCaptain: 'Co-Capitán:',
        loading: 'Cargando datos del evento...',
        errorNoId: 'Error: No se ha especificado un ID de evento en la URL.',
        liveMatches: 'Partidos en Directo',
        toDefine: 'Por definir',
        groupPhase: 'Fase de Grupos',
        position: 'Pos',
        team: 'Equipo',
        pts: 'PTS',
        pj: 'PJ',
        gf: 'GF',
        gc: 'GC',
        dg: 'DG',
        bh: 'BH',
        // Roles
        roleAdmin: 'ADMIN',
        roleCaptain: 'CAPITÁN',
        roleCoCaptain: 'CO-CAPITÁN',
        roleExtraCaptain: 'CAPITÁN EXTRA',
        roleManager: 'MÁNAGER',
        roleMatchGuide: 'GUÍA DE PARTIDO',
        roleDraftCaptain: 'CAPITÁN DE DRAFT',
        roleVisitor: 'VISITANTE',
        myTeam: 'Mi Equipo',
        matchSchedule: 'Calendario de Partidos',
        participatingTeams: 'Equipos Participantes',
        round: 'Jornada',
        myMatches: 'Mis Partidos',
        pending: 'Pendiente',
        completed: 'Completado',
        chatMatch: 'Chat Partido',
        reportResult: 'Reportar Resultado'
    },
    en: {
        backBtn: '← Dashboard',
        classification: 'Standings',
        calendar: 'Schedule',
        brackets: 'Playoffs',
        teams: 'Teams',
        finishedTitle: '🏆 TOURNAMENT FINISHED',
        finishedText: 'Thank you for participating and following the broadcast!',
        champion: '🏆 Champion:',
        noMatches: 'No live matches.',
        tournamentFinished: 'The tournament has finished.',
        noTeams: 'No approved teams yet.',
        noGroups: 'Group draw has not been performed.',
        noCalendar: 'Schedule will be shown when tournament starts.',
        noBrackets: 'Playoffs have not started.',
        captain: 'Captain:',
        coCaptain: 'Co-Captain:',
        loading: 'Loading event data...',
        errorNoId: 'Error: No event ID specified in URL.',
        liveMatches: 'Live Matches',
        toDefine: 'To be defined',
        groupPhase: 'Group Stage',
        position: 'Pos',
        team: 'Team',
        pts: 'PTS',
        pj: 'GP',
        gf: 'GF',
        gc: 'GA',
        dg: 'GD',
        bh: 'BH',
        // Roles
        roleAdmin: 'ADMIN',
        roleCaptain: 'CAPTAIN',
        roleCoCaptain: 'CO-CAPTAIN',
        roleExtraCaptain: 'EXTRA CAPTAIN',
        roleManager: 'MANAGER',
        roleMatchGuide: 'MATCH GUIDE',
        roleDraftCaptain: 'DRAFT CAPTAIN',
        roleVisitor: 'VISITOR',
        myTeam: 'My Team',
        matchSchedule: 'Match Schedule',
        participatingTeams: 'Participating Teams',
        round: 'Round',
        myMatches: 'My Matches',
        pending: 'Pending',
        completed: 'Completed',
        chatMatch: 'Match Chat',
        reportResult: 'Report Result'
    }
};

let currentLang = localStorage.getItem('preferredLanguage') || 'es';

function t(key) {
    return translations[currentLang][key] || translations.es[key] || key;
}

function updateLanguage() {
    // Actualizar elementos con data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = t(key);
    });

    // Actualizar botones de vista
    const viewButtons = document.querySelectorAll('.view-btn');
    if (viewButtons.length >= 4) {
        viewButtons[0].textContent = t('classification');
        viewButtons[1].textContent = t('calendar');
        viewButtons[2].textContent = t('brackets');
        viewButtons[3].textContent = t('teams');
    }

    // Actualizar select móvil
    const mobileSelect = document.getElementById('mobile-view-select');
    if (mobileSelect && mobileSelect.options.length >= 4) {
        mobileSelect.options[0].textContent = t('classification');
        mobileSelect.options[1].textContent = t('calendar');
        mobileSelect.options[2].textContent = t('brackets');
        mobileSelect.options[3].textContent = t('teams');

        // Add 'My Matches' option if it doesn't exist and user has role
        if (userRoleData && userRoleData.teamId && mobileSelect.options.length === 4) {
            const opt = document.createElement('option');
            opt.value = 'my-matches-view';
            opt.textContent = t('myMatches');
            mobileSelect.appendChild(opt);
        }
    }

    // Actualizar texto de "loading"
    const loadingEl = document.getElementById('loading');
    if (loadingEl && loadingEl.textContent.includes('Cargando')) {
        loadingEl.textContent = t('loading');
    }

    // Disparar evento de cambio de idioma global
    document.dispatchEvent(new Event('languageChanged'));
}

document.addEventListener('DOMContentLoaded', () => {
    // Inicializar idioma
    updateLanguage();

    // Event listeners para cambio de idioma
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentLang = btn.dataset.lang;
            localStorage.setItem('preferredLanguage', currentLang);
            document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateLanguage();
        });
    });

    const urlParams = new URLSearchParams(window.location.search);
    const tournamentId = urlParams.get('tournamentId');
    const draftId = urlParams.get('draftId');
    const rouletteSessionId = urlParams.get('rouletteSessionId');

    if (rouletteSessionId) {
        document.body.classList.add('draft-view-style');
        initializeRouletteView(rouletteSessionId);
    } else if (tournamentId) {
        document.body.classList.remove('draft-view-style');
        initializeTournamentView(tournamentId);
    } else if (draftId) {
        document.body.classList.add('draft-view-style');
        initializeDraftView(draftId);
    } else {
        document.getElementById('loading').textContent = t('errorNoId');
    }
});

// ===== DETECCIÓN DE ROL EN EVENTO =====
let userRoleData = null;

async function checkUserRoleInEvent(eventId) {
    try {
        const response = await fetch(`/api/my-role-in-event/${eventId}`);
        const roleData = await response.json();
        userRoleData = roleData; // Store globally

        console.log('[DEBUG checkUserRoleInEvent]', roleData);

        if (roleData.authenticated && roleData.role !== 'visitor') {
            displayRoleBadge(roleData);

            // Show 'My Matches' tab if user is captain/co-captain/manager/admin/extraCaptain
            if (['captain', 'coCaptain', 'manager', 'admin', 'extraCaptain'].includes(roleData.role)) {
                const myMatchesBtn = document.getElementById('my-matches-btn');
                if (myMatchesBtn) myMatchesBtn.style.display = 'inline-block';
            }
        }
    } catch (error) {
        console.log('Usuario no autenticado o error al detectar rol:', error);
    }
}

function displayRoleBadge(roleData) {
    const badgeEl = document.getElementById('user-role-badge');
    const iconEl = document.getElementById('role-icon');
    const labelEl = document.getElementById('role-label');
    const teamEl = document.getElementById('role-team');

    // Íconos por tipo de rol
    const roleIcons = {
        admin: '👑',
        captain: '⚽',
        coCaptain: '⚽',
        extraCaptain: '⚽',
        draftCaptain: '🎯',
        manager: '👔',
        matchGuide: '📋'
    };

    // Mapeo de roles a claves de traducción
    const roleKeys = {
        admin: 'roleAdmin',
        captain: 'roleCaptain',
        coCaptain: 'roleCoCaptain',
        extraCaptain: 'roleExtraCaptain',
        draftCaptain: 'roleDraftCaptain',
        manager: 'roleManager',
        matchGuide: 'roleMatchGuide'
    };

    // Actualizar badge
    iconEl.textContent = roleIcons[roleData.role] || '👤';
    labelEl.textContent = t(roleKeys[roleData.role]);

    // Mostrar equipo si es capitán
    if (roleData.teamName) {
        teamEl.textContent = roleData.teamName;
        teamEl.style.display = 'block';
    } else {
        teamEl.style.display = 'none';
    }

    // Aplicar clase CSS según el rol
    badgeEl.className = `user-role-badge role-${roleData.role}`;
    badgeEl.style.display = 'flex';
}

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
    let currentTournamentState = null; // Store state for re-rendering

    // Escuchar cambio de idioma para re-renderizar
    document.addEventListener('languageChanged', () => {
        if (currentTournamentState) {
            renderTournamentState(currentTournamentState);
        }
    });

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

    // NUEVO: Detectar rol del usuario en este evento
    checkUserRoleInEvent(tournamentId).then(() => {
        // Re-render My Matches after role is detected
        if (currentTournamentState && userRoleData && userRoleData.teamId) {
            renderMyMatches(currentTournamentState);
        }
    });

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
        currentTournamentState = tournament; // Update cached state

        // Renderizar siempre el nombre y formato
        tournamentNameEl.textContent = tournament.status === 'finalizado' ? `${tournament.nombre} (Finalizado)` : tournament.nombre;
        tournamentFormatEl.textContent = `${tournament.config.format.label} | ${Object.keys(tournament.teams.aprobados).length} / ${tournament.config.format.size} Equipos`;

        // Renderizar los datos del torneo siempre
        renderTeams(tournament);
        renderClassification(tournament);
        renderCalendar(tournament);
        renderBracket(tournament);
        renderLiveMatches(tournament);

        // Render 'My Matches' if user has role
        if (userRoleData && userRoleData.authenticated && userRoleData.teamId) {
            renderMyMatches(tournament);
        }

        // Si está finalizado, mostrar vista especial Y mantener las pestañas visibles
        if (tournament.status === 'finalizado') {
            // Asegurarse que el view-switcher esté visible
            viewSwitcherEl.style.display = 'flex';
            document.querySelector('.mobile-view-switcher').style.display = 'block';

            // Mostrar también la vista de "finalizado" en partidos en directo
            liveMatchesListEl.innerHTML = '';

            // Obtener el campeón
            const finalMatch = tournament.structure.eliminatorias?.final;
            let championHTML = '';
            if (finalMatch && finalMatch.resultado) {
                const [scoreA, scoreB] = finalMatch.resultado.split('-').map(Number);
                const champion = scoreA > scoreB ? finalMatch.equipoA : finalMatch.equipoB;
                championHTML = `
                    <div class="finished-tournament-banner">
                        <h2>${t('finishedTitle')}</h2>
                        <p>${t('finishedText')}</p>
                        <h3>${t('champion')} ${champion.nombre} 🏆</h3>
                    </div>
                `;
            } else {
                championHTML = `<p class="placeholder">${t('tournamentFinished')}</p>`;
            }
            liveMatchesListEl.innerHTML = championHTML;

            // Activar la vista de clasificación por defecto
            if (!mainPanelEl.querySelector('.view-pane.active')) {
                mainPanelEl.querySelector('[data-view="classification-view"]').click();
            }
            return;
        }

        // Torneos en curso: lógicaexistente
        viewSwitcherEl.style.display = 'flex';
        finishedViewEl.classList.remove('active');
        if (!mainPanelEl.querySelector('.view-pane.active')) {
            mainPanelEl.querySelector('[data-view="classification-view"]').click();
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
            let metaHTML = `<div class="team-meta"><span>Capitán: ${team.capitanTag}</span>`;
            if (team.coCaptainTag) {
                metaHTML += `<span>Co-Capitán: ${team.coCaptainTag}</span>`;
            }
            metaHTML += '</div>';
            const twitterLink = team.twitter ? `<a href="https://twitter.com/${team.twitter.replace('@', '')}" target="_blank" class="team-link-btn">Twitter</a>` : '';
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
            groupsContainerEl.innerHTML = `<p class="placeholder">${t('noGroups')}</p>`;
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

            // Detectar si hay campo BH (Buchholz) para liguilla suiza
            const hasBH = sortedTeams.some(team => team.stats.buchholz !== undefined);

            let groupHTML = `<div class="group-container">
                <h3 class="group-title">${groupName}</h3>
                <div class="classification-table-header">
                    <div class="header-team-info">
                        <span class="header-pos">${t('position')}</span>
                        <span class="header-team-name">${t('team')}</span>
                    </div>
                    <div class="header-stats-grid ${hasBH ? 'with-bh' : ''}">
                        <span class="header-stat">${t('pts')}</span>
                        <span class="header-stat">${t('pj')}</span>
                        <span class="header-stat">${t('gf')}</span>
                        <span class="header-stat">${t('gc')}</span>
                        <span class="header-stat">${t('dg')}</span>
                        ${hasBH ? `<span class="header-stat">${t('bh')}</span>` : ''}
                    </div>
                </div>`;

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
                        <div class="team-stats-grid ${hasBH ? 'with-bh' : ''}">
                            <div class="stat-item"><span class="stat-value">${team.stats.pts}</span></div>
                            <div class="stat-item"><span class="stat-value">${team.stats.pj}</span></div>
                            <div class="stat-item"><span class="stat-value">${team.stats.gf}</span></div>
                            <div class="stat-item"><span class="stat-value">${team.stats.gc}</span></div>
                            <div class="stat-item"><span class="stat-value">${dg}</span></div>
                            ${hasBH ? `<div class="stat-item"><span class="stat-value">${team.stats.buchholz || 0}</span></div>` : ''}
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
                const round = `${t('round')} ${match.jornada}`;
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
            const roundText = `${t('round')} ${match.jornada}`;
            const groupKey = match.nombreGrupo ? `${match.nombreGrupo} - ${roundText}` : roundText;
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
        const positionOrder = ['GK', 'DFC', 'CARR', 'MC', 'DC'];
        const sortedPlayers = [...team.players].sort((a, b) => positionOrder.indexOf(a.primaryPosition) - positionOrder.indexOf(b.primaryPosition));
        sortedPlayers.forEach(player => {
            const li = document.createElement('li');
            li.textContent = `${player.psnId} (${player.primaryPosition})`;
            modalRosterListEl.appendChild(li);
        });
        modalEl.classList.remove('hidden');
    }

    function renderMyMatches(tournament) {
        // Admins don't need teamId, they see all matches
        if (!userRoleData) return;

        const container = document.getElementById('my-matches-container');
        if (!container) return;

        // Collect all matches
        const allMatches = [];
        if (tournament.structure.calendario) {
            Object.values(tournament.structure.calendario).forEach(groupMatches => {
                allMatches.push(...groupMatches);
            });
        }
        if (tournament.structure.eliminatorias) {
            Object.values(tournament.structure.eliminatorias).forEach(stage => {
                if (Array.isArray(stage)) allMatches.push(...stage);
                else if (stage && typeof stage === 'object' && stage.matchId) allMatches.push(stage);
            });
        }

        // Filter matches: admins see ALL, others see only their team's matches
        let myMatches;
        if (userRoleData.role === 'admin') {
            myMatches = allMatches.filter(match => match && match.equipoA && match.equipoB);
        } else {
            if (!userRoleData.teamId) {
                console.warn('[DEBUG] No teamId found for user. userRoleData:', userRoleData);
                return; // Non-admins need teamId
            }
            myMatches = allMatches.filter(match =>
                match && (match.equipoA?.id === userRoleData.teamId || match.equipoB?.id === userRoleData.teamId)
            );
        }

        if (myMatches.length === 0) {
            container.innerHTML = `<p class="placeholder">${t('noMatches')}</p>`;
            return;
        }


        // Group matches by round (jornada)
        const matchesByRound = {};
        myMatches.forEach(match => {
            const roundNum = match.jornada || match.round || 'Sin Jornada';
            if (!matchesByRound[roundNum]) matchesByRound[roundNum] = [];
            matchesByRound[roundNum].push(match);
        });

        // Sort rounds numerically
        const sortedRounds = Object.keys(matchesByRound).sort((a, b) => {
            if (a === 'Sin Jornada') return 1;
            if (b === 'Sin Jornada') return -1;
            return Number(a) - Number(b);
        });

        container.innerHTML = '';

        sortedRounds.forEach(roundNum => {
            // Round header
            const roundHeader = document.createElement('h3');
            roundHeader.style.cssText = 'margin: 1.5rem 0 1rem 0; color: #00d4ff; font-size: 1.1rem;';
            roundHeader.textContent = roundNum === 'Sin Jornada' ? roundNum : `${t('round')} ${roundNum}`;
            container.appendChild(roundHeader);

            matchesByRound[roundNum].forEach(match => {
                const teamA = match.equipoA;
                const teamB = match.equipoB;
                const isCompleted = match.status === 'completado' || match.resultado;
                const statusText = isCompleted ? t('completed') : t('pending');
                const statusClass = isCompleted ? 'status-completed' : 'status-pending';

                let actionsHTML = '';


                // Chat button if thread exists
                if (match.threadId && tournament.guildId) {
                    const threadUrl = `https://discord.com/channels/${tournament.guildId}/${match.threadId}`;
                    actionsHTML += `<a href="${threadUrl}" target="_blank" class="action-btn" style="text-decoration:none; padding: 8px 15px; background: #5865F2; color: white; border-radius: 6px; display: inline-block; margin-right: 10px;">💬 ${t('chatMatch')}</a>`;
                }

                // Note: Report via Discord only


                const matchCard = document.createElement('div');
                matchCard.className = 'calendar-match';
                matchCard.style.cssText = 'margin-bottom: 1rem; padding: 1rem; background: rgba(255,255,255,0.05); border-radius: 8px;';

                const teamALogo = teamA.logoUrl ? `<img src="${teamA.logoUrl}" class="team-logo-small" alt="" style="width: 24px; height: 24px; border-radius: 50%; margin: 0 8px;">` : '';
                const teamBLogo = teamB.logoUrl ? `<img src="${teamB.logoUrl}" class="team-logo-small" alt="" style="width: 24px; height: 24px; border-radius: 50%; margin: 0 8px;">` : '';

                matchCard.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <div style="flex: 1; display: flex; align-items: center;">
                        ${teamALogo}
                        <span style="font-weight: bold;">${teamA.nombre}</span>
                    </div>
                    <div style="padding: 0 1rem; font-size: 1.2rem; font-weight: bold;">
                        ${match.resultado || 'vs'}
                    </div>
                    <div style="flex: 1; display: flex; align-items: center; justify-content: flex-end;">
                        <span style="font-weight: bold;">${teamB.nombre}</span>
                        ${teamBLogo}
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="status-badge ${statusClass}" style="padding: 4px 12px; border-radius: 4px; font-size: 0.85rem;">${statusText}</span>
                    <div>${actionsHTML}</div>
                </div>
            `;

                container.appendChild(matchCard);
            });
        });
    }

    // Global function for opening report modal
    window.openReportModal = function (matchId, teamA, teamB) {
        const modal = document.getElementById('report-match-modal');
        const teamsEl = document.getElementById('report-teams');
        const labelA = document.getElementById('report-label-a');
        const labelB = document.getElementById('report-label-b');
        const form = document.getElementById('report-match-form');
        const statusEl = document.getElementById('report-status');
        const goalsAInput = document.getElementById('report-goals-a');
        const goalsBInput = document.getElementById('report-goals-b');

        // Set match info
        teamsEl.textContent = `${teamA} vs ${teamB}`;
        labelA.textContent = teamA;
        labelB.textContent = teamB;
        statusEl.textContent = '';
        goalsAInput.value = '';
        goalsBInput.value = '';

        // Handle form submission
        form.onsubmit = async (e) => {
            e.preventDefault();

            const goalsA = parseInt(goalsAInput.value);
            const goalsB = parseInt(goalsBInput.value);

            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Enviando...';
            statusEl.textContent = '';

            try {
                const response = await fetch(`/api/matches/${matchId}/report`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ goalsA, goalsB, lang: currentLang })
                });

                const data = await response.json();

                if (response.ok) {
                    statusEl.textContent = data.message;
                    statusEl.style.color = '#43B581';
                    setTimeout(() => {
                        modal.classList.add('hidden');
                        // Reload to refresh match state
                        location.reload();
                    }, 2000);
                } else {
                    throw new Error(data.error || 'Error al enviar reporte');
                }
            } catch (err) {
                statusEl.textContent = err.message;
                statusEl.style.color = '#f04747';
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Enviar Reporte';
            }
        };

        modal.classList.remove('hidden');
    };
} // Fin de initializeTournamentView

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

    const positionOrder = ['GK', 'DFC', 'CARR', 'MC', 'DC'];
    const MIDFIELDER_POSITIONS = ['MC'];
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
            const loginControlEl = document.getElementById('login-control');

            if (currentUser) {
                document.getElementById('user-greeting').textContent = `Hola, ${currentUser.username}`;
                userSessionEl.classList.remove('hidden');
                if (loginControlEl) loginControlEl.classList.add('hidden');
            } else {
                userSessionEl.classList.add('hidden');
                if (loginControlEl) loginControlEl.classList.remove('hidden');
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
                if (!hasLoadedInitialData) {
                    loadingEl.classList.add('hidden');
                    draftContainerEl.classList.remove('hidden');
                    hasLoadedInitialData = true;
                }
                renderDraftState(message.data);
            }
        };
    }

    function fetchInitialData() {
        fetch(`/draft-data/${draftId}`)
            .then(response => response.ok ? response.json() : Promise.resolve(null))
            .then(data => {
                if (data) {
                    loadingEl.classList.add('hidden');
                    draftContainerEl.classList.remove('hidden');
                    renderDraftState(data);
                    hasLoadedInitialData = true;
                } else {
                    loadingEl.textContent = 'No se encontraron datos para este Draft.';
                }
            })
            .catch(err => {
                console.error('Error fetching initial data:', err);
                loadingEl.textContent = 'Error al cargar datos.';
            });
    }

    function renderDraftState(draft) {
        draft.captains = draft.captains || [];
        draft.players = draft.players || [];
        currentDraftState = draft;
        draftNameEl.textContent = draft.config?.name || 'Draft';

        // Update status info
        if (draft.status === 'seleccion') {
            const currentPick = draft.selection.currentPick;
            const totalPicks = draft.selection.totalPicks;
            roundInfoEl.textContent = `Ronda ${Math.ceil(currentPick / draft.captains.length)}`;
            currentPickEl.textContent = currentPick;

            const captainIdInTurn = draft.selection.order[draft.selection.turn];
            const captainInTurn = draft.captains.find(c => c.userId === captainIdInTurn);
            currentTeamEl.textContent = captainInTurn ? captainInTurn.teamName : 'Desconocido';

            renderRoundPickOrder(draft);
        } else {
            roundInfoEl.textContent = draft.status === 'finalizado' ? 'Finalizado' : 'Esperando inicio';
            currentPickEl.textContent = '-';
        }

        // --- ADMIN CONTROLS: UNDO ---
        const existingUndoBtn = document.getElementById('admin-undo-btn');
        if (currentUser && currentUser.roles && currentUser.roles.includes('admin') && draft.status === 'seleccion') {
            if (!existingUndoBtn) {
                const undoBtn = document.createElement('button');
                undoBtn.id = 'admin-undo-btn';
                undoBtn.className = 'admin-btn undo-btn';
                undoBtn.innerHTML = '⏪ Deshacer Pick';
                undoBtn.style.marginTop = '10px';
                undoBtn.style.backgroundColor = '#e74c3c';
                undoBtn.style.color = '#fff';
                undoBtn.style.padding = '5px 10px';
                undoBtn.style.border = 'none';
                undoBtn.style.borderRadius = '5px';
                undoBtn.style.cursor = 'pointer';
                undoBtn.onclick = () => {
                    if (confirm('¿Seguro que quieres deshacer el último pick? El turno retrocederá y el jugador volverá a la lista de Libres.')) {
                        socket.send(JSON.stringify({ type: 'admin_undo_pick', draftId: draft.shortId }));
                    }
                };

                // Añadirlo debajo del bloque de info del turno
                const currentPickBoard = document.querySelector('.current-pick-board');
                if (currentPickBoard) {
                    currentPickBoard.appendChild(undoBtn);
                }
            }
        } else if (existingUndoBtn) {
            existingUndoBtn.remove();
        }

        // Check for new picks to show alert
        if (draft.lastPick && (!lastShownPickData || lastShownPickData.pickNumber !== draft.lastPick.pickNumber)) {
            const captain = draft.captains.find(c => c.userId === draft.lastPick.captainId);
            const player = draft.players.find(p => p.userId === draft.lastPick.playerId);
            if (captain && player) {
                showPickAlert(draft.lastPick.pickNumber, player, captain);
                lastShownPickData = draft.lastPick;
            }
        }

        renderAvailablePlayers(draft);
        renderTeamManagementView(draft);

        // Render teams grid
        const teamsGridEl = document.getElementById('teams-grid');
        teamsGridEl.innerHTML = '';
        draft.captains.forEach(captain => {
            const teamPlayers = draft.players.filter(p => p.captainId === captain.userId);
            const teamCard = document.createElement('div');
            teamCard.className = 'team-card-draftview';

            let playersListHTML = '<ul class="team-roster-compact">';
            teamPlayers.forEach(p => {
                const isSecondary = p.pickedForPosition && p.pickedForPosition !== p.primaryPosition;
                let replaceBtn = '';
                if (currentUser && currentUser.roles && currentUser.roles.includes('admin') && draft.status === 'seleccion') {
                    replaceBtn = ` <button class="admin-init-replace-btn" data-player-id="${p.userId}" data-team-id="${captain.userId}" title="Reemplazar Jugador" style="background:transparent; border:none; cursor:pointer;">🔄</button>`;
                }
                playersListHTML += `<li>${p.psnId} <span class="pos-badge">${p.pickedForPosition || p.primaryPosition}${isSecondary ? '*' : ''}</span>${replaceBtn}</li>`;
            });
            playersListHTML += '</ul>';

            teamCard.innerHTML = `
                <h3>${captain.teamName}</h3>
                <div class="captain-name">Capi: ${captain.username}</div>
                ${playersListHTML}
            `;
            teamsGridEl.appendChild(teamCard);
        });
    }

    function renderAvailablePlayers(draft) {
        playersTableBodyEl.innerHTML = '';
        const captainIdInTurn = (draft.selection && draft.selection.order?.length > 0) ? draft.selection.order[draft.selection.turn] : null;
        const isMyTurn = currentUser && draft.status === 'seleccion' && String(currentUser.id) === String(captainIdInTurn);

        // --- NUEVA LÓGICA DE VISIBILIDAD DE DETALLES ---
        const canViewDetails = currentUser && (draft.status === 'finalizado' || draft.status === 'torneo_generado');
        const isAuthenticated = !!currentUser;

        // Mostrar/Ocultar columna WhatsApp
        const whatsappHeader = document.querySelector('.col-whatsapp');
        if (whatsappHeader) {
            if (isAuthenticated) whatsappHeader.classList.remove('hidden');
            else whatsappHeader.classList.add('hidden');
        }

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

            // ADMIN CONTROLS: REPLACE MODE OR FORCE PICK
            if (currentUser && currentUser.roles && currentUser.roles.includes('admin') && draft.status === 'seleccion') {
                if (window.adminReplaceMode) {
                    actionButtonsHTML = `<button class="admin-finalize-replace-btn" data-new-player-id="${player.userId}" data-new-player-psn="${player.psnId}" style="background-color:#E62429; color:white; padding:5px; border-radius:5px; border:none; cursor:pointer; font-weight:bold;">Sustituir por este</button>`;
                } else {
                    actionButtonsHTML = `<button class="admin-force-pick-btn" data-player-id="${player.userId}" data-draft-id="${draft.shortId}" style="background-color:#3498db; color:white; padding:5px; border-radius:5px; border:none; cursor:pointer;">⚡ Forzar Pick</button>`;
                }
            }

            // Si se cumplen las condiciones, añadimos el botón de ver detalles
            if (canViewDetails) {
                actionButtonsHTML += `<button class="details-btn" data-player-id="${player.userId}" data-draft-id="${draft.shortId}">🪪 Ver Ficha</button>`;
            }

            const statusIcon = player.currentTeam === 'Libre' ? '🔎' : '🛡️';

            // Renderizado condicional de WhatsApp (Oculto por defecto para streamings)
            let whatsappCell = '';
            if (isAuthenticated) {
                whatsappCell = `<td data-label="WhatsApp">
                    <span class="player-data whatsapp-blur" 
                          style="filter: blur(5px); cursor: pointer; transition: filter 0.3s;" 
                          onclick="this.style.filter = this.style.filter === 'none' ? 'blur(5px)' : 'none'" 
                          title="Haz clic para mostrar/ocultar">
                        ${player.whatsapp || 'N/A'}
                    </span>
                </td>`;
            }

            row.innerHTML = `
            <td data-label="Strikes"><span class="player-data">${player.strikes || 0}</span></td>
            <td data-label="NOMBRE"><span class="player-data">${statusIcon} ${player.psnId}</span></td>
            ${whatsappCell}
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
            } else if (activeFilterPos === 'Medios') {
                // Lógica especial para el filtro de Medios
                if (isMyTurn) {
                    if (hasPrimaryMatchesInData) {
                        if (MIDFIELDER_POSITIONS.includes(primaryPos)) isVisible = true;
                    } else {
                        if (MIDFIELDER_POSITIONS.includes(secondaryPos)) isVisible = true;
                    }
                } else {
                    if (filterColumn === 'primary' && MIDFIELDER_POSITIONS.includes(primaryPos)) {
                        isVisible = true;
                    } else if (filterColumn === 'secondary' && MIDFIELDER_POSITIONS.includes(secondaryPos)) {
                        isVisible = true;
                    }
                }
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

            // ADMIN: Force Pick
            if (event.target.classList.contains('admin-force-pick-btn')) {
                const playerId = event.target.dataset.playerId;
                if (confirm('¿Forzar pick de este jugador para el capitán activo?')) {
                    socket.send(JSON.stringify({ type: 'admin_force_pick', draftId, playerId }));
                }
            }

            // ADMIN: Finalize Replace Pick
            if (event.target.classList.contains('admin-finalize-replace-btn')) {
                const newPlayerId = event.target.dataset.newPlayerId;
                const newPlayerPsn = event.target.dataset.newPlayerPsn;
                const oldPlayerId = window.adminReplaceData.oldPlayerId;
                const teamId = window.adminReplaceData.teamId;

                const dispositionStr = prompt(`Vas a sustituir al jugador antiguo por ${newPlayerPsn}.\nEscribe 'release' para devolver al antiguo jugador a la Agencia Libre, o 'kick' para expulsarlo del torneo por completo.`);

                if (dispositionStr === 'release' || dispositionStr === 'kick') {
                    socket.send(JSON.stringify({
                        type: 'admin_replace_pick',
                        draftId,
                        teamId,
                        oldPlayerId,
                        newPlayerId,
                        disposition: dispositionStr
                    }));
                    window.adminReplaceMode = false;
                    window.adminReplaceData = null;
                    document.getElementById('admin-replace-banner')?.remove();
                    // El socket hará el re-render cuando llegue el nuevo state
                } else if (dispositionStr !== null) {
                    alert('Acción cancelada. Has introducido un comando no válido.');
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
        document.addEventListener('click', function (event) {
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

            // ADMIN: Init Replace Mode
            if (event.target.classList.contains('admin-init-replace-btn') || event.target.closest('.admin-init-replace-btn')) {
                const btn = event.target.classList.contains('admin-init-replace-btn') ? event.target : event.target.closest('.admin-init-replace-btn');
                const oldPlayerId = btn.dataset.playerId;
                const teamId = btn.dataset.teamId;
                window.adminReplaceMode = true;
                window.adminReplaceData = { oldPlayerId, teamId };

                // Show banner
                let banner = document.getElementById('admin-replace-banner');
                if (!banner) {
                    banner = document.createElement('div');
                    banner.id = 'admin-replace-banner';
                    banner.style = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); background:var(--primary-color); color:#fff; padding:15px; z-index:9999; border-radius:5px; text-align:center; font-weight:bold; width:90%; max-width:600px; border:2px solid black; box-shadow:0 4px 10px rgba(0,0,0,0.5);';
                    document.body.appendChild(banner);
                }
                banner.innerHTML = `MODO REEMPLAZO ACTIVO<br><span style="font-size:14px;font-weight:normal;">Selecciona en la tabla de disponibles al nuevo jugador.</span><br><button id="admin-cancel-replace-btn" style="margin-top:10px; padding:5px; color:#000; cursor:pointer;">Cancelar</button>`;

                document.getElementById('admin-cancel-replace-btn').onclick = () => {
                    window.adminReplaceMode = false;
                    window.adminReplaceData = null;
                    document.getElementById('admin-replace-banner').remove();
                    if (typeof currentDraftState !== 'undefined') {
                        renderAvailablePlayers(currentDraftState);
                    }
                };

                // Forzar re-render de la tabla para mostrar los botones de confirmación
                if (typeof currentDraftState !== 'undefined') {
                    renderAvailablePlayers(currentDraftState);
                    // Scroll a la tabla de disponibles suave
                    document.querySelector('.players-table-container').scrollIntoView({ behavior: 'smooth' });
                }
            }
        });
    }

    function setupFilters() {
        if (positionFiltersEl.innerHTML !== '') return;
        positionFiltersEl.innerHTML = `<select id="filter-column-select"><option value="primary">Filtrar por Pos. Primaria</option><option value="secondary">Filtrar por Pos. Secundaria</option></select>`;
        const select = document.getElementById('filter-column-select');
        select.addEventListener('change', applyTableFilters);

        const allPositions = ['Todos', 'GK', 'DFC', 'CARR', 'Medios', 'DC'];
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
    const groupAList = document.getElementById('group-a-list');
    const groupBList = document.getElementById('group-b-list');
    const groupCList = document.getElementById('group-c-list');
    const groupDList = document.getElementById('group-d-list');
    const ctx = canvas.getContext('2d');

    let teams = [];
    let startAngle = 0;
    let spinTime = 0;
    let spinTimeTotal = 0;
    let spinAngleStart = 0;
    let currentTournamentId = null;

    const colors = ["#E62429", "#222222", "#FFFFFF", "#555555"];

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${window.location.host}`);
    socket.onopen = () => console.log('Conectado al servidor para Sorteo con Ruleta.');

    // *** NUEVO: Escucha las actualizaciones del torneo para llenar los grupos ***
    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        console.log('[DEBUG 6] Actualización recibida del bot:', message);

        if (message.type === 'tournament' && message.id === currentTournamentId) {
            console.log('[DEBUG 7] ¡IDs coinciden! Actualizando la lista de grupos.', { id_recibido: message.id, id_esperado: currentTournamentId });
            updateGroupDisplay(message.data.structure.grupos);
        }
    };

    async function fetchTeams() {
        spinButton.disabled = true;
        spinButton.textContent = 'CARGANDO EQUIPOS...';
        try {
            const response = await fetch(`/api/roulette-data/${sessionId}`);
            const data = await response.json();

            if (response.ok) {
                teams = data.teams;
                currentTournamentId = data.tournamentShortId; // Usamos el ID del torneo
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
            } else { statusEl.textContent = `Error: ${data.error}`; }
        } catch (error) { statusEl.textContent = 'Error al conectar con el servidor.'; }
    }

    // *** NUEVO: Función para actualizar la lista de grupos en la barra lateral ***
    function updateGroupDisplay(groups) {
        groupAList.innerHTML = '';
        groupBList.innerHTML = '';
        groupCList.innerHTML = ''; // <-- AÑADIDO
        groupDList.innerHTML = ''; // <-- AÑADIDO

        if (groups['Grupo A']) {
            groups['Grupo A'].equipos.forEach(team => {
                const li = document.createElement('li');
                li.textContent = team.nombre;
                groupAList.appendChild(li);
            });
        }
        if (groups['Grupo B']) {
            groups['Grupo B'].equipos.forEach(team => {
                const li = document.createElement('li');
                li.textContent = team.nombre;
                groupBList.appendChild(li);
            });
        }
        // --- BLOQUE AÑADIDO ---
        if (groups['Grupo C']) {
            groups['Grupo C'].equipos.forEach(team => {
                const li = document.createElement('li');
                li.textContent = team.nombre;
                groupCList.appendChild(li);
            });
        }
        if (groups['Grupo D']) {
            groups['Grupo D'].equipos.forEach(team => {
                const li = document.createElement('li');
                li.textContent = team.nombre;
                groupDList.appendChild(li);
            });
        }
        // --- FIN DEL BLOQUE ---
    }

    function drawRoulette() {
        if (teams.length === 0) return;
        const arc = Math.PI * 2 / teams.length;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        if (teams.length > 12) {
            // Si hay muchos equipos (ej. 16), usamos una fuente más pequeña
            ctx.font = 'bold 16px Bebas Neue';
        } else {
            // Si hay pocos equipos (ej. 8), usamos la fuente grande de siempre
            ctx.font = 'bold 24px Bebas Neue';
        }
        teams.forEach((team, i) => {
            const angle = startAngle + i * arc;
            ctx.fillStyle = colors[i % colors.length];
            ctx.beginPath();
            ctx.arc(400, 400, 380, angle, angle + arc, false);
            ctx.arc(400, 400, 0, angle + arc, angle, true);
            ctx.stroke();
            ctx.fill();
            ctx.save();
            ctx.fillStyle = (i % colors.length === 2) ? '#000000' : '#FFFFFF';
            ctx.translate(400 + Math.cos(angle + arc / 2) * 200, 400 + Math.sin(angle + arc / 2) * 200);
            ctx.rotate(angle + arc / 2 + Math.PI / 2);
            const text = team.name;
            ctx.fillText(text, -ctx.measureText(text).width / 2, 0);
            ctx.restore();
        });
    }

    function spin() {
        if (teams.length === 0) return;
        spinButton.disabled = true;
        statusEl.textContent = 'Girando...';
        // *** MODIFICADO: Más fuerza y duración para un giro más emocionante ***
        spinAngleStart = Math.random() * 20 + 30;
        spinTime = 0;
        spinTimeTotal = Math.random() * 2000 + 7000;
        animate();
    }

    function animate() {
        spinTime += 30;
        if (spinTime >= spinTimeTotal) {
            stopSpinning();
            return;
        }
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

        statusEl.textContent = `Asignando a... ¡${winner.name}!`;
        console.log('[DEBUG 1] Enviando resultado al bot:', { sessionId: sessionId, teamId: winner.id });

        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'spin_result', sessionId: sessionId, teamId: winner.id }));
        }

        setTimeout(() => { fetchTeams(); }, 4000);
    }

    function easeOut(t, b, c, d) {
        const ts = (t /= d) * t;
        const tc = ts * t;
        return b + c * (tc + -3 * ts + 3 * t);
    }

    loadingEl.classList.add('hidden');
    rouletteContainerEl.classList.remove('hidden');
    fetchTeams();
    spinButton.addEventListener('click', spin);
}
