// home-news.js — News display, dynamic video loading, and admin panel for Home

const FALLBACK_VIDEO_HOME = 'https://res.cloudinary.com/dxqky8j6e/video/upload/v1778836034/home-bg_w45ddj.mp4';

// ===== DYNAMIC VIDEO LOADING =====
async function loadDynamicVideo() {
    try {
        const res = await fetch('/api/settings/videos');
        const data = await res.json();
        if (data.video_home) {
            const video = document.getElementById('hero-video');
            if (video) {
                const source = video.querySelector('source');
                if (source && source.src !== data.video_home) {
                    source.src = data.video_home;
                    video.load();
                    video.play().catch(() => {});
                }
            }
        }
    } catch (e) { /* fallback stays */ }
}

// ===== NEWS DISPLAY =====
let newsCache = [];

async function loadNews() {
    try {
        const res = await fetch('/api/news');
        newsCache = await res.json();
        renderNews(newsCache);
    } catch (e) { console.error('Error loading news:', e); }
}

function renderNews(news) {
    const section = document.getElementById('news-section');
    const container = document.getElementById('news-container');
    if (!news || news.length === 0) { section.style.display = 'none'; return; }

    section.style.display = 'block';
    const featured = news.filter(n => n.priority === 'featured');
    const important = news.filter(n => n.priority === 'important');
    const regular = news.filter(n => n.priority === 'regular');

    let html = '';

    // Featured
    featured.forEach(n => {
        html += renderCard(n, 'featured');
    });

    // Important grid
    if (important.length > 0) {
        html += '<div class="news-grid-important">';
        important.forEach(n => { html += renderCard(n, 'important'); });
        html += '</div>';
    }

    // Regular grid
    if (regular.length > 0) {
        html += '<div class="news-grid-regular">';
        regular.forEach(n => { html += renderCard(n, 'regular'); });
        html += '</div>';
    }

    container.innerHTML = html;

    // Bind click events
    container.querySelectorAll('.news-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id;
            const item = newsCache.find(n => n._id === id);
            if (item) openNewsModal(item);
        });
    });
}

