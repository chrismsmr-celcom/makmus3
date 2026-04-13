/* ==========================================================================
   PAGE ARTICLE — MAKMUS (VERSION CORRIGÉE - SLUG FIX + LIKES/FAVORIS)
   ========================================================================== */

const SUPABASE_URL = 'https://logphtrdkpbfgtejtime.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvZ3BodHJka3BiZmd0ZWp0aW1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNzY4MDYsImV4cCI6MjA4NTc1MjgwNn0.Uoxiax-whIdbB5oI3bof-hN0m5O9PDi96zmaUZ6BBio';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 🔧 CORRECTION : Récupération correcte du slug depuis l'URL
const urlParams = new URLSearchParams(window.location.search);
let articleId = urlParams.get('id');
let articleSlug = urlParams.get('slug');

// 🔧 CORRECTION : Si l'URL est de type /article/mon-slug (sans paramètre)
if (!articleId && !articleSlug && window.location.pathname.startsWith('/article/')) {
    articleSlug = window.location.pathname.replace('/article/', '');
    articleSlug = articleSlug.split('?')[0];
    articleSlug = articleSlug.split('#')[0];
    console.log('✅ SLUG détecté depuis pathname:', articleSlug);
}

// 🔧 CORRECTION : Forcer la redirection vers l'URL avec paramètre slug pour éviter les problèmes
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
    }
    if (e.target.classList.contains('modal-overlay')) {
        e.target.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
});

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
            // Recharger les likes et favoris après connexion
            if (currentArticle) {
                fetchLikeStatus();
                fetchBookmarkStatus();
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
            // Recharger l'article pour mettre à jour likes/favoris
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
                container.innerHTML = '<p class="no-favs">Aucun favori</p>';
            } else {
                container.innerHTML = favs.map(function(f) {
                    var title = f.articles?.titre || 'Article';
                    return '<div class="mini-fav-item"><a href="redaction.html?id=' + f.article_id + '">' + escapeHtml(title) + '</a></div>';
                }).join('');
            }
        }
    } catch (error) {
        console.warn("Erreur chargement favoris:", error);
    }
};

/* --------------------------------------
   LIKES (avec BDD)
   -------------------------------------- */
async function fetchLikeStatus() {
    if (!currentArticle || !currentUser) return;
    
    try {
        const { data, error } = await supabaseClient
            .from('user_likes')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('article_id', currentArticle.id)
            .maybeSingle();
        
        const likeBtn = document.getElementById('like-btn');
        if (likeBtn) {
            if (data && !error) {
                likeBtn.classList.add('liked');
            } else {
                likeBtn.classList.remove('liked');
            }
        }
    } catch (error) {
        console.error('Erreur fetchLikeStatus:', error);
    }
}

async function fetchLikesCount() {
    if (!currentArticle) return;
    
    try {
        const { count, error } = await supabaseClient
            .from('user_likes')
            .select('id', { count: 'exact', head: true })
            .eq('article_id', currentArticle.id);
        
        const likeSpan = document.getElementById('nb-like');
        if (likeSpan) {
            likeSpan.textContent = count || 0;
        }
    } catch (error) {
        console.error('Erreur fetchLikesCount:', error);
    }
}

