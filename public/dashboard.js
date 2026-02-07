// dashboard.js - Controlador principal del dashboard (Versión standalone)

// ===== TRADUCCIONES INTEGRADAS =====
const translations = {
    es: {
        nav: { active: 'Activos', history: 'Historial' },
        dashboard: {
            title: 'Dashboard de Eventos',
            activeEvents: 'Eventos Activos',
            noActiveEvents: 'No hay eventos activos en este momento',
            history: 'Historial de Eventos',
            allTypes: 'Todos los tipos',
            tournaments: 'Torneos',
            drafts: 'Drafts',
            search: 'Buscar por nombre...',
            name: 'Nombre',
            type: 'Tipo',
            date: 'Fecha',
            status: 'Estado',
            actions: 'Acciones',
            view: 'Ver',
            loading: 'Cargando eventos...',
            error: 'Error al cargar eventos',
            noResults: 'No se encontraron eventos'
        },
        status: {
            active: 'En curso', pending: 'Pendiente', completed: 'Finalizado',
            cancelled: 'Cancelado', registration_open: 'Inscripción abierta',
            fase_de_grupos: 'Fase de grupos', octavos: 'Octavos', cuartos: 'Cuartos',
            semifinales: 'Semifinales', final: 'Final', finalizado: 'Finalizado'
        },
        eventTypes: { tournament: 'Torneo', draft: 'Draft', league: 'Liguilla' },
        tournament: {
            format: 'Formato', teams: 'Equipos', matches: 'Partidos',
            classification: 'Clasificación', calendar: 'Calendario', bracket: 'Eliminatorias',
            teamList: 'Equipos Participantes', liveMatches: 'Partidos en Directo',
            champion: 'Campeón', groups: 'Fase de Grupos', winner: 'Ganador'
        },
        draft: {
            currentTurn: 'Turno actual', pick: 'Pick', round: 'Ronda', team: 'Equipo',
            availablePlayers: 'Jugadores Disponibles', position: 'Posición',
            primary: 'Primaria', secondary: 'Secundaria', strikes: 'Strikes',
            action: 'Acción', select: 'Seleccionar', myTeam: 'Mi Equipo'
        },
        auth: {
            login: 'Iniciar Sesión con Discord',
            logout: 'Cerrar Sesión',
            notMember: 'No eres miembro del servidor',
            notMemberDesc: 'Para acceder a todas las funcionalidades, únete a nuestro servidor de Discord',
            joinServer: 'Unirse al Servidor',
            welcome: 'Bienvenido/a',
            loginRequired: 'Debes iniciar sesión para acceder a esta función',
            loginPrompt: 'Inicia sesión para acceder a funciones personalizadas'
        },
        common: {
            close: 'Cerrar', back: 'Volver', next: 'Siguiente', previous: 'Anterior',
            page: 'Página', of: 'de', total: 'Total', filters: 'Filtros',
            clear: 'Limpiar', apply: 'Aplicar', createdAt: 'Creado el',
            updatedAt: 'Actualizado el', loading: 'Cargando...'
        },
        messages: {
            noData: 'No hay datos disponibles',
            loadingError: 'Error al cargar los datos',
            connectionLost: 'Conexión perdida. Reintentando...',
            reconnected: 'Conexión restablecida'
        }
    },
    en: {
        nav: { active: 'Active', history: 'History' },
        dashboard: {
            title: 'Events Dashboard',
            activeEvents: 'Active Events',
            noActiveEvents: 'No active events at the moment',
            history: 'Events History',
            allTypes: 'All types',
            tournaments: 'Tournaments',
            drafts: 'Drafts',
            search: 'Search by name...',
            name: 'Name',
            type: 'Type',
            date: 'Date',
            status: 'Status',
            actions: 'Actions',
            view: 'View',
            loading: 'Loading events...',
            error: 'Error loading events',
            noResults: 'No events found'
        },
        status: {
            active: 'In progress', pending: 'Pending', completed: 'Completed',
            cancelled: 'Cancelled', registration_open: 'Registration open',
            fase_de_grupos: 'Group stage', octavos: 'Round of 16', cuartos: 'Quarterfinals',
            semifinales: 'Semifinals', final: 'Final', finalizado: 'Finished'
        },
        eventTypes: { tournament: 'Tournament', draft: 'Draft', league: 'League' },
        tournament: {
            format: 'Format', teams: 'Teams', matches: 'Matches',
            classification: 'Classification', calendar: 'Calendar', bracket: 'Bracket',
            teamList: 'Participating Teams', liveMatches: 'Live Matches',
            champion: 'Champion', groups: 'Group Stage', winner: 'Winner'
        },
        draft: {
            currentTurn: 'Current turn', pick: 'Pick', round: 'Round', team: 'Team',
            availablePlayers: 'Available Players', position: 'Position',
            primary: 'Primary', secondary: 'Secondary', strikes: 'Strikes',
            action: 'Action', select: 'Select', myTeam: 'My Team'
        },
        auth: {
            login: 'Login with Discord',
            logout: 'Logout',
            notMember: 'You are not a server member',
            notMemberDesc: 'To access all features, join our Discord server',
            joinServer: 'Join Server',
            welcome: 'Welcome',
            loginRequired: 'You must login to access this feature',
            loginPrompt: 'Login to access personalized features'
        },
        common: {
            close: 'Close', back: 'Back', next: 'Next', previous: 'Previous',
            page: 'Page', of: 'of', total: 'Total', filters: 'Filters',
            clear: 'Clear', apply: 'Apply', createdAt: 'Created on',
            updatedAt: 'Updated on', loading: 'Loading...'
        },
        messages: {
            noData: 'No data available',
            loadingError: 'Error loading data',
            connectionLost: 'Connection lost. Retrying...',
            reconnected: 'Connection restored'
        }
    }
};

