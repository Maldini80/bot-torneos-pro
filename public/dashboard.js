// dashboard.js - Controlador principal del dashboard (Versión standalone)

// ===== TRADUCCIONES INTEGRADAS =====
const translations = {
    es: {
        nav: { active: 'Activos', history: 'Historial', home: 'Inicio', tournaments: 'Torneos' },
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
            viewDraftBoard: 'Tablero Original',
            loading: 'Cargando eventos...',
            error: 'Error al cargar eventos',
            noResults: 'No se encontraron eventos',
            searchPlaceholder: 'Buscar por nombre...'
        },
        status: {
            active: 'En curso', pending: 'Pendiente', completed: 'Finalizado',
            cancelled: 'Cancelado', registration_open: 'Inscripción abierta',
            inscripcion: 'Inscripción abierta', inscripcion_abierta: 'Inscripción abierta',
            en_curso: 'En curso', torneo_generado: 'Torneo generado',
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
        tournaments: {
            openTournaments: 'Torneos Abiertos - Inscríbete en Torneos',
            openDescription: 'Torneos y ligas actualmente abiertas a registro',
            noOpenTournaments: 'No hay torneos abiertos en este momento',
            registerNow: 'Inscribirse Ahora',
            free: 'Gratis',
            paid: 'Pago',
            price: 'Precio',
            teams: 'equipos',
            viewRegistered: 'Ver Inscritos',
            teamsList: 'Equipos Inscritos',
            noTeams: 'No hay equipos inscritos aún',
            loadingTeams: 'Cargando equipos...',
            prompts: {
                teamName: 'Nombre de tu equipo:',
                eafcName: 'Nombre en EAFC:',
                stream: 'Canal de transmisión (opcional):',
                twitter: 'Twitter (sin @, opcional):'
            }
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
            profile: 'Perfil',
            notMember: 'No eres miembro del servidor',
            notMemberDesc: 'Para acceder a todas las funcionalidades, únete a nuestro servidor de Discord',
            joinServer: 'Unirse al Servidor',
            welcome: 'Bienvenido/a',
            loginRequired: 'Debes iniciar sesión para acceder a esta función',
            loginPrompt: 'Inicia sesión para acceder a funciones personalizadas'
        },
        profile: {
            title: 'Mi Perfil',
            verified: 'Verificado',
            notVerified: 'No Verificado',
            verifyNow: 'Verificar Ahora',
            verifyMessage: 'Tu cuenta no está verificada. Vincula tu ID de juego para participar.',
            myTeams: 'Mis Equipos',
            noTeams: 'No perteneces a ningún equipo aún.',
            createTeamHint: '¡Crea el tuyo propio o pide que te fichen!',
            manage: 'Gestionar',
            createTeam: 'Crear Nuevo Equipo',
            manager: 'Manager',
            captain: 'Capitán',
            loading: 'Cargando...',
            error: 'Error cargando tus equipos. Intenta de nuevo.'
        },
        verification: {
            title: 'Verificar Cuenta',
            platform: 'Plataforma',
            playerId: 'ID de Jugador',
            idPlaceholder: 'Ej: User123',
            submit: 'Verificar',
            submitting: 'Verificando...',
            success: '¡Verificación exitosa!',
            error: 'Error en la verificación'
        },
        createTeam: {
            title: 'Fundar un Nuevo Equipo',
            subtitle: 'Define la identidad de tu club',
            league: 'Liga',
            leagueRequired: '*',
            leagueHint: 'Selecciona la liga en la que competirá tu equipo',
            leagueLoading: 'Cargando ligas...',
            leagueNone: 'No hay ligas disponibles',
            leagueError: 'Error al cargar ligas',
            leagueSelect: 'Selecciona una liga',
            leagueValidation: 'Por favor selecciona una liga',
            teamName: 'Nombre del Equipo',
            teamNamePlaceholder: 'Ej: Los Galácticos FC',
            abbreviation: 'Abreviatura (TAG)',
            abbreviationPlaceholder: 'LGF',
            abbreviationHint: 'Exactamente 3 letras',
            twitter: 'Twitter del equipo (Opcional, sin @)',
            twitterPlaceholder: 'vpglightnings',
            twitterHint: 'Opcional - Sin el símbolo @',
            logo: 'URL del Logo (Opcional)',
            logoPlaceholder: 'https://i.imgur.com/...',
            logoHint: 'Opcional - Se usará logo por defecto si se deja vacío',
            preview: 'Vista Previa',
            previewName: 'Nombre del Equipo',
            requestTeam: 'Solicitar Creación de Equipo',
            requesting: 'Enviando solicitud...',
            requestSuccess: '✅ Solicitud enviada!',
            requestSuccessMessage: 'Tu solicitud ha sido enviada a los administradores de Discord.\nRecibirás una notificación cuando sea aprobada o rechazada.\n\nTiempo estimado: 5-30 minutos (dependiendo de disponibilidad de admins)',
            error: 'Error al procesar la solicitud'
        },
        teamManagement: {
            title: 'Gestionar Equipo',
            roster: 'Plantilla (Roster)',
            invitePlayer: 'Fichar Jugador',
            invitePlaceholder: 'ID de Discord (Recomendado) o Usuario',
            invite: 'Invitar',
            inviting: 'Buscando e invitando...',
            inviteSuccess: 'añadido al equipo!',
            inviteError: 'Error al invitar',
            kick: 'Expulsar',
            promote: 'Ascender a Capitán',
            demote: 'Degradar a Miembro',
            confirmKick: '¿Seguro que quieres expulsar a este jugador?',
            member: 'Miembro',
            notVerifiedBadge: 'No verificado',
            loading: 'Cargando plantilla...',
            coCaptainPlaceholder: 'ID de Discord o Usuario'
        },
        matchReport: {
            title: 'Reportar Resultado',
            submit: 'Enviar Reporte',
            success: 'Resultado enviado correctamente',
            error: 'Error al enviar el resultado'
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
            connectionError: 'Error de conexión',
            unknownUser: 'Usuario Desconocido',
            connectionLost: 'Conexión perdida. Reintentando...',
            reconnected: 'Conexión restablecida'
        }
    },
    en: {
        nav: { active: 'Active', history: 'History', home: 'Home', tournaments: 'Tournaments' },
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
            viewDraftBoard: 'Original Board',
            loading: 'Loading events...',
            error: 'Error loading events',
            noResults: 'No events found',
            searchPlaceholder: 'Search by name...'
        },
        status: {
            active: 'In Progress', pending: 'Pending', completed: 'Finished',
            cancelled: 'Cancelled', registration_open: 'Registration Open',
            inscripcion: 'Registration Open', inscripcion_abierta: 'Registration Open',
            en_curso: 'In Progress', torneo_generado: 'Tournament Generated',
            fase_de_grupos: 'Group Stage', octavos: 'Round of 16', cuartos: 'Quarterfinals',
            semifinales: 'Semifinales', final: 'Final', finalizado: 'Finished',
            draft_started: 'Draft Started', picking_phase: 'Picking Phase', draft_completed: 'Draft Completed'
        },
        eventTypes: { tournament: 'Tournament', draft: 'Draft', league: 'League' },
        tournament: {
            format: 'Format', teams: 'Teams', matches: 'Matches',
            classification: 'Classification', calendar: 'Calendar', bracket: 'Bracket',
            teamList: 'Participating Teams', liveMatches: 'Live Matches',
            champion: 'Champion', groups: 'Group Stage', winner: 'Winner'
        },
        tournaments: {
            openTournaments: 'Open Tournaments - Register Now',
            openDescription: 'Currently open tournaments and leagues for registration',
            noOpenTournaments: 'No open tournaments at the moment',
            registerNow: 'Register Now',
            free: 'Free',
            paid: 'Paid',
            price: 'Price',
            teams: 'teams',
            viewRegistered: 'View Registered',
            teamsList: 'Registered Teams',
            noTeams: 'No teams registered yet',
            loadingTeams: 'Loading teams...',
            prompts: {
                teamName: 'Your team name:',
                eafcName: 'Your EAFC team name:',
                stream: 'Stream channel (optional):',
                twitter: 'Twitter (without @, optional):'
            }
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
            profile: 'Profile',
            notMember: 'You are not a server member',
            notMemberDesc: 'To access all features, join our Discord server',
            joinServer: 'Join Server',
            welcome: 'Welcome',
            loginRequired: 'You must login to access this feature',
            loginPrompt: 'Login to access personalized features'
        },
        profile: {
            title: 'My Profile',
            verified: 'Verified',
            notVerified: 'Not Verified',
            verifyNow: 'Verify Now',
            verifyMessage: 'Your account is not verified. Link your game ID to participate.',
            myTeams: 'My Teams',
            noTeams: 'You are not part of any team yet.',
            createTeamHint: 'Create your own or ask to be signed!',
            manage: 'Manage',
            createTeam: 'Create New Team',
            manager: 'Manager',
            captain: 'Captain',
            loading: 'Loading...',
            error: 'Error loading your teams. Try again.'
        },
        verification: {
            title: 'Verify Account',
            platform: 'Platform',
            playerId: 'Player ID',
            idPlaceholder: 'Ex: User123',
            submit: 'Verify',
            submitting: 'Verifying...',
            success: 'Verification successful!',
            error: 'Verification error'
        },
        createTeam: {
            title: 'Found a New Team',
            subtitle: 'Define your club identity',
            league: 'League',
            leagueRequired: '*',
            leagueHint: 'Select the league your team will compete in',
            leagueLoading: 'Loading leagues...',
            leagueNone: 'No leagues available',
            leagueError: 'Error loading leagues',
            leagueSelect: 'Select a league',
            leagueValidation: 'Please select a league',
            teamName: 'Team Name',
            teamNamePlaceholder: 'FC Barcelona',
            abbreviation: 'Abbreviation (TAG)',
            abbreviationPlaceholder: 'FCB',
            abbreviationHint: 'Exactly 3 letters',
            twitter: 'Team Twitter (Optional, without @)',
            twitterPlaceholder: 'vpglightnings',
            twitterHint: 'Optional - Without @ symbol',
            logo: 'Logo URL (Optional)',
            logoPlaceholder: 'https://i.imgur.com/...',
            logoHint: 'Optional - Default logo will be used if left empty',
            preview: 'Preview',
            previewName: 'Team Name',
            requestTeam: 'Request Team Creation',
            requesting: 'Sending request...',
            requestSuccess: '✅ Request sent!',
            requestSuccessMessage: 'Your request has been sent to Discord administrators.\nYou will receive a notification when it is approved or rejected.\n\nEstimated time: 5-30 minutes (depending on admin availability)',
            error: 'Error processing request'
        },
        teamManagement: {
            title: 'Manage Team',
            roster: 'Roster',
            invitePlayer: 'Sign Player',
            invitePlaceholder: 'Discord ID (Recommended) or Username',
            invite: 'Invite',
            inviting: 'Searching and inviting...',
            inviteSuccess: 'added to team!',
            inviteError: 'Error inviting',
            kick: 'Kick',
            promote: 'Promote to Captain',
            demote: 'Demote to Member',
            confirmKick: 'Are you sure you want to kick this player?',
            member: 'Member',
            notVerifiedBadge: 'Not verified',
            loading: 'Loading roster...',
            coCaptainPlaceholder: 'Discord ID or Username'
        },
        matchReport: {
            title: 'Report Match Result',
            submit: 'Submit Report',
            success: 'Result submitted successfully',
            error: 'Error submitting result'
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
            connectionError: 'Connection error',
            unknownUser: 'Unknown User',
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
            console.log('🔍 [DEBUG] Auth Response:', JSON.stringify(data, null, 2));
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

        console.log('[DEBUG] Rendering User Profile:', {
            username: this.currentUser.username,
            global: this.currentUser.global_name,
            avatar: avatarUrl
        });

        userAvatar.src = avatarUrl;
        userAvatar.onerror = () => { userAvatar.src = 'https://cdn.discordapp.com/embed/avatars/0.png'; }; // Fallback

        const displayName = this.currentUser.global_name || this.currentUser.username || 'Usuario';
        userName.textContent = displayName;

        // Force update just in case
        setTimeout(() => {
            document.getElementById('user-name').textContent = displayName;
        }, 100);

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

        // Setup language selector
        this.setupLanguageSelector();

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
                        alert(this.t('verification.success'));
                        window.location.reload();
                    } else {
                        const err = await res.json();
                        alert(this.t('verification.error') + ': ' + (err.error || ''));
                        if (submitBtn) submitBtn.disabled = false;
                    }
                } catch (e) {
                    alert(this.t('messages.connectionError'));
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
        console.log('[DEBUG] Opening Profile Modal. CurrentUser:', this.currentUser);
        const modal = document.getElementById('profile-modal');
        modal.classList.remove('hidden');

        const nameElement = document.getElementById('profile-username-large');
        const avatarElement = document.getElementById('profile-avatar-large');

        if (this.currentUser) {
            nameElement.textContent = this.currentUser.global_name || this.currentUser.username;

            const avatarHash = this.currentUser.avatar;
            const userId = this.currentUser.id;
            let avatarUrl = 'https://cdn.discordapp.com/embed/avatars/0.png';

            if (avatarHash) {
                // Check if animated GIF
                const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
                avatarUrl = `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}`;
            }

            console.log(`[DEBUG] Setting Avatar URL: ${avatarUrl}`);
            avatarElement.src = avatarUrl;

            // Si falla la carga, poner default
            avatarElement.onerror = () => {
                console.warn('[Avatar] Failed to load, using default.');
                avatarElement.src = 'https://cdn.discordapp.com/embed/avatars/0.png';
            };
        } else {
            nameElement.textContent = 'Usuario Desconocido';
            avatarElement.src = 'https://cdn.discordapp.com/embed/avatars/0.png';
        }

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
        this.translatePage();
    }

    async loadMyTeams() {
        const container = document.getElementById('my-teams-container');
        const createBtn = document.getElementById('create-team-btn');
        container.innerHTML = this.generateSkeletonTeamCards(2);

        try {
            const response = await fetch('/api/user/teams');
            if (!response.ok) throw new Error('Error al cargar equipos');

            const data = await response.json();
            console.log('🔍 [DEBUG] Teams Response:', JSON.stringify(data, null, 2));
            console.log('🔍 [DEBUG] this.currentUser:', this.currentUser);
            // FIX: Use this.currentUser.id instead of just this.currentUser
            const userId = this.currentUser?.id;
            const hasManagedTeam = data.teams.some(team => team.managerId === userId);

            // Hide Create Button if user manages a team
            if (createBtn) {
                if (hasManagedTeam) {
                    createBtn.style.display = 'none';
                } else {
                    createBtn.style.display = 'block';
                    createBtn.onclick = () => {
                        document.getElementById('profile-modal').classList.add('hidden');
                        document.getElementById('create-team-modal').classList.remove('hidden');
                    };
                }
            }

            if (data.teams && data.teams.length > 0) {
                container.innerHTML = data.teams.map(team => {
                    const roleLabel = team.managerId === this.currentUser.id
                        ? `👑 ${this.t('profile.manager')}`
                        : `🧢 ${this.t('profile.captain')}`;
                    return `
                    <div class="team-card-mini">
                        <img src="${team.logoUrl}" alt="${team.name}" class="team-logo-mini" onerror="this.src='https://i.imgur.com/2M7540p.png'">
                        <div class="team-info-mini">
                            <span class="team-name">${team.name}</span>
                            <span class="team-role-badge">${roleLabel}</span>
                        </div>
                        <button class="action-btn manage-team-btn" onclick="dashboard.openTeamManagement('${team._id}', '${team.name}', '${team.logoUrl || ''}')">
                            ⚙️ ${this.t('profile.manage')}
                        </button>
                    </div>
                `}).join('');
            } else {
                container.innerHTML = `
                <div class="empty-state-teams">
                    <p>${this.t('profile.noTeams')}</p>
                    <p class="sub-text">${this.t('profile.createTeamHint')}</p>
                </div>
            `;
            }
        } catch (e) {
            console.error('Error loading teams:', e);
            container.innerHTML = `<p class="error-message">${this.t('profile.error')}</p>`;
        }
    }

    setupLanguageSelector() {
        const langButtons = document.querySelectorAll('.lang-btn');
        langButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentLang = btn.dataset.lang;
                localStorage.setItem('preferredLang', this.currentLang);
                langButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.translatePage();
            });
        });

        // Load saved language preference
        const savedLang = localStorage.getItem('preferredLang') || 'es';
        this.currentLang = savedLang;
        langButtons.forEach(btn => {
            if (btn.dataset.lang === savedLang) {
                btn.classList.add('active');
            }
        });
    }

    // Helper function for translations
    t(key) {
        const keys = key.split('.');
        let value = translations[this.currentLang || 'es'];
        for (const k of keys) {
            value = value?.[k];
        }
        return value || key;
    }

    // Translate all elements with data-i18n attributes
    translatePage() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translation = this.t(key);
            if (translation !== key) { // Only update if translation exists
                el.textContent = translation;
            }
        });

        // Translate placeholders
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            const translation = this.t(key);
            if (translation !== key) {
                el.placeholder = translation;
            }
        });
    }

    async setupCreateTeamForm() {
        // Load available leagues
        const leagueSelect = document.getElementById('team-league');
        if (leagueSelect) {
            try {
                const res = await fetch('/api/leagues');
                const data = await res.json();

                if (data.success && data.leagues.length > 0) {
                    leagueSelect.innerHTML = `<option value="">${this.t('createTeam.leagueSelect')}</option>` +
                        data.leagues.map(league => `<option value="${league}">${league}</option>`).join('');
                } else {
                    leagueSelect.innerHTML = `<option value="">${this.t('createTeam.leagueNone')}</option>`;
                    leagueSelect.disabled = true;
                }
            } catch (error) {
                console.error('Error loading leagues:', error);
                leagueSelect.innerHTML = `<option value="">${this.t('createTeam.leagueError')}</option>`;
                leagueSelect.disabled = true;
            }
        }

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
                previewName.textContent = e.target.value || this.t('createTeam.previewName');
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
                btn.textContent = this.t('createTeam.requesting');
                errorBox.classList.add('hidden');

                const data = {
                    league: document.getElementById('team-league').value,
                    teamName: document.getElementById('team-name').value,
                    teamAbbr: document.getElementById('team-abbr').value,
                    teamTwitter: document.getElementById('team-twitter').value,
                    logoUrl: document.getElementById('team-logo').value
                };

                // Validate league selection
                if (!data.league) {
                    errorBox.textContent = this.t('createTeam.leagueValidation');
                    errorBox.classList.remove('hidden');
                    btn.disabled = false;
                    btn.textContent = this.t('createTeam.requestTeam');
                    return;
                }

                try {
                    const res = await fetch('/api/teams/request', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });

                    const result = await res.json();

                    if (res.ok) {
                        // Show success message
                        alert(this.t('createTeam.requestSuccess') + '\n\n' +
                            this.t('createTeam.requestSuccessMessage'));

                        // Close modal and refresh
                        document.getElementById('create-team-modal').classList.add('hidden');
                        form.reset();
                        // Optionally reload after a delay to show pending status
                        setTimeout(() => window.location.reload(), 1000);
                    } else {
                        throw new Error(result.error);
                    }
                } catch (err) {
                    errorBox.textContent = err.message;
                    errorBox.classList.remove('hidden');
                    btn.disabled = false;
                    btn.textContent = this.t('createTeam.requestTeam');
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

    async openTeamManagement(teamId, teamName, logoUrl) {
        this.currentManagingTeamId = teamId;
        const modal = document.getElementById('manage-team-modal');
        const title = document.getElementById('manage-team-name');
        const teamLogo = modal.querySelector('.team-logo-large') || document.createElement('img'); // Fallback if not exists

        // Fix: Update team logo in modal if element exists
        const logoImg = document.getElementById('manage-team-logo');
        if (logoImg) {
            logoImg.src = logoUrl || 'https://i.imgur.com/2M7540p.png';
        }

        const rosterList = document.getElementById('roster-list');
        const inviteMsg = document.getElementById('invite-message');

        modal.classList.remove('hidden');
        title.textContent = teamName;
        rosterList.innerHTML = this.generateSkeletonTableRows(5);
        inviteMsg.classList.add('hidden');
        inviteMsg.textContent = '';

        // Load Roster
        await this.loadRoster(teamId);

        // Setup Invite Form
        const inviteForm = document.getElementById('invite-player-form');
        const inviteInput = document.getElementById('invite-input');
        inviteForm.onsubmit = (e) => this.handleInvite(e);

        // Autocomplete Logic
        let debounceTimer;
        inviteInput.oninput = (e) => {
            const query = e.target.value;
            if (query.length < 2) return;

            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => {
                try {
                    const res = await fetch(`/api/search-verified-users?q=${encodeURIComponent(query)}`);
                    const data = await res.json();

                    const datalist = document.getElementById('users-list');
                    datalist.innerHTML = '';

                    data.results.forEach(user => {
                        const option = document.createElement('option');
                        option.value = user.discordId; // El valor que se enviará es el ID
                        // Texto visible en algunos navegadores: "Username (ID)"
                        option.label = `${user.username} (ID: ${user.discordId})`;
                        datalist.appendChild(option);
                    });
                } catch (err) {
                    console.error('Error searching:', err);
                }
            }, 300);
        };

        // Close Modal Setup
        const closeBtn = document.querySelector('.close-manage-team');
        closeBtn.onclick = () => {
            modal.classList.add('hidden');
            this.currentManagingTeamId = null;
        };
    }

    // ===== SKELETON LOADER HELPERS =====
    generateSkeletonEventCards(count = 3) {
        return Array(count).fill(0).map(() => `
            <div class="event-card skeleton-event-card skeleton"></div>
        `).join('');
    }

    generateSkeletonTableRows(count = 5) {
        return Array(count).fill(0).map(() => `
            <div class="skeleton-table-row skeleton"></div>
        `).join('');
    }

    generateSkeletonTeamCards(count = 3) {
        return Array(count).fill(0).map(() => `
            <div class="team-card skeleton-team-card skeleton"></div>
        `).join('');
    }

    async loadRoster(teamId) {
        const rosterList = document.getElementById('roster-list');
        try {
            const res = await fetch(`/api/teams/${teamId}/roster`);
            const data = await res.json();

            if (res.ok) {
                const isDraftTeam = data.roster.some(m => m.isDraft);
                const inviteForm = document.getElementById('invite-player-form');
                if (inviteForm) {
                    inviteForm.style.display = (isDraftTeam || !data.isManager) ? 'none' : 'flex';
                }

                rosterList.innerHTML = data.roster.map(member => this.renderRosterItem(member, data.isManager)).join('');

                // Update Co-Captain UI
                const coCaptain = data.roster.find(m => m.role === 'co-captain');
                const infoDiv = document.getElementById('tm-cocaptain-info');
                const nameSpan = document.getElementById('tm-cocaptain-name');
                if (infoDiv && nameSpan) {
                    if (coCaptain) {
                        infoDiv.classList.remove('hidden');
                        nameSpan.textContent = coCaptain.username; // + maybe ID?
                    } else {
                        infoDiv.classList.add('hidden');
                    }
                }

                // Check if team is in active tournaments to show/hide co-captain section
                await this.checkAndToggleCoCaptainSection(teamId);
            } else {
                rosterList.innerHTML = `<p class="error-message">${data.error}</p>`;
            }
        } catch (e) {
            rosterList.innerHTML = '<p class="error-message">Error cargando plantilla.</p>';
        }
    }

    renderRosterItem(member, amIManager) {
        const isMe = member.id === this.currentUser.id;
        let actions = '';

        if (!isMe) {
            if (member.isDraft) {
                // Draft Controls
                if (amIManager && member.role !== 'manager') {
                    actions += `<button class="icon-btn" style="background: rgba(255, 152, 0, 0.2); border-color: rgba(255, 152, 0, 0.5); color: #ff9800" title="Poner Strike" onclick="dashboard.requestDraftStrike('${member.id}')">⚠️</button>`;
                    actions += `<button class="icon-btn" style="background: rgba(33, 150, 243, 0.2); border-color: rgba(33, 150, 243, 0.5); color: #2196F3" title="Sustituir Jugador" onclick="dashboard.openSubstituteModal('${member.id}')">🔄</button>`;
                }
            } else {
                // Normal Teams Controls
                const canKick = amIManager || (this.userRoles.includes('captain') && member.role === 'member');
                if (canKick) {
                    if (amIManager) {
                        if (member.role === 'member') {
                            actions += `<button class="icon-btn promote-btn" title="Ascender a Capitán" onclick="dashboard.promotePlayer('${member.id}', 'captain')">⬆️</button>`;
                        } else if (member.role === 'captain') {
                            actions += `<button class="icon-btn demote-btn" title="Degradar a Miembro" onclick="dashboard.promotePlayer('${member.id}', 'member')">⬇️</button>`;
                        }
                    }
                    actions += `<button class="icon-btn kick-btn" title="Expulsar" onclick="dashboard.kickPlayer('${member.id}')">❌</button>`;
                }
            }
        }

        const roleBadge = member.role === 'manager' ? '👑' : (member.role === 'captain' ? '🧢' : '👤');
        const roleName = member.role === 'manager' ? 'Manager' : (member.role === 'captain' ? 'Capitán' : 'Miembro');

        let draftInfoHtml = '';
        if (member.isDraft && amIManager && member.role !== 'manager') {
            draftInfoHtml = `
            <div style="font-size: 0.85em; color: #aaa; margin-top: 6px; display: flex; gap: 10px; background: rgba(255,255,255,0.05); padding: 5px 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1);">
                ${member.primaryPosition ? `<span title="Posición">📍 ${member.primaryPosition}</span>` : ''}
                ${member.whatsapp ? `<span title="WhatsApp">📱 ${member.whatsapp}</span>` : ''}
                ${member.strikes > 0 ? `<span style="color:#ff9800" title="Strikes">⚠️ ${member.strikes} Stripes</span>` : ''}
            </div>`;
        }

        return `
            <div class="roster-item">
                <div class="roster-user-info">
                    <img src="${member.avatar}" class="avatar-small">
                    <div class="user-details" style="width: 100%;">
                        <span class="user-name">${member.username}</span>
                        <div class="user-badges">
                            <span class="role-badge ${member.role}">${roleBadge} ${roleName}</span>
                            ${member.psnId ? `<span class="platform-badge">${(member.platform || 'SYS').toUpperCase()}: ${member.psnId}</span>` : '<span class="unverified-badge">⚠️ No verificado</span>'}
                        </div>
                        ${draftInfoHtml}
                    </div>
                </div>
                <div class="roster-actions">
                    ${actions}
                </div>
            </div>
        `;
    }

    async checkAndToggleCoCaptainSection(teamId) {
        try {
            const res = await fetch(`/api/teams/${teamId}/active-tournaments`);
            const data = await res.json();

            const coCaptainSection = document.querySelector('.manage-section:has(#tm-cocaptain-input)');
            if (coCaptainSection) {
                if (data.hasActiveTournaments) {
                    coCaptainSection.style.display = 'block';
                } else {
                    coCaptainSection.style.display = 'none';
                }
            }
        } catch (e) {
            console.warn('Error checking active tournaments:', e);
            // If error, show section by default
        }
    }

    async handleInvite(e) {
        e.preventDefault();
        const input = document.getElementById('invite-input');
        const msg = document.getElementById('invite-message');
        const btn = e.target.querySelector('button');

        const usernameOrId = input.value.trim();
        if (!usernameOrId) return;

        btn.disabled = true;
        msg.textContent = 'Buscando e invitando...';
        msg.className = 'status-message';
        msg.classList.remove('hidden');

        try {
            const res = await fetch(`/api/teams/${this.currentManagingTeamId}/invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usernameOrId })
            });
            const data = await res.json();

            if (res.ok) {
                msg.textContent = `✅ ¡${data.user.username} añadido al equipo!`;
                msg.className = 'status-message success';
                input.value = '';
                this.loadRoster(this.currentManagingTeamId);
            } else {
                msg.textContent = `❌ ${data.error}`;
                msg.className = 'status-message error';
            }
        } catch (error) {
            msg.textContent = '❌ Error de conexión';
            msg.className = 'status-message error';
        }
        btn.disabled = false;
    }

    async requestDraftStrike(playerId) {
        const reason = prompt(`⚠️ Escribe el motivo para poner un STRIKE. Esta acción será notificada a los administradores:`);
        if (!reason) return;

        const teamIdParts = this.currentManagingTeamId.split('_'); // draft_XYZ_capId
        if (teamIdParts.length < 3) return console.error('Invalid draft team ID');
        const draftId = teamIdParts[1];

        try {
            const res = await fetch('/api/draft/strike', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ draftId, playerId, reason })
            });
            const data = await res.json();

            if (res.ok && data.success) {
                alert('✅ ' + data.message);
                this.loadRoster(this.currentManagingTeamId);
            } else {
                alert('❌ ' + (data.error || 'Hubo un error al procesar el strike.'));
            }
        } catch (e) {
            console.error('Error strike:', e);
            alert('❌ Error de conexión al solicitar el strike.');
        }
    }

    async openSubstituteModal(playerId) {
        const teamIdParts = this.currentManagingTeamId.split('_');
        if (teamIdParts.length < 3) return;
        const draftId = teamIdParts[1];

        const select = document.getElementById('substitute-in-player-id');
        select.innerHTML = '<option value="" disabled selected>Cargando agentes libres...</option>';
        document.getElementById('substitute-out-player-id').value = playerId;
        document.getElementById('substitute-reason').value = '';
        document.getElementById('substitute-status').className = '';
        document.getElementById('substitute-status').textContent = '';

        document.getElementById('substitute-modal').classList.remove('hidden');

        try {
            const res = await fetch(`/api/draft/free-agents/${draftId}`);
            const data = await res.json();

            if (res.ok && data.success) {
                if (data.freeAgents.length === 0) {
                    select.innerHTML = '<option value="" disabled selected>No hay agentes libres disponibles</option>';
                } else {
                    select.innerHTML = '<option value="" disabled selected>Selecciona un jugador...</option>' +
                        data.freeAgents.map(p => `<option value="${p.id}">${p.username} (${p.primaryPosition || 'N/A'}) - ${p.platform || 'N/A'}</option>`).join('');
                }
            } else {
                select.innerHTML = '<option value="" disabled>Error al cargar libres</option>';
            }
        } catch (e) {
            select.innerHTML = '<option value="" disabled>Error de conexión</option>';
        }

        const form = document.getElementById('substitute-form');
        form.onsubmit = async (e) => {
            e.preventDefault();
            const inPlayerId = select.value;
            const reason = document.getElementById('substitute-reason').value;
            const btn = form.querySelector('button');
            const status = document.getElementById('substitute-status');

            if (!inPlayerId) return;

            btn.disabled = true;
            status.textContent = 'Enviando solicitud...';
            status.className = 'status-message';

            try {
                const submitRes = await fetch('/api/draft/substitute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ draftId, outPlayerId: playerId, inPlayerId, reason })
                });
                const submitData = await submitRes.json();

                if (submitRes.ok && submitData.success) {
                    status.textContent = '✅ ' + submitData.message;
                    status.className = 'status-message success';
                    setTimeout(() => {
                        document.getElementById('substitute-modal').classList.add('hidden');
                    }, 3000);
                } else {
                    status.textContent = '❌ ' + (submitData.error || 'Error en la solicitud');
                    status.className = 'status-message error';
                    btn.disabled = false;
                }
            } catch (err) {
                status.textContent = '❌ Error de conexión';
                status.className = 'status-message error';
                btn.disabled = false;
            }
        };
    }

    async kickPlayer(userId) {
        if (!confirm('¿Seguro que quieres expulsar a este jugador?')) return;

        try {
            const res = await fetch(`/api/teams/${this.currentManagingTeamId}/kick`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });
            if (res.ok) {
                this.loadRoster(this.currentManagingTeamId);
            } else {
                const data = await res.json();
                alert(data.error);
            }
        } catch (e) {
            alert('Error al expulsar');
        }
    }

    async promotePlayer(userId, role) {
        try {
            const res = await fetch(`/api/teams/${this.currentManagingTeamId}/promote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, role })
            });
            if (res.ok) {
                this.loadRoster(this.currentManagingTeamId);
            } else {
                const data = await res.json();
                alert(data.error);
            }
        } catch (e) {
            alert('Error al cambiar rol');
        }
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
            if (sectionId === 'open-tournaments') {
                loadOpenTournaments();
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
            ${event.id.startsWith('draft-') ? `
            <div style="margin-top: 10px;">
                <button class="secondary-btn" style="width: 100%; font-size: 0.8em; padding: 6px;" onclick="event.stopPropagation(); window.location.href='/index.html?draftId=${event.id.replace('draft-', '')}'">
                    📋 ${t(this.currentLang, 'dashboard.viewDraftBoard')}
                </button>
            </div>` : ''}
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
            const date = event.createdAt ? new Date(event.createdAt).toLocaleDateString() : '—';

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
                        ${event.id.startsWith('draft-') ? `
                        <button class="btn-view" style="margin-top: 4px; background: rgba(0,246,255,0.15); border-color: rgba(0,246,255,0.3);" onclick="window.location.href='/index.html?draftId=${event.id.replace('draft-', '')}'">
                            📋 ${t(this.currentLang, 'dashboard.viewDraftBoard')}
                        </button>` : ''}
                    </td>
                </tr>
            `;
        }).join('');

        mobileContainer.innerHTML = allEvents.map(event => {
            const typeLabel = t(this.currentLang, `eventTypes.${event.type}`);
            const statusLabel = t(this.currentLang, `status.${event.status}`);
            const date = event.createdAt ? new Date(event.createdAt).toLocaleDateString() : '—';

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
                    // Importante: también recargar la sección de torneos abiertos (inscripciones)
                    if (typeof loadOpenTournaments === 'function') {
                        loadOpenTournaments();
                    }
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

// ======================================
// INSCRIPCIÓN A TORNEOS
// ======================================

// Función para cargar torneos abiertos
async function loadOpenTournaments() {
    try {
        const response = await fetch('/api/tournaments/open', {
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Error al cargar torneos');
        }

        const data = await response.json();
        const tournaments = data.tournaments || [];

        const grid = document.getElementById('open-tournaments-grid');
        const emptyState = document.getElementById('no-open-tournaments');

        if (!grid || !emptyState) return; // Protección

        if (tournaments.length === 0) {
            grid.classList.add('hidden');
            emptyState.classList.remove('hidden');
            return;
        }

        grid.classList.remove('hidden');
        emptyState.classList.add('hidden');

        // Obtener idioma actual y traducciones dinámicas
        const currentLang = window.dashboard?.currentLang || 'es';
        const t = (key) => window.t ? window.t(currentLang, key) : key;
        const tr = window.dashboard?.translations?.[currentLang]?.tournaments || {};

        grid.innerHTML = tournaments.map(tour => {
            // Traducir tipo de inscripción y etiquetas
            const isPaid = tour.isPaid;
            const isDraft = (tour.tipo || '').toLowerCase() === 'draft' || tour.isDraft === true;
            const inscriptionLabel = isPaid ? (tr.paid || 'Pago') : (tr.free || 'Gratis');
            const priceLabel = tr.price || 'Precio';
            const teamsLabel = isDraft ? (tr.players || 'jugadores') : (tr.teams || 'equipos');
            const viewLabel = isDraft ? (tr.viewDraft || 'Ver Tablero') : (tr.viewRegistered || 'Ver Inscritos');
            const registerLabel = isDraft ? (tr.registerDraft || 'Participar') : (tr.registerNow || 'Inscribirse Ahora');

            // Determinar la información a mostrar
            let infoTeamsHtml = '';
            if (isDraft) {
                // Drafts: solo mostrar el número de inscritos
                infoTeamsHtml = `<span>📊 ${tour.playersCount || 0} ${teamsLabel} inscritos</span>`;
            } else {
                // Torneos: mostrar current/max
                infoTeamsHtml = `<span>📊 ${tour.teamsCount || 0}/${tour.maxTeams || '∞'} ${teamsLabel}</span>`;
            }

            return `
            <div class="event-card">
                <div class="event-card-header">
                    <h3>${escapeHtml(tour.nombre)}</h3>
                    <span class="tournament-badge ${isPaid ? 'paid' : 'free'}">
                        ${inscriptionLabel}
                    </span>
                </div>
                <div class="event-card-body">
                    <p><strong>${isDraft ? 'DRAFT' : tour.tipo}</strong></p>
                    ${isPaid ? `<p>💰 ${priceLabel}: ${tour.entryFee}€</p>` : ''}
                    <div class="tournament-info">
                        ${infoTeamsHtml}
                        <span>🎮 ${tour.format ? tour.format.toUpperCase() : 'EAFC'}</span>
                    </div>
                    <div class="tournament-actions">
                        <button class="secondary-btn btn-view-event" onclick="window.location.href='/index.html?${isDraft ? 'draftId' : 'tournamentId'}=${tour.shortId}'">
                            👁️ ${viewLabel}
                        </button>
                        <button class="register-btn btn-join-event" onclick="${isDraft ? `openDraftRegistrationModal('${tour.shortId}')` : `openRegistrationModal('${tour.shortId}', ${isPaid}, '${currentLang}')`}">
                            ⚽ ${registerLabel}
                        </button>
                    </div>
                </div>
            </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error cargando torneos:', error);
    }
}

