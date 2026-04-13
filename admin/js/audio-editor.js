/* ==========================================================================
   STUDIO AUDIO - ÉDITEUR CORRIGÉ
   ========================================================================== */

let currentAudioId = null;

document.addEventListener('DOMContentLoaded', () => {
    checkAdminAuth();
    loadAudiosList();
    setupUploadAreas();
    
    document.getElementById('audio-form').addEventListener('submit', saveAudio);
    document.getElementById('cancel-btn').addEventListener('click', resetForm);
    document.getElementById('logout-nav').addEventListener('click', logout);
});

function setupUploadAreas() {
    // Upload image
    const imageArea = document.getElementById('image-upload-area');
    const imageInput = document.getElementById('image-file');
    
    if (imageArea) {
        imageArea.addEventListener('click', () => imageInput.click());
        imageArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            imageArea.classList.add('dragover');
        });
        imageArea.addEventListener('dragleave', () => imageArea.classList.remove('dragover'));
        imageArea.addEventListener('drop', (e) => {
            e.preventDefault();
            imageArea.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                uploadImage(file);
            }
        });
    }
    
    if (imageInput) {
        imageInput.addEventListener('change', (e) => {
            if (e.target.files[0]) uploadImage(e.target.files[0]);
        });
    }
    
    // Upload audio
    const audioArea = document.getElementById('audio-upload-area');
    const audioInput = document.getElementById('audio-file');
    
    if (audioArea) {
        audioArea.addEventListener('click', () => audioInput.click());
        audioArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            audioArea.classList.add('dragover');
        });
        audioArea.addEventListener('dragleave', () => audioArea.classList.remove('dragover'));
        audioArea.addEventListener('drop', (e) => {
            e.preventDefault();
            audioArea.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('audio/')) {
                uploadAudio(file);
            }
        });
    }
    
    if (audioInput) {
        audioInput.addEventListener('change', (e) => {
            if (e.target.files[0]) uploadAudio(e.target.files[0]);
        });
    }
}

async function uploadImage(file) {
    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `audio_cover_${Date.now()}.${fileExt}`;
        const filePath = `audio-covers/${fileName}`;
        
        // Vérifier si le bucket existe
        const { data: buckets } = await supabaseClient.storage.listBuckets();
        const bucketExists = buckets?.some(b => b.name === 'media');
        
        if (!bucketExists) {
            showStatus('Le bucket "media" n\'existe pas. Veuillez le créer dans Supabase.', 'error');
            return;
        }
        
        const { error } = await supabaseClient.storage
            .from('media')
            .upload(filePath, file);
        
        if (error) {
            console.error("Upload error:", error);
            showStatus('Erreur upload image: ' + error.message, 'error');
            return;
        }
        
        const { data: { publicUrl } } = supabaseClient.storage
            .from('media')
            .getPublicUrl(filePath);
        
        document.getElementById('image-url').value = publicUrl;
        
        const preview = document.getElementById('image-preview');
        const previewImg = document.getElementById('preview-img');
        if (previewImg) previewImg.src = publicUrl;
        if (preview) preview.style.display = 'block';
        
        showStatus('Image uploadée avec succès', 'success');
        
    } catch (err) {
        console.error("Upload image error:", err);
        showStatus('Erreur: ' + err.message, 'error');
    }
}

async function uploadAudio(file) {
    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `audio_${Date.now()}.${fileExt}`;
        const filePath = fileName;
        
        // ✅ Utiliser le bucket 'audios' au lieu de 'media'
        const { error } = await supabaseClient.storage
            .from('audios')  // ← Changement ici
            .upload(filePath, file, {
                contentType: 'audio/mpeg',
                cacheControl: '3600'
            });
        
        if (error) {
            console.error("Upload error:", error);
            showStatus('Erreur upload audio: ' + error.message, 'error');
            return;
        }
        
        const { data: { publicUrl } } = supabaseClient.storage
            .from('audios')
            .getPublicUrl(filePath);
        
        document.getElementById('audio-url').value = publicUrl;
        
        // Calculer la durée
        const audio = new Audio();
        audio.src = URL.createObjectURL(file);
        audio.addEventListener('loadedmetadata', () => {
            const duration = Math.round(audio.duration);
            const durationInput = document.getElementById('audio-duration-data');
            if (durationInput) durationInput.value = duration;
            
            const minutes = Math.floor(duration / 60);
            const seconds = duration % 60;
            const audioInfo = document.getElementById('audio-info');
            if (audioInfo) {
                audioInfo.innerHTML = `✅ ${file.name} (${minutes}:${seconds < 10 ? '0' + seconds : seconds})`;
                audioInfo.style.display = 'block';
            }
            showStatus('Audio uploadé avec succès', 'success');
        });
        
    } catch (err) {
        console.error("Upload audio error:", err);
        showStatus('Erreur: ' + err.message, 'error');
    }
}
async function saveAudio(e) {
    e.preventDefault();
    
    const titre = document.getElementById('audio-title').value;
    if (!titre) {
        showStatus('Veuillez saisir un titre', 'error');
        return;
    }
    
    const audioUrl = document.getElementById('audio-url').value;
    if (!audioUrl) {
        showStatus('Veuillez uploader un fichier audio', 'error');
        return;
    }
    
    const durationInput = document.getElementById('audio-duration-data');
    const duree = durationInput ? parseInt(durationInput.value) || 0 : 0;
    
    const audioData = {
        titre: titre,
        description: document.getElementById('audio-description').value || null,
        audio_url: audioUrl,
        image_url: document.getElementById('image-url').value || null,
        duree: duree,
        type: document.getElementById('audio-type').value,
        source: document.getElementById('audio-source').value || null,
        category: document.getElementById('audio-category').value || null,
        is_published: document.getElementById('audio-published').checked,
        updated_at: new Date().toISOString()
    };
    
    try {
        let result;
        if (currentAudioId) {
            result = await supabaseClient
                .from('audios')
                .update(audioData)
                .eq('id', currentAudioId);
        } else {
            audioData.created_at = new Date().toISOString();
            result = await supabaseClient
                .from('audios')
                .insert([audioData]);
        }
        
        if (result.error) throw result.error;
        
        showStatus(currentAudioId ? 'Audio mis à jour' : 'Audio créé avec succès', 'success');
        resetForm();
        loadAudiosList();
        
    } catch (error) {
        console.error("Save error:", error);
        showStatus('Erreur: ' + error.message, 'error');
    }
}

