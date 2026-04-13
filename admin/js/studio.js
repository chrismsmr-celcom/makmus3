/* ==========================================================================
   STUDIO MÉDIA MAKMUS (CORRIGÉ)
   ========================================================================== */

var SUPABASE_URL = 'https://logphtrdkpbfgtejtime.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvZ3BodHJka3BiZmd0ZWp0aW1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNzY4MDYsImV4cCI6MjA4NTc1MjgwNn0.Uoxiax-whIdbB5oI3bof-hN0m5O9PDi96zmaUZ6BBio';

var supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
var currentUser = null;
var mediaList = [];
var selectedMedia = new Set();
var currentFilter = 'all';
var currentSearch = '';
var currentPage = 1;
var ITEMS_PER_PAGE = 24;
var BUCKET_NAME = 'media';

/* --------------------------------------
   AUTHENTIFICATION
   -------------------------------------- */
async function checkAdminAuth() {
    try {
        var { data: { user }, error } = await supabaseClient.auth.getUser();
        
        if (error || !user) {
            window.location.href = 'login.html';
            return;
        }
        
        currentUser = user;
        initBucket();
        loadMedia();
    } catch (error) {
        console.error('Auth error:', error);
        window.location.href = 'login.html';
    }
}

/* --------------------------------------
   BUCKET STORAGE (CORRIGÉ)
   -------------------------------------- */
async function initBucket() {
    try {
        // Vérifier si le bucket existe
        var { data: buckets, error: listError } = await supabaseClient.storage.listBuckets();
        
        if (listError) {
            console.error('Erreur listage buckets:', listError);
            return;
        }
        
        var bucketExists = false;
        if (buckets) {
            for (var i = 0; i < buckets.length; i++) {
                if (buckets[i].name === BUCKET_NAME) {
                    bucketExists = true;
                    console.log('Bucket "media" trouvé');
                    break;
                }
            }
        }
        
        if (!bucketExists) {
            console.log('Création du bucket "media"...');
            var { error: createError } = await supabaseClient.storage.createBucket(BUCKET_NAME, {
                public: true,
                fileSizeLimit: 10485760
            });
            
            if (createError) {
                console.error('Erreur création bucket:', createError);
                showToast('Erreur: Impossible de créer le bucket media', 'error');
            } else {
                console.log('Bucket "media" créé avec succès');
                showToast('Bucket media créé', 'success');
            }
        }
    } catch (error) {
        console.error('Erreur initBucket:', error);
    }
}
/* --------------------------------------
   UPLOAD
   -------------------------------------- */
async function uploadFiles(files) {
    for (var f = 0; f < files.length; f++) {
        var file = files[f];
        
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
            showToast(file.name + ' non supporte', 'error');
            continue;
        }
        
        if (file.size > 10 * 1024 * 1024) {
            showToast(file.name + ' depasse 10MB', 'error');
            continue;
        }
        
        var timestamp = Date.now();
        var ext = file.name.split('.').pop();
        var filename = timestamp + '-' + Math.random().toString(36).substring(2, 8) + '.' + ext;
        var filePath = filename;
        
        showToast('Upload de ' + file.name + '...', 'info');
        
        var { error } = await supabaseClient.storage
            .from(BUCKET_NAME)
            .upload(filePath, file);
        
        if (error) {
            showToast('Erreur: ' + file.name, 'error');
            console.error(error);
            continue;
        }
        
        var { data: urlData } = supabaseClient.storage
            .from(BUCKET_NAME)
            .getPublicUrl(filePath);
        
        await supabaseClient
            .from('media')
            .insert([{
                filename: file.name,
                url: urlData.publicUrl,
                type: file.type.startsWith('image/') ? 'image' : 'video',
                mime_type: file.type,
                size: file.size,
                uploaded_by: currentUser.id
            }]);
        
        showToast(file.name + ' uploadé !', 'success');
    }
    
    loadMedia();
}

/* --------------------------------------
   CHARGEMENT DES MÉDIAS
   -------------------------------------- */
