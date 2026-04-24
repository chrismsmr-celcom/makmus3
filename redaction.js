/* ==========================================================================
   PAGE ARTICLE — MAKMUS (VERSION CORRIGÉE - SLUG FIX + LIKES/FAVORIS + SIDE PANELS + VUES)
   ========================================================================== */

const SUPABASE_URL = 'https://logphtrdkpbfgtejtime.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvZ3BodHJka3BiZmd0ZWp0aW1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNzY4MDYsImV4cCI6MjA4NTc1MjgwNn0.Uoxiax-whIdbB5oI3bof-hN0m5O9PDi96zmaUZ6BBio';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Récupération du slug depuis l'URL
const urlParams = new URLSearchParams(window.location.search);
let articleId = urlParams.get('id');
let articleSlug = urlParams.get('slug');

// Si l'URL est de type /article/mon-slug (sans paramètre)
if (!articleId && !articleSlug && window.location.pathname.startsWith('/article/')) {
    articleSlug = window.location.pathname.replace('/article/', '');
    articleSlug = articleSlug.split('?')[0];
    articleSlug = articleSlug.split('#')[0];
    console.log('✅ SLUG détecté depuis pathname:', articleSlug);
}

// Redirection si slug présent mais pas dans l'URL
if (articleSlug && !window.location.search.includes('slug=')) {
    const newUrl = `${window.location.origin}/redaction.html?slug=${encodeURIComponent(articleSlug)}`;
    console.log('🔄 Redirection vers:', newUrl);
    window.location.replace(newUrl);
    throw new Error('Redirection en cours');
}

let currentArticle = null;
let currentUser = null;
let progressInterval = null;
let keepAliveInterval = null;
let currentAudioChunks = [];
let currentChunkIndex = 0;
let isAudioPlaying = false;
let currentAudioUtterance = null;
let totalAudioDuration = 0;

/* --------------------------------------
   UTILITAIRES
   -------------------------------------- */