window.toggleLike = async function() {
    if (!currentArticle) return;
    
    // Vérifier si l'utilisateur est connecté
    if (!currentUser) {
        showToast('Connectez-vous pour aimer cet article', 'info');
        window.toggleSidePanel(true);
        return;
    }
    
    const likeBtn = document.getElementById('like-btn');
    const isLiked = likeBtn.classList.contains('liked');
    
    try {
        if (!isLiked) {
            // Ajouter le like
            const { error } = await supabaseClient
                .from('user_likes')
                .insert([{ user_id: currentUser.id, article_id: currentArticle.id }]);
            
            if (error) throw error;
            
            likeBtn.classList.add('liked');
            showToast('Article aimé !', 'success');
        } else {
            // Retirer le like
            const { error } = await supabaseClient
                .from('user_likes')
                .delete()
                .eq('user_id', currentUser.id)
                .eq('article_id', currentArticle.id);
            
            if (error) throw error;
            
            likeBtn.classList.remove('liked');
            showToast('Like retiré', 'info');
        }
        
        // Mettre à jour le compteur
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
    
    try {
        const { data, error } = await supabaseClient
            .from('user_favorites')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('article_id', currentArticle.id)
            .maybeSingle();
        
        const bookmarkBtn = document.getElementById('bookmark-btn');
        const span = bookmarkBtn?.querySelector('span:last-child');
        
        if (bookmarkBtn) {
            if (data && !error) {
                bookmarkBtn.classList.add('bookmarked');
                if (span) span.textContent = 'Sauvegardé';
            } else {
                bookmarkBtn.classList.remove('bookmarked');
                if (span) span.textContent = 'Sauvegarder';
            }
        }
    } catch (error) {
        console.error('Erreur fetchBookmarkStatus:', error);
    }
}

window.toggleBookmark = async function() {
    if (!currentArticle) return;
    
    // Vérifier si l'utilisateur est connecté
    if (!currentUser) {
        showToast('Connectez-vous pour sauvegarder des articles', 'info');
        window.toggleSidePanel(true);
        return;
    }
    
    const bookmarkBtn = document.getElementById('bookmark-btn');
    const span = bookmarkBtn?.querySelector('span:last-child');
    const isBookmarked = bookmarkBtn?.classList.contains('bookmarked');
    
    try {
        if (!isBookmarked) {
            // Ajouter aux favoris
            const { error } = await supabaseClient
                .from('user_favorites')
                .insert([{ 
                    user_id: currentUser.id, 
                    article_id: currentArticle.id,
                    article_title: currentArticle.titre
                }]);
            
            if (error) throw error;
            
            bookmarkBtn.classList.add('bookmarked');
            if (span) span.textContent = 'Sauvegardé';
            showToast('Article sauvegardé dans vos favoris', 'success');
            
            // Recharger la liste des favoris dans le panneau
            window.loadUserActivity();
        } else {
            // Retirer des favoris
            const { error } = await supabaseClient
                .from('user_favorites')
                .delete()
                .eq('user_id', currentUser.id)
                .eq('article_id', currentArticle.id);
            
            if (error) throw error;
            
            bookmarkBtn.classList.remove('bookmarked');
            if (span) span.textContent = 'Sauvegarder';
            showToast('Article retiré des favoris', 'info');
            
            // Recharger la liste des favoris dans le panneau
            window.loadUserActivity();
        }
    } catch (error) {
        console.error('Erreur toggleBookmark:', error);
        showToast('Erreur lors de la sauvegarde', 'error');
    }
};

/* --------------------------------------
   COMMENTAIRES
   -------------------------------------- */
async function fetchComments() {
    if (!currentArticle) return;
    var { data } = await supabaseClient
        .from('article_comments')
        .select('*')
        .eq('article_id', currentArticle.id)
        .order('created_at', { ascending: false });
    if (data) {
        var list = document.getElementById('comments-list');
        if (list) {
            list.innerHTML = data.map(function(c) {
                return '<div style="border-bottom:1px solid #eee; padding:15px 0;"><b>' + escapeHtml(c.nom) + '</b><br>' + escapeHtml(c.message) + '</div>';
            }).join('');
        }
        var commSpan = document.getElementById('nb-comm');
        if (commSpan) commSpan.textContent = data.length;
    }
}

window.postComment = async function() {
    var nomInput = document.getElementById('comm-name');
    var msgInput = document.getElementById('comm-text');
    var nom = nomInput?.value.trim();
    var msg = msgInput?.value.trim();
    
    if (!nom || !msg) {
        showToast("Veuillez remplir tous les champs", 'error');
        return;
    }
    
    if (!currentArticle) return;
    
    var { error } = await supabaseClient.from('article_comments').insert([{ 
        article_id: currentArticle.id, 
        nom: nom, 
        message: msg 
    }]);
    
    if (!error) {
        if (msgInput) msgInput.value = "";
        fetchComments();
        showToast("Commentaire publié !");
    } else {
        showToast("Erreur lors de la publication", 'error');
    }
};

/* --------------------------------------
   PARTAGE
   -------------------------------------- */
window.openShare = function() { window.toggleModal('shareModal', true); };
window.closeShare = function() { window.toggleModal('shareModal', false); };
window.openComments = function() { window.toggleModal('commentModal', true); };
window.closeComments = function() { window.toggleModal('commentModal', false); };

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

/* --------------------------------------
   METADATA OPEN GRAPH & TWITTER CARDS
   -------------------------------------- */
function updateOpenGraphTags(article) {
    if (!article) return;
    
    let imageUrl = article.image_url;
    if (!imageUrl && article.medias) {
        try {
            const medias = typeof article.medias === 'string' ? JSON.parse(article.medias) : article.medias;
            const firstImage = medias.find(m => m.type === 'image');
            if (firstImage) imageUrl = firstImage.url;
        } catch(e) {}
    }
    
    if (!imageUrl) {
        imageUrl = 'https://logphtrdkpbfgtejtime.supabase.co/storage/v1/object/public/Photo,%20Image/Untitled%20folder/MAK_MUS__1_-removebg-preview.png';
    }
    
    const cleanDesc = (article.description || '').replace(/<[^>]*>/g, '').substring(0, 300);
    const pageUrl = article.slug 
        ? `${window.location.origin}/article/${article.slug}`
        : window.location.href;
    
    function setMetaTag(selector, attribute, content, isProperty = true) {
        let meta = document.querySelector(selector);
        if (!meta) {
            meta = document.createElement('meta');
            if (isProperty) {
                meta.setAttribute('property', attribute);
            } else {
                meta.setAttribute('name', attribute);
            }
            document.head.appendChild(meta);
        }
        meta.setAttribute('content', content);
    }
    
    setMetaTag('meta[property="og:title"]', 'og:title', article.titre + ' | MAKMUS', true);
    setMetaTag('meta[property="og:description"]', 'og:description', cleanDesc, true);
    setMetaTag('meta[property="og:image"]', 'og:image', imageUrl, true);
    setMetaTag('meta[property="og:image:width"]', 'og:image:width', '1200', true);
    setMetaTag('meta[property="og:image:height"]', 'og:image:height', '630', true);
    setMetaTag('meta[property="og:url"]', 'og:url', pageUrl, true);
    setMetaTag('meta[property="og:type"]', 'og:type', 'article', true);
    setMetaTag('meta[property="og:site_name"]', 'og:site_name', 'MAKMUS', true);
    
    setMetaTag('meta[name="twitter:card"]', 'twitter:card', 'summary_large_image', false);
    setMetaTag('meta[name="twitter:site"]', 'twitter:site', '@MakMus', false);
    setMetaTag('meta[name="twitter:title"]', 'twitter:title', article.titre + ' | MAKMUS', false);
    setMetaTag('meta[name="twitter:description"]', 'twitter:description', cleanDesc, false);
    setMetaTag('meta[name="twitter:image"]', 'twitter:image', imageUrl, false);
}

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
    
    var paragraphs = bodyElement.querySelectorAll('p');
    var body = "";
    paragraphs.forEach(function(p) { body += p.innerText + " "; });
    body = bodyElement.innerText || "";
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
   CREDITS
   -------------------------------------- */
function formatImageCredit(credit, source) {
    source = source || 'MakMus';
    if (!credit) return null;
    return '<div class="image-credit">Credit: ' + escapeHtml(credit) + ' — ' + escapeHtml(source) + '</div>';
}

function addAuthorCredit(authorName, authorRole) {
    authorRole = authorRole || 'Journaliste';
    if (!authorName || authorName === 'La Redaction') return '';
    return '<div class="author-credit">' + escapeHtml(authorName) + ' — ' + escapeHtml(authorRole) + ' pour MakMus</div>';
}

function renderArticle(art) {
    var contentToSplit = art.content || art.description || '';
    var paragraphs = contentToSplit.split('</p>');
    var totalPara = paragraphs.length;
    var readTime = calculateReadTime(art.content || art.description || '');
    var cleanContent = (art.content || art.description || '')
        .replace(/<span style="font-family: georgia, palatino, serif;">/gi, '')
        .replace(/<li style="font-family: georgia, palatino, serif;">/gi, '<li>')
        .replace(/<\/span>/gi, '')
        .replace(/style="font-family: georgia, palatino, serif;?"/gi, '');
    var contentToSplit = cleanContent;
    var extraMedias = art.medias || [];
    var mediaIndex = 0;
    
    // Conteneur pour le contenu texte avec la BONNE CLASSE
    var textContent = '';
    
    for (var idx = 0; idx < paragraphs.length; idx++) {
        var p = paragraphs[idx];
        if (p.trim() === "") continue;
        textContent += p + '</p>';
        
        // Insertion des médias (images/vidéos)
        if (idx > 0 && idx % 3 === 0 && mediaIndex < extraMedias.length) {
            var media = extraMedias[mediaIndex];
            if (media.type === 'image') {
                textContent += `
                    <div class="media-fullwidth-wrapper">
                        <figure class="article-media-wrapper">
                            <img src="${media.url}" loading="lazy" alt="${escapeHtml(media.caption || '')}">
                            <figcaption class="media-caption">${escapeHtml(media.caption || '')}</figcaption>
                        </figure>
                    </div>
                `;
            } else if (media.type === 'video') {
                textContent += `
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
            mediaIndex++;
        }
        
        // Insertion de la pub
        if (idx === 1 && totalPara > 3) {
            textContent += `</div>`; // Ferme le div texte
            
            var pubHtml = `
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
            textContent += pubHtml;
            // Rouvre avec la BONNE CLASSE
            textContent += `<div class="article-content" id="article-text-content">`;
        }
        
        // Insertion des recommandations
        if (idx === Math.floor(totalPara / 2) && totalPara > 5) {
            textContent += `
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
            setTimeout(function() { fillInlineGrid(art.category, art.id); }, 200);
        }
    }
    
    // Ajout des médias restants
    if (mediaIndex < extraMedias.length) {
        for (var i = mediaIndex; i < extraMedias.length; i++) {
            var media = extraMedias[i];
            if (media.type === 'image') {
                textContent += `
                    <div class="media-fullwidth-wrapper">
                        <figure class="article-media-wrapper">
                            <img src="${media.url}" loading="lazy" alt="${escapeHtml(media.caption || '')}">
                            <figcaption class="media-caption">${escapeHtml(media.caption || '')}</figcaption>
                        </figure>
                    </div>
                `;
            }
        }
    }
    
    // Fermeture du conteneur texte
    textContent += `</div>`;
    
    // Bio auteur (inchangée)
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
    
    var authorBioHtml = '';
    if (authorBio || authorRole) {
        authorBioHtml = `
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
    
    // Média principal (vidéo ou image)
var mainMediaHtml = '';
if (art.video_url && art.video_url !== '') {
    mainMediaHtml = `
        <div class="media-fullwidth-wrapper">
            <figure class="main-figure main-video-figure">
                <div class="hero-video-wrapper" style="position: relative;">
                    <div class="video-controls-top">
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
                        
                        <button class="video-control-btn share-btn" onclick="heroFlexible.shareVideo('${art.id}', '${escapeHtml(art.titre)}')">
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
                    
                    <div class="play-overlay" onclick="playArticleVideo(this)">
                        <div class="play-button">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2">
                                <polygon points="5 3 19 12 5 21 5 3" fill="white"/>
                            </svg>
                        </div>
                    </div>
                    
                    <video 
                        id="article-main-video" 
                        src="${art.video_url}" 
                        poster="${art.image_url || ''}" 
                        style="width: 100%; height: auto; display: block;"
                        preload="metadata"
                        autoplay
                        muted
                        loop
                        playsinline>
                        <source src="${art.video_url}" type="video/mp4">
                        Votre navigateur ne supporte pas la vidéo.
                    </video>
                    
                    ${art.video_caption ? `<figcaption class="img-caption-style">${escapeHtml(art.video_caption)}</figcaption>` : ''}
                </div>
            </figure>
        </div>
    `;
}else if (art.image_url) {
        mainMediaHtml = `
            <div class="media-fullwidth-wrapper">
                <figure class="main-figure">
                    <img src="${art.image_url}" class="main-img" onerror="this.src='https://via.placeholder.com/800x500'">
                    ${art.image_caption ? `<figcaption class="img-caption-style">${escapeHtml(art.image_caption)}</figcaption>` : ''}
                </figure>
            </div>
        `;
    }
    
    // Structure complète avec la BONNE CLASSE
    var fullHtml = `
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
        
        ${mainMediaHtml}
        
        <!-- ICI LA CORRECTION : la classe et l'id correspondent au CSS -->
        <div class="article-content" id="article-text-content">
            ${textContent}
        </div>
        
        ${authorBioHtml}
    `;
    
    document.getElementById('full-article').innerHTML = fullHtml;
    
    initArticleVideoPlayer();
    
    var speechBtn = document.getElementById('speech-btn');
    if (speechBtn) {
        speechBtn.removeAttribute('onclick');
        speechBtn.addEventListener('click', function(e) {
            e.preventDefault();
            window.toggleSpeech();
        });
    }
    
    // Charger les données après le rendu
    fetchLikesCount();
    fetchComments();
    fetchRelatedArticles(art.tags, art.category);
    
    // Charger les états utilisateur si connecté
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

function toggleArticleVideoMute(event, button) {
    event.stopPropagation();
    const wrapper = button.closest('.hero-video-wrapper');
    const video = wrapper.querySelector('video');
    
    video.muted = !video.muted;
    
    const svg = button.querySelector('svg');
    if (video.muted) {
        svg.innerHTML = '<path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6"/>';
    } else {
        svg.innerHTML = '<path d="M11 5L6 9H2v6h4l5 4V5zM22 9l-3 3 3 3M18 9l-3 3 3 3"/>';
    }
}

function toggleArticleVideoFullscreen(event, button) {
    event.stopPropagation();
    const wrapper = button.closest('.hero-video-wrapper');
    const video = wrapper.querySelector('video');
    
    if (!document.fullscreenElement) {
        video.requestFullscreen().catch(err => {
            console.log(`Erreur plein écran: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
}

function handleArticleVideoLike(event, button, articleId) {
    event.stopPropagation();
    const svg = button.querySelector('svg');
    const isLiked = svg.getAttribute('fill') === '#a30000';
    
    if (!isLiked) {
        svg.setAttribute('fill', '#a30000');
        showToast('Vidéo ajoutée aux favoris', 'success');
    } else {
        svg.setAttribute('fill', 'none');
        showToast('Like retiré', 'info');
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
    
    wrapper.addEventListener('mouseenter', function() {
        if (!video.paused && playOverlay) {
            playOverlay.style.opacity = '0';
        }
    });
    
    wrapper.addEventListener('mouseleave', function() {
        if (!video.paused && playOverlay) {
            playOverlay.style.opacity = '0';
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

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        var modal = document.getElementById('author-bio-modal');
        if (modal) {
            window.closeAuthorBio();
        }
    }
});

async function loadArticle() {
    console.log('=== loadArticle CALLED ===');
    console.log('articleSlug:', articleSlug);
    console.log('articleId:', articleId);
    
    let query;
    
    if (articleSlug) {
        console.log('RECHERCHE PAR SLUG:', articleSlug);
        query = supabaseClient
            .from('articles')
            .select('*')
            .eq('slug', articleSlug)
            .single();
    } else if (articleId) {
        console.log('RECHERCHE PAR ID:', articleId);
        query = supabaseClient
            .from('articles')
            .select('*')
            .eq('id', articleId)
            .single();
    } else {
        document.getElementById('full-article').innerHTML = "<p class='error-msg'>Article non trouvé.</p>";
        return;
    }
    
    const { data: art, error } = await query;
    
    if (error || !art) {
        console.error('ERREUR:', error);
        document.getElementById('full-article').innerHTML = "<p class='error-msg'>Article introuvable.</p>";
        return;
    }
    
    console.log('ARTICLE TROUVÉ:', art.titre);
    
    currentArticle = art;
    document.title = art.titre + ' | MAKMUS';
    
    updateOpenGraphTags(art);
    renderArticle(art);
    restoreReadingPosition();
    window.addEventListener('beforeunload', saveReadingPosition);
}

async function fillInlineGrid(category, currentId) {
    var { data: related } = await supabaseClient
        .from('articles')
        .select('id, titre, image_url')
        .eq('category', category)
        .neq('id', currentId)
        .limit(2);
    if (related && related.length > 0) {
        for (var i = 0; i < related.length; i++) {
            var item = related[i];
            var titleEl = document.getElementById('inline-title-' + (i+1));
            if (titleEl) {
                titleEl.innerHTML = '<a href="redaction.html?id=' + item.id + '" style="text-decoration:none; color:#121212; font-weight:bold; font-size:0.9rem;">' + escapeHtml(item.titre) + '</a>';
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
        .select('id, titre, image_url, category')
        .eq('category', category)
        .neq('id', currentArticle.id)
        .limit(6);
    if (!related || related.length === 0) {
        if (box) box.style.display = 'none';
        return;
    }
    if (box) box.style.display = 'block';
    grid.innerHTML = related.map(function(art) {
        return '<a href="redaction.html?id=' + art.id + '" class="rec-card"><div class="rec-image-container"><img src="' + art.image_url + '" alt="' + escapeHtml(art.titre) + '" loading="lazy" onerror="this.src=\'https://via.placeholder.com/300x200\'"><div class="ad-badge">Recommandé</div></div><div class="rec-source">' + escapeHtml(art.category || 'MakMus') + '</div><h4 class="rec-title">' + escapeHtml(art.titre) + '</h4></a>';
    }).join('');
}

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
    
    if (articleId || articleSlug) {
        loadArticle();
    } else {
        var fullArt = document.getElementById('full-article');
        if (fullArt) {
            fullArt.innerHTML = "<p style='text-align:center; padding:100px; font-family:serif;'>Article non trouvé.</p>";
        }
    }
});