/* ==========================================================================
   EDITEUR TINYMCE - MAKMUS (VERSION COMPLÈTE AVEC SLUG)
   ========================================================================== */

var editor = null;
var currentArticleId = null;
var currentUser = null;
var mediaCount = 0;

var urlParams = new URLSearchParams(window.location.search);
currentArticleId = urlParams.get('id');

/* --------------------------------------
   FONCTIONS UTILITAIRES
   -------------------------------------- */
function generateSlug(title, id) {
    if (!title) return '';
    
    // Supprimer les accents
    var withoutAccents = title
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    
    // Remplacer les espaces et caractères spéciaux par des tirets
    var slug = withoutAccents
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    
    // Ajouter un identifiant court pour garantir l'unicité
    var shortId;
    if (id && id !== 'null' && id !== 'undefined') {
        shortId = id.replace(/-/g, '').substring(0, 8);
    } else {
        shortId = Date.now().toString().substring(0, 8);
    }
    
    return `${slug}-${shortId}`;
}

function validateSlug(slug) {
    return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

/* --------------------------------------
   GESTION DES MÉDIAS MULTIPLES
   -------------------------------------- */
function addMediaItem(mediaData) {
    var container = document.getElementById('media-items');
    var index = mediaCount++;
    
    var mediaHtml = `
        <div class="media-group" data-index="${index}">
            <div class="media-group-header">
                <span class="media-group-title">Média ${index + 1}</span>
                <button type="button" class="remove-media-btn" onclick="removeMediaItem(${index})">Supprimer</button>
            </div>
            <div class="form-group">
                <label>Type</label>
                <select class="media-type-select" data-field="type" data-index="${index}">
                    <option value="image" ${mediaData && mediaData.type === 'image' ? 'selected' : ''}>Image</option>
                    <option value="video" ${mediaData && mediaData.type === 'video' ? 'selected' : ''}>Vidéo</option>
                </select>
            </div>
            <div class="form-group">
                <label>URL du média</label>
                <input type="text" class="media-url" data-field="url" data-index="${index}" value="${mediaData ? (mediaData.url || '') : ''}" placeholder="https://...">
            </div>
            <div class="form-group">
                <label>Légende / Crédit</label>
                <input type="text" class="media-caption" data-field="caption" data-index="${index}" value="${mediaData ? (mediaData.caption || '') : ''}" placeholder="Description...">
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', mediaHtml);
}

function removeMediaItem(index) {
    var element = document.querySelector('.media-group[data-index="' + index + '"]');
    if (element) element.remove();
}

function getAllMedias() {
    var medias = [];
    var mediaGroups = document.querySelectorAll('.media-group');
    
    for (var i = 0; i < mediaGroups.length; i++) {
        var group = mediaGroups[i];
        var type = group.querySelector('.media-type-select').value;
        var url = group.querySelector('.media-url').value;
        var caption = group.querySelector('.media-caption').value;
        
        if (url && url.trim() !== '') {
            medias.push({
                type: type,
                url: url,
                caption: caption,
                order: i
            });
        }
    }
    
    return medias;
}

function loadMediasFromArticle(medias) {
    if (!medias || medias.length === 0) return;
    
    for (var i = 0; i < medias.length; i++) {
        addMediaItem(medias[i]);
    }
}

/* --------------------------------------
   INITIALISATION TINYMCE
   -------------------------------------- */
function initEditor() {
    tinymce.init({
        selector: '#article-content',
        height: 500,
        width: '100%',
        plugins: ['advlist', 'autolink', 'link', 'image', 'lists', 'charmap', 'preview', 'anchor', 'searchreplace', 'wordcount', 'visualblocks', 'code', 'fullscreen', 'media', 'table', 'emoticons', 'help'],
        toolbar: 'undo redo | styles | bold italic | alignleft aligncenter alignright | bullist numlist | link image | preview fullscreen',
        menubar: 'file edit view insert format tools table help',
        
        paste_as_text: false,
        paste_auto_cleanup_on_paste: true,
        paste_remove_styles: true,
        paste_remove_styles_if_webkit: true,
        paste_strip_class_attributes: 'all',
        paste_remove_spans: true,
        paste_retain_style_properties: 'none',
        
        content_style: 'body { font-family: "Lora", Georgia, serif !important; font-size: 18px; line-height: 1.6; max-width: 680px; margin: 0 auto; } img { max-width: 100%; height: auto; }',
        
        cleanup: true,
        cleanup_on_startup: true,
        
        formats: {
            bold: {inline: 'strong'},
            italic: {inline: 'em'},
            underline: {inline: 'u'}
        },
        
        setup: function(ed) {
            editor = ed;
            
            ed.on('paste', function(e) {
                var content = (e.clipboardData || window.clipboardData).getData('text/html');
                if (content) {
                    content = content.replace(/style="[^"]*"/gi, '');
                    content = content.replace(/font-family:[^;]+;/gi, '');
                    content = content.replace(/<span[^>]*>/gi, '');
                    content = content.replace(/<\/span>/gi, '');
                    content = content.replace(/<li style="[^"]*">/gi, '<li>');
                    
                    e.preventDefault();
                    ed.insertContent(content);
                }
            });
            
            ed.on('PastePostProcess', function(e) {
                var node = e.node;
                if (node) {
                    var elements = node.querySelectorAll('[style]');
                    for (var i = 0; i < elements.length; i++) {
                        elements[i].removeAttribute('style');
                    }
                    
                    var spans = node.querySelectorAll('span');
                    for (var j = 0; j < spans.length; j++) {
                        var span = spans[j];
                        if (span.attributes.length === 0) {
                            span.outerHTML = span.innerHTML;
                        }
                    }
                }
            });
        }
    });
}

/* --------------------------------------
   CHARGEMENT D'UN ARTICLE
   -------------------------------------- */
async function loadArticle(id) {
    try {
        var { data, error } = await supabaseClient
            .from('articles')
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) throw error;
        
        document.getElementById('article-title').value = data.titre || '';
        document.getElementById('article-excerpt').value = data.description || '';
        document.getElementById('article-category').value = data.category || '';
        document.getElementById('article-subcategory').value = data.subcategory || '';
        document.getElementById('article-tags').value = data.tags || '';
        document.getElementById('author-name').value = data.author_name || '';
        document.getElementById('author-image').value = data.author_image || '';
        document.getElementById('article-image').value = data.image_url || '';
        document.getElementById('article-image-caption').value = data.image_caption || '';
        document.getElementById('article-video').value = data.video_url || '';
        document.getElementById('article-priority').checked = data.is_priority === true;
        
        // Afficher le slug dans un champ (optionnel)
        var slugField = document.getElementById('article-slug');
        if (slugField && data.slug) {
            slugField.value = data.slug;
        }
        
        if (data.medias && data.medias.length > 0) {
            loadMediasFromArticle(data.medias);
        }
        
        if (editor && data.content) {
            editor.setContent(data.content);
        }
        
        showStatus('Article chargé', 'success');
    } catch (error) {
        console.error('Erreur chargement:', error);
        showStatus('Erreur de chargement', 'error');
    }
}

function cleanEditorContent(content) {
    content = content.replace(/style="[^"]*"/gi, '');
    content = content.replace(/font-family:[^;]+;/gi, '');
    content = content.replace(/<span[^>]*>/gi, '');
    content = content.replace(/<\/span>/gi, '');
    content = content.replace(/<li style="[^"]*">/gi, '<li>');
    content = content.replace(/<p style="[^"]*">/gi, '<p>');
    content = content.replace(/<p>\s*<\/p>/gi, '');
    content = content.replace(/<p><br[^>]*><\/p>/gi, '');
    
    return content;
}

/* --------------------------------------
   SAUVEGARDE AVEC SLUG
   -------------------------------------- */
async function saveArticle(status) {
    var title = document.getElementById('article-title').value;
    var excerpt = document.getElementById('article-excerpt').value;
    var category = document.getElementById('article-category').value;
    var subcategory = document.getElementById('article-subcategory').value;
    var tags = document.getElementById('article-tags').value;
    var rawContent = editor ? editor.getContent() : '';
    var content = cleanEditorContent(rawContent);
    var medias = getAllMedias();
    var imageUrl = document.getElementById('article-image')?.value || null;
    var imageCaption = document.getElementById('article-image-caption')?.value || null;
    var authorName = document.getElementById('author-name')?.value || null;
    var authorImage = document.getElementById('author-image')?.value || null;
    var isPriority = document.getElementById('article-priority').checked;
    var videoUrl = document.getElementById('article-video')?.value || null;
    
    if (!title) {
        showToast('Veuillez saisir un titre', 'error');
        return;
    }
    
    // Générer le slug
    let slug;
    
    // Vérifier si un slug personnalisé a été saisi
    var customSlug = document.getElementById('article-slug')?.value;
    
    if (customSlug && customSlug.trim() !== '') {
        // Utiliser le slug personnalisé
        slug = customSlug
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    } else if (currentArticleId) {
        // Pour un article existant, garder le slug actuel
        try {
            var { data: existing } = await supabaseClient
                .from('articles')
                .select('slug')
                .eq('id', currentArticleId)
                .single();
            if (existing && existing.slug) {
                slug = existing.slug;
            } else {
                slug = generateSlug(title, currentArticleId);
            }
        } catch(e) {
            slug = generateSlug(title, currentArticleId);
        }
    } else {
        // Nouvel article : générer le slug
        slug = generateSlug(title, null);
    }
    
    // Vérifier l'unicité du slug (pour les nouveaux articles ou changement de titre)
    if (!currentArticleId || (customSlug && customSlug !== '')) {
        try {
            var { data: existingSlug } = await supabaseClient
                .from('articles')
                .select('slug')
                .eq('slug', slug)
                .neq('id', currentArticleId || '');
            
            if (existingSlug && existingSlug.length > 0) {
                // Slug existe déjà, ajouter un timestamp
                slug = slug + '-' + Date.now().toString().substring(0, 6);
                showToast('Slug modifié pour éviter les doublons', 'info');
            }
        } catch(e) {}
    }
    
    showToast('Sauvegarde en cours...', 'info');
    
    try {
        var result;
        
        var articleData = {
            titre: title,
            slug: slug,
            description: excerpt || null,
            category: category || null,
            subcategory: subcategory || null,
            tags: tags || null,
            content: content || null,
            medias: medias || [],
            image_url: imageUrl,
            image_caption: imageCaption,
            video_url: videoUrl,
            author_name: authorName || currentUser?.email?.split('@')[0] || 'Rédaction',
            author_image: authorImage || null,
            is_priority: isPriority,
            status: status,
            is_published: status === 'published',
            updated_at: new Date()
        };
        
        if (currentUser && !currentArticleId) {
            articleData.author_id = currentUser.id;
        }
        
        if (currentArticleId) {
            result = await supabaseClient
                .from('articles')
                .update(articleData)
                .eq('id', currentArticleId);
        } else {
            articleData.created_at = new Date();
            articleData.views = 0;
            result = await supabaseClient
                .from('articles')
                .insert([articleData]);
            
            if (result.data && result.data[0]) {
                currentArticleId = result.data[0].id;
                window.history.pushState({}, '', '?id=' + currentArticleId);
            }
        }
        
        if (result.error) throw result.error;
        
        var successMessage = status === 'published' 
            ? '✅ Article publié avec succès !\nURL: /article/' + slug 
            : '📝 Brouillon sauvegardé !';
        showToast(successMessage, 'success');
        
        if (status === 'published') {
            setTimeout(function() {
                window.location.href = 'dashboard.html';
            }, 1500);
        }
        
    } catch (error) {
        console.error('Erreur:', error);
        showToast('Erreur: ' + error.message, 'error');
    }
}

function showStatus(message, type) {
    var statusDiv = document.getElementById('status-message');
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
    
    setTimeout(function() {
        statusDiv.className = 'status';
    }, 3000);
}

function previewArticle() {
    var title = document.getElementById('article-title').value;
    var content = editor ? editor.getContent() : '';
    var medias = getAllMedias();
    var authorName = document.getElementById('author-name').value || 'Rédaction';
    
    var mediaHtml = '';
    for (var i = 0; i < medias.length; i++) {
        var m = medias[i];
        if (m.type === 'image') {
            mediaHtml += '<div><img src="' + m.url + '" style="max-width:100%; margin:20px 0;"><p style="color:#666; font-size:12px;">' + (m.caption || '') + '</p></div>';
        } else {
            mediaHtml += '<div><video src="' + m.url + '" controls style="max-width:100%; margin:20px 0;"></video><p style="color:#666; font-size:12px;">' + (m.caption || '') + '</p></div>';
        }
    }
    
    var previewWindow = window.open('', '_blank');
    previewWindow.document.write('<!DOCTYPE html><html><head><title>' + title + ' — Aperçu</title><style>body{max-width:800px;margin:0 auto;padding:40px;font-family:"Lora",serif;font-size:18px;line-height:1.6;}img,video{max-width:100%;height:auto;}.author{color:#666;font-size:14px;margin-bottom:20px;}</style></head><body><h1>' + title + '</h1><div class="author">Par ' + authorName + '</div>' + mediaHtml + content + '</body></html>');
    previewWindow.document.close();
}

/* --------------------------------------
   TOAST NOTIFICATION
   -------------------------------------- */
function showToast(message, type) {
    type = type || 'success';
    
    var existing = document.querySelector('.editor-toast');
    if (existing) existing.remove();
    
    var toast = document.createElement('div');
    toast.className = 'editor-toast ' + type;
    toast.innerHTML = '<span>' + message + '</span>';
    
    toast.style.cssText = 'position: fixed; bottom: 30px; right: 30px; background: ' + (type === 'error' ? '#dc3545' : '#28a745') + '; color: white; padding: 12px 24px; border-radius: 8px; font-family: "Libre Franklin", sans-serif; font-size: 14px; font-weight: 500; z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.15); animation: slideIn 0.3s ease;';
    
    document.body.appendChild(toast);
    
    toast.style.transform = 'translateX(0)';
    
    setTimeout(function() {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(function() {
            if (toast && toast.remove) toast.remove();
        }, 300);
    }, 3000);
}

var style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateX(100px);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }
    .editor-toast {
        animation: slideIn 0.3s ease;
    }
`;
document.head.appendChild(style);

/* --------------------------------------
   INITIALISATION
   -------------------------------------- */
document.addEventListener('DOMContentLoaded', function() {
    checkAdminAuth().then(function(authenticated) {
        if (authenticated) {
            currentUser = supabaseClient.auth.user;
            initEditor();
            if (currentArticleId) {
                loadArticle(currentArticleId);
            }
        }
    });
    
    var addBtn = document.getElementById('add-media-btn');
    if (addBtn) {
        addBtn.addEventListener('click', function() {
            addMediaItem(null);
        });
    }
    
    var publishBtn = document.getElementById('publish-btn');
    var draftBtn = document.getElementById('draft-btn');
    var previewBtn = document.getElementById('preview-btn');
    var logoutBtn = document.getElementById('logout-nav');
    
    if (publishBtn) publishBtn.addEventListener('click', function() { saveArticle('published'); });
    if (draftBtn) draftBtn.addEventListener('click', function() { saveArticle('draft'); });
    if (previewBtn) previewBtn.addEventListener('click', previewArticle);
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
});