async function loadMedia() {
    var grid = document.getElementById('media-grid');
    if (!grid) return;
    grid.innerHTML = '<div class="loading">Chargement...</div>';
    
    try {
        var query = supabaseClient
            .from('media')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false });
        
        if (currentFilter !== 'all') {
            query = query.eq('type', currentFilter);
        }
        
        if (currentSearch) {
            query = query.ilike('filename', '%' + currentSearch + '%');
        }
        
        var from = (currentPage - 1) * ITEMS_PER_PAGE;
        var to = from + ITEMS_PER_PAGE - 1;
        
        var { data, error, count } = await query.range(from, to);
        
        if (error) throw error;
        
        mediaList = data || [];
        renderMediaGrid();
        renderPagination(count || 0);
        
    } catch (error) {
        console.error('Erreur chargement medias:', error);
        grid.innerHTML = '<div class="loading">Erreur de chargement</div>';
    }
}

function renderMediaGrid() {
    var grid = document.getElementById('media-grid');
    if (!grid) return;
    
    if (mediaList.length === 0) {
        grid.innerHTML = '<div class="loading">Aucun media trouve</div>';
        return;
    }
    
    var html = '';
    for (var i = 0; i < mediaList.length; i++) {
        var media = mediaList[i];
        var isSelected = selectedMedia.has(media.id);
        html += '<div class="media-card ' + (isSelected ? 'selected' : '') + '" data-id="' + media.id + '">';
        if (media.type === 'image') {
            html += '<img src="' + media.url + '" class="media-preview" alt="' + media.filename + '">';
        } else {
            html += '<video src="' + media.url + '" class="media-preview" muted></video>';
        }
        html += '<div class="media-info">';
        html += '<div class="media-filename">' + media.filename + '</div>';
        html += '<div class="media-meta">' + new Date(media.created_at).toLocaleDateString('fr-FR') + '</div>';
        html += '</div>';
        html += '<div class="media-select-overlay">' + (isSelected ? '✓' : '') + '</div>';
        html += '</div>';
    }
    grid.innerHTML = html;
    
    var cards = document.querySelectorAll('.media-card');
    for (var j = 0; j < cards.length; j++) {
        cards[j].addEventListener('click', function(e) {
            e.stopPropagation();
            var id = this.getAttribute('data-id');
            toggleSelection(id);
        });
    }
}

function toggleSelection(id) {
    if (selectedMedia.has(id)) {
        selectedMedia.delete(id);
    } else {
        selectedMedia.add(id);
    }
    
    var cards = document.querySelectorAll('.media-card');
    for (var i = 0; i < cards.length; i++) {
        if (cards[i].getAttribute('data-id') === id) {
            if (selectedMedia.has(id)) {
                cards[i].classList.add('selected');
                cards[i].querySelector('.media-select-overlay').textContent = '✓';
            } else {
                cards[i].classList.remove('selected');
                cards[i].querySelector('.media-select-overlay').textContent = '';
            }
        }
    }
    
    updateSelectionBar();
}

function updateSelectionBar() {
    var bar = document.getElementById('selection-bar');
    var info = document.getElementById('selection-info');
    var count = selectedMedia.size;
    
    if (bar && info) {
        if (count > 0) {
            bar.classList.add('show');
            info.textContent = count + ' media' + (count > 1 ? 's' : '') + ' selectionne' + (count > 1 ? 's' : '');
        } else {
            bar.classList.remove('show');
        }
    }
}

function insertMedia() {
    if (selectedMedia.size === 0) return;
    
    var selected = [];
    for (var i = 0; i < mediaList.length; i++) {
        if (selectedMedia.has(mediaList[i].id)) {
            selected.push(mediaList[i]);
        }
    }
    
    var urls = [];
    for (var j = 0; j < selected.length; j++) {
        urls.push(selected[j].url);
    }
    
    sessionStorage.setItem('inserted_media_urls', JSON.stringify(urls));
    window.location.href = 'editor.html?insert=true';
}

