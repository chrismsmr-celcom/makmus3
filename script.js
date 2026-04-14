/* ==========================================================================
   MAKMUS MEDIA — SCRIPT PRINCIPAL COMPLET
   ========================================================================== */

/* --------------------------------------
   1. CONFIGURATION SUPABASE
   -------------------------------------- */
const SUPABASE_URL = 'https://logphtrdkpbfgtejtime.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvZ3BodHJka3BiZmd0ZWp0aW1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNzY4MDYsImV4cCI6MjA4NTc1MjgwNn0.Uoxiax-whIdbB5oI3bof-hN0m5O9PDi96zmaUZ6BBio';
const EXCHANGE_API_KEY = '4e4fee63bab6fce7ba7b39e8';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* --------------------------------------
   2. VARIABLES GLOBALES
   -------------------------------------- */
let activeAds = [];
let currentAdIndex = 0;
let currentTickerIndex = 0;
let currentAudio = null;
let currentPlayBtn = null;
let sportCache = {};

/* --------------------------------------
   3. UTILITAIRES
   -------------------------------------- */
function calculerTempsLecture(texte) {
    if (!texte) return "1 MIN";
    const mots = texte.replace(/<[^>]*>/g, '').split(/\s+/).filter(w => w.length > 0).length;
    return Math.ceil(mots / 200) + " MIN";
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'success') {
    const existing = document.querySelector('.makmus-toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = 'makmus-toast';
    toast.innerHTML = `<span>${message}</span>`;
    toast.style.cssText = `position: fixed; bottom: 30px; right: 30px; background: ${type === 'error' ? '#dc3545' : '#28a745'}; color: white; padding: 12px 24px; border-radius: 8px; font-family: "Libre Franklin", sans-serif; font-size: 14px; font-weight: 500; z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.15); animation: slideIn 0.3s ease;`;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

/* --------------------------------------
   4. MENU & PANNEAUX
   -------------------------------------- */
window.toggleMenu = function(show) {
    const menu = document.getElementById('fullMenu');
    if (!menu) return;
    const shouldOpen = typeof show === 'boolean' ? show : !menu.classList.contains('active');
    menu.classList.toggle('active', shouldOpen);
    document.body.style.overflow = shouldOpen ? 'hidden' : 'auto';
};

window.toggleSidePanel = function(isOpen) {
    const panel = document.getElementById('sideAccount');
    if (!panel) return;
    panel.classList.toggle('active', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : 'auto';
};

/* --------------------------------------
   AUTHENTIFICATION
   -------------------------------------- */
window.checkUserStatus = async function() {
    try {
        var { data: { user } } = await supabaseClient.auth.getUser();
        currentUser = user;
        var loggedOut = document.getElementById('logged-out-view');
        var loggedIn = document.getElementById('logged-in-view');
        var emailDisplay = document.getElementById('user-email-display');
        var avatar = document.querySelector('.user-avatar');
        
        if (user) {
            if (loggedOut) loggedOut.style.display = 'none';
            if (loggedIn) loggedIn.style.display = 'block';
            if (emailDisplay) emailDisplay.textContent = user.email;
            if (avatar) avatar.textContent = user.email.charAt(0).toUpperCase();
            window.loadUserActivity().catch(function() {});
            
            if (typeof currentArticle !== 'undefined' && currentArticle) {
                if (typeof fetchLikeStatus === 'function') fetchLikeStatus();
                if (typeof fetchBookmarkStatus === 'function') fetchBookmarkStatus();
            }
        } else {
            if (loggedOut) loggedOut.style.display = 'block';
            if (loggedIn) loggedIn.style.display = 'none';
        }
    } catch (error) {
        console.error("Auth error:", error);
    }
};

window.handleAuth = async function(type) {
    var email = document.getElementById('auth-email')?.value;
    var password = document.getElementById('auth-password')?.value;
    if (!email || !password) return alert("Veuillez remplir tous les champs.");
    
    try {
        var result;
        if (type === 'signup') {
            result = await supabaseClient.auth.signUp({ email: email, password: password });
            if (!result.error) alert("Inscription reussie ! Verifiez vos emails.");
        } else {
            result = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
        }
        if (result.error) throw result.error;
        if (result.data.session) {
            await window.checkUserStatus();
            window.toggleSidePanel(false);
            if (currentArticle) {
                fetchLikeStatus();
                fetchBookmarkStatus();
                fetchLikesCount();
            }
        }
    } catch (error) {
        alert("Erreur : " + error.message);
    }
};

window.handleLogout = async function() {
    if (!confirm("Voulez-vous vous deconnecter ?")) return;
    try {
        await supabaseClient.auth.signOut();
        currentUser = null;
        window.location.reload();
    } catch (error) {
        alert("Erreur : " + error.message);
    }
};

window.navigateToAccountOption = function(option) {
    window.toggleSidePanel(false);
    if (option === 'favoris') {
        window.location.href = 'favoris.html';
    } else if (option === 'commentaires') {
        window.location.href = 'mes-commentaires.html';
    }
};

window.loadUserActivity = async function() {
    try {
        var { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;
        
        var { data: favs } = await supabaseClient
            .from('user_favorites')
            .select('article_id, articles(titre)')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(5);
        
        var container = document.getElementById('user-favorites-list');
        if (container) {
            if (!favs || favs.length === 0) {
                container.innerHTML = '<div class="no-favs">Aucun favori pour le moment</div>';
            } else {
                container.innerHTML = favs.map(function(f) {
                    var title = f.articles?.titre || 'Article';
                    return '<div class="mini-fav-item"><a href="redaction.html?id=' + f.article_id + '">' + escapeHtml(title) + '</a></div>';
                }).join('');
            }
        }
    } catch (error) {
        console.warn("Erreur chargement favoris:", error);
        var container = document.getElementById('user-favorites-list');
        if (container) {
            container.innerHTML = '<div class="no-favs">Erreur de chargement</div>';
        }
    }
};

/* --------------------------------------
   LIKES (avec BDD)
   -------------------------------------- */
async function fetchLikeStatus() {
    if (!currentArticle || !currentUser) return;
    
    const likeBtn = document.getElementById('like-btn');
    if (!likeBtn) return;
    
    try {
        const { data, error } = await supabaseClient
            .from('user_likes')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('article_id', currentArticle.id)
            .maybeSingle();
        
        if (data && !error) {
            likeBtn.classList.add('liked');
            likeBtn.disabled = true;
            likeBtn.title = "Vous avez déjà aimé cet article";
        } else {
            likeBtn.classList.remove('liked');
            likeBtn.disabled = false;
        }
    } catch (error) {
        console.error('Erreur fetchLikeStatus:', error);
    }
}

async function fetchLikesCount() {
    if (!currentArticle) return;
    
    const likeSpan = document.getElementById('nb-like');
    if (!likeSpan) return;
    
    try {
        const { count, error } = await supabaseClient
            .from('user_likes')
            .select('id', { count: 'exact', head: true })
            .eq('article_id', currentArticle.id);
        
        likeSpan.textContent = count || 0;
    } catch (error) {
        console.error('Erreur fetchLikesCount:', error);
    }
}

/* --------------------------------------
   FAVORIS (avec BDD)
   -------------------------------------- */
async function fetchBookmarkStatus() {
    if (!currentArticle || !currentUser) return;
    
    const bookmarkBtn = document.getElementById('bookmark-btn');
    if (!bookmarkBtn) return;
    
    const span = bookmarkBtn?.querySelector('span:last-child');
    
    try {
        const { data, error } = await supabaseClient
            .from('user_favorites')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('article_id', currentArticle.id)
            .maybeSingle();
        
        if (data && !error) {
            bookmarkBtn.classList.add('bookmarked');
            bookmarkBtn.disabled = true;
            if (span) span.textContent = 'Sauvegardé ✓';
            bookmarkBtn.title = "Article déjà sauvegardé";
        } else {
            bookmarkBtn.classList.remove('bookmarked');
            bookmarkBtn.disabled = false;
            if (span) span.textContent = 'Sauvegarder';
        }
    } catch (error) {
        console.error('Erreur fetchBookmarkStatus:', error);
    }
}

window.toggleBookmark = async function() {
    if (!currentArticle) return;
    
    if (!currentUser) {
        showToast('Connectez-vous pour sauvegarder des articles', 'info');
        window.toggleSidePanel(true);
        return;
    }
    
    const bookmarkBtn = document.getElementById('bookmark-btn');
    if (bookmarkBtn.disabled) {
        showToast('Article déjà sauvegardé', 'info');
        return;
    }
    
    const span = bookmarkBtn?.querySelector('span:last-child');
    
    try {
        const { error } = await supabaseClient
            .from('user_favorites')
            .insert([{ 
                user_id: currentUser.id, 
                article_id: currentArticle.id,
                article_title: currentArticle.titre
            }]);
        
        if (error) throw error;
        
        bookmarkBtn.classList.add('bookmarked');
        bookmarkBtn.disabled = true;
        if (span) span.textContent = 'Sauvegardé ✓';
        bookmarkBtn.title = "Article déjà sauvegardé";
        showToast('Article sauvegardé dans vos favoris', 'success');
        window.loadUserActivity();
    } catch (error) {
        console.error('Erreur toggleBookmark:', error);
        showToast('Erreur lors de la sauvegarde', 'error');
    }
};

/* --------------------------------------
   6. TICKER BOURSIER
   -------------------------------------- */
async function fetchMarketData() {
    if (!EXCHANGE_API_KEY) return false;
    try {
        const res = await fetch(`https://v6.exchangerate-api.com/v6/${EXCHANGE_API_KEY}/latest/USD`);
        const data = await res.json();
        if (data.result === "success") {
            const rate = Math.round(data.conversion_rates.CDF).toLocaleString('fr-FR');
            window.marketData = window.marketData || [
                { label: "USD/CDF", value: `${rate} FC`, change: "LIVE", trend: "up" },
                { label: "BTC/USD", value: "98,450", change: "+1.2%", trend: "up" },
                { label: "OR (oz)", value: "2,150", change: "-0.5%", trend: "down" }
            ];
            window.marketData[0].value = `${rate} FC`;
            return true;
        }
    } catch(e) {
        console.warn("Ticker error:", e);
        return false;
    }
}

function updateTickerUI() {
    const wrapper = document.getElementById('ticker-content');
    if (!wrapper) return;
    const marketData = window.marketData || [];
    if (!marketData.length) return;
    
    wrapper.style.opacity = "0";
    setTimeout(() => {
        const item = marketData[currentTickerIndex];
        wrapper.innerHTML = `<span class="ticker-item"><strong>${item.label}:</strong> ${item.value}<small style="color:${item.trend === 'up' ? '#27ae60' : '#e74c3c'}">${item.trend === 'up' ? '▲' : '▼'} ${item.change}</small></span>`;
        wrapper.style.opacity = "1";
        currentTickerIndex = (currentTickerIndex + 1) % marketData.length;
    }, 300);
}

/* --------------------------------------
   7. MOTEUR DE NEWS PRINCIPAL (AVEC AUDIOS)
   -------------------------------------- */
async function fetchMakmusNews(querySearch) {
    const status = document.getElementById('status-line');
    if (status) status.textContent = "CHARGEMENT...";
    
    try {
        let query = supabaseClient
            .from('articles')
            .select('*')
            .eq('is_published', true)
            .order('created_at', { ascending: false });
        
        if (querySearch && querySearch !== 'top') {
            query = query.or(`category.ilike.%${querySearch}%,titre.ilike.%${querySearch}%`);
        }
        
        const { data: articles, error } = await query;
        if (error) throw error;
        
        if (querySearch && querySearch !== 'top') {
            if (status) status.textContent = `RESULTATS : ${querySearch.toUpperCase()}`;
            if (articles?.length) renderUI(articles[0], articles.slice(1, 13));
            return;
        }
        
        if (!articles?.length) {
            renderEmptyStates();
            if (status) status.textContent = "AUCUN ARTICLE";
            return;
        }
        
        const usedIds = new Set();
        
        const filterUnique = (items, condition, limit) => {
            const filtered = items.filter(item => {
                if (!item || !condition(item)) return false;
                if (usedIds.has(item.id)) return false;
                return true;
            });
            const taken = filtered.slice(0, limit);
            taken.forEach(item => usedIds.add(item.id));
            return taken;
        };
        
        const excludedFromMain = [
            'OPINION', 'MAKMUS_SPORT_RESUME', 'AUTRE_INFO', 'LIFESTYLE',
            'ECONOMIE', 'FINANCE', 'MARCHE', 'INTERNATIONAL', 'MONDE', 'GLOBAL',
            'ENVIRONNEMENT', 'CLIMAT', 'ECOLOGIE', 'SPORT', 'SPORT_FOOTBALL',
            'SPORT_BASKETBALL', 'SPORT_TENNIS', 'SPORT_COMBAT', 'SPORT_ESPORT'
        ];
        
        const autreInfos = filterUnique(articles, a => a.category === 'AUTRE_INFO', 6);
        const opinions = filterUnique(articles, a => a.category === 'OPINION', 3);
        const lifestyle = filterUnique(articles, a => a.category === 'LIFESTYLE', 4);
        const economie = filterUnique(articles, a => ['ECONOMIE', 'FINANCE', 'MARCHE'].includes(a.category), 7);
        const international = filterUnique(articles, a => ['INTERNATIONAL', 'MONDE', 'GLOBAL'].includes(a.category), 7);
        const environnement = filterUnique(articles, a => ['ENVIRONNEMENT', 'CLIMAT', 'ECOLOGIE'].includes(a.category), 7);
        const sport = filterUnique(articles, a => a.category?.startsWith('SPORT'), 7);
        
        const mainStream = articles.filter(a => {
            if (!a?.category) return false;
            if (excludedFromMain.includes(a.category)) return false;
            if (usedIds.has(a.id)) return false;
            return true;
        });
        
        let heroArticle = articles.find(a => a?.is_priority === true && !usedIds.has(a.id));
        if (!heroArticle && mainStream.length > 0) {
            heroArticle = mainStream[0];
            if (heroArticle) usedIds.add(heroArticle.id);
        }
        
        const gridArticles = mainStream.filter(a => a.id !== heroArticle?.id).slice(0, 15);
        gridArticles.forEach(a => usedIds.add(a.id));
        const moreNews = articles.filter(a => !usedIds.has(a.id)).slice(0, 20);
        
        const { data: audios, error: audioError } = await supabaseClient
            .from('audios')
            .select('*')
            .eq('is_published', true)
            .order('created_at', { ascending: false })
            .limit(6);
        
        if (audioError) console.warn("Erreur chargement audios:", audioError);
        
        renderUI(heroArticle, gridArticles);
        renderAutreInfo(autreInfos);
        renderOpinions(opinions);
        renderLifestyle(lifestyle);
        renderEconomy(economie);
        renderInternational(international);
        renderEnvironnement(environnement);
        renderSport(sport);
        renderMoreNews(moreNews);
        renderAudios(audios || []);
        
        console.log('🔍 Vérification doublons: IDs uniques:', usedIds.size, '/ Total:', articles.length);
        
        if (status) status.textContent = "EDITION DU JOUR";
        
    } catch(e) {
        console.error("News error:", e);
        if (status) status.textContent = "ERREUR";
        renderEmptyStates();
    }
}

/* ==========================================================================
   8. HERO FLEXIBLE
   ========================================================================== */
const heroFlexible = {
    currentIndex: 0,
    slides: [],
    interval: null,
    autoPlayDelay: 5000,
    
    renderMedia(article) {
        if (article.video_url && article.video_url !== '') {
            const videoCaption = article.video_caption || article.caption || '';
            return `
                <div class="hero-video-wrapper">
                    <video id="hero-video" src="${article.video_url}" poster="${article.image_url || ''}" muted loop playsinline autoplay></video>
                    <div class="hero-video-controls-vertical">
                        <button class="video-control-btn play-pause-btn" onclick="heroFlexible.toggleVideo()">
                            <svg viewBox="0 0 24 24" fill="white" width="20" height="20">
                                <polygon points="5 3 19 12 5 21 5 3" id="video-play-icon"/>
                                <rect x="6" y="4" width="4" height="16" id="video-pause-icon" style="display:none" rx="1"/>
                                <rect x="14" y="4" width="4" height="16" id="video-pause-icon-2" style="display:none" rx="1"/>
                            </svg>
                        </button>
                        <button class="video-control-btn volume-btn" onclick="heroFlexible.toggleVolume()">
                            <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="18" height="18">
                                <path d="M11 5L6 9H2v6h4l5 4V5z"/>
                                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.08"/>
                            </svg>
                        </button>
                        <button class="video-control-btn share-btn" onclick="heroFlexible.shareVideo('${article.id}', '${escapeHtml(article.titre)}')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="18" height="18">
                                <circle cx="18" cy="5" r="3"/>
                                <circle cx="6" cy="12" r="3"/>
                                <circle cx="18" cy="19" r="3"/>
                                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                            </svg>
                        </button>
                        <button class="video-control-btn fullscreen-btn" onclick="heroFlexible.toggleFullscreen()">
                            <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="18" height="18">
                                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                            </svg>
                        </button>
                    </div>
                    ${videoCaption ? `<div class="hero-video-caption" id="hero-video-caption"><div class="caption-content"><svg class="subtitle-icon" viewBox="0 0 24 24" fill="white" width="16" height="16"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z"/></svg><span class="caption-text">${escapeHtml(videoCaption)}</span></div></div>` : ''}
                </div>`;
        }
        
        const articleMedias = article.medias || [];
        if (articleMedias.length > 0 || article.image_url) {
            const galleryItems = [];
            if (article.image_url) galleryItems.push({ type: 'image', url: article.image_url, caption: article.image_caption || '' });
            articleMedias.forEach(media => galleryItems.push({ type: media.type || 'image', url: media.url, caption: media.caption || '' }));
            
            if (galleryItems.length > 1) {
                this.slides = galleryItems;
                this.currentIndex = 0;
                let slidesHtml = '', dotsHtml = '';
                galleryItems.forEach((item, i) => {
                    slidesHtml += `<div class="hero-gallery-slide">${item.type === 'video' ? `<video src="${item.url}" controls></video>` : `<img src="${item.url}" onerror="this.src='https://via.placeholder.com/800x500'">`}</div>`;
                    dotsHtml += `<div class="gallery-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></div>`;
                });
                setTimeout(() => {
                    document.querySelectorAll('.gallery-dot').forEach((dot, idx) => {
                        dot.addEventListener('click', () => this.goToSlide(idx));
                    });
                }, 100);
                return `<div class="hero-gallery-wrapper"><div class="hero-gallery-slides" id="hero-gallery-slides">${slidesHtml}</div></div>
                        <div class="hero-gallery-controls"><div class="hero-gallery-dots">${dotsHtml}</div>
                        <div class="hero-gallery-nav"><button class="gallery-prev" onclick="heroFlexible.prevSlide()">‹</button>
                        <button class="gallery-next" onclick="heroFlexible.nextSlide()">›</button></div></div>`;
            }
            if (galleryItems.length === 1) {
                return `<div class="hero-single-image"><img src="${galleryItems[0].url}" onerror="this.src='https://via.placeholder.com/800x500'">${galleryItems[0].caption ? `<div class="photo-credit">${escapeHtml(galleryItems[0].caption)}</div>` : ''}</div>`;
            }
        }
        
        return `<div class="hero-single-image"><img src="https://via.placeholder.com/800x500" alt="Image par défaut"></div>`;
    },
    
    goToSlide(index) {
        if (index < 0) index = 0;
        if (index >= this.slides.length) index = this.slides.length - 1;
        this.currentIndex = index;
        const slidesContainer = document.getElementById('hero-gallery-slides');
        if (slidesContainer) slidesContainer.style.transform = `translateX(-${this.currentIndex * 100}%)`;
        document.querySelectorAll('.gallery-dot').forEach((dot, i) => dot.classList.toggle('active', i === this.currentIndex));
        this.resetAutoPlay();
    },
    
    nextSlide() { this.goToSlide(this.currentIndex + 1 >= this.slides.length ? 0 : this.currentIndex + 1); },
    prevSlide() { this.goToSlide(this.currentIndex - 1 < 0 ? this.slides.length - 1 : this.currentIndex - 1); },
    startAutoPlay() { if (this.interval) clearInterval(this.interval); if (this.slides?.length > 1) this.interval = setInterval(() => this.nextSlide(), this.autoPlayDelay); },
    resetAutoPlay() { this.startAutoPlay(); },
    
    toggleVideo() {
        const video = document.getElementById('hero-video');
        if (!video) return;
        const playIcon = document.querySelector('#video-play-icon');
        const pauseIcons = document.querySelectorAll('#video-pause-icon, #video-pause-icon-2');
        if (video.paused) {
            video.play();
            if (playIcon) playIcon.style.display = 'none';
            pauseIcons.forEach(icon => icon.style.display = 'block');
        } else {
            video.pause();
            if (playIcon) playIcon.style.display = 'block';
            pauseIcons.forEach(icon => icon.style.display = 'none');
        }
    },
    
    toggleVolume() {
        const video = document.getElementById('hero-video');
        if (!video) return;
        video.muted = !video.muted;
        const volumeIcon = document.querySelector('.volume-btn svg');
        if (volumeIcon) {
            volumeIcon.innerHTML = video.muted ? '<path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6"/>' : '<path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.08"/>';
        }
    },
    
    toggleFullscreen() {
        const video = document.getElementById('hero-video');
        if (!video) return;
        if (video.requestFullscreen) video.requestFullscreen();
        else if (video.webkitRequestFullscreen) video.webkitRequestFullscreen();
        else if (video.msRequestFullscreen) video.msRequestFullscreen();
    },
    
    shareVideo(articleId, articleTitle) {
        const articleUrl = `${window.location.origin}/redaction.html?id=${articleId}`;
        if (navigator.share) {
            navigator.share({ title: articleTitle, text: 'Découvrez cet article sur MAKMUS', url: articleUrl }).catch(() => this.copyToClipboard(articleUrl));
        } else {
            this.copyToClipboard(articleUrl);
        }
    },
    
    copyToClipboard(url) {
        navigator.clipboard.writeText(url).then(() => showToast('Lien copié dans le presse-papier')).catch(() => showToast('Impossible de copier le lien', 'error'));
    }
};

function renderUI(heroArticle, gridArticles) {
    const heroZone = document.getElementById('hero-zone');
    const grid = document.getElementById('news-grid');
    
    if (heroZone && heroArticle) {
        const subArticles = (gridArticles || []).slice(0, 3);
        let subHtml = '';
        
        subArticles.forEach(sub => {
            if (!sub) return;
            const hasImage = sub.image_url && sub.image_url !== '';
            const readTime = calculerTempsLecture(sub.description);
            
            if (hasImage) {
                subHtml += `
                    <div class="sub-article-card" onclick="window.location.href='redaction.html?id=${sub.id}'">
                        <img src="${sub.image_url}" class="sub-article-image" onerror="this.src='https://via.placeholder.com/100x100'">
                        <div class="sub-article-content">
                            <h4 class="sub-article-title">${escapeHtml(sub.titre)}</h4>
                            <span class="sub-article-read-time">${readTime}</span>
                        </div>
                    </div>
                `;
            } else {
                subHtml += `
                    <div class="sub-article-text-only" onclick="window.location.href='redaction.html?id=${sub.id}'">
                        <h4 class="sub-article-title">${escapeHtml(sub.titre)}</h4>
                        <span class="sub-article-read-time">${readTime}</span>
                    </div>
                `;
            }
        });
        
        const cleanDesc = (heroArticle.description || "").replace(/<[^>]*>/g, '').substring(0, 560);
        heroZone.innerHTML = `
            <div class="hero-main-wrapper">
                <div class="hero-two-columns">
                    <div class="hero-left">
                        <h1 class="hero-title" onclick="window.location.href='redaction.html?id=${heroArticle.id}'">${escapeHtml(heroArticle.titre)}</h1>
                        <p class="hero-description">${cleanDesc}...</p>
                    </div>
                    <div class="hero-right">
                        ${heroFlexible.renderMedia(heroArticle)}
                    </div>
                </div>
                <div class="hero-sub-section">
                    <div class="sub-section-header">
                        <span class="sub-section-label">A LIRE AUSSI</span>
                        <span class="sub-section-line"></span>
                    </div>
                    <div class="hero-sub-grid">
                        ${subHtml}
                    </div>
                </div>
            </div>
        `;
        
        setTimeout(() => { 
            if (heroFlexible.slides?.length > 1) heroFlexible.startAutoPlay(); 
        }, 100);
    }
    
    if (grid && gridArticles) {
        grid.innerHTML = gridArticles.slice(3, 15).map(art => {
            const excerpt = (art.description || "").replace(/<[^>]*>/g, '').substring(0, 120);
            return `<div class="article-card" onclick="window.location.href='redaction.html?id=${art.id}'">
                <div class="card-img-wrapper">
                    <img class="article-image" src="${art.image_url || 'https://via.placeholder.com/400x250'}" onerror="this.src='https://via.placeholder.com/400x250'">
                </div>
                <div class="article-meta-content">
                    <h3 class="article-title">${escapeHtml(art.titre)}</h3>
                    <p class="article-excerpt">${escapeHtml(excerpt)}...</p>
                    <span class="read-time-small">${calculerTempsLecture(art.description)}</span>
                </div>
            </div>`;
        }).join('');
    }
}

/* ==========================================================================
   9. FONCTIONS DE RENDU MÉDIA ET SECTIONS
   ========================================================================== */
function renderSectionMedia(article) {
    if (article.video_url && article.video_url !== '') {
        const videoCaption = article.video_caption || article.caption || '';
        return `
            <div class="hero-video-wrapper">
                <video src="${article.video_url}" poster="${article.image_url || ''}" muted loop playsinline autoplay></video>
                <div class="hero-video-controls-vertical">
                    <button class="video-control-btn play-pause-btn" onclick="toggleVideoPlaySection(this)">
                        <svg viewBox="0 0 24 24" fill="white" width="20" height="20">
                            <polygon points="5 3 19 12 5 21 5 3" class="play-icon-section"/>
                            <rect x="6" y="4" width="4" height="16" class="pause-icon-section" style="display:none" rx="1"/>
                            <rect x="14" y="4" width="4" height="16" class="pause-icon-section-2" style="display:none" rx="1"/>
                        </svg>
                    </button>
                    <button class="video-control-btn volume-btn" onclick="toggleVideoVolumeSection(this)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="18" height="18">
                            <path d="M11 5L6 9H2v6h4l5 4V5z"/>
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.08"/>
                        </svg>
                    </button>
                    <button class="video-control-btn share-btn" onclick="shareSectionArticle('${article.id}', '${escapeHtml(article.titre)}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="18" height="18">
                            <circle cx="18" cy="5" r="3"/>
                            <circle cx="6" cy="12" r="3"/>
                            <circle cx="18" cy="19" r="3"/>
                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                        </svg>
                    </button>
                    <button class="video-control-btn fullscreen-btn" onclick="toggleVideoFullscreenSection(this)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="18" height="18">
                            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                        </svg>
                    </button>
                </div>
                ${videoCaption ? `<div class="hero-video-caption"><div class="caption-content"><svg class="subtitle-icon" viewBox="0 0 24 24" fill="white" width="16" height="16"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z"/></svg><span class="caption-text">${escapeHtml(videoCaption)}</span></div></div>` : ''}
            </div>
        `;
    }
    
    const articleMedias = article.medias || [];
    if (articleMedias.length > 0 || article.image_url) {
        const galleryItems = [];
        if (article.image_url) galleryItems.push({ type: 'image', url: article.image_url, caption: article.image_caption || '' });
        articleMedias.forEach(media => galleryItems.push({ type: media.type || 'image', url: media.url, caption: media.caption || '' }));
        
        if (galleryItems.length > 1) {
            const galleryId = 'gallery_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            let slidesHtml = '', dotsHtml = '';
            
            galleryItems.forEach((item, i) => {
                const mediaType = item.type === 'video' ? 'video' : 'image';
                const captionText = item.caption || '';
                
                slidesHtml += `
                    <div class="hero-gallery-slide" data-index="${i}">
                        ${mediaType === 'video' ? 
                            `<video src="${item.url}" controls poster="${item.url}?frame=1"></video>` : 
                            `<img src="${item.url}" onerror="this.src='https://via.placeholder.com/800x500'">`
                        }
                        ${captionText ? `<div class="hero-slide-caption"><p>${escapeHtml(captionText)}</p></div>` : ''}
                    </div>
                `;
                dotsHtml += `<div class="gallery-dot ${i === 0 ? 'active' : ''}" data-index="${i}" onclick="goToGallerySlideSection('${galleryId}', ${i})"></div>`;
            });
            
            return `
                <div class="hero-gallery-wrapper" id="${galleryId}">
                    <div class="hero-gallery-slides">${slidesHtml}</div>
                    <div class="hero-gallery-controls">
                        <div class="hero-gallery-dots">${dotsHtml}</div>
                        <div class="hero-gallery-nav">
                            <button class="gallery-prev" onclick="prevGallerySectionById('${galleryId}')">‹</button>
                            <button class="gallery-next" onclick="nextGallerySectionById('${galleryId}')">›</button>
                        </div>
                    </div>
                </div>
                <style>
                    #${galleryId} .hero-gallery-slides {
                        display: flex;
                        overflow-x: auto;
                        scroll-snap-type: x mandatory;
                        scroll-behavior: smooth;
                    }
                    #${galleryId} .hero-gallery-slide {
                        flex: 0 0 100%;
                        scroll-snap-align: start;
                        position: relative;
                    }
                    #${galleryId} .hero-gallery-slide img,
                    #${galleryId} .hero-gallery-slide video {
                        width: 100%;
                        height: auto;
                        max-height: 500px;
                        object-fit: cover;
                    }
                    #${galleryId} .hero-slide-caption {
                        position: absolute;
                        bottom: 0;
                        left: 0;
                        right: 0;
                        background: linear-gradient(to top, rgba(0,0,0,0.8), transparent);
                        color: white;
                        padding: 40px 30px 20px;
                        font-family: var(--serif);
                        font-size: 0.9rem;
                    }
                </style>
            `;
        }
        
        if (galleryItems.length === 1) {
            const singleItem = galleryItems[0];
            return `
                <div class="hero-single-image">
                    <img src="${singleItem.url}" onerror="this.src='https://via.placeholder.com/800x500'">
                    ${singleItem.caption ? `<div class="photo-credit">${escapeHtml(singleItem.caption)}</div>` : ''}
                </div>
            `;
        }
    }
    
    return `<div class="hero-single-image"><img src="${article.image_url || 'https://via.placeholder.com/800x450'}" onerror="this.src='https://via.placeholder.com/800x450'"></div>`;
}

/* ==========================================================================
   FONCTIONS VIDÉO POUR LES SECTIONS
   ========================================================================== */
function toggleVideoPlaySection(btn) {
    const video = btn.closest('.hero-video-wrapper').querySelector('video');
    if (!video) return;
    const playIcon = btn.querySelector('.play-icon-section');
    const pauseIcons = btn.querySelectorAll('.pause-icon-section, .pause-icon-section-2');
    if (video.paused) {
        video.play();
        if (playIcon) playIcon.style.display = 'none';
        pauseIcons.forEach(icon => icon.style.display = 'block');
    } else {
        video.pause();
        if (playIcon) playIcon.style.display = 'block';
        pauseIcons.forEach(icon => icon.style.display = 'none');
    }
}

function toggleVideoVolumeSection(btn) {
    const video = btn.closest('.hero-video-wrapper').querySelector('video');
    if (!video) return;
    video.muted = !video.muted;
    const volumeIcon = btn.querySelector('svg');
    if (volumeIcon) {
        volumeIcon.innerHTML = video.muted ? 
            '<path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6"/>' : 
            '<path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.08"/>';
    }
}

function toggleVideoFullscreenSection(btn) {
    const video = btn.closest('.hero-video-wrapper').querySelector('video');
    if (!video) return;
    if (video.requestFullscreen) video.requestFullscreen();
    else if (video.webkitRequestFullscreen) video.webkitRequestFullscreen();
    else if (video.msRequestFullscreen) video.msRequestFullscreen();
}

function shareSectionArticle(articleId, articleTitle) {
    const articleUrl = `${window.location.origin}/redaction.html?id=${articleId}`;
    if (navigator.share) {
        navigator.share({ title: articleTitle, text: 'Découvrez cet article sur MAKMUS', url: articleUrl }).catch(() => {});
    } else {
        navigator.clipboard.writeText(articleUrl).then(() => showToast('Lien copié dans le presse-papier'));
    }
}

/* ==========================================================================
   FONCTIONS GALERIE
   ========================================================================== */
const galleryStates = {};

function goToGallerySlideSection(galleryId, index) {
    const wrapper = document.getElementById(galleryId);
    if (!wrapper) return;
    
    const slides = wrapper.querySelector('.hero-gallery-slides');
    const slideWidth = wrapper.offsetWidth;
    
    if (slides) {
        slides.scrollTo({ left: index * slideWidth, behavior: 'smooth' });
    }
    
    const dots = wrapper.querySelectorAll('.gallery-dot');
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
    });
    
    galleryStates[galleryId] = index;
}

function prevGallerySectionById(galleryId) {
    const wrapper = document.getElementById(galleryId);
    if (!wrapper) return;
    
    const slides = wrapper.querySelector('.hero-gallery-slides');
    const dots = wrapper.querySelectorAll('.gallery-dot');
    const currentIndex = galleryStates[galleryId] || 0;
    const newIndex = Math.max(0, currentIndex - 1);
    
    if (slides) {
        const slideWidth = wrapper.offsetWidth;
        slides.scrollTo({ left: newIndex * slideWidth, behavior: 'smooth' });
    }
    
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === newIndex);
    });
    
    galleryStates[galleryId] = newIndex;
}

function nextGallerySectionById(galleryId) {
    const wrapper = document.getElementById(galleryId);
    if (!wrapper) return;
    
    const slides = wrapper.querySelector('.hero-gallery-slides');
    const dots = wrapper.querySelectorAll('.gallery-dot');
    const totalSlides = dots.length;
    const currentIndex = galleryStates[galleryId] || 0;
    const newIndex = Math.min(totalSlides - 1, currentIndex + 1);
    
    if (slides) {
        const slideWidth = wrapper.offsetWidth;
        slides.scrollTo({ left: newIndex * slideWidth, behavior: 'smooth' });
    }
    
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === newIndex);
    });
    
    galleryStates[galleryId] = newIndex;
}

/* ==========================================================================
   SOUS-ARTICLES EN MEDIA OBJECT
   ========================================================================== */
function renderSubArticlesAsMediaObject(subArticles) {
    if (!subArticles.length) return '';
    
    return `
        <div class="economy-sub-section">
            <div class="economy-sub-header">
                <span class="economy-sub-label">À LA UNE ÉCO</span>
                <span class="economy-sub-line"></span>
            </div>
            <div class="economy-sub-grid media-object-grid">
                ${subArticles.map(art => `
                    <div class="media-object-card" onclick="window.location.href='redaction.html?id=${art.id}'">
                        <div class="media-object-thumbnail">
                            <img src="${art.image_url || 'https://via.placeholder.com/100x100'}" alt="${escapeHtml(art.titre)}" onerror="this.src='https://via.placeholder.com/100x100'">
                        </div>
                        <div class="media-object-content">
                            <h3 class="media-object-title">${escapeHtml(art.titre)}</h3>
                            <p class="media-object-excerpt">${(art.description || "").replace(/<[^>]*>/g, '').substring(0, 80)}...</p>
                            <span class="media-object-read-time">${calculerTempsLecture(art.description)}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

/* ==========================================================================
   RENDER ECONOMY, INTERNATIONAL, ENVIRONNEMENT, SPORT
   ========================================================================== */
function renderEconomy(articles) {
    const container = document.getElementById('economy-grid');
    if (!container) return;
    const ecoArticles = articles.filter(a => a?.category && ['ECONOMIE', 'FINANCE', 'MARCHE'].includes(a.category));
    if (!ecoArticles.length) { container.innerHTML = '<div class="economy-empty">Aucun article économique disponible</div>'; return; }
    
    const heroArticle = ecoArticles[0];
    const subArticles = ecoArticles.slice(1, 6);
    const cleanDesc = (heroArticle.description || "").replace(/<[^>]*>/g, '').substring(0, 400);
    
    let html = `<div class="economy-hero-wrapper"><div class="economy-hero-flexible">
        <div class="economy-hero-left"><span class="economy-hero-category">${heroArticle.category || 'ÉCONOMIE'}</span>
        <h1 class="economy-hero-title" onclick="window.location.href='redaction.html?id=${heroArticle.id}'">${escapeHtml(heroArticle.titre)}</h1>
        <p class="economy-hero-description">${cleanDesc}...</p>
        <div class="economy-hero-meta"><span class="economy-hero-read-time">${calculerTempsLecture(heroArticle.description)}</span>
        <span class="economy-hero-cta" onclick="window.location.href='redaction.html?id=${heroArticle.id}'"></span></div></div>
        <div class="economy-hero-right">${renderSectionMedia(heroArticle)}</div>
    </div></div>`;
    
    html += renderSubArticlesAsMediaObject(subArticles);
    container.innerHTML = html;
}

function renderInternational(articles) {
    const container = document.getElementById('international-grid');
    if (!container) return;
    const internationalArticles = articles.filter(a => a?.category && ['INTERNATIONAL', 'MONDE', 'GLOBAL'].includes(a.category));
    if (!internationalArticles.length) { container.innerHTML = '<div class="international-empty">Aucun article international disponible</div>'; return; }
    
    const heroArticle = internationalArticles[0];
    const subArticles = internationalArticles.slice(1, 6);
    const cleanDesc = (heroArticle.description || "").replace(/<[^>]*>/g, '').substring(0, 400);
    
    let html = `<div class="international-hero-wrapper"><div class="international-hero-flexible">
        <div class="international-hero-left"><span class="international-hero-category">${heroArticle.subcategory || heroArticle.category || 'INTERNATIONAL'}</span>
        <h1 class="international-hero-title" onclick="window.location.href='redaction.html?id=${heroArticle.id}'">${escapeHtml(heroArticle.titre)}</h1>
        <p class="international-hero-description">${cleanDesc}...</p>
        <div class="international-hero-meta"><span class="international-hero-read-time">${calculerTempsLecture(heroArticle.description)}</span>
        <span class="international-hero-cta" onclick="window.location.href='redaction.html?id=${heroArticle.id}'"></span></div></div>
        <div class="international-hero-right">${renderSectionMedia(heroArticle)}</div>
    </div></div>`;
    
    html += renderSubArticlesAsMediaObject(subArticles);
    container.innerHTML = html;
}

function renderEnvironnement(articles) {
    const container = document.getElementById('environnement-grid');
    if (!container) return;
    const environnementArticles = articles.filter(a => a?.category && ['ENVIRONNEMENT', 'CLIMAT', 'ECOLOGIE'].includes(a.category));
    if (!environnementArticles.length) { container.innerHTML = '<div class="environnement-empty">Aucun article environnement disponible</div>'; return; }
    
    const heroArticle = environnementArticles[0];
    const subArticles = environnementArticles.slice(1, 6);
    const cleanDesc = (heroArticle.description || "").replace(/<[^>]*>/g, '').substring(0, 400);
    
    let html = `<div class="environnement-hero-wrapper"><div class="environnement-hero-flexible">
        <div class="environnement-hero-left"><span class="environnement-hero-category">${heroArticle.subcategory || heroArticle.category || 'ENVIRONNEMENT'}</span>
        <h1 class="environnement-hero-title" onclick="window.location.href='redaction.html?id=${heroArticle.id}'">${escapeHtml(heroArticle.titre)}</h1>
        <p class="environnement-hero-description">${cleanDesc}...</p>
        <div class="environnement-hero-meta"><span class="environnement-hero-read-time">${calculerTempsLecture(heroArticle.description)}</span>
        <span class="environnement-hero-cta" onclick="window.location.href='redaction.html?id=${heroArticle.id}'"></span></div></div>
        <div class="environnement-hero-right">${renderSectionMedia(heroArticle)}</div>
    </div></div>`;
    
    html += renderSubArticlesAsMediaObject(subArticles);
    container.innerHTML = html;
}

function renderSport(articles) {
    const container = document.getElementById('sport-grid');
    if (!container) return;
    const sportCategories = ['SPORT_FOOTBALL', 'SPORT_BASKETBALL', 'SPORT_TENNIS', 'SPORT_COMBAT', 'SPORT_ESPORT', 'SPORT'];
    const sportArticles = articles.filter(a => a?.category && sportCategories.includes(a.category));
    if (!sportArticles.length) { container.innerHTML = '<div class="sport-empty">Aucun article sport disponible</div>'; return; }
    
    const heroArticle = sportArticles[0];
    const subArticles = sportArticles.slice(1, 6);
    const cleanDesc = (heroArticle.description || "").replace(/<[^>]*>/g, '').substring(0, 400);
    
    let html = `<div class="sport-hero-wrapper"><div class="sport-hero-flexible">
        <div class="sport-hero-left"><span class="sport-hero-category">${heroArticle.category?.replace('SPORT_', '') || 'SPORT'}</span>
        <h1 class="sport-hero-title" onclick="window.location.href='redaction.html?id=${heroArticle.id}'">${escapeHtml(heroArticle.titre)}</h1>
        <p class="sport-hero-description">${cleanDesc}...</p>
        <div class="sport-hero-meta"><span class="sport-hero-read-time">${calculerTempsLecture(heroArticle.description)}</span>
        <span class="sport-hero-cta" onclick="window.location.href='redaction.html?id=${heroArticle.id}'"></span></div></div>
        <div class="sport-hero-right">${renderSectionMedia(heroArticle)}</div>
    </div></div>`;
    
    html += renderSubArticlesAsMediaObject(subArticles);
    container.innerHTML = html;
}

/* ==========================================================================
   RENDER AUTRE INFO, OPINIONS, LIFESTYLE, MORE NEWS
   ========================================================================== */
function renderAutreInfo(articles) {
    const container = document.getElementById('sidebar-list');
    if (!container || !articles || articles.length === 0) return;
    setSlidesData(articles);
    const mainArt = articles[0];
    const secondaryArticles = articles.slice(1, 3);
    let html = `<article class="main-trending-card" onclick="window.location.href='redaction.html?id=${encodeURIComponent(mainArt.id)}'">
        <img src="${mainArt.image_url || 'https://via.placeholder.com/600x400'}" class="slide-cover" onerror="this.src='https://via.placeholder.com/600x400'">
        <div class="card-content"><span class="photo-credit">${escapeHtml(mainArt.author_name || 'MakMus')}</span>
        <h2 class="main-headline">${escapeHtml(mainArt.titre)}</h2>
        <p class="summary-text">${escapeHtml((mainArt.description || "").replace(/<[^>]*>/g, '').substring(0, 100))}...</p>
        <span class="main-read-time">${calculerTempsLecture(mainArt.description)}</span></div></article>`;
    if (secondaryArticles.length) {
        html += `<div class="secondary-grid">${secondaryArticles.map(art => `<article class="grid-card" onclick="window.location.href='redaction.html?id=${encodeURIComponent(art.id)}'">
            <img src="${art.image_url || 'https://via.placeholder.com/300x300'}" class="grid-cover" onerror="this.src='https://via.placeholder.com/300x300'">
            <h4 class="grid-headline">${escapeHtml(art.titre)}</h4><span class="grid-read-time">${calculerTempsLecture(art.description)}</span></article>`).join('')}</div>`;
    }
    container.innerHTML = html;
}

function renderOpinions(opinions) {
    const container = document.getElementById('opinion-list');
    if (!container || !opinions?.length) return;
    container.innerHTML = opinions.map((op, i) => `<div class="opinion-container-box">
        <div class="opinion-author-row"><span class="author-name">${escapeHtml(op.author_name || 'La Redaction')}</span>
        <img class="author-avatar" src="${op.author_image || 'https://via.placeholder.com/40'}" onerror="this.src='https://via.placeholder.com/40'"></div>
        <h4 class="opinion-text-title" onclick="window.location.href='redaction.html?id=${op.id}'">${escapeHtml(op.titre)}</h4>
        <span class="read-time-small">${calculerTempsLecture(op.description)}</span>
        ${i === 0 && op.image_url ? `<img class="opinion-main-cover" src="${op.image_url}" onclick="window.location.href='redaction.html?id=${op.id}'">` : ''}
    </div>`).join('');
}

function renderLifestyle(articles) {
    const container = document.getElementById('lifestyle-grid');
    if (!container || !articles?.length) return;
    const main = articles[0];
    const subs = articles.slice(1, 4);
    container.innerHTML = `<div class="lifestyle-main" onclick="window.location.href='redaction.html?id=${main.id}'">
        <div class="ls-main-text"><h2 class="ls-main-title">${escapeHtml(main.titre)}</h2><p class="ls-excerpt">${(main.description || "").replace(/<[^>]*>/g, '').substring(0, 160)}...</p><span class="ls-read-time">${calculerTempsLecture(main.description)}</span></div>
        <div class="ls-main-img"><img src="${main.image_url || 'https://via.placeholder.com/800x500'}" onerror="this.src='https://via.placeholder.com/800x500'">${main.author_name ? `<span class="ls-photo-credit">${escapeHtml(main.author_name)}</span>` : ''}</div>
    </div><div class="lifestyle-sub-grid">${subs.map(art => `<div class="ls-sub-card" onclick="window.location.href='redaction.html?id=${art.id}'">
        <div class="ls-sub-text"><h4>${escapeHtml(art.titre)}</h4><span class="ls-read-time">${calculerTempsLecture(art.description)}</span></div>
        <img src="${art.image_url || 'https://via.placeholder.com/150x150'}" class="ls-sub-img"></div>`).join('')}</div>`;
}

function renderMoreNews(articles) {
    const container = document.getElementById('more-info-grid');
    if (!container) return;
    const categories = [...new Set(articles.map(a => a.category))].slice(0, 5);
    container.innerHTML = categories.map(cat => {
        const filtered = articles.filter(a => a.category === cat).slice(0, 4);
        if (!filtered.length) return '';
        const main = filtered[0];
        const subs = filtered.slice(1);
        return `<div class="info-category-block"><span class="category-label">${cat.replace('_', ' ')}</span>
            <img src="${main.image_url}" class="info-main-img" onclick="window.location.href='redaction.html?id=${main.id}'">
            <h4 class="info-main-title" onclick="window.location.href='redaction.html?id=${main.id}'">${escapeHtml(main.titre)}</h4>
            <div class="info-sub-list">${subs.map(s => `<p class="info-sub-title" onclick="window.location.href='redaction.html?id=${s.id}'">${escapeHtml(s.titre)}</p>`).join('')}</div></div>`;
    }).join('');
}

/* ==========================================================================
   SYNC SIDEBAR CONTENT
   ========================================================================== */
function syncSidebarContent() {
    const desktopList = document.querySelector('#sidebar-list');
    const mobileList = document.querySelector('#sidebar-list-mobile');
    if (desktopList && mobileList) {
        mobileList.innerHTML = desktopList.innerHTML;
    }
    
    const desktopOpinion = document.querySelector('#opinion-list');
    const mobileOpinion = document.querySelector('#opinion-list-mobile');
    if (desktopOpinion && mobileOpinion) {
        mobileOpinion.innerHTML = desktopOpinion.innerHTML;
    }
}
// Synchroniser le contenu entre sidebar desktop et mobile
function syncSidebarContent() {
    // Synchroniser la liste "AUTRE INFO"
    const desktopList = document.querySelector('#sidebar-list');
    const mobileList = document.querySelector('#sidebar-list-mobile');
    
    if (desktopList && mobileList) {
        mobileList.innerHTML = desktopList.innerHTML;
        console.log('✅ Sidebar list synchronisée');
    }
    
    // Synchroniser la liste "OPINION"
    const desktopOpinion = document.querySelector('#opinion-list');
    const mobileOpinion = document.querySelector('#opinion-list-mobile');
    
    if (desktopOpinion && mobileOpinion) {
        mobileOpinion.innerHTML = desktopOpinion.innerHTML;
        console.log('✅ Opinion list synchronisée');
    }
}

// Appeler après chaque rendu de contenu
function renderAutreInfo(articles) {
    const container = document.getElementById('sidebar-list');
    if (!container || !articles || articles.length === 0) return;
    setSlidesData(articles);
    const mainArt = articles[0];
    const secondaryArticles = articles.slice(1, 3);
    let html = `<article class="main-trending-card" onclick="window.location.href='redaction.html?id=${encodeURIComponent(mainArt.id)}'">
        <img src="${mainArt.image_url || 'https://via.placeholder.com/600x400'}" class="slide-cover" onerror="this.src='https://via.placeholder.com/600x400'">
        <div class="card-content"><span class="photo-credit">${escapeHtml(mainArt.author_name || 'MakMus')}</span>
        <h2 class="main-headline">${escapeHtml(mainArt.titre)}</h2>
        <p class="summary-text">${escapeHtml((mainArt.description || "").replace(/<[^>]*>/g, '').substring(0, 100))}...</p>
        <span class="main-read-time">${calculerTempsLecture(mainArt.description)}</span></div></article>`;
    if (secondaryArticles.length) {
        html += `<div class="secondary-grid">${secondaryArticles.map(art => `<article class="grid-card" onclick="window.location.href='redaction.html?id=${encodeURIComponent(art.id)}'">
            <img src="${art.image_url || 'https://via.placeholder.com/300x300'}" class="grid-cover" onerror="this.src='https://via.placeholder.com/300x300'">
            <h4 class="grid-headline">${escapeHtml(art.titre)}</h4><span class="grid-read-time">${calculerTempsLecture(art.description)}</span></article>`).join('')}</div>`;
    }
    container.innerHTML = html;
    
    // 🔄 SYNC AVEC LA SIDEBAR MOBILE
    syncSidebarContent();
}

function renderOpinions(opinions) {
    const container = document.getElementById('opinion-list');
    if (!container || !opinions?.length) return;
    container.innerHTML = opinions.map((op, i) => `<div class="opinion-container-box">
        <div class="opinion-author-row"><span class="author-name">${escapeHtml(op.author_name || 'La Redaction')}</span>
        <img class="author-avatar" src="${op.author_image || 'https://via.placeholder.com/40'}" onerror="this.src='https://via.placeholder.com/40'"></div>
        <h4 class="opinion-text-title" onclick="window.location.href='redaction.html?id=${op.id}'">${escapeHtml(op.titre)}</h4>
        <span class="read-time-small">${calculerTempsLecture(op.description)}</span>
        ${i === 0 && op.image_url ? `<img class="opinion-main-cover" src="${op.image_url}" onclick="window.location.href='redaction.html?id=${op.id}'">` : ''}
    </div>`).join('');
    
    // 🔄 SYNC AVEC LA SIDEBAR MOBILE
    syncSidebarContent();
}
/* ==========================================================================
   RENDER AUDIOS
   ========================================================================== */
function renderAudios(audios) {
    const container = document.getElementById('audio-grid');
    if (!container) {
        console.warn('⚠️ #audio-grid non trouvé dans le DOM');
        return;
    }
    
    if (!audios || audios.length === 0) {
        container.innerHTML = '<div class="audio-empty">Aucun audio disponible</div>';
        return;
    }
    
    container.innerHTML = audios.map(audio => {
        const minutes = Math.floor(audio.duree / 60);
        const seconds = audio.duree % 60;
        const tag = audio.type === 'resume' ? 'RÉSUMÉ' : audio.type === 'podcast' ? 'PODCAST' : 'INFO';
        
        return `
            <div class="audio-card" data-audio-id="${audio.id}">
                <div class="audio-image-wrapper">
                    <img src="${audio.image_url || 'https://picsum.photos/80/80'}" onerror="this.src='https://picsum.photos/80/80'">
                </div>
                <div class="audio-info">
                    <div class="audio-label-group">
                        <span class="audio-tag">${tag}</span>
                        ${audio.source ? `<span class="audio-source">${escapeHtml(audio.source)}</span>` : ''}
                        ${audio.category ? `<span class="audio-category">${escapeHtml(audio.category)}</span>` : ''}
                    </div>
                    <h4 class="audio-title">${escapeHtml(audio.titre)}</h4>
                    ${audio.description ? `<p class="audio-description">${escapeHtml(audio.description.substring(0, 100))}...</p>` : ''}
                    <div class="audio-player-bar">
                        <button class="play-circle" data-audio-url="${audio.audio_url}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="5 3 19 12 5 21 5 3"/>
                            </svg>
                        </button>
                        <span class="audio-duration">${minutes}:${seconds < 10 ? '0' + seconds : seconds}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    document.querySelectorAll('.play-circle').forEach(btn => {
        btn.removeEventListener('click', handleAudioPlay);
        btn.addEventListener('click', handleAudioPlay);
    });
}

function handleAudioPlay(e) {
    e.stopPropagation();
    const btn = e.currentTarget;
    const audioUrl = btn.getAttribute('data-audio-url');
    
    if (!audioUrl) {
        showToast('Audio non disponible', 'error');
        return;
    }
    
    if (currentAudioObj) {
        currentAudioObj.pause();
        if (currentPlayBtn) {
            currentPlayBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
        }
    }
    
    if (currentAudioObj && currentAudioObj.src === audioUrl && currentAudioObj.paused) {
        currentAudioObj.play();
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
        currentPlayBtn = btn;
        return;
    }
    
    if (currentAudioObj && currentAudioObj.src === audioUrl && !currentAudioObj.paused) {
        currentAudioObj.pause();
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
        currentAudioObj = null;
        currentPlayBtn = null;
        return;
    }
    
    currentAudioObj = new Audio(audioUrl);
    currentAudioObj.play().catch(error => {
        console.error('Erreur lecture:', error);
        showToast('Impossible de lire cet audio', 'error');
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
        currentAudioObj = null;
        currentPlayBtn = null;
    });
    
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    currentPlayBtn = btn;
    
    currentAudioObj.onended = () => {
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
        currentAudioObj = null;
        currentPlayBtn = null;
    };
}

/* ==========================================================================
   PUBLICITE
   ========================================================================== */
let adsData = [];
let currentAdIdx = 0;
let adsInterval = null;

async function initAds() {
    try {
        if (typeof supabaseClient === 'undefined') {
            console.warn('Supabase non initialisé');
            displayFallbackAd();
            return;
        }
        
        const { data, error } = await supabaseClient
            .from('publicites')
            .select('*')
            .eq('est_active', true)
            .order('created_at', { ascending: true });
        
        if (error) throw error;
        
        if (!data || data.length === 0) {
            displayFallbackAd();
            return;
        }
        
        adsData = data;
        currentAdIdx = 0;
        displayNextAd();
        
        if (adsInterval) clearInterval(adsInterval);
        adsInterval = setInterval(displayNextAd, 15000);
        
    } catch (error) {
        console.error('Erreur chargement publicites:', error);
        displayFallbackAd();
    }
}

function displayNextAd() {
    const zone = document.getElementById('ad-display-zone');
    if (!zone) return;
    
    if (!adsData || adsData.length === 0) {
        displayFallbackAd();
        return;
    }
    
    const ad = adsData[currentAdIdx];
    if (!ad) {
        displayFallbackAd();
        return;
    }
    
    const clickUrl = ad.lien_clic && ad.lien_clic !== '' ? ad.lien_clic : '#';
    let adHtml = '';
    const adLabel = '<div class="ad-label">PUBLICITÉ</div>';
    
    if (ad.type === 'video') {
        adHtml = `
            <div class="ad-container ad-video">
                ${adLabel}
                <video class="ad-raw-media" 
                       src="${ad.media_url}" 
                       autoplay 
                       muted 
                       loop 
                       playsinline 
                       onclick="window.open('${clickUrl}', '_blank')">
                </video>
            </div>
        `;
    } else {
        const imageUrl = ad.media_url && ad.media_url !== '' 
            ? ad.media_url 
            : 'https://via.placeholder.com/728x90?text=Publicite';
        
        adHtml = `
            <div class="ad-container ad-image">
                ${adLabel}
                <img class="ad-raw-media" 
                     src="${imageUrl}" 
                     onclick="window.open('${clickUrl}', '_blank')" 
                     onerror="this.src='https://via.placeholder.com/728x90?text=Image+non+disponible'">
            </div>
        `;
    }
    
    zone.innerHTML = adHtml;
    currentAdIdx = (currentAdIdx + 1) % adsData.length;
}

function displayFallbackAd() {
    const zone = document.getElementById('ad-display-zone');
    if (!zone) return;
    
    zone.innerHTML = `
        <div class="ad-container ad-fallback">
            <div class="ad-label">ESPACE PUBLICITAIRE</div>
            <div class="ad-fallback-content">
                <span>Votre publicité ici</span>
                <small>Contactez-nous</small>
            </div>
        </div>
    `;
}

/* ==========================================================================
   VIDEOS
   ========================================================================== */
async function fetchVideos() {
    const { data } = await supabaseClient.from('videos_du_jour').select('*').eq('is_published', true);
    const slider = document.getElementById('video-slider');
    if (!slider || !data) return;
    
    slider.innerHTML = data.map((vid, index) => `
        <div class="video-magazine-item">
            <div class="video-card">
                <video playsinline muted ${index === 0 ? 'autoplay' : ''} loop data-src="${vid.video_url}" preload="none"></video>
                <div class="video-controls-vertical">
                    <button class="video-control-btn play-pause-btn" onclick="window.toggleVideoPlay(this)">
                        <svg viewBox="0 0 24 24" fill="white" width="20" height="20">
                            <polygon points="5 3 19 12 5 21 5 3" class="play-icon"/>
                            <rect x="6" y="4" width="4" height="16" class="pause-icon" style="display:none" rx="1"/>
                            <rect x="14" y="4" width="4" height="16" class="pause-icon-2" style="display:none" rx="1"/>
                        </svg>
                    </button>
                    <button class="video-control-btn volume-btn" onclick="window.toggleVideoVolume(this)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="18" height="18">
                            <path d="M11 5L6 9H2v6h4l5 4V5z"/>
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.08"/>
                        </svg>
                    </button>
                    <button class="video-control-btn fullscreen-btn" onclick="window.toggleVideoFullscreen(this)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="18" height="18">
                            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                        </svg>
                    </button>
                </div>
                <div class="play-overlay" onclick="window.playVideo(this)"><div class="play-button"><svg width="48" height="48" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg></div></div>
            </div>
            <h4 class="video-mag-title">${escapeHtml(vid.titre)}</h4>
        </div>
    `).join('');
}

/* ==========================================================================
   TAGS TRENDING
   ========================================================================== */
async function loadTrendingTags() {
    const container = document.getElementById('tags-container');
    if (!container) return;
    try {
        const { data } = await supabaseClient.from('articles').select('tags').eq('is_published', true).not('tags', 'is', null).limit(50);
        const counts = {};
        data?.forEach(art => {
            if (typeof art.tags === 'string') art.tags.split(',').forEach(t => { const tag = t.trim(); if (tag) counts[tag] = (counts[tag] || 0) + 1; });
        });
        const topTags = Object.keys(counts).sort((a,b) => counts[b] - counts[a]).slice(0, 6);
        container.innerHTML = topTags.length ? topTags.map((tag, i) => `<span class="trending-link ${i === 0 ? 'is-live' : ''}" onclick="fetchMakmusNews('${tag.replace(/'/g, "\\'")}')">${tag.toUpperCase()}</span>`).join('') : '<span class="trending-link">AUCUN TAG</span>';
    } catch(e) { console.warn("Tags error:", e); container.innerHTML = '<span class="trending-link">TAGS INDISPONIBLES</span>'; }
}

/* ==========================================================================
   SLIDER AUTRE INFO
   ========================================================================== */
let currentSlideIndex = 0;
let slidesData = [];

function setSlidesData(slides) { slidesData = slides; currentSlideIndex = 0; }

window.moveSlide = function(direction) {
    if (!slidesData.length) return;
    currentSlideIndex += direction;
    if (currentSlideIndex < 0) currentSlideIndex = slidesData.length - 1;
    if (currentSlideIndex >= slidesData.length) currentSlideIndex = 0;
    updateSlideDisplay();
};

function updateSlideDisplay() {
    const container = document.getElementById('sidebar-list');
    if (!container || !slidesData.length) return;
    const slide = slidesData[currentSlideIndex];
    if (!slide) return;
    const mainArt = slide;
    const secondaryArticles = slidesData.slice(1, 3);
    let html = `<article class="main-trending-card" onclick="window.location.href='redaction.html?id=${encodeURIComponent(mainArt.id)}'">
        <img src="${mainArt.image_url || 'https://via.placeholder.com/600x400'}" class="slide-cover" onerror="this.src='https://via.placeholder.com/600x400'">
        <div class="card-content"><span class="photo-credit">${escapeHtml(mainArt.author_name || 'MakMus')}</span>
        <h2 class="main-headline">${escapeHtml(mainArt.titre)}</h2>
        <p class="summary-text">${escapeHtml((mainArt.description || "").replace(/<[^>]*>/g, '').substring(0, 100))}...</p>
        <span class="main-read-time">${calculerTempsLecture(mainArt.description)}</span></div></article>`;
    if (secondaryArticles.length) {
        html += `<div class="secondary-grid">${secondaryArticles.map(art => `<article class="grid-card" onclick="window.location.href='redaction.html?id=${encodeURIComponent(art.id)}'">
            <img src="${art.image_url || 'https://via.placeholder.com/300x300'}" class="grid-cover" onerror="this.src='https://via.placeholder.com/300x300'">
            <h4 class="grid-headline">${escapeHtml(art.titre)}</h4><span class="grid-read-time">${calculerTempsLecture(art.description)}</span></article>`).join('')}</div>`;
    }
    container.innerHTML = html;
}

/* ==========================================================================
   FONCTIONS DE PARTAGE
   ========================================================================== */
window.shareArticle = function(articleId, articleTitle, articleImage, articleDescription) {
    const articleUrl = `${window.location.origin}/redaction.html?id=${articleId}`;
    const shareData = {
        title: articleTitle,
        text: articleDescription || 'Découvrez cet article sur MAKMUS',
        url: articleUrl
    };
    
    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        navigator.share(shareData).catch(e => console.log('Partage annulé:', e));
    } else {
        openShareModal(articleId, articleTitle, articleUrl);
    }
};