// Listener para recargar torneos al cambiar de idioma
document.addEventListener('click', (e) => {
    if (e.target.matches('.lang-btn')) {
        setTimeout(loadOpenTournaments, 100); // Pequeño delay para asegurar que el idioma cambió
    }
});

// Función para abrir modal de inscripción
async function openRegistrationModal(tournamentId, isPaid, langCode) {
    const lang = langCode || getCurrentLanguage();
    const tr = window.dashboard?.translations?.[lang]?.tournaments?.prompts || {};

    // TORNEO DE PAGO - Sistema de doble aprobación
    if (isPaid) {
        // 1. Nombre del Equipo (sirve para EAFC también)
        const teamName = prompt(tr.teamName || 'Nombre de tu equipo:');
        if (!teamName) return;

        // 2. Canal de Stream (Opcional)
        const streamChannel = prompt(tr.stream || 'Canal de transmisión (opcional):') || '';

        // Enviamos datos simplificados (Twitter vacío, EAFC = TeamName)
        await registerTournament(tournamentId, {
            teamName,
            eafcTeamName: teamName,
            streamChannel,
            twitter: ''
        }, null);
    }
    // TORNEO GRATUITO - Requiere equipo VPG
    else {
        // Solo pedimos Stream (Opcional)
        const streamChannel = prompt(tr.stream || 'Canal de transmisión (opcional):') || '';

        await registerTournament(tournamentId, {
            streamChannel,
            twitter: ''
        }, null);
    }
}