async function loadAudiosList() {
    const container = document.getElementById('audios-list');
    if (!container) return;
    
    try {
        const { data, error } = await supabaseClient
            .from('audios')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        if (!data || data.length === 0) {
            container.innerHTML = '<p>Aucun audio</p>';
            return;
        }
        
        container.innerHTML = data.map(audio => `
            <div class="audio-item" data-id="${audio.id}">
                <div class="audio-item-info">
                    <div class="audio-item-title">${escapeHtml(audio.titre)}</div>
                    <div class="audio-item-meta">
                        ${audio.type || 'podcast'} • ${audio.source || 'MAKMUS'} • 
                        ${audio.is_published ? '✅ Publié' : '📝 Brouillon'}
                    </div>
                </div>
                <div class="audio-item-actions">
                    <button class="edit-btn" onclick="editAudio('${audio.id}')">✏️</button>
                    <button class="delete-btn" onclick="deleteAudio('${audio.id}')">🗑️</button>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error("Load error:", error);
        container.innerHTML = '<p>Erreur de chargement</p>';
    }
}

async function editAudio(id) {
    try {
        const { data, error } = await supabaseClient
            .from('audios')
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) throw error;
        
        currentAudioId = data.id;
        document.getElementById('audio-title').value = data.titre;
        document.getElementById('audio-description').value = data.description || '';
        document.getElementById('audio-type').value = data.type || 'podcast';
        document.getElementById('audio-source').value = data.source || '';
        document.getElementById('audio-category').value = data.category || '';
        document.getElementById('audio-published').checked = data.is_published;
        
        if (data.image_url) {
            document.getElementById('image-url').value = data.image_url;
            const previewImg = document.getElementById('preview-img');
            if (previewImg) previewImg.src = data.image_url;
            const imagePreview = document.getElementById('image-preview');
            if (imagePreview) imagePreview.style.display = 'block';
        }
        
        if (data.audio_url) {
            document.getElementById('audio-url').value = data.audio_url;
            const audioInfo = document.getElementById('audio-info');
            if (audioInfo) {
                audioInfo.innerHTML = `✅ Audio chargé`;
                audioInfo.style.display = 'block';
            }
        }
        
        if (data.duree) {
            const durationInput = document.getElementById('audio-duration-data');
            if (durationInput) durationInput.value = data.duree;
        }
        
        const saveBtn = document.getElementById('save-btn');
        if (saveBtn) saveBtn.textContent = 'Mettre à jour';
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
    } catch (error) {
        console.error("Edit error:", error);
        showStatus('Erreur: ' + error.message, 'error');
    }
}

async function deleteAudio(id) {
    if (!confirm('Supprimer cet audio ?')) return;
    
    try {
        const { error } = await supabaseClient
            .from('audios')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        showStatus('Audio supprimé', 'success');
        loadAudiosList();
        if (currentAudioId === id) resetForm();
        
    } catch (error) {
        console.error("Delete error:", error);
        showStatus('Erreur: ' + error.message, 'error');
    }
}

function resetForm() {
    currentAudioId = null;
    const form = document.getElementById('audio-form');
    if (form) form.reset();
    
    document.getElementById('image-url').value = '';
    document.getElementById('audio-url').value = '';
    document.getElementById('audio-duration-data').value = '0';
    
    const imagePreview = document.getElementById('image-preview');
    if (imagePreview) imagePreview.style.display = 'none';
    
    const audioInfo = document.getElementById('audio-info');
    if (audioInfo) audioInfo.style.display = 'none';
    
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) saveBtn.textContent = 'Sauvegarder';
}

function showStatus(message, type) {
    const statusDiv = document.getElementById('status-message');
    if (!statusDiv) return;
    
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
    setTimeout(() => {
        statusDiv.className = 'status';
    }, 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function checkAdminAuth() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) {
            window.location.href = 'index.html';
        }
    } catch (error) {
        console.error("Auth error:", error);
        window.location.href = 'index.html';
    }
}

function logout() {
    supabaseClient.auth.signOut();
    window.location.href = 'index.html';
}