function openShareModal(articleId, articleTitle, articleUrl) {
    const urlPreview = document.getElementById('share-url-preview');
    if (urlPreview) urlPreview.textContent = articleUrl;
    window.currentShareUrl = articleUrl;
    window.currentShareTitle = articleTitle;
    window.toggleModal('shareModal', true);
}

window.copyLink = function() {
    const url = window.currentShareUrl || window.location.href;
    navigator.clipboard.writeText(url);
    showToast("Lien copié !");
    window.toggleModal('shareModal', false);
};

window.shareToX = function() {
    const url = encodeURIComponent(window.currentShareUrl || window.location.href);
    const title = encodeURIComponent(window.currentShareTitle || document.title);
    window.open(`https://twitter.com/intent/tweet?text=${title}&url=${url}`, '_blank', 'width=600,height=450');
    window.toggleModal('shareModal', false);
};

window.shareToFacebook = function() {
    const url = encodeURIComponent(window.currentShareUrl || window.location.href);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank', 'width=600,height=450');
    window.toggleModal('shareModal', false);
};

window.shareToWhatsApp = function() {
    const url = encodeURIComponent(window.currentShareUrl || window.location.href);
    const title = encodeURIComponent(window.currentShareTitle || document.title);
    window.open(`https://wa.me/?text=${title}%20${url}`, '_blank', 'width=600,height=450');
    window.toggleModal('shareModal', false);
};

