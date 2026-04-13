/* ==========================================================================
   AUTHENTIFICATION ADMIN - VERSION SIMPLIFIÉE
   ========================================================================== */

var SUPABASE_URL = 'https://logphtrdkpbfgtejtime.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvZ3BodHJka3BiZmd0ZWp0aW1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNzY4MDYsImV4cCI6MjA4NTc1MjgwNn0.Uoxiax-whIdbB5oI3bof-hN0m5O9PDi96zmaUZ6BBio';

var supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
var currentUser = null;

// Version simplifiée - accepte tous les utilisateurs connectés
async function checkAdminAuth() {
    try {
        var { data: { user }, error } = await supabaseClient.auth.getUser();
        
        if (error || !user) {
            window.location.href = 'login.html';
            return false;
        }
        
        currentUser = user;
        return true;
        
    } catch (error) {
        console.error('Auth error:', error);
        window.location.href = 'login.html';
        return false;
    }
}

async function logout() {
    if (confirm('Voulez-vous vous deconnecter ?')) {
        await supabaseClient.auth.signOut();
        window.location.href = 'login.html';
    }
}