// ==== GESTION MODAL DRAFT ====
window.openDraftRegistrationModal = async function (draftId) {
    try {
        // Comprobar si el usuario tiene sesión en la web de forma segura
        const response = await fetch('/api/check-membership');
        const data = await response.json();

        if (!data.authenticated) {
            alert('Debes iniciar sesión con Discord para inscribirte en un Draft.');
            window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname)}`;
            return;
        }

        if (!data.user?.isVerified) {
            alert('Tu cuenta no está verificada. Por favor, ve a la sección "Perfil" de esta web y vincula tu ID de juego para poder participar.');
            return;
        }

        const modal = document.getElementById('draft-registration-modal');
        if (modal) {
            document.getElementById('draft-reg-id').value = draftId;
            document.getElementById('draft-primary-pos').value = '';
            document.getElementById('draft-secondary-pos').value = 'NONE';
            document.getElementById('draft-reg-status').textContent = '';
            modal.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error al comprobar sesión:', error);
        alert('Hubo un error al verificar tu sesión. Inténtalo de nuevo.');
    }
};

window.closeDraftModal = function () {
    const modal = document.getElementById('draft-registration-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
};

// Event listener para el form de Draft
document.addEventListener('DOMContentLoaded', () => {
    const draftForm = document.getElementById('draft-reg-form');
    if (draftForm) {
        draftForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const draftId = document.getElementById('draft-reg-id').value;
            const primaryPos = document.getElementById('draft-primary-pos').value;
            const secondaryPos = document.getElementById('draft-secondary-pos').value;
            const statusEl = document.getElementById('draft-reg-status');
            const submitBtn = draftForm.querySelector('button[type="submit"]');

            if (!primaryPos) {
                statusEl.textContent = 'Debes seleccionar una posición principal.';
                statusEl.style.color = '#f04747';
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Inscribiendo...';
            statusEl.textContent = '';

            try {
                const response = await fetch(`/api/draft/${draftId}/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ primaryPosition: primaryPos, secondaryPosition: secondaryPos })
                });

                const data = await response.json();

                if (response.ok) {
                    statusEl.textContent = data.message;
                    statusEl.style.color = '#43B581';
                    setTimeout(() => {
                        window.closeDraftModal();
                        // Refrescar tarjetas de torneos para actualizar el count
                        loadOpenTournaments();
                    }, 1500);
                } else {
                    throw new Error(data.error || 'Error al inscribirse');
                }
            } catch (err) {
                statusEl.textContent = err.message;
                statusEl.style.color = '#f04747';
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Confirmar Inscripción';
            }
        });
    }
});

