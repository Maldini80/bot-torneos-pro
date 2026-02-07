// dashboard.js - Controlador principal del dashboard
import { t, getCurrentLanguage, setCurrentLanguage } from '../src/utils/translations.js';

class DashboardApp {
    constructor() {
        this.currentLang = getCurrentLanguage();
        this.eventCache = new Map();
        this.ws = null;
        this.currentPage = 1;
        this.currentFilter = 'all';
        this.searchTerm = '';
    }

    async init() {
        console.log('[Dashboard] Iniciando aplicación...');

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

            // Marcar el activo
            if (btn.getAttribute('data-lang') === this.currentLang) {
                btn.classList.add('active');
            }
        });
    }

    switchLanguage(lang) {
        this.currentLang = lang;
        setCurrentLanguage(lang);

        // Actualizar botones activos
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
        });

        this.applyTranslations();
    }

    applyTranslations() {
        // Traducir elementos con data-i18n
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            el.textContent = t(this.currentLang, key);
        });

        // Traducir placeholders
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

                // Actualizar botones activos
                navButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    switchSection(sectionId) {
        // Ocultar todas las secciones
        document.querySelectorAll('.view-section').forEach(section => {
            section.classList.remove('active');
        });

        // Mostrar la sección seleccionada
        const targetSection = document.getElementById(sectionId);
        if (targetSection) {
            targetSection.classList.add('active');

            // Si es historial y no se ha cargado, cargarlo
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

        // Debounce para búsqueda
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

        // Desktop/Tablet: Table
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

        // Mobile: Cards
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
        const modal = document.getElementById('event-modal');
        const title = document.getElementById('modal-title');
        const content = document.getElementById('event-content');

        title.textContent = t(this.currentLang, 'common.loading');
        content.innerHTML = '<div class="loading-spinner">Cargando...</div>';
        modal.classList.remove('hidden');

        try {
            // Redirigir a la página específica del tipo de evento
            if (eventType === 'tournament') {
                window.location.href = `/index.html?id=${eventId}`;
            } else if (eventType === 'draft') {
                window.location.href = `/index.html?id=${eventId}`;
            }
        } catch (error) {
            console.error('[Dashboard] Error abriendo evento:', error);
            content.innerHTML = `<p style="color: red;">${t(this.currentLang, 'messages.loadingError')}</p>`;
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

                // Actualizar eventos activos si hay cambios
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
window.dashboard = dashboard; // Exponer globalmente para onclick handlers

document.addEventListener('DOMContentLoaded', () => {
    dashboard.init();
});
