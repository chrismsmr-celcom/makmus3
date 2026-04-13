/* ==========================================================================
   DASHBOARD MAKMUS
   ========================================================================== */

// Vérifier l'authentification
checkAdminAuth();

// Charger les statistiques
async function loadStats() {
    try {
        var { count: total } = await supabaseClient
            .from('articles')
            .select('*', { count: 'exact', head: true });
        
        var { count: published } = await supabaseClient
            .from('articles')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'published');
        
        var { count: drafts } = await supabaseClient
            .from('articles')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'draft');
        
        var { data: viewsData } = await supabaseClient
            .from('articles')
            .select('views');
        
        var totalViews = 0;
        if (viewsData) {
            for (var i = 0; i < viewsData.length; i++) {
                totalViews += viewsData[i].views || 0;
            }
        }
        
        document.getElementById('total-articles').textContent = total || 0;
        document.getElementById('published-articles').textContent = published || 0;
        document.getElementById('draft-articles').textContent = drafts || 0;
        document.getElementById('total-views').textContent = totalViews.toLocaleString();
        
    } catch (error) {
        console.error('Erreur stats:', error);
    }
}

// Charger les articles
async function loadArticles() {
    var tbody = document.getElementById('articles-list');
    
    try {
        var { data, error } = await supabaseClient
            .from('articles')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);
        
        if (error) throw error;
        
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">Aucun article</td></tr>';
            return;
        }
        
        var html = '';
        for (var i = 0; i < data.length; i++) {
            var article = data[i];
            html += '<tr>';
            html += '<td><a href="editor.html?id=' + article.id + '">' + (article.titre || 'Sans titre') + '</a></td>';
            html += '<td>' + (article.category || '-') + '</td>';
            html += '<td><span class="status-badge ' + (article.status === 'published' ? 'status-published' : 'status-draft') + '">' + (article.status === 'published' ? 'Publié' : 'Brouillon') + '</span></td>';
            html += '<td>' + (article.views || 0) + '</td>';
            html += '<td>' + new Date(article.created_at).toLocaleDateString('fr-FR') + '</td>';
            html += '<td><a href="editor.html?id=' + article.id + '" class="action-link">Modifier</a></td>';
            html += '</tr>';
        }
        tbody.innerHTML = html;
        
    } catch (error) {
        console.error('Erreur chargement:', error);
        tbody.innerHTML = '<tr><td colspan="6">Erreur de chargement</td></tr>';
    }
}

// Supprimer un article
window.deleteArticle = async function(id) {
    if (!confirm('Supprimer définitivement cet article ?')) return;
    
    var { error } = await supabaseClient
        .from('articles')
        .delete()
        .eq('id', id);
    
    if (error) {
        showToast('Erreur lors de la suppression', 'error');
    } else {
        showToast('Article supprimé avec succès', 'success');
        loadStats();
        loadArticles();
    }
};
// Initialisation
loadStats();
loadArticles();

// Déconnexion
document.getElementById('logout-btn').addEventListener('click', logout);