// Función para ver equipos inscritos
async function viewRegisteredTeams(shortId) {
    const modal = document.getElementById('teams-modal');
    const container = document.getElementById('teams-list-container');
    const lang = getCurrentLanguage();
    const tr = window.dashboard?.translations?.[lang]?.tournaments || {};

    if (!modal || !container) return;

    modal.classList.remove('hidden');
    container.innerHTML = `<div class="loading-spinner">${tr.loadingTeams || 'Cargando...'}</div>`;
    document.getElementById('teams-modal-title').textContent = tr.teamsList || 'Equipos Inscritos';

    try {
        const response = await fetch(`/api/tournaments/${shortId}/teams`);
        const data = await response.json();

        if (!data.teams || data.teams.length === 0) {
            container.innerHTML = `<p style="text-align: center; color: #888; padding: 20px;">${tr.noTeams || 'No hay equipos inscritos'}</p>`;
            return;
        }

        container.innerHTML = data.teams.map(team => `
            <div style="display: flex; align-items: center; padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <img src="${team.logo}" alt="${team.name}" style="width: 40px; height: 40px; border-radius: 50%; margin-right: 15px; object-fit: cover;">
                <div>
                    <div style="font-weight: bold; color: white;">${escapeHtml(team.name)}</div>
                    <div style="font-size: 0.85em; color: #aaa;">Manager: ${escapeHtml(team.captain)}</div>
                </div>
            </div>
        `).join('');

    } catch (e) {
        console.error('Error viewing teams:', e);
        container.innerHTML = '<p class="error-message">Error cargando equipos</p>';
    }
}

