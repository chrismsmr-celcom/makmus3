<?php
session_start();
header('Content-Type: application/json');
require_once '../config/db.php';

$user_id = $_SESSION['user_id'] ?? null;

if (!$user_id) {
    echo json_encode(['success' => false, 'message' => 'Non connecté']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

// GET - Récupérer les favoris
if ($method === 'GET') {
    $article_id = $_GET['article_id'] ?? null;
    
    if ($article_id) {
        // Vérifier si l'article est en favori
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM user_favorites WHERE user_id = ? AND article_id = ?");
        $stmt->execute([$user_id, $article_id]);
        $isFavorite = $stmt->fetchColumn() > 0;
        echo json_encode(['success' => true, 'isFavorite' => $isFavorite]);
    } else {
        // Récupérer tous les favoris avec les détails des articles
        $stmt = $pdo->prepare("
            SELECT a.* FROM user_favorites uf 
            JOIN articles a ON uf.article_id = a.id 
            WHERE uf.user_id = ? 
            ORDER BY uf.created_at DESC
        ");
        $stmt->execute([$user_id]);
        $favorites = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'favorites' => $favorites]);
    }
    exit;
}

// POST - Ajouter/retirer des favoris
if ($method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $article_id = $data['article_id'] ?? null;
    $action = $data['action'] ?? 'toggle';
    
    if (!$article_id) {
        echo json_encode(['success' => false, 'message' => 'Article ID requis']);
        exit;
    }
    
    if ($action === 'add') {
        try {
            $stmt = $pdo->prepare("INSERT INTO user_favorites (user_id, article_id) VALUES (?, ?)");
            $stmt->execute([$user_id, $article_id]);
            echo json_encode(['success' => true, 'isFavorite' => true]);
        } catch (PDOException $e) {
            echo json_encode(['success' => false, 'message' => 'Déjà en favori']);
        }
    } 
    elseif ($action === 'remove') {
        $stmt = $pdo->prepare("DELETE FROM user_favorites WHERE user_id = ? AND article_id = ?");
        $stmt->execute([$user_id, $article_id]);
        echo json_encode(['success' => true, 'isFavorite' => false]);
    }
    else {
        // Toggle
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM user_favorites WHERE user_id = ? AND article_id = ?");
        $stmt->execute([$user_id, $article_id]);
        $exists = $stmt->fetchColumn() > 0;
        
        if ($exists) {
            $pdo->prepare("DELETE FROM user_favorites WHERE user_id = ? AND article_id = ?")->execute([$user_id, $article_id]);
            echo json_encode(['success' => true, 'isFavorite' => false]);
        } else {
            $pdo->prepare("INSERT INTO user_favorites (user_id, article_id) VALUES (?, ?)")->execute([$user_id, $article_id]);
            echo json_encode(['success' => true, 'isFavorite' => true]);
        }
    }
    exit;
}
?>