function showToast(message, type) {
    type = type || 'success';
    var existing = document.querySelector('.makmus-toast');
    if (existing) existing.remove();
    
    var toast = document.createElement('div');
    toast.className = 'makmus-toast';
    toast.innerHTML = '<span>' + message + '</span>';
    document.body.appendChild(toast);
    
    setTimeout(function() { toast.classList.add('show'); }, 100);
    setTimeout(function() {
        toast.classList.remove('show');
        setTimeout(function() { toast.remove(); }, 400);
    }, 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updateLiveDate() {
    var el = document.getElementById('live-date');
    if (el) {
        el.textContent = new Date().toLocaleDateString('fr-FR', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        }).toUpperCase();
    }
}

function cleanTextForSpeech(text) {
    if (!text) return '';
    return text
        .replace(/https?:\/\/[^\s]+/g, '')
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        .replace(/[^\w\s\.\,\!\?\;\:\'\"\(\)\[\]\{\}\<\>\@\#\$\%\^\&\*\-\+\=\\\/\|\`\~]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function splitTextIntoChunks(text, maxChunkSize) {
    maxChunkSize = maxChunkSize || 800;
    var sentences = text.match(/[^\.!\?]+[\.!\?]+/g) || [text];
    var chunks = [];
    var currentChunk = '';
    
    for (var i = 0; i < sentences.length; i++) {
        var sentence = sentences[i];
        if ((currentChunk + sentence).length > maxChunkSize) {
            if (currentChunk) chunks.push(currentChunk.trim());
            currentChunk = sentence;
        } else {
            currentChunk += sentence;
        }
    }
    if (currentChunk) chunks.push(currentChunk.trim());
    return chunks;
}

function calculateReadTime(content) {
    var wordsPerMinute = 200;
    var text = content.replace(/<[^>]*>/g, '');
    var wordCount = text.split(/\s+/).length;
    var minutes = Math.ceil(wordCount / wordsPerMinute);
    return minutes;
}

function saveReadingPosition() {
    var scrollPos = window.scrollY;
    localStorage.setItem('reading_pos_' + (currentArticle?.id || articleId), scrollPos);
}

function restoreReadingPosition() {
    var savedPos = localStorage.getItem('reading_pos_' + (currentArticle?.id || articleId));
    if (savedPos && currentArticle) {
        setTimeout(function() { window.scrollTo(0, parseInt(savedPos)); }, 500);
        showToast("Reprise de la lecture", 'info');
    }
}

function initScrollProgress() {
    var progressBar = document.createElement('div');
    progressBar.id = 'scroll-progress';
    progressBar.style.cssText = 'position: fixed; top: 0; left: 0; width: 0%; height: 3px; background: #a30000; z-index: 10001; transition: width 0.1s ease;';
    document.body.appendChild(progressBar);
    
    window.addEventListener('scroll', function() {
        var winScroll = document.body.scrollTop || document.documentElement.scrollTop;
        var height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        var scrolled = (winScroll / height) * 100;
        progressBar.style.width = scrolled + '%';
    });
}

/* --------------------------------------
   MENU & PANNEAUX
   -------------------------------------- */
window.toggleMenu = function(show) {
    var menu = document.getElementById('fullMenu');
    if (!menu) return;
    var shouldOpen = typeof show === 'boolean' ? show : !menu.classList.contains('active');
    if (shouldOpen) {
        menu.classList.add('active');
        document.body.style.overflow = 'hidden';
    } else {
        menu.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
};

window.toggleSidePanel = function(isOpen) {
    var panel = document.getElementById('sideAccount');
    if (!panel) return;
    panel.classList.toggle('active', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : 'auto';
};

window.toggleSharePanel = function(isOpen) {
    var panel = document.getElementById('sharePanel');
    if (!panel) return;
    panel.classList.toggle('active', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : 'auto';
};

window.toggleModal = function(id, show) {
    var modal = document.getElementById(id);
    if (modal) {
        modal.style.display = show ? 'flex' : 'none';
        document.body.style.overflow = show ? 'hidden' : 'auto';
    }
};

document.addEventListener('click', function(e) {
    if (e.target.classList.contains('side-panel-overlay')) {
        window.toggleSidePanel(false);
        window.toggleSharePanel(false);
        window.closeCommentsPanel();
    }
});

/* --------------------------------------
   AUTHENTIFICATION - FONCTIONS
   -------------------------------------- */
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
            
            if (typeof window.loadUserActivity === 'function') {
                window.loadUserActivity().catch(function(err) {
                    console.warn('loadUserActivity error:', err);
                });
            }
            
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

/* --------------------------------------
   AUTHENTIFICATION SIMPLIFIÉE
   -------------------------------------- */

let isLoginMode = true;

function updateAuthUI() {
    const submitBtn = document.getElementById('auth-submit-btn');
    const toggleBtn = document.getElementById('auth-toggle-btn');
    const modeText = document.getElementById('auth-mode-text');
    
    if (!submitBtn) return;
    
    if (isLoginMode) {
        submitBtn.textContent = 'SE CONNECTER';
        if (toggleBtn) toggleBtn.textContent = 'CREER UN COMPTE';
        if (modeText) modeText.innerHTML = 'Pas encore de compte ? Cliquez sur "Créer un compte"';
    } else {
        submitBtn.textContent = "S'INSCRIRE";
        if (toggleBtn) toggleBtn.textContent = 'RETOUR A LA CONNEXION';
        if (modeText) modeText.innerHTML = 'Déjà un compte ? Cliquez sur "Retour à la connexion"';
    }
}

window.handleSimplifiedAuth = async function() {
    const emailInput = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    
    const email = emailInput?.value.trim();
    const password = passwordInput?.value;
    
    if (!email || !password) {
        showToast('Veuillez remplir tous les champs', 'error');
        return;
    }
    
    if (!email.includes('@') || !email.includes('.')) {
        showToast('Email invalide', 'error');
        return;
    }
    
    if (password.length < 6) {
        showToast('Le mot de passe doit contenir au moins 6 caractères', 'error');
        return;
    }
    
    try {
        let result;
        
        if (isLoginMode) {
            result = await supabaseClient.auth.signInWithPassword({ 
                email: email, 
                password: password 
            });
            if (result.error) throw result.error;
            showToast('Connexion réussie !', 'success');
        } else {
            result = await supabaseClient.auth.signUp({ 
                email: email, 
                password: password,
                options: {
                    emailRedirectTo: window.location.origin,
                    data: { full_name: email.split('@')[0] }
                }
            });
            if (result.error) throw result.error;
            
            if (result.data.session) {
                showToast('Inscription réussie ! Bienvenue !', 'success');
            } else {
                showToast('Inscription réussie ! Connectez-vous', 'success');
                isLoginMode = true;
                updateAuthUI();
                if (emailInput) emailInput.value = '';
                if (passwordInput) passwordInput.value = '';
                return;
            }
        }
        
        await window.checkUserStatus();
        
        if (typeof window.toggleSidePanel === 'function') {
            window.toggleSidePanel(false);
        }
        
        if (typeof currentArticle !== 'undefined' && currentArticle) {
            if (typeof fetchLikeStatus === 'function') fetchLikeStatus();
            if (typeof fetchBookmarkStatus === 'function') fetchBookmarkStatus();
            if (typeof fetchLikesCount === 'function') fetchLikesCount();
        }
        
        if (typeof window.loadUserActivity === 'function') {
            window.loadUserActivity();
        }
        
        if (emailInput) emailInput.value = '';
        if (passwordInput) passwordInput.value = '';
        
    } catch (error) {
        console.error('Auth error:', error);
        
        if (error.message.includes('Invalid login credentials')) {
            showToast('Email ou mot de passe incorrect', 'error');
        } else if (error.message.includes('User already registered')) {
            showToast('Cet email est déjà utilisé. Connectez-vous.', 'error');
            isLoginMode = true;
            updateAuthUI();
        } else {
            showToast(error.message, 'error');
        }
    }
};

window.toggleAuthMode = function() {
    isLoginMode = !isLoginMode;
    updateAuthUI();
    
    const emailInput = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    if (emailInput) emailInput.value = '';
    if (passwordInput) passwordInput.value = '';
};

function initAuthEvents() {
    const submitBtn = document.getElementById('auth-submit-btn');
    const toggleBtn = document.getElementById('auth-toggle-btn');
    
    if (submitBtn) {
        submitBtn.removeEventListener('click', window.handleSimplifiedAuth);
        submitBtn.addEventListener('click', window.handleSimplifiedAuth);
    }
    if (toggleBtn) {
        toggleBtn.removeEventListener('click', window.toggleAuthMode);
        toggleBtn.addEventListener('click', window.toggleAuthMode);
    }
    
    updateAuthUI();
}

window.isLoginMode = isLoginMode;
window.updateAuthUI = updateAuthUI;
window.initAuthEvents = initAuthEvents;

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

window.toggleLike = async function() {
    if (!currentArticle) return;
    
    if (!currentUser) {
        showToast('Connectez-vous pour aimer cet article', 'info');
        window.toggleSidePanel(true);
        return;
    }
    
    const likeBtn = document.getElementById('like-btn');
    if (likeBtn.disabled) {
        showToast('Vous avez déjà aimé cet article', 'info');
        return;
    }
    
    try {
        const { error } = await supabaseClient
            .from('user_likes')
            .insert([{ 
                user_id: currentUser.id, 
                article_id: currentArticle.id 
            }]);
        
        if (error) {
            console.error('Erreur insertion:', error);
            showToast('Erreur lors du like', 'error');
            return;
        }
        
        likeBtn.classList.add('liked');
        likeBtn.disabled = true;
        likeBtn.title = "Vous avez déjà aimé cet article";
        showToast('Article aimé !', 'success');
        fetchLikesCount();
    } catch (error) {
        console.error('Erreur toggleLike:', error);
        showToast('Erreur lors du like', 'error');
    }
};

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
        
        if (typeof window.loadUserActivity === 'function') {
            window.loadUserActivity();
        }
    } catch (error) {
        console.error('Erreur toggleBookmark:', error);
        showToast('Erreur lors de la sauvegarde', 'error');
    }
};

/* --------------------------------------
   DECONNEXION
   -------------------------------------- */
window.handleLogout = async function() {
    if (!confirm("Voulez-vous vous déconnecter ?")) return;
    try {
        await supabaseClient.auth.signOut();
        currentUser = null;
        
        const loggedOut = document.getElementById('logged-out-view');
        const loggedIn = document.getElementById('logged-in-view');
        
        if (loggedOut) loggedOut.style.display = 'block';
        if (loggedIn) loggedIn.style.display = 'none';
        
        const favoritesContainer = document.getElementById('user-favorites-list');
        if (favoritesContainer) {
            favoritesContainer.innerHTML = '<div class="no-favs">Connectez-vous pour voir vos favoris</div>';
        }
        
        showToast('Déconnexion réussie', 'success');
    } catch (error) {
        console.error("Erreur déconnexion:", error);
        showToast('Erreur lors de la déconnexion', 'error');
    }
};

/* --------------------------------------
   COMMENTAIRES - SIDE PANEL
   -------------------------------------- */
window.openComments = function() {
    var panel = document.getElementById('commentPanel');
    var overlay = document.querySelector('#commentPanel .side-panel-overlay');
    if (panel) {
        panel.classList.add('active');
        if (overlay) overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
    fetchComments();
};

window.closeCommentsPanel = function() {
    var panel = document.getElementById('commentPanel');
    var overlay = document.querySelector('#commentPanel .side-panel-overlay');
    if (panel) {
        panel.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
};

window.closeComments = window.closeCommentsPanel;

async function fetchCommentLikeStatus(commentId) {
    if (!currentUser) return false;
    
    try {
        const { data, error } = await supabaseClient
            .from('comment_likes')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('comment_id', commentId)
            .maybeSingle();
        
        return !error && data;
    } catch (error) {
        console.error('Erreur fetchCommentLikeStatus:', error);
        return false;
    }
}

function renderReplies(replies) {
    if (!replies || replies.length === 0) return '';
    
    return replies.map(function(reply) {
        var date = new Date(reply.created_at).toLocaleDateString('fr-FR', {
            day: 'numeric', month: 'short', year: 'numeric'
        });
        
        var displayName = reply.nom;
        if (displayName && displayName.includes('@')) {
            displayName = displayName.split('@')[0];
        }
        
        return `
            <div class="reply-item">
                <div class="comment-author-info">
                    <span class="comment-author">${escapeHtml(displayName)}</span>
                    <span class="comment-date">${date}</span>
                </div>
                <div class="comment-message">${escapeHtml(reply.message)}</div>
                <div class="comment-actions">
                    <button class="comment-like-btn" onclick="window.toggleCommentLike(${reply.id}, this)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                        </svg>
                        <span class="comment-like-count">${reply.likes_count || 0}</span>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function fetchComments() {
    if (!currentArticle) return;
    
    try {
        var { data: comments, error } = await supabaseClient
            .from('article_comments')
            .select('*')
            .eq('article_id', currentArticle.id)
            .is('parent_id', null)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        var { data: replies } = await supabaseClient
            .from('article_comments')
            .select('*')
            .eq('article_id', currentArticle.id)
            .not('parent_id', 'is', null)
            .order('created_at', { ascending: true });
        
        var repliesByParent = {};
        if (replies) {
            replies.forEach(function(reply) {
                if (!repliesByParent[reply.parent_id]) {
                    repliesByParent[reply.parent_id] = [];
                }
                repliesByParent[reply.parent_id].push(reply);
            });
        }
        
        var list = document.getElementById('comments-list');
        if (list) {
            if (!comments || comments.length === 0) {
                list.innerHTML = '<div class="comment-empty">Aucun commentaire pour le moment. Soyez le premier à commenter !</div>';
            } else {
                var commentsHtml = '';
                for (var i = 0; i < comments.length; i++) {
                    var c = comments[i];
                    var isLiked = await fetchCommentLikeStatus(c.id);
                    var date = new Date(c.created_at).toLocaleDateString('fr-FR', {
                        day: 'numeric', month: 'short', year: 'numeric'
                    });
                    
                    var displayName = c.nom;
                    if (displayName && displayName.includes('@')) {
                        displayName = displayName.split('@')[0];
                    }
                    
                    commentsHtml += `
                        <div class="comment-item" data-comment-id="${c.id}">
                            <div class="comment-header">
                                <div class="comment-author-info">
                                    <span class="comment-author">${escapeHtml(displayName)}</span>
                                    <span class="comment-date">${date}</span>
                                </div>
                            </div>
                            <div class="comment-message">${escapeHtml(c.message)}</div>
                            <div class="comment-actions">
                                <button class="comment-like-btn ${isLiked ? 'liked' : ''}" onclick="window.toggleCommentLike(${c.id}, this)">
                                    <svg viewBox="0 0 24 24" fill="${isLiked ? '#a30000' : 'none'}" stroke="currentColor" stroke-width="1.5">
                                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                                    </svg>
                                    <span class="comment-like-count">${c.likes_count || 0}</span>
                                </button>
                                <button class="comment-reply-btn" onclick="window.showReplyForm(${c.id})">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                                    </svg>
                                    <span>Répondre</span>
                                </button>
                            </div>
                            <div id="reply-form-${c.id}" class="reply-form" style="display: none;">
                                <textarea id="reply-text-${c.id}" placeholder="Votre réponse..." class="reply-input" rows="1"></textarea>
                                <button class="reply-submit" onclick="window.postReply(${c.id})">Envoyer</button>
                            </div>
                            <div id="replies-${c.id}" class="comment-replies">
                                ${renderReplies(repliesByParent[c.id] || [])}
                            </div>
                        </div>
                    `;
                }
                list.innerHTML = commentsHtml;
            }
        }
        
        var commSpan = document.getElementById('nb-comm');
        if (commSpan) commSpan.textContent = comments?.length || 0;
    } catch (error) {
        console.error('Erreur fetchComments:', error);
        var list = document.getElementById('comments-list');
        if (list) {
            list.innerHTML = '<div class="comment-empty">Erreur de chargement des commentaires</div>';
        }
    }
}

window.toggleCommentLike = async function(commentId, buttonElement) {
    if (!currentUser) {
        showToast('Connectez-vous pour aimer un commentaire', 'info');
        window.toggleSidePanel(true);
        return;
    }
    
    const isLiked = buttonElement.classList.contains('liked');
    const likeCountSpan = buttonElement.querySelector('.comment-like-count');
    let currentCount = parseInt(likeCountSpan.textContent) || 0;
    
    try {
        if (!isLiked) {
            const { error } = await supabaseClient
                .from('comment_likes')
                .insert([{ user_id: currentUser.id, comment_id: commentId }]);
            
            if (error) throw error;
            
            await supabaseClient
                .from('article_comments')
                .update({ likes_count: currentCount + 1 })
                .eq('id', commentId);
            
            buttonElement.classList.add('liked');
            likeCountSpan.textContent = currentCount + 1;
            showToast('Commentaire aimé !', 'success');
        } else {
            const { error } = await supabaseClient
                .from('comment_likes')
                .delete()
                .eq('user_id', currentUser.id)
                .eq('comment_id', commentId);
            
            if (error) throw error;
            
            await supabaseClient
                .from('article_comments')
                .update({ likes_count: Math.max(0, currentCount - 1) })
                .eq('id', commentId);
            
            buttonElement.classList.remove('liked');
            likeCountSpan.textContent = Math.max(0, currentCount - 1);
            showToast('Like retiré', 'info');
        }
    } catch (error) {
        console.error('Erreur toggleCommentLike:', error);
        showToast('Erreur lors du like', 'error');
    }
};

window.showReplyForm = function(commentId) {
    var form = document.getElementById(`reply-form-${commentId}`);
    if (form) {
        form.style.display = form.style.display === 'none' ? 'flex' : 'none';
        if (form.style.display === 'flex') {
            var textarea = document.getElementById(`reply-text-${commentId}`);
            if (textarea) textarea.focus();
        }
    }
};

window.postReply = async function(parentId) {
    var textInput = document.getElementById(`reply-text-${parentId}`);
    var msg = textInput?.value.trim();
    
    if (!msg) {
        showToast("Veuillez écrire une réponse", 'error');
        return;
    }
    
    if (!currentArticle) return;
    
    const { data: { user } } = await supabaseClient.auth.getUser();
    
    if (!user) {
        showToast("Connectez-vous pour répondre", 'info');
        window.toggleSidePanel(true);
        return;
    }
    
    try {
        var replyData = { 
            article_id: currentArticle.id,
            parent_id: parentId,
            nom: user.email,
            message: msg,
            likes_count: 0
        };
        
        var { error } = await supabaseClient.from('article_comments').insert([replyData]);
        
        if (!error) {
            if (textInput) textInput.value = "";
            fetchComments();
            showToast("Réponse publiée !", 'success');
        } else {
            console.error('Erreur:', error);
            showToast("Erreur: " + (error.message || "Publication impossible"), 'error');
        }
    } catch (error) {
        console.error('Erreur postReply:', error);
        showToast("Erreur lors de la publication", 'error');
    }
};

window.postComment = async function() {
    var msgInput = document.getElementById('comm-text');
    var msg = msgInput?.value.trim();
    
    if (!msg) {
        showToast("Veuillez écrire un commentaire", 'error');
        return;
    }
    
    if (!currentArticle) return;
    
    const { data: { user } } = await supabaseClient.auth.getUser();
    
    if (!user) {
        showToast("Connectez-vous pour commenter", 'info');
        window.toggleSidePanel(true);
        return;
    }
    
    try {
        var commentData = { 
            article_id: currentArticle.id,
            parent_id: null,
            nom: user.email,
            message: msg,
            likes_count: 0
        };
        
        var { error } = await supabaseClient.from('article_comments').insert([commentData]);
        
        if (!error) {
            if (msgInput) msgInput.value = "";
            fetchComments();
            showToast("Commentaire publié !", 'success');
        } else {
            console.error('Erreur:', error);
            showToast("Erreur: " + (error.message || "Publication impossible"), 'error');
        }
    } catch (error) {
        console.error('Erreur postComment:', error);
        showToast("Erreur lors de la publication", 'error');
    }
};

/* --------------------------------------
   PARTAGE - SIDE PANEL
   -------------------------------------- */
window.openShare = function() {
    window.toggleSharePanel(true);
};

window.closeShare = function() {
    window.toggleSharePanel(false);
};

window.copyLink = function() {
    navigator.clipboard.writeText(window.location.href);
    showToast("Lien de l'article copié");
    window.closeShare();
};

window.shareToX = function() {
    var url = encodeURIComponent(window.location.href);
    var title = encodeURIComponent(document.title);
    var shareUrl = 'https://twitter.com/intent/tweet?text=' + title + '&url=' + url;
    window.open(shareUrl, '_blank', 'width=600,height=450');
    window.closeShare();
};

window.shareToFacebook = function() {
    var url = encodeURIComponent(window.location.href);
    var shareUrl = 'https://www.facebook.com/sharer/sharer.php?u=' + url;
    window.open(shareUrl, '_blank', 'width=600,height=450');
    window.closeShare();
};

window.shareToWhatsApp = function() {
    var url = encodeURIComponent(window.location.href);
    var title = encodeURIComponent(document.title);
    var shareUrl = 'https://wa.me/?text=' + title + '%20' + url;
    window.open(shareUrl, '_blank', 'width=600,height=450');
    window.closeShare();
};

window.shareToLinkedIn = function() {
    var url = encodeURIComponent(window.location.href);
    var title = encodeURIComponent(document.title);
    var shareUrl = 'https://www.linkedin.com/sharing/share-offsite/?url=' + url + '&title=' + title;
    window.open(shareUrl, '_blank', 'width=600,height=450');
    window.closeShare();
};

window.shareToTelegram = function() {
    var url = encodeURIComponent(window.location.href);
    var title = encodeURIComponent(document.title);
    var shareUrl = 'https://t.me/share/url?url=' + url + '&text=' + title;
    window.open(shareUrl, '_blank', 'width=600,height=450');
    window.closeShare();
};

window.shareToInstagram = function() {
    var url = encodeURIComponent(window.location.href);
    var title = encodeURIComponent(document.title);
    var shareUrl = `https://www.instagram.com/?url=${url}&caption=${title}`;
    window.open(shareUrl, '_blank', 'width=600,height=450');
    window.closeShare();
    showToast("Partagez le lien sur Instagram", 'info');
};

window.shareToBluesky = function() {
    var url = encodeURIComponent(window.location.href);
    var title = encodeURIComponent(document.title);
    var shareUrl = `https://bsky.app/intent/compose?text=${title}%20${url}`;
    window.open(shareUrl, '_blank', 'width=600,height=450');
    window.closeShare();
};

window.shareToThreads = function() {
    var url = encodeURIComponent(window.location.href);
    var title = encodeURIComponent(document.title);
    var shareUrl = `https://www.threads.net/intent/post?text=${title}%20${url}`;
    window.open(shareUrl, '_blank', 'width=600,height=450');
    window.closeShare();
    showToast("Partagez le lien sur Threads", 'info');
};

/* --------------------------------------
   METADATA OPEN GRAPH & TWITTER CARDS
   -------------------------------------- */

/**
 * Nettoie et valide une URL d'image pour les réseaux sociaux
 * @param {string} url - L'URL de l'image
 * @returns {string|null} - URL nettoyée ou null
 */
function getValidSocialImageUrl(url) {
    if (!url || typeof url !== 'string') return null;
    
    // Supprimer les espaces et caractères invisibles
    let cleanUrl = url.trim();
    
    // Vérifier que c'est une URL HTTP/HTTPS valide
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        console.warn('❌ URL invalide (pas HTTP/HTTPS):', cleanUrl);
        return null;
    }
    
    // Enlever les paramètres de tracking (utm_, fbclid, etc.)
    if (cleanUrl.includes('?')) {
        const urlParts = cleanUrl.split('?');
        const baseUrl = urlParts[0];
        const params = urlParts[1];
        
        // Garder seulement les paramètres essentiels pour Wikimedia
        if (baseUrl.includes('wikimedia')) {
            // Extraire juste le chemin de l'image sans paramètres de redimensionnement
            const match = baseUrl.match(/(https?:\/\/[^?]+)/);
            if (match) return match[0];
        }
        return baseUrl;
    }
    
    return cleanUrl;
}

function updateOpenGraphTags(article) {
    const setMeta = (selector, attribute, content, isProperty = true) => {
        let meta = document.querySelector(selector);
        if (!meta) {
            meta = document.createElement('meta');
            if (isProperty) meta.setAttribute('property', attribute);
            else meta.setAttribute('name', attribute);
            document.head.appendChild(meta);
        }
        meta.setAttribute('content', content);
    };
    
    // Nettoyer la description
    const cleanDesc = (article.description || article.excerpt || '')
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 300);
    
    // ✅ Récupérer et valider l'URL de l'image
    let imageUrl = null;
    
    // 1. Essayer l'image principale (URL externe comme Wikimedia)
    if (article.image_url && article.image_url.trim() !== '') {
        imageUrl = getValidSocialImageUrl(article.image_url);
    }
    
    // 2. Sinon, chercher dans les médias de l'article
    if (!imageUrl && article.medias && article.medias.length > 0) {
        const firstImage = article.medias.find(m => m.type === 'image');
        if (firstImage && firstImage.url) {
            imageUrl = getValidSocialImageUrl(firstImage.url);
        }
    }
    
    // 3. Fallback : image par défaut (ton logo MAKMUS)
    if (!imageUrl) {
        imageUrl = 'https://logphtrdkpbfgtejtime.supabase.co/storage/v1/object/public/Photo%2C%20Image/Untitled%20folder/MAK_MUS__1_-removebg-preview.png';
    }
    
    // ✅ Construire l'URL canonique de l'article
    let articleUrl;
    if (article.slug && article.slug !== '') {
        articleUrl = `${window.location.origin}/redaction.html?slug=${encodeURIComponent(article.slug)}`;
    } else {
        articleUrl = `${window.location.origin}/redaction.html?id=${article.id}`;
    }
    
    // Mettre à jour le titre de la page
    document.title = `${article.titre} | MAKMUS`;
    
    // 🔵 Open Graph Facebook, LinkedIn, WhatsApp
    setMeta('meta[property="og:title"]', 'og:title', `${article.titre} | MAKMUS`, true);
    setMeta('meta[property="og:description"]', 'og:description', cleanDesc, true);
    setMeta('meta[property="og:image"]', 'og:image', imageUrl, true);
    setMeta('meta[property="og:image:width"]', 'og:image:width', '1200', true);
    setMeta('meta[property="og:image:height"]', 'og:image:height', '630', true);
    setMeta('meta[property="og:url"]', 'og:url', articleUrl, true);
    setMeta('meta[property="og:type"]', 'og:type', 'article', true);
    setMeta('meta[property="og:site_name"]', 'og:site_name', 'MAKMUS', true);
    
    // 🐦 Twitter Card
    setMeta('meta[name="twitter:card"]', 'twitter:card', 'summary_large_image', false);
    setMeta('meta[name="twitter:site"]', 'twitter:site', '@MakMus', false);
    setMeta('meta[name="twitter:creator"]', 'twitter:creator', '@MakMus', false);
    setMeta('meta[name="twitter:title"]', 'twitter:title', `${article.titre} | MAKMUS`, false);
    setMeta('meta[name="twitter:description"]', 'twitter:description', cleanDesc, false);
    setMeta('meta[name="twitter:image"]', 'twitter:image', imageUrl, false);
    
    // Description standard pour SEO
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
        metaDesc = document.createElement('meta');
        metaDesc.setAttribute('name', 'description');
        document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', cleanDesc);
    
    console.log('✅ Meta tags mis à jour pour:', article.titre);
    console.log('📷 Image utilisée:', imageUrl);
}

// Liste des mots à supprimer (stop words en français)
const STOP_WORDS = [
    'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'ou', 'mais',
    'donc', 'or', 'ni', 'car', 'pour', 'dans', 'par', 'sur', 'avec', 'sans',
    'souverainete', 'financiere', 'interieur', 'marche', 'titre', 'article'
];

function generateSlug(title, id) {
    if (!title) return id ? id.toString() : generateShortId();
    
    // Convertir et supprimer les accents
    let slug = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    // 1. Extraire les mots-clés importants (capitalisés, longs, ou après "de")
    let words = slug.toLowerCase().split(/[^a-z0-9]+/);
    let importantWords = words.filter(word => 
        word.length > 4 && !STOP_WORDS.includes(word)
    );
    
    // 2. Prendre les 4 premiers mots importants max
    let shortSlug = importantWords.slice(0, 4).join('-');
    
    // 3. Si aucun mot important trouvé, prendre une partie du titre
    if (shortSlug === '') {
        shortSlug = slug.substring(0, 40).replace(/[^a-z0-9]+/g, '-');
    }
    
    // 4. Nettoyer et tronquer
    shortSlug = shortSlug.replace(/^-+|-+$/g, '');
    
    // 5. Ajouter un identifiant court (soit l'ID, soit l'horodatage)
    const shortId = id ? id.substring(0, 6) : Date.now().toString().substring(3, 9);
    
    return `${shortSlug}-${shortId}`;
}

function generateShortId() {
    return Math.random().toString(36).substring(2, 8);
}

// Dans votre redaction.js, ajoutez une fonction d'extraction
function getArticleIdFromShortUrl(pathname) {
    // Pour une URL /p/mot-cles-123456
    const match = pathname.match(/\/p\/(?:.*-)?(\d+)/);
    if (match) return match[1];
    return null;
}
// Fonction de debug pour les meta tags
async function debugOpenGraph(article) {
    console.group('🔍 Debug Open Graph');
    console.log('Titre:', article.titre);
    console.log('Image URL brute:', article.image_url);
    
    // Vérifier si l'URL est accessible
    if (article.image_url) {
        try {
            const response = await fetch(article.image_url, { method: 'HEAD' });
            console.log('Image accessible ?', response.ok);
            console.log('Status:', response.status);
            console.log('Content-Type:', response.headers.get('content-type'));
        } catch (error) {
            console.error('Erreur accès image:', error);
        }
    }
    console.groupEnd();
}

// Appelle-la dans loadArticle après avoir récupéré l'article
// debugOpenGraph(art);

/* --------------------------------------
   TTS & LECTEUR AUDIO
   -------------------------------------- */
var synth = window.speechSynthesis;

function getBestFrenchVoice() {
    var voices = synth.getVoices();
    if (!voices || voices.length === 0) return null;
    return voices.find(function(v) { return v.lang === 'fr-FR' && v.localService === true; }) ||
           voices.find(function(v) { return v.lang === 'fr-FR'; }) ||
           voices.find(function(v) { return v.lang.startsWith('fr'); }) ||
           voices[0];
}

function stopAudioPlayback() {
    try { synth.cancel(); } catch(e) {}
    if (progressInterval) clearInterval(progressInterval);
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    isAudioPlaying = false;
    currentChunkIndex = 0;
    currentAudioUtterance = null;
    
    var playIcon = document.querySelector('#play-icon');
    var pauseIcon1 = document.querySelector('#pause-icon');
    var pauseIcon2 = document.querySelector('#pause-icon-2');
    if (playIcon) playIcon.style.display = 'block';
    if (pauseIcon1) pauseIcon1.style.display = 'none';
    if (pauseIcon2) pauseIcon2.style.display = 'none';
    
    var progressBar = document.getElementById('audio-progress-bar');
    if (progressBar) progressBar.style.width = "0%";
}

function updateAudioProgress(current, total) {
    var progressBar = document.getElementById('audio-progress-bar');
    if (progressBar && total > 0) {
        progressBar.style.width = (current / total) * 100 + '%';
    }
}

function updateAudioTimeDisplay(current, total) {
    var currentSpan = document.getElementById('audio-current-time');
    var durationSpan = document.getElementById('audio-duration');
    if (currentSpan) {
        var minutes = Math.floor(current / 60);
        var seconds = Math.floor(current % 60);
        currentSpan.textContent = minutes + ':' + seconds.toString().padStart(2, '0');
    }
    if (durationSpan && total) {
        var minutes = Math.floor(total / 60);
        var seconds = Math.floor(total % 60);
        durationSpan.textContent = minutes + ':' + seconds.toString().padStart(2, '0');
    }
}

function playAudioChunk(text, voice, rate) {
    return new Promise(function(resolve, reject) {
        var utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'fr-FR';
        utterance.volume = 0.9;
        utterance.rate = rate;
        utterance.pitch = 1.0;
        if (voice) utterance.voice = voice;
        
        var timeout = setTimeout(function() {
            synth.cancel();
            reject(new Error('Timeout'));
        }, 30000);
        
        utterance.onend = function() {
            clearTimeout(timeout);
            resolve();
        };
        utterance.onerror = function(event) {
            clearTimeout(timeout);
            reject(event);
        };
        
        synth.speak(utterance);
        currentAudioUtterance = utterance;
    });
}

async function startArticlePlayback() {
    var title = document.querySelector('.article-main-title')?.innerText || "";
    var bodyElement = document.getElementById('article-text-content');
    if (!bodyElement) return;
    
    var body = bodyElement.innerText || "";
    var cleanText = cleanTextForSpeech(title + ". " + body);
    if (!cleanText || cleanText.length < 20) {
        showToast("Texte trop court pour la lecture audio", 'error');
        return;
    }
    if (cleanText.length > 8000) cleanText = cleanText.substring(0, 8000) + "... Fin de l'article.";
    
    currentAudioChunks = splitTextIntoChunks(cleanText);
    currentChunkIndex = 0;
    totalAudioDuration = currentAudioChunks.length;
    
    updateAudioTimeDisplay(0, totalAudioDuration);
    updateAudioProgress(0, totalAudioDuration);
    
    var voice = getBestFrenchVoice();
    var speedSelect = document.getElementById('audio-speed-select');
    var rate = parseFloat(speedSelect?.value || 0.9);
    
    isAudioPlaying = true;
    
    var playIcon = document.querySelector('#play-icon');
    var pauseIcon1 = document.querySelector('#pause-icon');
    var pauseIcon2 = document.querySelector('#pause-icon-2');
    if (playIcon) playIcon.style.display = 'none';
    if (pauseIcon1) pauseIcon1.style.display = 'block';
    if (pauseIcon2) pauseIcon2.style.display = 'block';
    
    for (var i = 0; i < currentAudioChunks.length && isAudioPlaying; i++) {
        currentChunkIndex = i;
        updateAudioProgress(i, totalAudioDuration);
        updateAudioTimeDisplay(i, totalAudioDuration);
        
        try {
            await playAudioChunk(currentAudioChunks[i], voice, rate);
        } catch (error) {
            console.warn('Chunk ' + (i+1) + ' failed:', error);
            await new Promise(function(r) { setTimeout(r, 500); });
            if (isAudioPlaying && i < currentAudioChunks.length) {
                try {
                    await playAudioChunk(currentAudioChunks[i], voice, rate);
                } catch (retryError) {}
            }
        }
        await new Promise(function(r) { setTimeout(r, 200); });
    }
    
    if (isAudioPlaying) {
        updateAudioProgress(totalAudioDuration, totalAudioDuration);
        updateAudioTimeDisplay(totalAudioDuration, totalAudioDuration);
        showToast("Lecture terminee", 'success');
    }
    stopAudioPlayback();
    var audioContainer = document.getElementById('audio-player-container');
    if (audioContainer) audioContainer.style.display = 'none';
    var speechText = document.getElementById('speech-text');
    if (speechText) speechText.innerText = "ECOUTER";
}

function pauseAudioPlayback() {
    if (synth.speaking && !synth.paused) {
        synth.pause();
        isAudioPlaying = false;
        var playIcon = document.querySelector('#play-icon');
        var pauseIcon1 = document.querySelector('#pause-icon');
        var pauseIcon2 = document.querySelector('#pause-icon-2');
        if (playIcon) playIcon.style.display = 'block';
        if (pauseIcon1) pauseIcon1.style.display = 'none';
        if (pauseIcon2) pauseIcon2.style.display = 'none';
    }
}

function resumeAudioPlayback() {
    if (synth.paused) {
        synth.resume();
        isAudioPlaying = true;
        var playIcon = document.querySelector('#play-icon');
        var pauseIcon1 = document.querySelector('#pause-icon');
        var pauseIcon2 = document.querySelector('#pause-icon-2');
        if (playIcon) playIcon.style.display = 'none';
        if (pauseIcon1) pauseIcon1.style.display = 'block';
        if (pauseIcon2) pauseIcon2.style.display = 'block';
    }
}

function toggleAudioPlayPause() {
    if (!isAudioPlaying && currentAudioChunks.length === 0) {
        startArticlePlayback();
    } else if (synth.speaking && !synth.paused) {
        pauseAudioPlayback();
    } else if (synth.paused) {
        resumeAudioPlayback();
    } else {
        startArticlePlayback();
    }
}

function stopAudio() {
    stopAudioPlayback();
    var audioContainer = document.getElementById('audio-player-container');
    if (audioContainer) audioContainer.style.display = 'none';
    currentAudioChunks = [];
    currentChunkIndex = 0;
    var speechText = document.getElementById('speech-text');
    if (speechText) speechText.innerText = "ECOUTER";
}

window.toggleSpeech = function() {
    var audioContainer = document.getElementById('audio-player-container');
    if (audioContainer) {
        if (audioContainer.style.display === 'none' || !audioContainer.style.display) {
            audioContainer.style.display = 'block';
            startArticlePlayback();
            var speechText = document.getElementById('speech-text');
            if (speechText) speechText.innerText = "ARRETER";
        } else {
            stopAudio();
            audioContainer.style.display = 'none';
            var speechText = document.getElementById('speech-text');
            if (speechText) speechText.innerText = "ECOUTER";
        }
    }
};

/* --------------------------------------
   TAGS TRENDING
   -------------------------------------- */
async function loadTrendingTags() {
    var container = document.getElementById('tags-container');
    if (!container) return;
    try {
        var { data } = await supabaseClient.from('articles').select('tags').eq('is_published', true).not('tags', 'is', null).limit(50);
        var counts = {};
        data?.forEach(function(art) {
            if (typeof art.tags === 'string') {
                art.tags.split(',').forEach(function(tag) {
                    var t = tag.trim();
                    if (t) counts[t] = (counts[t] || 0) + 1;
                });
            }
        });
        var topTags = Object.keys(counts).sort(function(a, b) { return counts[b] - counts[a]; }).slice(0, 6);
        container.innerHTML = topTags.map(function(tag, i) {
            return '<span class="trending-link ' + (i === 0 ? 'is-live' : '') + '" onclick="window.location.href=\'index.html?tag=' + encodeURIComponent(tag) + '\'">' + tag.toUpperCase() + '</span>';
        }).join('');
    } catch(e) {
        console.warn("Tags error:", e);
    }
}

/* --------------------------------------
   UTILITAIRES AMÉLIORÉS
   -------------------------------------- */
function sanitizeContent(content) {
    if (!content) return '';
    return content
        .replace(/<span style="font-family: georgia, palatino, serif;">/gi, '')
        .replace(/<li style="font-family: georgia, palatino, serif;">/gi, '<li>')
        .replace(/<\/span>/gi, '')
        .replace(/style="font-family: georgia, palatino, serif;?"/gi, '');
}

function isValidImageUrl(url) {
    if (!url) return false;
    return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:');
}

function parseHtmlToParagraphs(html) {
    if (!html) return [];
    var cleanHtml = sanitizeContent(html);
    var temp = document.createElement('div');
    temp.innerHTML = cleanHtml;
    var elements = [];
    
    // ✅ Sélectionner TOUS les éléments de contenu (pas seulement les paragraphes)
    var nodes = temp.querySelectorAll('p, ul, ol, table, blockquote, h1, h2, h3, h4, h5, h6, div.media-wrapper, figure');
    
    if (nodes.length === 0) {
        // Si aucun élément trouvé, retourner le HTML brut
        return [cleanHtml];
    }
    
    for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        var outerHtml = el.outerHTML;
        
        // Nettoyer les styles résiduels
        outerHtml = outerHtml.replace(/style="[^"]*"/gi, '');
        outerHtml = outerHtml.replace(/class="[^"]*"/gi, '');
        
        elements.push(outerHtml);
    }
    
    // Si on a des listes ou tableaux, les conserver tels quels
    if (cleanHtml.includes('<ul') || cleanHtml.includes('<ol') || cleanHtml.includes('<table')) {
        return elements;
    }
    
    return elements;
}

function initLazyImages() {
    var images = document.querySelectorAll('.article-media-wrapper img[loading="lazy"]');
    images.forEach(function(img) {
        img.addEventListener('load', function() {
            img.classList.add('loaded');
        });
        if (img.complete) {
            img.classList.add('loaded');
        }
    });
}

/* --------------------------------------
   RENDER ARTICLE
   -------------------------------------- */
function renderMedia(media) {
    var imageUrl = isValidImageUrl(media.url) ? media.url : 'https://via.placeholder.com/800x500?text=Image+non+disponible';
    
    if (media.type === 'image') {
        return `
            <div class="media-fullwidth-wrapper">
                <figure class="article-media-wrapper">
                    <img src="${imageUrl}" loading="lazy" alt="${escapeHtml(media.caption || '')}">
                    <figcaption class="media-caption">${escapeHtml(media.caption || '')}</figcaption>
                </figure>
            </div>
        `;
    } else if (media.type === 'video') {
        return `
            <div class="media-fullwidth-wrapper">
                <figure class="article-media-wrapper">
                    <video controls preload="metadata" playsinline>
                        <source src="${media.url}" type="video/mp4">
                    </video>
                    <figcaption class="media-caption">${escapeHtml(media.caption || 'Vidéo MakMus')}</figcaption>
                </figure>
            </div>
        `;
    }
    return '';
}

function renderAd() {
    return `
        <div class="ad-fullwidth-wrapper">
            <div class="in-article-ad">
                <span class="ad-label">PUBLICITÉ</span>
                <div class="ad-box">
                    <h4>MakMus Direct</h4>
                    <p>Rejoignez notre canal WhatsApp pour les alertes en direct.</p>
                    <button class="btn-whatsapp" onclick="window.open('https://whatsapp.com/channel/...', '_blank')">REJOINDRE</button>
                </div>
            </div>
        </div>
    `;
}

function renderRecommendations() {
    return `
        <div class="inline-recommendations">
            <h4 class="grid-title">À LIRE AUSSI</h4>
            <div class="mini-grid" id="inline-grid-container">
                <div class="mini-card" id="card-1">
                    <img id="inline-img-1" class="mini-card-img" style="display:none;">
                    <p id="inline-title-1">Chargement...</p>
                </div>
                <div class="mini-card" id="card-2">
                    <img id="inline-img-2" class="mini-card-img" style="display:none;">
                    <p id="inline-title-2">Chargement...</p>
                </div>
            </div>
        </div>
    `;
}

function renderArticleHeader(art, readTime) {
    return `
        <header class="article-header">
            <div class="article-category-label">${escapeHtml(art.category || 'Actualité')}</div>
            <h1 class="article-main-title">${escapeHtml(art.titre)}</h1>
            <div class="read-time-estimate">${readTime} min de lecture</div>
            <div class="article-byline">
                <img src="${art.author_image || 'https://via.placeholder.com/40'}" class="author-avatar" onerror="this.src='https://via.placeholder.com/40'">
                <div class="author-info">
                    <div class="author-name-wrapper">
                        <span class="author-name-label">Par</span>
                        <a href="#" class="author-name-link" onclick="window.showAuthorBio('${art.author_name}', '${art.author_role || ''}', '${art.author_bio || ''}', '${art.author_twitter || ''}', '${art.author_website || ''}', '${art.author_image || ''}'); return false;">
                            ${escapeHtml(art.author_name || 'La Rédaction')}
                        </a>
                    </div>
                    <div class="publish-date">Publié le ${new Date(art.created_at).toLocaleDateString('fr-FR', {day:'numeric', month:'long', year:'numeric'})}</div>
                </div>
            </div>
            <div class="article-actions-wrapper">
                <div class="actions-group">
                    <div class="actions-primary">
                        <button class="action-btn" id="like-btn" onclick="window.toggleLike()">
                            <div class="icon-circle">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.78-8.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                                </svg>
                            </div>
                            <span id="nb-like" class="count-label">0</span>
                        </button>
                        <button class="action-btn" onclick="window.openComments()">
                            <div class="icon-circle">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                                </svg>
                            </div>
                            <span id="nb-comm" class="count-label">0</span>
                        </button>                      
                        <button class="action-btn" id="bookmark-btn" onclick="window.toggleBookmark()">
                            <div class="icon-circle">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                                </svg>
                            </div>
                            <span>Sauvegarder</span>
                        </button>
                    </div>
                    <div class="actions-secondary">
                        <button class="action-btn" onclick="window.openShare()">
                            <div class="icon-circle">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/>
                                </svg>
                            </div>
                            <span>Partager</span>
                        </button>
                        <button class="action-btn speech-btn" id="speech-btn">
                            <div class="icon-circle">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
                                </svg>
                            </div>
                            <span id="speech-text">ÉCOUTER</span>
                        </button>
                    </div>
                </div>
            </div>
        </header>
    `;
}

function renderMainMedia(art) {
    if (art.video_url && art.video_url !== '') {
        return `
            <div class="media-fullwidth-wrapper">
                <figure class="main-figure main-video-figure">
                    <div class="hero-video-wrapper" style="position: relative; width: 100%;">
                        <div class="video-controls-top">
                            <button class="video-control-btn play-pause-btn" onclick="heroFlexible?.toggleVideo()">
                                <svg viewBox="0 0 24 24" fill="white" width="20" height="20">
                                    <polygon points="5 3 19 12 5 21 5 3" id="video-play-icon"/>
                                    <rect x="6" y="4" width="4" height="16" id="video-pause-icon" style="display:none" rx="1"/>
                                    <rect x="14" y="4" width="4" height="16" id="video-pause-icon-2" style="display:none" rx="1"/>
                                </svg>
                            </button>
                            <button class="video-control-btn volume-btn" onclick="heroFlexible?.toggleVolume()">
                                <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="18" height="18">
                                    <path d="M11 5L6 9H2v6h4l5 4V5z"/>
                                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.08"/>
                                </svg>
                            </button>
                            <button class="video-control-btn share-btn" onclick="heroFlexible?.shareVideo('${art.id}', '${escapeHtml(art.titre)}')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="18" height="18">
                                    <circle cx="18" cy="5" r="3"/>
                                    <circle cx="6" cy="12" r="3"/>
                                    <circle cx="18" cy="19" r="3"/>
                                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                                </svg>
                            </button>
                            <button class="video-control-btn fullscreen-btn" onclick="heroFlexible?.toggleFullscreen()">
                                <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="18" height="18">
                                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                                </svg>
                            </button>
                        </div>
                        <div class="play-overlay" onclick="playArticleVideo(this)">
                            <div class="play-button">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2">
                                    <polygon points="5 3 19 12 5 21 5 3" fill="white"/>
                                </svg>
                            </div>
                        </div>
                        <video id="article-main-video" src="${art.video_url}" poster="${art.image_url || ''}" style="width: 100%; height: auto; display: block; margin: 0 auto;" preload="metadata" autoplay muted loop playsinline>
                            <source src="${art.video_url}" type="video/mp4">
                        </video>
                        ${art.video_caption ? `<figcaption class="img-caption-style">${escapeHtml(art.video_caption)}</figcaption>` : ''}
                    </div>
                </figure>
            </div>
        `;
    } else if (art.image_url) {
        return `
            <div class="media-fullwidth-wrapper">
                <figure class="main-figure">
                    <img src="${art.image_url}" class="main-img" alt="${escapeHtml(art.titre)}" onerror="this.src='https://via.placeholder.com/800x500'">
                    ${art.image_caption ? `<figcaption class="img-caption-style">${escapeHtml(art.image_caption)}</figcaption>` : ''}
                </figure>
            </div>
        `;
    }
    return '';
}

function renderAuthorBio(art) {
    var authorBio = art.author_bio || '';
    var authorRole = art.author_role || 'Journaliste';
    var authorTwitter = art.author_twitter || '';
    var authorWebsite = art.author_website || '';
    
    var socialLinksHtml = '';
    if (authorTwitter || authorWebsite) {
        socialLinksHtml = '<div class="author-bio-social">';
        if (authorTwitter) {
            socialLinksHtml += `
                <a href="https://x.com/${authorTwitter}" target="_blank" rel="noopener" class="social-x">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231z"/>
                    </svg>
                    <span>X</span>
                </a>
            `;
        }
        if (authorWebsite) {
            socialLinksHtml += `
                <a href="${authorWebsite}" target="_blank" rel="noopener" class="social-website">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="2" y1="12" x2="22" y2="12"/>
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                    </svg>
                    <span>Site web</span>
                </a>
            `;
        }
        socialLinksHtml += '</div>';
    }
    
    if (authorBio || authorRole) {
        return `
            <div class="author-bio">
                <div class="author-bio-container">
                    <img src="${art.author_image || 'https://via.placeholder.com/60'}" class="author-bio-avatar" onerror="this.src='https://via.placeholder.com/60'">
                    <div class="author-bio-info">
                        <div class="author-bio-name">${escapeHtml(art.author_name || 'La Rédaction')}</div>
                        <div class="author-bio-role">${escapeHtml(authorRole)}</div>
                        ${authorBio ? `<div class="author-bio-text">${escapeHtml(authorBio)}</div>` : ''}
                        ${socialLinksHtml}
                    </div>
                </div>
            </div>
        `;
    }
    return '';
}

function renderArticle(art) {
    var cleanContent = sanitizeContent(art.content || art.description || '');
    var elements = parseHtmlToParagraphs(cleanContent);
    var totalElements = elements.length;
    var readTime = calculateReadTime(art.content || art.description || '');
    var extraMedias = art.medias || [];
    var mediaIndex = 0;
    var textContent = '';
    
    for (var idx = 0; idx < elements.length; idx++) {
        var element = elements[idx];
        if (!element || element.trim() === "") continue;
        
        // ✅ Conserver l'élément tel quel (préserve les listes, tableaux, citations)
        textContent += element;
        
        // Insérer un média tous les 3 éléments
        if (idx > 0 && idx % 3 === 0 && mediaIndex < extraMedias.length) {
            textContent += renderMedia(extraMedias[mediaIndex]);
            mediaIndex++;
        }
        
        // Pub après le 2ème élément
        if (idx === 1 && totalElements > 3) {
            textContent += renderAd();
        }
        
        // Bloc "À LIRE AUSSI" au milieu
        if (idx === Math.floor(totalElements / 2) && totalElements > 5) {
            textContent += renderRecommendations();
            setTimeout(function() { fillInlineGrid(art.category, art.id); }, 200);
        }
    }
    
    // S'il reste des médias non insérés
    while (mediaIndex < extraMedias.length) {
        textContent += renderMedia(extraMedias[mediaIndex]);
        mediaIndex++;
    }
    
    var fullHtml = `
        ${renderArticleHeader(art, readTime)}
        ${renderMainMedia(art)}
        <div class="article-content" id="article-text-content">
            ${textContent}
        </div>
        ${renderAuthorBio(art)}
    `;
    
    document.getElementById('full-article').innerHTML = fullHtml;
    
    initArticleVideoPlayer();
    initLazyImages();
    
    var speechBtn = document.getElementById('speech-btn');
    if (speechBtn) {
        speechBtn.removeAttribute('onclick');
        speechBtn.addEventListener('click', function(e) {
            e.preventDefault();
            window.toggleSpeech();
        });
    }
    
    fetchLikesCount();
    fetchComments();
    if (typeof fetchRelatedArticles === 'function') fetchRelatedArticles(art.tags, art.category);
    
    if (currentUser) {
        fetchLikeStatus();
        fetchBookmarkStatus();
    }
    
    initScrollProgress();
    updateOpenGraphTags(art);
}

function playArticleVideo(element) {
    const wrapper = element.closest('.hero-video-wrapper');
    const video = wrapper.querySelector('video');
    const playOverlay = element;
    
    if (video.paused) {
        video.play();
        playOverlay.style.opacity = '0';
        playOverlay.style.pointerEvents = 'none';
    } else {
        video.pause();
        playOverlay.style.opacity = '1';
        playOverlay.style.pointerEvents = 'auto';
    }
}

function initArticleVideoPlayer() {
    const wrapper = document.querySelector('.hero-video-wrapper');
    const video = document.querySelector('#article-main-video');
    const playOverlay = document.querySelector('.play-overlay');
    
    if (!wrapper || !video) return;
    
    video.addEventListener('play', function() {
        if (playOverlay) {
            playOverlay.style.opacity = '0';
            playOverlay.style.pointerEvents = 'none';
        }
    });
    
    video.addEventListener('pause', function() {
        if (playOverlay && video.paused) {
            playOverlay.style.opacity = '1';
            playOverlay.style.pointerEvents = 'auto';
        }
    });
}

/* --------------------------------------
   BIO AUTEUR - MODAL
   -------------------------------------- */
window.showAuthorBio = function(name, role, bio, twitter, website, avatar) {
    var existingModal = document.getElementById('author-bio-modal');
    if (existingModal) existingModal.remove();
    
    var modalSocialLinks = '';
    if (twitter || website) {
        modalSocialLinks = '<div class="author-bio-modal-social">';
        if (twitter) {
            modalSocialLinks += `
                <a href="https://x.com/${twitter}" target="_blank" rel="noopener" class="social-x">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231z"/>
                    </svg>
                    <span>X</span>
                </a>
            `;
        }
        if (website) {
            modalSocialLinks += `
                <a href="${website}" target="_blank" rel="noopener" class="social-website">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="2" y1="12" x2="22" y2="12"/>
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                    </svg>
                    <span>Site web</span>
                </a>
            `;
        }
        modalSocialLinks += '</div>';
    }
    
    var modalHtml = `
        <div id="author-bio-modal" class="author-bio-modal" onclick="window.closeAuthorBio()">
            <div class="author-bio-modal-content" onclick="event.stopPropagation()">
                <button class="author-bio-close" onclick="window.closeAuthorBio()">&times;</button>
                <div class="author-bio-modal-header">
                    <img src="${avatar || 'https://via.placeholder.com/80'}" class="author-bio-modal-avatar" onerror="this.src='https://via.placeholder.com/80'">
                    <div class="author-bio-modal-info">
                        <h3>${escapeHtml(name)}</h3>
                        ${role ? `<div class="author-bio-modal-role">${escapeHtml(role)}</div>` : ''}
                    </div>
                </div>
                ${bio ? `<div class="author-bio-modal-bio">${escapeHtml(bio)}</div>` : ''}
                ${modalSocialLinks}
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.body.style.overflow = 'hidden';
};

window.closeAuthorBio = function() {
    var modal = document.getElementById('author-bio-modal');
    if (modal) {
        modal.remove();
    }
    document.body.style.overflow = '';
};

/* --------------------------------------
   INCRÉMENTATION DES VUES (VERSION DURABLE)
   -------------------------------------- */
// Remplacez la fonction incrementArticleViews par celle-ci :

async function incrementArticleViews(articleId) {
    if (!articleId) {
        console.warn('❌ Aucun ID article fourni');
        return;
    }
    
    const sessionKey = `viewed_${articleId}`;
    if (sessionStorage.getItem(sessionKey)) {
        console.log('📊 Vue déjà comptée dans cette session');
        return;
    }
    
    console.log('📊 Incrémentation des vues pour article:', articleId);
    
    try {
        // ✅ Envoi direct de l'UUID (pas de conversion en string)
        const { data, error } = await supabaseClient.rpc('increment_article_views', {
            article_id_param: articleId  // ← UUID direct
        });
        
        if (error) throw error;
        
        console.log(`✅ Vue comptée (RPC): ${data}`);
        sessionStorage.setItem(sessionKey, 'true');
        
    } catch (error) {
        console.warn('⚠️ RPC échoué, fallback vers méthode manuelle:', error.message);
        await manualIncrementViews(articleId);
    }
}
// Méthode manuelle de secours (fonctionne toujours)
async function manualIncrementViews(articleId) {
    try {
        const { data: article, error: fetchError } = await supabaseClient
            .from('articles')
            .select('views_count')
            .eq('id', articleId)
            .single();
        
        if (fetchError) {
            console.error('❌ Erreur récupération vues:', fetchError);
            return;
        }
        
        const currentViews = article?.views_count || 0;
        const newCount = currentViews + 1;
        
        const { error: updateError } = await supabaseClient
            .from('articles')
            .update({ views_count: newCount })
            .eq('id', articleId);
        
        if (updateError) {
            console.error('❌ Erreur mise à jour:', updateError);
        } else {
            console.log(`✅ Vue comptée (manuel): ${currentViews} → ${newCount}`);
            sessionStorage.setItem(`viewed_${articleId}`, 'true');
            
            const viewsSpan = document.getElementById('nb-views');
            if (viewsSpan) viewsSpan.textContent = newCount;
            if (currentArticle) currentArticle.views_count = newCount;
        }
    } catch (err) {
        console.error('❌ Erreur manuelle:', err);
    }
}

/* --------------------------------------
   LOAD ARTICLE
   -------------------------------------- */
async function loadArticle() {
    console.log('=== loadArticle CALLED ===');
    console.log('articleSlug:', articleSlug);
    console.log('articleId:', articleId);
    
    const loadingContainer = document.getElementById('full-article');
    if (loadingContainer) {
        loadingContainer.innerHTML = '<div class="loading-spinner">Chargement en cours...</div>';
    }
    
    try {
        let query;
        
        if (articleSlug) {
            console.log('RECHERCHE PAR SLUG:', articleSlug);
            query = supabaseClient
                .from('articles')
                .select('*')
                .eq('slug', articleSlug);
        } else if (articleId) {
            console.log('RECHERCHE PAR ID:', articleId);
            query = supabaseClient
                .from('articles')
                .select('*')
                .eq('id', articleId);
        } else {
            document.getElementById('full-article').innerHTML = "<p class='error-msg'>Article non trouvé.</p>";
            return;
        }
        
        const { data, error } = await query;
        
        if (error) {
            console.error('ERREUR SQL:', error);
            document.getElementById('full-article').innerHTML = "<p class='error-msg'>Erreur lors du chargement de l'article.</p>";
            return;
        }
        
        if (!data || data.length === 0) {
            console.error('AUCUN ARTICLE TROUVÉ');
            document.getElementById('full-article').innerHTML = "<p class='error-msg'>Article introuvable.</p>";
            return;
        }
        
        // Gérer les doublons
        let art = data[0];
        if (data.length > 1) {
            console.warn(`⚠️ ${data.length} articles trouvés. Prise du plus récent.`);
            art = data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        }
        
        console.log('ARTICLE TROUVÉ:', art.titre);
        console.log('ID:', art.id);
        console.log('Vues actuelles:', art.views_count || 0);
        
        currentArticle = art;
        document.title = art.titre + ' | MAKMUS';
        
        // Mise à jour de l'URL
        if (art.slug && !window.location.search.includes('slug=')) {
            const newUrl = `${window.location.origin}/redaction.html?slug=${encodeURIComponent(art.slug)}`;
            console.log('🔄 Mise à jour URL:', newUrl);
            window.history.replaceState({}, '', newUrl);
        }
        
        updateOpenGraphTags(art);
        renderArticle(art);
        
        // ✅ Incrémenter les vues APRÈS l'affichage
        await incrementArticleViews(art.id);
        
        restoreReadingPosition();
        window.addEventListener('beforeunload', saveReadingPosition);
        
    } catch (err) {
        console.error('ERREUR GLOBALE:', err);
        document.getElementById('full-article').innerHTML = "<p class='error-msg'>Une erreur est survenue. Veuillez réessayer.</p>";
    }
}

/* --------------------------------------
   FILL INLINE GRID
   -------------------------------------- */
async function fillInlineGrid(category, currentId) {
    var { data: related } = await supabaseClient
        .from('articles')
        .select('id, titre, image_url, slug')
        .eq('category', category)
        .neq('id', currentId)
        .limit(2);
    if (related && related.length > 0) {
        for (var i = 0; i < related.length; i++) {
            var item = related[i];
            var titleEl = document.getElementById('inline-title-' + (i+1));
            if (titleEl) {
                titleEl.innerHTML = '<a href="' + getArticleUrl(item) + '" style="text-decoration:none; color:#121212; font-weight:bold; font-size:0.9rem;">' + escapeHtml(item.titre) + '</a>';
            }
        }
        if (related.length === 1) {
            var card2 = document.getElementById('card-2');
            if (card2) card2.style.display = 'none';
        }
    } else {
        var container = document.querySelector('.inline-recommendations');
        if (container) container.style.display = 'none';
    }
}

async function fetchRelatedArticles(tags, category) {
    var grid = document.getElementById('recommendations-grid');
    var box = document.getElementById('recommendations-box');
    if (!grid) return;
    if (!currentArticle) return;
    
    var { data: related } = await supabaseClient
        .from('articles')
        .select('id, titre, image_url, category, slug')
        .eq('category', category)
        .neq('id', currentArticle.id)
        .limit(6);
    
    if (!related || related.length === 0) {
        if (box) box.style.display = 'none';
        return;
    }
    if (box) box.style.display = 'block';
    
    grid.innerHTML = related.map(function(art) {
        return '<a href="' + getArticleUrl(art) + '" class="rec-card">' +
            '<div class="rec-image-container">' +
                '<img src="' + art.image_url + '" alt="' + escapeHtml(art.titre) + '" loading="lazy" onerror="this.src=\'https://via.placeholder.com/300x200\'">' +
                '<div class="ad-badge">Recommandé</div>' +
            '</div>' +
            '<div class="rec-source">' + escapeHtml(art.category || 'MakMus') + '</div>' +
            '<h4 class="rec-title">' + escapeHtml(art.titre) + '</h4>' +
        '</a>';
    }).join('');
}
/* --------------------------------------
   TOGGLE PASSWORD VISIBILITY
   -------------------------------------- */
window.togglePasswordVisibility = function() {
    const passwordInput = document.getElementById('auth-password');
    if (!passwordInput) return;
    
    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordInput.setAttribute('type', type);
    
    // Optionnel : changer l'icône
    const btn = document.querySelector('.toggle-password-btn');
    if (btn) {
        btn.textContent = type === 'password' ? '👁️' : '🙈';
    }
};
/* --------------------------------------
   INITIALISATION
   -------------------------------------- */
document.addEventListener('DOMContentLoaded', function() {
    updateLiveDate();
    window.checkUserStatus();
    loadTrendingTags();
    
    var audioContainer = document.getElementById('audio-player-container');
    if (audioContainer) audioContainer.style.display = 'none';
    
    var playPauseBtn = document.getElementById('audio-play-pause');
    var stopBtn = document.getElementById('audio-stop');
    var timeline = document.getElementById('audio-timeline');
    var speedSelect = document.getElementById('audio-speed-select');
    
    if (playPauseBtn) playPauseBtn.addEventListener('click', toggleAudioPlayPause);
    if (stopBtn) stopBtn.addEventListener('click', stopAudio);
    if (timeline) {
        timeline.addEventListener('click', function(e) {
            var rect = timeline.getBoundingClientRect();
            var percent = (e.clientX - rect.left) / rect.width;
            var targetChunk = Math.floor(percent * totalAudioDuration);
            if (targetChunk !== currentChunkIndex && targetChunk < currentAudioChunks.length) {
                stopAudioPlayback();
                currentChunkIndex = targetChunk;
                startArticlePlayback();
            }
        });
    }
    if (speedSelect) {
        speedSelect.addEventListener('change', function() {
            if (synth.speaking || synth.paused) {
                var wasPlaying = !synth.paused;
                stopAudioPlayback();
                if (wasPlaying) startArticlePlayback();
            }
        });
    }
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            window.closeCommentsPanel();
            window.toggleSharePanel(false);
        }
    });
    
    if (articleId || articleSlug) {
        loadArticle();
    } else {
        var fullArt = document.getElementById('full-article');
        if (fullArt) {
            fullArt.innerHTML = "<p style='text-align:center; padding:100px; font-family:serif;'>Article non trouvé.</p>";
        }
    }
});