/* ==========================================================================
   INITIALISATION
   ========================================================================== */
function renderEmptyStates() {
    const hero = document.getElementById('hero-zone');
    if (hero) hero.innerHTML = '<div class="hero-empty">Aucun article disponible</div>';
    
    const eco = document.getElementById('economy-grid');
    if (eco) eco.innerHTML = '<div class="economy-empty">Aucun article économique</div>';
    
    const international = document.getElementById('international-grid');
    if (international) international.innerHTML = '<div class="international-empty">Aucun article international</div>';
    
    const environnement = document.getElementById('environnement-grid');
    if (environnement) environnement.innerHTML = '<div class="environnement-empty">Aucun article environnement</div>';
    
    const sport = document.getElementById('sport-grid');
    if (sport) sport.innerHTML = '<div class="sport-empty">Aucun article sport</div>';
    
    const audio = document.getElementById('audio-grid');
    if (audio) audio.innerHTML = '<div class="audio-empty">Aucun audio disponible</div>';
    
    const news = document.getElementById('news-grid');
    if (news) news.innerHTML = '<div class="news-empty">Aucun article</div>';
}

document.addEventListener('DOMContentLoaded', () => {
    const dateEl = document.getElementById('live-date');
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
    
    window.checkUserStatus();
    fetchMakmusNews();
    
    fetchMarketData().then(success => { if (success) { updateTickerUI(); setInterval(updateTickerUI, 10000); } });
    setInterval(fetchMarketData, 3600000);
    fetchVideos();
    initAds();
    loadTrendingTags();
    
    console.log("MAKMUS — Initialisé avec succès");
});