function t(lang, key) {
    const keys = key.split('.');
    let value = translations[lang];
    for (const k of keys) {
        if (value && typeof value === 'object') value = value[k];
        else return key;
    }
    return value || key;
}

function getCurrentLanguage() {
    return localStorage.getItem('preferredLanguage') || 'es';
}

function setCurrentLanguage(lang) {
    localStorage.setItem('preferredLanguage', lang);
}

// ===== DASHBOARD APP =====
class DashboardApp {
    constructor() {
        this.currentLang = getCurrentLanguage();
        this.eventCache = new Map();
        this.ws = null;
        this.currentPage = 1;
        this.currentFilter = 'all';
        this.searchTerm = '';
        this.currentUser = null;
        this.isMember = false;
        this.userRoles = [];
    }

    async checkAuth() {
        try {
            const response = await fetch('/api/check-membership');
            const data = await response.json();

            if (data.authenticated) {
                this.currentUser = data.user;
                this.isMember = data.isMember;
                this.userRoles = data.roles || [];
                this.isVerified = data.user.isVerified; // Store verification status

                this.showUserProfile();

                if (!data.isMember) {
                    this.showNonMemberWarning();
                }
            } else {
                this.showLoginButton();
            }
        } catch (error) {
            console.error('Error checking auth:', error);
            this.showLoginButton();
        }
    }

    showUserProfile() {
        const loginBtn = document.getElementById('login-btn');
        const userProfile = document.getElementById('user-profile');
        const userAvatar = document.getElementById('user-avatar');
        const userName = document.getElementById('user-name');
        const profileBtn = document.getElementById('profile-btn');

        loginBtn.style.display = 'none';
        userProfile.style.display = 'flex';

        const avatarUrl = this.currentUser.avatar
            ? `https://cdn.discordapp.com/avatars/${this.currentUser.id}/${this.currentUser.avatar}.png`
            : 'https://cdn.discordapp.com/embed/avatars/0.png';

        userAvatar.src = avatarUrl;
        userName.textContent = this.currentUser.global_name || this.currentUser.username;

        // Bind Profile Button
        if (profileBtn) {
            profileBtn.onclick = () => this.openProfileModal();
        }

        // Setup Logout
        document.getElementById('logout-btn').onclick = () => {
            window.location.href = '/logout';
        };

        // Setup Modal Close
        document.querySelector('.close-profile').onclick = () => {
            document.getElementById('profile-modal').classList.add('hidden');
        };

        // Close on outside click
        window.addEventListener('click', (e) => {
            const modal = document.getElementById('profile-modal');
            if (e.target === modal) modal.classList.add('hidden');
        });

        this.setupVerificationForm();
        this.setupCreateTeamForm();
    }

