/* ==========================================================================
   DASHBOARD MAKMUS - VERSION COMPLÈTE AVEC LIKES ET COMMENTAIRES
   ========================================================================== */

// Vérifier l'authentification
checkAdminAuth();

// Charger les statistiques complètes
async function loadStats() {
    try {
        // 1. Statistiques des articles
        var { count: total } = await supabaseClient
            .from('articles')
            .select('*', { count: 'exact', head: true });
        
        var { count: published } = await supabaseClient
            .from('articles')
            .select('*', { count: 'exact', head: true })
            .eq('is_published', true);
        
        var { count: drafts } = await supabaseClient
            .from('articles')
            .select('*', { count: 'exact', head: true })
            .eq('is_published', false);
        
        // 2. Vues totales
        var { data: viewsData } = await supabaseClient
            .from('articles')
            .select('views');
        
        var totalViews = 0;
        if (viewsData) {
            for (var i = 0; i < viewsData.length; i++) {
                totalViews += viewsData[i].views || 0;
            }
        }
        
        // 3. ✅ LIKES TOTAUX (sur les articles)
        var { count: totalLikes } = await supabaseClient
            .from('user_likes')
            .select('*', { count: 'exact', head: true });
        
        // 4. ✅ COMMENTAIRES TOTAUX
        var { count: totalComments } = await supabaseClient
            .from('article_comments')
            .select('*', { count: 'exact', head: true });
        
        // 5. ✅ LIKES SUR COMMENTAIRES
        var { count: totalCommentLikes } = await supabaseClient
            .from('comment_likes')
            .select('*', { count: 'exact', head: true });
        
        // 6. ✅ FAVORIS TOTAUX
        var { count: totalFavorites } = await supabaseClient
            .from('user_favorites')
            .select('*', { count: 'exact', head: true });
        
        // Mettre à jour l'affichage
        document.getElementById('total-articles').textContent = total || 0;
        document.getElementById('published-articles').textContent = published || 0;
        document.getElementById('draft-articles').textContent = drafts || 0;
        document.getElementById('total-views').textContent = totalViews.toLocaleString();
        document.getElementById('total-likes').textContent = totalLikes?.toLocaleString() || 0;
        document.getElementById('total-comments').textContent = totalComments?.toLocaleString() || 0;
        document.getElementById('total-comment-likes').textContent = totalCommentLikes?.toLocaleString() || 0;
        document.getElementById('total-favorites').textContent = totalFavorites?.toLocaleString() || 0;
        
    } catch (error) {
        console.error('Erreur stats:', error);
    }
}

// Charger les articles avec leurs statistiques
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
            tbody.innerHTML = '<tr><td colspan="8">Aucun article</td></tr>';
            return;
        }
        
        // Pour chaque article, récupérer le nombre de likes et commentaires
        var html = '';
        for (var i = 0; i < data.length; i++) {
            var article = data[i];
            
            // Récupérer les likes pour cet article
            var { count: articleLikes } = await supabaseClient
                .from('user_likes')
                .select('*', { count: 'exact', head: true })
                .eq('article_id', article.id);
            
            // Récupérer les commentaires pour cet article
            var { count: articleComments } = await supabaseClient
                .from('article_comments')
                .select('*', { count: 'exact', head: true })
                .eq('article_id', article.id);
            
            html += '<tr>';
            html += '<td><a href="editor.html?id=' + article.id + '">' + (article.titre || 'Sans titre') + '</a></td>';
            html += '<td>' + (article.category || '-') + '</td>';
            html += '<td><span class="status-badge ' + (article.is_published ? 'status-published' : 'status-draft') + '">' + (article.is_published ? 'Publié' : 'Brouillon') + '</span></td>';
            html += '<td>' + (article.views || 0) + '</td>';
            html += '<td>' + (articleLikes || 0) + '</td>';
            html += '<td>' + (articleComments || 0) + '</td>';
            html += '<td>' + new Date(article.created_at).toLocaleDateString('fr-FR') + '</td>';
            html += '<td><a href="editor.html?id=' + article.id + '" class="action-link">Modifier</a></td>';
            html += '</tr>';
        }
        tbody.innerHTML = html;
        
    } catch (error) {
        console.error('Erreur chargement:', error);
        tbody.innerHTML = '<tr><td colspan="8">Erreur de chargement</td></tr>';
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

// Rafraîchir les données
function refreshDashboard() {
    loadStats();
    loadArticles();
}

// Initialisation
loadStats();
loadArticles();

// Rafraîchir toutes les 30 secondes
setInterval(refreshDashboard, 30000);

// Déconnexion
document.getElementById('logout-btn').addEventListener('click', logout);