// client.js
document.addEventListener('DOMContentLoaded', () => {
    const loadingEl = document.getElementById('loading');
    const mainContainerEl = document.getElementById('main-container');

    const draftNameEl = document.getElementById('draft-name');
    const currentTeamEl = document.getElementById('current-team');
    const currentPickEl = document.getElementById('current-pick');
    const teamsContainerEl = document.getElementById('teams-container');
    const playersListEl = document.getElementById('players-list');

    // Extraemos el ID del draft de la URL (ej: /?draftId=mi-draft)
    const urlParams = new URLSearchParams(window.location.search);
    const draftId = urlParams.get('draftId');

    if (!draftId) {
        loadingEl.textContent = 'Error: No se ha especificado un ID de draft.';
        return;
    }

    // 1. Conexión WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${window.location.host}`);

    socket.onopen = () => {
        console.log('Conectado al servidor de visualización.');
    };

    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        // Solo actualizamos si el mensaje es para este draft específico
        if (message.draftId === draftId) {
            console.log('Recibida actualización del draft:', message.data);
            renderDraftState(message.data);
        }
    };

    // 2. Carga de datos inicial
    fetch(`/draft-data/${draftId}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('No se encontraron datos para este draft. La selección podría no haber comenzado.');
            }
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

    // 3. Función principal para renderizar el estado
    function renderDraftState(draft) {
        // Actualizar cabecera
        draftNameEl.textContent = draft.name;
        if (draft.status === 'seleccion') {
            const currentCaptain = draft.captains.find(c => c.userId === draft.selection.order[draft.selection.turn]);
            currentTeamEl.textContent = currentCaptain ? currentCaptain.teamName : 'N/A';
            currentPickEl.textContent = draft.selection.currentPick;
        } else {
             currentTeamEl.textContent = 'Finalizado';
             currentPickEl.textContent = '---';
        }

        // Renderizar equipos
        teamsContainerEl.innerHTML = '';
        draft.captains.forEach(captain => {
            const teamPlayers = draft.players
                .filter(p => p.captainId === captain.userId)
                .sort((a, b) => a.primaryPosition.localeCompare(b.primaryPosition) || a.psnId.localeCompare(b.psnId));

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

        // Renderizar jugadores disponibles
        playersListEl.innerHTML = '';
        const availablePlayers = draft.players.filter(p => !p.captainId && !p.isCaptain);
        availablePlayers.forEach(player => {
            const playerItem = `<div class="player-item">${player.psnId} (${player.primaryPosition})</div>`;
            playersListEl.innerHTML += playerItem;
        });
    }
});
