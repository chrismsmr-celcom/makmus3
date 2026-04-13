// netlify/edge-functions/meta-injector.js
export default async (request, context) => {
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    // Vérifier si c'est une page article
    let articleId = url.searchParams.get('id');
    let slug = url.searchParams.get('slug');
    
    // Si l'URL est de type /article/mon-slug
    if (!articleId && !slug && pathname.startsWith('/article/')) {
        slug = pathname.replace('/article/', '');
    }
    
    // Si ce n'est pas une page article, on laisse passer
    if (!articleId && !slug) {
        return context.next();
    }
    
    // Configuration Supabase
    const SUPABASE_URL = 'https://logphtrdkpbfgtejtime.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvZ3BodHJka3BiZmd0ZWp0aW1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNzY4MDYsImV4cCI6MjA4NTc1MjgwNn0.Uoxiax-whIdbB5oI3bof-hN0m5O9PDi96zmaUZ6BBio';
    
    try {
        // Récupérer l'article
        let query;
        if (slug) {
            query = `slug=eq.${slug}`;
        } else {
            query = `id=eq.${articleId}`;
        }
        
        const response = await fetch(`${SUPABASE_URL}/rest/v1/articles?${query}&select=*`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        
        const articles = await response.json();
        const article = articles[0];
        
        if (!article) {
            return context.next();
        }
        
        // Récupérer l'URL de l'image
        let imageUrl = article.image_url;
        
        // Si pas d'image, chercher dans la galerie
        if (!imageUrl && article.medias) {
            try {
                const medias = typeof article.medias === 'string' ? JSON.parse(article.medias) : article.medias;
                const firstImage = medias.find(m => m.type === 'image');
                if (firstImage) imageUrl = firstImage.url;
            } catch(e) {}
        }
        
        // Image par défaut (logo MAKMUS)
        if (!imageUrl) {
            imageUrl = 'https://logphtrdkpbfgtejtime.supabase.co/storage/v1/object/public/Photo,%20Image/Untitled%20folder/MAK_MUS__1_-removebg-preview.png';
        }
        
        // Nettoyer la description
        const cleanDesc = (article.description || '')
            .replace(/<[^>]*>/g, '')
            .substring(0, 300);
        
        // Construire l'URL canonique
        const canonicalUrl = article.slug 
            ? `${url.origin}/article/${article.slug}`
            : url.href;
        
        // Générer les meta tags
        const metaTags = `
            <title>${article.titre} | MAKMUS</title>
            <meta name="description" content="${cleanDesc}">
            <meta property="og:title" content="${article.titre} | MAKMUS">
            <meta property="og:description" content="${cleanDesc}">
            <meta property="og:image" content="${imageUrl}">
            <meta property="og:image:width" content="1200">
            <meta property="og:image:height" content="630">
            <meta property="og:url" content="${canonicalUrl}">
            <meta property="og:type" content="article">
            <meta property="og:site_name" content="MAKMUS">
            <meta name="twitter:card" content="summary_large_image">
            <meta name="twitter:title" content="${article.titre} | MAKMUS">
            <meta name="twitter:description" content="${cleanDesc}">
            <meta name="twitter:image" content="${imageUrl}">
            <link rel="canonical" href="${canonicalUrl}">
        `;
        
        // Récupérer le HTML original
        const originalResponse = await context.next();
        let html = await originalResponse.text();
        
        // Supprimer les meta tags existants pour éviter les doublons
        html = html.replace(/<meta property="og:[^>]*>/g, '');
        html = html.replace(/<meta name="twitter:[^>]*>/g, '');
        html = html.replace(/<title>.*<\/title>/, '');
        
        // Injecter les nouveaux meta tags
        html = html.replace('<head>', `<head>${metaTags}`);
        
        return new Response(html, {
            status: 200,
            headers: {
                'Content-Type': 'text/html',
                'Cache-Control': 'public, max-age=3600'
            }
        });
        
    } catch (error) {
        console.error('Edge function error:', error);
        return context.next();
    }
};

// Configuration : cette fonction s'exécute pour toutes les pages
export const config = {
    path: "/*"
};