function renderCard(n, priorityClass) {
    const date = new Date(n.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    let mediaHtml = '';
    if (n.mediaUrl) {
        if (n.mediaType === 'video') {
            mediaHtml = `<div class="news-card-media"><video src="${n.mediaUrl}" muted loop playsinline preload="metadata"></video></div>`;
        } else {
            mediaHtml = `<img class="news-card-media" src="${n.mediaUrl}" alt="${n.title}" loading="lazy">`;
        }
    }
    const badgeLabel = priorityClass === 'featured' ? '★ Destacada' : priorityClass === 'important' ? '🔥 Importante' : '';

    return `
        <div class="news-card ${priorityClass}" data-id="${n._id}">
            ${mediaHtml}
            <div>
                <div class="news-card-body">
                    <h3>${n.title}</h3>
                    <p>${n.body}</p>
                </div>
                <div class="news-card-meta">
                    <span>${date} · ${n.author || ''}</span>
                    ${badgeLabel ? `<span class="news-priority-badge ${priorityClass}">${badgeLabel}</span>` : ''}
                </div>
            </div>
        </div>
    `;
}

function openNewsModal(n) {
    const modal = document.getElementById('news-modal');
    const mediaDiv = document.getElementById('news-modal-media');
    document.getElementById('news-modal-title').textContent = n.title;
    document.getElementById('news-modal-body').textContent = n.body;
    const date = new Date(n.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('news-modal-meta').textContent = `${date} · ${n.author || ''}`;

    if (n.mediaUrl) {
        if (n.mediaType === 'video') {
            mediaDiv.innerHTML = `<video src="${n.mediaUrl}" controls autoplay muted style="width:100%;border-radius:20px 20px 0 0;"></video>`;
        } else {
            mediaDiv.innerHTML = `<img src="${n.mediaUrl}" style="width:100%;border-radius:20px 20px 0 0;">`;
        }
    } else {
        mediaDiv.innerHTML = '';
    }
    modal.classList.add('open');
}

// Close news modal
document.getElementById('news-modal-close')?.addEventListener('click', () => {
    document.getElementById('news-modal').classList.remove('open');
});
document.getElementById('news-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
});

// ===== ADMIN PANEL =====
async function initAdminPanel() {
    try {
        const res = await fetch('/api/user');
        const user = await res.json();
        if (!user || !user.isAdmin) return;

        const gear = document.getElementById('admin-gear');
        gear.classList.add('visible');

        // Gear toggle
        document.getElementById('admin-gear-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            gear.classList.toggle('open');
        });
        document.addEventListener('click', () => gear.classList.remove('open'));

        // Videos link
        document.getElementById('admin-videos-link').addEventListener('click', async (e) => {
            e.preventDefault();
            gear.classList.remove('open');
            // Load current values
            try {
                const r = await fetch('/api/settings/videos');
                const d = await r.json();
                document.getElementById('admin-video-home').value = d.video_home || '';
                document.getElementById('admin-video-dash').value = d.video_dash || '';
            } catch (err) { /* empty */ }
            document.getElementById('admin-videos-modal').classList.add('open');
        });

        // Save videos
        document.getElementById('admin-save-videos').addEventListener('click', async () => {
            const video_home = document.getElementById('admin-video-home').value.trim();
            const video_dash = document.getElementById('admin-video-dash').value.trim();
            try {
                await fetch('/api/admin/settings/videos', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ video_home, video_dash })
                });
                alert('✅ Videos actualizados. Recarga la página para verlos.');
                document.getElementById('admin-videos-modal').classList.remove('open');
            } catch (err) { alert('Error guardando'); }
        });

        // News management link
        document.getElementById('admin-news-link').addEventListener('click', async (e) => {
            e.preventDefault();
            gear.classList.remove('open');
            await loadAdminNewsList();
            document.getElementById('admin-news-list-view').style.display = 'block';
            document.getElementById('admin-news-form-view').style.display = 'none';
            document.getElementById('admin-news-modal-title').textContent = '📰 Gestionar Noticias';
            document.getElementById('admin-news-modal').classList.add('open');
        });

        // New news button
        document.getElementById('admin-new-news').addEventListener('click', () => {
            document.getElementById('admin-news-title').value = '';
            document.getElementById('admin-news-body').value = '';
            document.getElementById('admin-news-media').value = '';
            document.getElementById('admin-news-priority').value = 'regular';
            document.getElementById('admin-news-edit-id').value = '';
            document.getElementById('admin-save-news').textContent = 'Publicar';
            document.getElementById('admin-news-modal-title').textContent = '📰 Nueva Noticia';
            document.getElementById('admin-news-list-view').style.display = 'none';
            document.getElementById('admin-news-form-view').style.display = 'block';
        });

        // Cancel news form
        document.getElementById('admin-cancel-news').addEventListener('click', () => {
            document.getElementById('admin-news-list-view').style.display = 'block';
            document.getElementById('admin-news-form-view').style.display = 'none';
            document.getElementById('admin-news-modal-title').textContent = '📰 Gestionar Noticias';
        });

        // Save news
        document.getElementById('admin-save-news').addEventListener('click', async () => {
            const editId = document.getElementById('admin-news-edit-id').value;
            const payload = {
                title: document.getElementById('admin-news-title').value,
                body: document.getElementById('admin-news-body').value,
                mediaUrl: document.getElementById('admin-news-media').value,
                priority: document.getElementById('admin-news-priority').value
            };
            if (!payload.title || !payload.body) return alert('Título y cuerpo requeridos');

            try {
                if (editId) {
                    await fetch(`/api/admin/news/${editId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                } else {
                    await fetch('/api/admin/news', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                }
                await loadAdminNewsList();
                await loadNews(); // Refresh public view
                document.getElementById('admin-news-list-view').style.display = 'block';
                document.getElementById('admin-news-form-view').style.display = 'none';
                document.getElementById('admin-news-modal-title').textContent = '📰 Gestionar Noticias';
            } catch (err) { alert('Error guardando noticia'); }
        });

    } catch (e) { /* not logged in or not admin */ }
}

async function loadAdminNewsList() {
    try {
        const res = await fetch('/api/admin/news');
        const news = await res.json();
        const list = document.getElementById('admin-news-list');
        if (news.length === 0) {
            list.innerHTML = '<p style="color:var(--color-text-secondary);padding:16px;">No hay noticias</p>';
            return;
        }
        list.innerHTML = news.map(n => {
            const badge = n.archived ? '📦' : n.published ? '✅' : '⏸️';
            return `
                <div class="admin-news-item">
                    <span class="title">${badge} ${n.title}</span>
                    <div class="actions">
                        <button onclick="editNews('${n._id}')">✏️</button>
                        <button onclick="archiveNews('${n._id}', ${!n.archived})">${n.archived ? '📤' : '📦'}</button>
                        <button onclick="deleteNews('${n._id}')">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) { console.error('Error loading admin news:', e); }
}

window.editNews = async function(id) {
    try {
        const res = await fetch('/api/admin/news');
        const news = await res.json();
        const n = news.find(x => x._id === id);
        if (!n) return;
        document.getElementById('admin-news-title').value = n.title;
        document.getElementById('admin-news-body').value = n.body;
        document.getElementById('admin-news-media').value = n.mediaUrl || '';
        document.getElementById('admin-news-priority').value = n.priority;
        document.getElementById('admin-news-edit-id').value = id;
        document.getElementById('admin-save-news').textContent = 'Guardar Cambios';
        document.getElementById('admin-news-modal-title').textContent = '✏️ Editar Noticia';
        document.getElementById('admin-news-list-view').style.display = 'none';
        document.getElementById('admin-news-form-view').style.display = 'block';
    } catch (e) { alert('Error cargando noticia'); }
};

window.archiveNews = async function(id, archive) {
    try {
        await fetch(`/api/admin/news/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ archived: archive })
        });
        await loadAdminNewsList();
        await loadNews();
    } catch (e) { alert('Error'); }
};

window.deleteNews = async function(id) {
    if (!confirm('¿Eliminar esta noticia permanentemente?')) return;
    try {
        await fetch(`/api/admin/news/${id}`, { method: 'DELETE' });
        await loadAdminNewsList();
        await loadNews();
    } catch (e) { alert('Error'); }
};

// ===== INIT =====
loadDynamicVideo();
loadNews();
initAdminPanel();