function renderPagination(total) {
    var container = document.getElementById('pagination');
    if (!container) return;
    
    var totalPages = Math.ceil(total / ITEMS_PER_PAGE);
    
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    var html = '';
    for (var i = 1; i <= totalPages; i++) {
        html += '<button class="' + (i === currentPage ? 'active' : '') + '" data-page="' + i + '">' + i + '</button>';
    }
    container.innerHTML = html;
    
    var btns = container.querySelectorAll('button');
    for (var j = 0; j < btns.length; j++) {
        btns[j].addEventListener('click', function() {
            currentPage = parseInt(this.getAttribute('data-page'));
            loadMedia();
        });
    }
}

/* --------------------------------------
   DRAG & DROP
   -------------------------------------- */
function setupDragAndDrop() {
    var area = document.getElementById('upload-area');
    if (!area) return;
    
    area.addEventListener('dragover', function(e) {
        e.preventDefault();
        area.classList.add('drag-over');
    });
    
    area.addEventListener('dragleave', function() {
        area.classList.remove('drag-over');
    });
    
    area.addEventListener('drop', function(e) {
        e.preventDefault();
        area.classList.remove('drag-over');
        var files = Array.from(e.dataTransfer.files);
        uploadFiles(files);
    });
    
    var uploadBtn = document.getElementById('upload-btn');
    var fileInput = document.getElementById('file-input');
    
    if (uploadBtn) {
        uploadBtn.addEventListener('click', function() {
            if (fileInput) fileInput.click();
        });
    }
    
    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            uploadFiles(Array.from(e.target.files));
            e.target.value = '';
        });
    }
}

/* --------------------------------------
   FILTRES
   -------------------------------------- */
function setupFilters() {
    var filterBtns = document.querySelectorAll('.filter-btn');
    for (var i = 0; i < filterBtns.length; i++) {
        filterBtns[i].addEventListener('click', function() {
            var btns = document.querySelectorAll('.filter-btn');
            for (var j = 0; j < btns.length; j++) {
                btns[j].classList.remove('active');
            }
            this.classList.add('active');
            currentFilter = this.getAttribute('data-filter');
            currentPage = 1;
            loadMedia();
        });
    }
    
    var searchInput = document.getElementById('search-input');
    if (searchInput) {
        var timeout;
        searchInput.addEventListener('input', function() {
            clearTimeout(timeout);
            timeout = setTimeout(function() {
                currentSearch = searchInput.value;
                currentPage = 1;
                loadMedia();
            }, 300);
        });
    }
}

/* --------------------------------------
   TOAST
   -------------------------------------- */
function showToast(message, type) {
    type = type || 'success';
    var existing = document.querySelector('.admin-toast');
    if (existing) existing.remove();
    
    var toast = document.createElement('div');
    toast.className = 'admin-toast ' + type;
    toast.textContent = message;
    toast.style.cssText = 'position: fixed; bottom: 20px; right: 20px; background: ' + (type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : '#17a2b8') + '; color: white; padding: 12px 20px; border-radius: 8px; font-size: 14px; z-index: 1000;';
    
    document.body.appendChild(toast);
    
    setTimeout(function() {
        toast.style.opacity = '0';
        setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
}

async function logout() {
    if (confirm('Voulez-vous vous deconnecter ?')) {
        await supabaseClient.auth.signOut();
        window.location.href = 'login.html';
    }
}

/* --------------------------------------
   INITIALISATION
   -------------------------------------- */
document.addEventListener('DOMContentLoaded', function() {
    checkAdminAuth();
    setupDragAndDrop();
    setupFilters();
    
    var logoutBtn = document.getElementById('logout-btn');
    var cancelBtn = document.getElementById('cancel-selection');
    var insertBtn = document.getElementById('insert-media');
    
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
    if (cancelBtn) cancelBtn.addEventListener('click', function() {
        selectedMedia.clear();
        updateSelectionBar();
        loadMedia();
    });
    if (insertBtn) insertBtn.addEventListener('click', insertMedia);
});