// Live Updates: Actualizar cada 30 segundos
setInterval(loadOpenTournaments, 30000);


// Función para enviar inscripción al backend
async function registerTournament(tournamentId, teamData, paymentProofUrl) {
    try {
        const response = await fetch(`/api/tournaments/${tournamentId}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                teamData,
                paymentProofUrl
            })
        });

        const data = await response.json();

        if (!response.ok) {
            // Error de membresía de Discord
            if (data.requiresDiscordMembership) {
                const lang = getCurrentLanguage();
                const message = data.message?.[lang] || data.message?.es ||
                    (lang === 'es'
                        ? `❌ Debes ser miembro del servidor Discord para inscribirte.\n\n¿Quieres unirte ahora?`
                        : `❌ You must be a member of the Discord server to register.\n\nJoin now?`);

                if (confirm(message)) {
                    window.open(data.inviteUrl || 'https://discord.gg/vpglightnings', '_blank');
                }
                return;
            }

            // Error específico de VPG team
            if (data.requiresVpgTeam) {
                const lang = getCurrentLanguage();
                const message = data.message?.[lang] || data.message?.es || data.error;
                alert(message);
            } else {
                alert(`❌ ${data.error || 'Error al inscribirse'}`);
            }
            return;
        }

        // Éxito
        alert(`✅ ${data.message}`);

        // Recargar torneos
        await loadOpenTournaments();

    } catch (error) {
        console.error('Error registrando:', error);
        alert('❌ Error al procesar la inscripción. Inténtalo de nuevo.');
    }
}

// Helper para escapar HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Helper para obtener idioma actual
function getCurrentLanguage() {
    return document.documentElement.lang || 'es';
}

// Iniciar aplicación
const dashboard = new DashboardApp();
window.dashboard = dashboard;

document.addEventListener('DOMContentLoaded', () => {
    dashboard.init();

    // Cargar torneos abiertos
    loadOpenTournaments();
});
