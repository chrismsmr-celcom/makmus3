// netlify/functions/meta-injector.js
exports.handler = async (event, context) => {
    const url = new URL(event.rawUrl);
    const pathname = url.pathname;
    
    // Extraire l'ID ou le slug
    let articleId = url.searchParams.get('id');
    let slug = url.searchParams.get('slug');
    
    if (!articleId && !slug && pathname.startsWith('/article/')) {
        slug = pathname.replace('/article/', '');
    }
    
    if (!articleId && !slug) {
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/html' },
            body: await fetch(event.rawUrl).then(r => r.text())
        };
    }
    
    const SUPABASE_URL = 'https://logphtrdkpbfgtejtime.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvZ3BodHJka3BiZmd0ZWp0aW1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNzY4MDYsImV4cCI6MjA4NTc1MjgwNn0.Uoxiax-whIdbB5oI3bof-hN0m5O9PDi96zmaUZ6BBio';
    
    try {
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
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'text/html' },
                body: await fetch(event.rawUrl).then(r => r.text())
            };
        }
        
        // Récupérer l'image
        let imageUrl = article.image_url;
        if (!imageUrl && article.medias) {
            try {
                const medias = JSON.parse(article.medias);
                const firstImage = medias.find(m => m.type === 'image');
                if (firstImage) imageUrl = firstImage.url;
            } catch(e) {}
        }
        
        if (!imageUrl) {
            imageUrl = 'https://logphtrdkpbfgtejtime.supabase.co/storage/v1/object/public/Photo,%20Image/Untitled%20folder/MAK_MUS__1_-removebg-preview.png';
        }
        
        const cleanDesc = (article.description || '').replace(/<[^>]*>/g, '').substring(0, 300);
        
        // Générer les meta tags
        const metaTags = `
            <title>${article.titre} | MAKMUS</title>
            <meta property="og:title" content="${article.titre} | MAKMUS">
            <meta property="og:description" content="${cleanDesc}">
            <meta property="og:image" content="${imageUrl}">
            <meta property="og:image:width" content="1200">
            <meta property="og:image:height" content="630">
            <meta property="og:url" content="${url.href}">
            <meta property="og:type" content="article">
            <meta name="twitter:card" content="summary_large_image">
            <meta name="twitter:title" content="${article.titre} | MAKMUS">
            <meta name="twitter:description" content="${cleanDesc}">
            <meta name="twitter:image" content="${imageUrl}">
        `;
        
        // Récupérer le HTML original
        const originalHtml = await fetch(event.rawUrl).then(r => r.text());
        
        // Injecter les meta tags
        const modifiedHtml = originalHtml.replace('</head>', `${metaTags}</head>`);
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'text/html',
                'Cache-Control': 'public, max-age=3600'
            },
            body: modifiedHtml
        };
        
    } catch (error) {
        console.error('Function error:', error);
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/html' },
            body: await fetch(event.rawUrl).then(r => r.text())
        };
    }
};