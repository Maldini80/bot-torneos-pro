document.addEventListener('DOMContentLoaded', () => {
    // Referencias a elementos del DOM
    const loadingEl = document.getElementById('loading');
    const mainContainerEl = document.getElementById('main-container');
    const draftNameEl = document.getElementById('draft-name');
    const roundInfoEl = document.getElementById('round-info');
    const currentTeamEl = document.getElementById('current-team');
    const currentPickEl = document.getElementById('current-pick');
    const teamsContainerEl = document.getElementById('teams-container');
    const playersListEl = document.getElementById('players-list');

    // --- CONFIGURACIÓN DEL ORDEN DE POSICIONES ---
    const positionOrder = ['GK', 'DFC', 'CARR', 'MCD', 'MV/MCO', 'DC'];

    const urlParams = new URLSearchParams(window.location.search);
    const draftId = urlParams.get('draftId');

    if (!draftId) {
        loadingEl.textContent = 'Error: No se ha especificado un ID de draft.';
        return;
    }

    // --- LÓGICA DE WEBSOCKET (SIN CAMBIOS) ---
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${window.location.host}`);
    socket.onopen = () => console.log('Conectado al servidor de visualización.');
    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.draftId === draftId) {
            console.log('Recibida actualización del draft:', message.data);
            renderDraftState(message.data);
        }
    };

    // --- CARGA DE DATOS INICIAL (SIN CAMBIOS) ---
    fetch(`/draft-data/${draftId}`)
        .then(response => {
            if (!response.ok) throw new Error('No se encontraron datos. La selección podría no haber comenzado.');
            return response.json();
        })
        .then(data => {
            loadingEl.classList.add('hidden');
            mainContainerEl.classList.remove('hidden');
            renderDraftState(data);
        })
        .catch(error => {
            loadingEl.textContent = `Error: ${error.message}`;
            console.error(error);
        });

    // --- NUEVA FUNCIÓN DE ORDENACIÓN ---
    function sortPlayers(a, b) {
        const posA = positionOrder.indexOf(a.primaryPosition);
        const posB = positionOrder.indexOf(b.primaryPosition);
        if (posA !== posB) {
            return posA - posB;
        }
        return a.psnId.localeCompare(b.psnId);
    }

    // --- FUNCIÓN DE RENDERIZADO COMPLETAMENTE NUEVA ---
    function renderDraftState(draft) {
        // 1. Actualizar cabecera (con información de ronda)
        draftNameEl.textContent = draft.name;
        if (draft.status === 'seleccion' && draft.captains.length > 0) {
            const numCaptains = draft.captains.length;
            const totalPicks = 10 * numCaptains; // 10 rondas
            const currentRound = Math.floor((draft.selection.currentPick - 1) / numCaptains) + 1;
            const totalRounds = Math.ceil(totalPicks / numCaptains);
            
            roundInfoEl.textContent = `Ronda ${currentRound} de ${totalRounds}`;
            const currentCaptain = draft.captains.find(c => c.userId === draft.selection.order[draft.selection.turn]);
            currentTeamEl.textContent = currentCaptain ? currentCaptain.teamName : 'N/A';
            currentPickEl.textContent = draft.selection.currentPick;
        } else {
            roundInfoEl.textContent = 'Selección Finalizada';
            currentTeamEl.textContent = '---';
            currentPickEl.textContent = '---';
        }

        // 2. Renderizar equipos (con jugadores ordenados)
        teamsContainerEl.innerHTML = '';
        draft.captains.forEach(captain => {
            const teamPlayers = draft.players
                .filter(p => p.captainId === captain.userId)
                .sort(sortPlayers); // <-- APLICAMOS LA ORDENACIÓN

            let rosterHtml = '';
            teamPlayers.forEach(player => {
                rosterHtml += `<li><span class="player-name">${player.psnId}</span> <span class="player-pos">${player.primaryPosition}</span></li>`;
            });

            const teamCard = `
                <div class="team-card">
                    <h3 class="team-header">
                        ${captain.teamName}
                        <span class="captain-psn">Cap: ${captain.psnId}</span>
                    </h3>
                    <ul class="team-roster">${rosterHtml}</ul>
                </div>`;
            teamsContainerEl.innerHTML += teamCard;
        });

        // 3. Renderizar jugadores disponibles (ordenados y agrupados)
        playersListEl.innerHTML = '';
        const availablePlayers = draft.players
            .filter(p => !p.captainId && !p.isCaptain)
            .sort(sortPlayers); // <-- APLICAMOS LA ORDENACIÓN

        const groupedPlayers = {};
        availablePlayers.forEach(p => {
            if (!groupedPlayers[p.primaryPosition]) {
                groupedPlayers[p.primaryPosition] = [];
            }
            groupedPlayers[p.primaryPosition].push(p);
        });
        
        positionOrder.forEach(pos => {
            if (groupedPlayers[pos] && groupedPlayers[pos].length > 0) {
                let groupHtml = `<div class="position-group"><h3>${pos}</h3>`;
                groupedPlayers[pos].forEach(player => {
                    // Añadimos la posición secundaria si existe
                    const secondaryPos = player.secondaryPosition && player.secondaryPosition !== 'NONE' 
                        ? `<span class="player-sec-pos">(${player.secondaryPosition})</span>` 
                        : '';
                    groupHtml += `<div class="player-item"><span>${player.psnId}</span> ${secondaryPos}</div>`;
                });
                groupHtml += `</div>`;
                playersListEl.innerHTML += groupHtml;
            }
        });
    }
});