    setupVerificationForm() {
        const verifyBtn = document.getElementById('start-verification-btn');
        if (verifyBtn) {
            verifyBtn.onclick = () => {
                document.getElementById('profile-modal').classList.add('hidden');
                document.getElementById('verification-modal').classList.remove('hidden');
            };
        }

        const form = document.getElementById('verification-form');
        if (form) {
            form.onsubmit = async (e) => {
                e.preventDefault();
                const platform = document.getElementById('verify-platform').value;
                const psnId = document.getElementById('verify-id').value;
                const submitBtn = form.querySelector('button[type="submit"]');

                if (submitBtn) submitBtn.disabled = true;

                try {
                    const res = await fetch('/api/user/verify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ platform, psnId })
                    });

                    if (res.ok) {
                        alert('¡Cuenta verificada con éxito!');
                        window.location.reload();
                    } else {
                        const err = await res.json();
                        alert('Error: ' + (err.error || 'Error desconocido'));
                        if (submitBtn) submitBtn.disabled = false;
                    }
                } catch (e) {
                    alert('Error de conexión');
                    if (submitBtn) submitBtn.disabled = false;
                }
            };
        }

        const closeBtn = document.querySelector('.close-verification');
        if (closeBtn) {
            closeBtn.onclick = () => {
                document.getElementById('verification-modal').classList.add('hidden');
                document.getElementById('profile-modal').classList.remove('hidden');
            };
        }
    }

    async openProfileModal() {
        const modal = document.getElementById('profile-modal');
        modal.classList.remove('hidden');

        document.getElementById('profile-username-large').textContent = this.currentUser.global_name || this.currentUser.username;
        document.getElementById('profile-avatar-large').src = document.getElementById('user-avatar').src;

        const badgesContainer = document.getElementById('profile-status-badges');
        badgesContainer.innerHTML = '';

        if (this.isVerified) {
            badgesContainer.innerHTML += '<span class="status-badge status-completed">✅ Verificado</span>';
            if (this.currentUser.psnId) {
                badgesContainer.innerHTML += `<span class="status-badge">${this.currentUser.platform?.toUpperCase() || 'ID'}: ${this.currentUser.psnId}</span>`;
            }
            document.getElementById('verify-notification').classList.add('hidden');
        } else {
            badgesContainer.innerHTML += '<span class="status-badge status-cancelled">❌ No Verificado</span>';
            document.getElementById('verify-notification').classList.remove('hidden');
        }

        // Load Teams
        this.loadMyTeams();
    }

    async loadMyTeams() {
        const container = document.getElementById('my-teams-container');
        const createBtn = document.getElementById('create-team-btn');
        container.innerHTML = '<div class="loader-spinner"></div>';

        try {
            const response = await fetch('/api/user/teams');
            if (!response.ok) throw new Error('Error al cargar equipos');

            const data = await response.json();
            const hasManagedTeam = data.teams.some(team => team.managerId === this.currentUser.id);

            // Hide Create Button if user manages a team
            if (createBtn) {
                if (hasManagedTeam) {
                    createBtn.style.display = 'none';
                    // Optional: Add a notice
                } else {
                    createBtn.style.display = 'block';
                    createBtn.onclick = () => {
                        document.getElementById('profile-modal').classList.add('hidden');
                        document.getElementById('create-team-modal').classList.remove('hidden');
                    };
                }
            }

            if (data.teams && data.teams.length > 0) {
                container.innerHTML = data.teams.map(team => `
                    <div class="team-card-mini">
                        <img src="${team.logoUrl}" alt="${team.name}" class="team-logo-mini" onerror="this.src='https://i.imgur.com/2M7540p.png'">
                        <div class="team-info-mini">
                            <span class="team-name">${team.name}</span>
                            <span class="team-role-badge">${team.managerId === this.currentUser.id ? '👑 Manager' : '🧢 Capitán'}</span>
                        </div>
                        <button class="action-btn manage-team-btn" onclick="dashboard.openTeamManagement('${team._id}', '${team.name}')">
                            ⚙️ Gestionar
                        </button>
                    </div>
                `).join('');
            } else {
                container.innerHTML = `
                <div class="empty-state-teams">
                    <p>No perteneces a ningún equipo aún.</p>
                    <p class="sub-text">¡Crea el tuyo propio o pide que te fichen!</p>
                </div>
            `;
            }
        } catch (e) {
            console.error('Error loading teams:', e);
            container.innerHTML = '<p class="error-message">Error cargando tus equipos. Intenta de nuevo.</p>';
        }
    }

    setupCreateTeamForm() {
        // Preview Logic
        const logoInput = document.getElementById('team-logo');
        const nameInput = document.getElementById('team-name');
        const previewLogo = document.getElementById('preview-logo');
        const previewName = document.getElementById('preview-name');

        if (logoInput) {
            logoInput.addEventListener('input', (e) => {
                if (e.target.value.startsWith('http')) previewLogo.src = e.target.value;
            });
        }
        if (nameInput) {
            nameInput.addEventListener('input', (e) => {
                previewName.textContent = e.target.value || 'Nombre del Equipo';
            });
        }

        // Form Submit
        const form = document.getElementById('create-team-form');
        if (form) {
            form.onsubmit = async (e) => {
                e.preventDefault();
                const btn = form.querySelector('button[type="submit"]');
                const errorBox = document.getElementById('create-error');

                btn.disabled = true;
                btn.textContent = 'Creando...';
                errorBox.classList.add('hidden');

                const data = {
                    name: document.getElementById('team-name').value,
                    abbreviation: document.getElementById('team-abbr').value,
                    region: document.getElementById('team-region').value,
                    logoUrl: document.getElementById('team-logo').value
                };

                try {
                    const res = await fetch('/api/teams/create', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });

                    const result = await res.json();

                    if (res.ok) {
                        alert('¡Equipo fundado con éxito!');
                        window.location.reload();
                    } else {
                        throw new Error(result.error);
                    }
                } catch (err) {
                    errorBox.textContent = err.message;
                    errorBox.classList.remove('hidden');
                    btn.disabled = false;
                    btn.textContent = 'Fundar Equipo';
                }
            };
        }

        // Close Modal
        const closeBtn = document.querySelector('.close-create-team');
        if (closeBtn) {
            closeBtn.onclick = () => {
                document.getElementById('create-team-modal').classList.add('hidden');
                document.getElementById('profile-modal').classList.remove('hidden');
            };
        }
    }

    openTeamManagement(teamId, teamName) {
        alert(`Próximamente: Panel de Gestión para ${teamName}`);
    }



    showLoginButton() {
        const loginBtn = document.getElementById('login-btn');
        const userProfile = document.getElementById('user-profile');

        loginBtn.style.display = 'flex';
        userProfile.style.display = 'none';

        loginBtn.addEventListener('click', () => {
            window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname)}`;
        });
    }

    showNonMemberWarning() {
        const warningHTML = `
            <div class="non-member-warning">
                <h3>${t(this.currentLang, 'auth.notMember')}</h3>
                <p>${t(this.currentLang, 'auth.notMemberDesc')}</p>
                <a href="https://discord.gg/zEy9ztp8QM" 
                   class="join-server-btn" 
                   target="_blank">
                    ${t(this.currentLang, 'auth.joinServer')}
                </a>
            </div>
        `;

        // Insertar al inicio del main content
        const mainContent = document.querySelector('.dashboard-main');
        mainContent.insertAdjacentHTML('afterbegin', warningHTML);
    }

    async init() {
        console.log('[Dashboard] Iniciando aplicación...');

        await this.checkAuth(); // ← NUEVO: Verificar autenticación primero

        this.setupLanguageSelector();
        this.setupMobileNav();
        this.setupFilters();
        this.setupWebSocket();

        await this.loadActiveEvents();

        // Ocultar loading, mostrar app
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('dashboard-app').classList.remove('hidden');

        this.applyTranslations();
    }

    setupLanguageSelector() {
        const buttons = document.querySelectorAll('.lang-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const lang = btn.getAttribute('data-lang');
                this.switchLanguage(lang);
            });

            if (btn.getAttribute('data-lang') === this.currentLang) {
                btn.classList.add('active');
            }
        });
    }

    switchLanguage(lang) {
        this.currentLang = lang;
        setCurrentLanguage(lang);

        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
        });

        this.applyTranslations();
    }

    applyTranslations() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            el.textContent = t(this.currentLang, key);
        });

        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.placeholder = t(this.currentLang, 'dashboard.search');
        }
    }

    setupMobileNav() {
        const navButtons = document.querySelectorAll('.mobile-nav button');
        navButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const section = btn.getAttribute('data-section');
                this.switchSection(section);

                navButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    switchSection(sectionId) {
        document.querySelectorAll('.view-section').forEach(section => {
            section.classList.remove('active');
        });

        const targetSection = document.getElementById(sectionId);
        if (targetSection) {
            targetSection.classList.add('active');

            if (sectionId === 'history' && document.getElementById('history-tbody').children.length === 0) {
                this.loadHistory();
            }
        }
    }

    setupFilters() {
        const typeFilter = document.getElementById('type-filter');
        const searchInput = document.getElementById('search-input');

        typeFilter.addEventListener('change', () => {
            this.currentFilter = typeFilter.value;
            this.currentPage = 1;
            this.loadHistory();
        });

        let searchTimeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.searchTerm = searchInput.value;
                this.currentPage = 1;
                this.loadHistory();
            }, 500);
        });
    }

    async loadActiveEvents() {
        try {
            const response = await fetch('/api/events/active');
            if (!response.ok) throw new Error('Error al cargar eventos activos');

            const data = await response.json();
            this.renderActiveEvents(data);
        } catch (error) {
            console.error('[Dashboard] Error cargando eventos activos:', error);
            this.showError('active-grid', t(this.currentLang, 'dashboard.error'));
        }
    }

    renderActiveEvents(data) {
        const container = document.getElementById('active-grid');
        const noActiveMsg = document.getElementById('no-active');

        const allEvents = [...data.tournaments, ...data.drafts];

        if (allEvents.length === 0) {
            container.classList.add('hidden');
            noActiveMsg.classList.remove('hidden');
            return;
        }

        container.classList.remove('hidden');
        noActiveMsg.classList.add('hidden');
        container.innerHTML = '';

        allEvents.forEach(event => {
            const card = this.createEventCard(event);
            container.appendChild(card);
        });
    }

    createEventCard(event) {
        const card = document.createElement('div');
        card.className = 'event-card';
        card.onclick = () => this.openEventModal(event.id, event.type);

        const typeLabel = t(this.currentLang, `eventTypes.${event.type}`);
        const statusLabel = t(this.currentLang, `status.${event.status}`);

        let progressInfo = '';
        if (event.type === 'draft' && event.status === 'active') {
            progressInfo = `
                <div class="event-progress">
                    Pick ${event.currentPick || 0}/${event.totalPicks || 0}
                </div>
            `;
        }

        card.innerHTML = `
            <div class="event-card-header">
                <span class="event-type">${typeLabel}</span>
                <span class="event-status status-${event.status}">${statusLabel}</span>
            </div>
            <h3 class="event-name">${event.name}</h3>
            <div class="event-info">
                <span class="event-teams">👥 ${event.teamsCount} ${t(this.currentLang, 'tournament.teams')}</span>
                ${progressInfo}
            </div>
        `;

        return card;
    }

    async loadHistory() {
        try {
            const params = new URLSearchParams({
                page: this.currentPage,
                limit: 20,
                type: this.currentFilter,
                search: this.searchTerm
            });

            const response = await fetch(`/api/events/history?${params}`);
            if (!response.ok) throw new Error('Error al cargar historial');

            const data = await response.json();
            this.renderHistory(data);
            this.renderPagination(data);
        } catch (error) {
            console.error('[Dashboard] Error cargando historial:', error);
            this.showError('history-tbody', t(this.currentLang, 'dashboard.error'));
        }
    }

    renderHistory(data) {
        const tbody = document.getElementById('history-tbody');
        const mobileContainer = document.getElementById('history-mobile');

        const allEvents = [...data.tournaments, ...data.drafts]
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        if (allEvents.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">${t(this.currentLang, 'dashboard.noResults')}</td></tr>`;
            mobileContainer.innerHTML = `<p style="text-align:center; padding: 20px;">${t(this.currentLang, 'dashboard.noResults')}</p>`;
            return;
        }

        tbody.innerHTML = allEvents.map(event => {
            const typeLabel = t(this.currentLang, `eventTypes.${event.type}`);
            const statusLabel = t(this.currentLang, `status.${event.status}`);
            const date = new Date(event.createdAt).toLocaleDateString();

            return `
                <tr>
                    <td>${event.name}</td>
                    <td>${typeLabel}</td>
                    <td>${date}</td>
                    <td><span class="status-badge status-${event.status}">${statusLabel}</span></td>
                    <td>
                        <button class="btn-view" onclick="dashboard.openEventModal('${event.id}', '${event.type}')">
                            ${t(this.currentLang, 'dashboard.view')}
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        mobileContainer.innerHTML = allEvents.map(event => {
            const typeLabel = t(this.currentLang, `eventTypes.${event.type}`);
            const statusLabel = t(this.currentLang, `status.${event.status}`);
            const date = new Date(event.createdAt).toLocaleDateString();

            return `
                <div class="history-item status-${event.status}" onclick="dashboard.openEventModal('${event.id}', '${event.type}')">
                    <div class="history-item-header">
                        <h4>${event.name}</h4>
                        <span class="status-badge">${statusLabel}</span>
                    </div>
                    <div class="history-item-info">
                        <span>${typeLabel}</span>
                        <span>${date}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderPagination(data) {
        const pagination = document.getElementById('pagination');
        const totalPages = Math.ceil(data.total / data.limit);

        if (totalPages <= 1) {
            pagination.innerHTML = '';
            return;
        }

        let html = '';

        if (this.currentPage > 1) {
            html += `<button onclick="dashboard.goToPage(${this.currentPage - 1})">${t(this.currentLang, 'common.previous')}</button>`;
        }

        html += `<span>${t(this.currentLang, 'common.page')} ${this.currentPage} ${t(this.currentLang, 'common.of')} ${totalPages}</span>`;

        if (this.currentPage < totalPages) {
            html += `<button onclick="dashboard.goToPage(${this.currentPage + 1})">${t(this.currentLang, 'common.next')}</button>`;
        }

        pagination.innerHTML = html;
    }

    goToPage(page) {
        this.currentPage = page;
        this.loadHistory();
    }

    async openEventModal(eventId, eventType) {
        // Redirigir a index.html con el parámetro correcto según el tipo
        if (eventType === 'tournament') {
            window.location.href = `/index.html?tournamentId=${eventId}`;
        } else if (eventType === 'draft') {
            window.location.href = `/index.html?draftId=${eventId}`;
        }
    }

    setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${protocol}//${window.location.host}`);

        this.ws.onopen = () => {
            console.log('[Dashboard] WebSocket conectado');
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);

                if (msg.type === 'tournament' || msg.type === 'draft') {
                    this.loadActiveEvents();
                }
            } catch (error) {
                console.error('[Dashboard] Error procesando mensaje WS:', error);
            }
        };

        this.ws.onerror = (error) => {
            console.error('[Dashboard] WebSocket error:', error);
        };

        this.ws.onclose = () => {
            console.log('[Dashboard] WebSocket desconectado. Reintentando...');
            setTimeout(() => this.setupWebSocket(), 5000);
        };
    }

    showError(containerId, message) {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `<p class="error-message">${message}</p>`;
        }
    }
}

// Función global para cerrar modal
window.closeEventModal = function () {
    document.getElementById('event-modal').classList.add('hidden');
};

// Iniciar aplicación
const dashboard = new DashboardApp();
window.dashboard = dashboard;

document.addEventListener('DOMContentLoaded', () => {
    dashboard.init();
});
