<?php
session_start();
header('Content-Type: application/json');
require_once '../config/db.php';

$method = $_SERVER['REQUEST_METHOD'];
$user_id = $_SESSION['user_id'] ?? null;

if (!$user_id) {
    echo json_encode(['success' => false, 'message' => 'Non connecté']);
    exit;
}

// GET - Récupérer les likes de l'utilisateur
if ($method === 'GET') {
    $article_id = $_GET['article_id'] ?? null;
    
    if ($article_id) {
        // Vérifier si l'utilisateur a liké cet article
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM user_likes WHERE user_id = ? AND article_id = ?");
        $stmt->execute([$user_id, $article_id]);
        $isLiked = $stmt->fetchColumn() > 0;
        
        // Compter le nombre total de likes
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM user_likes WHERE article_id = ?");
        $stmt->execute([$article_id]);
        $totalLikes = $stmt->fetchColumn();
        
        echo json_encode(['success' => true, 'isLiked' => $isLiked, 'totalLikes' => $totalLikes]);
    } else {
        // Récupérer tous les likes de l'utilisateur
        $stmt = $pdo->prepare("SELECT article_id FROM user_likes WHERE user_id = ?");
        $stmt->execute([$user_id]);
        $likes = $stmt->fetchAll(PDO::FETCH_COLUMN);
        echo json_encode(['success' => true, 'likes' => $likes]);
    }
    exit;
}

// POST - Ajouter ou retirer un like
if ($method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $article_id = $data['article_id'] ?? null;
    $action = $data['action'] ?? 'toggle'; // 'add', 'remove', 'toggle'
    
    if (!$article_id) {
        echo json_encode(['success' => false, 'message' => 'Article ID requis']);
        exit;
    }
    
    if ($action === 'add') {
        // Ajouter un like
        try {
            $stmt = $pdo->prepare("INSERT INTO user_likes (user_id, article_id) VALUES (?, ?)");
            $stmt->execute([$user_id, $article_id]);
            
            // Mettre à jour le compteur dans articles
            $pdo->prepare("UPDATE articles SET likes_count = likes_count + 1 WHERE id = ?")->execute([$article_id]);
            
            echo json_encode(['success' => true, 'action' => 'added']);
        } catch (PDOException $e) {
            echo json_encode(['success' => false, 'message' => 'Déjà liké']);
        }
    } 
    elseif ($action === 'remove') {
        // Retirer un like
        $stmt = $pdo->prepare("DELETE FROM user_likes WHERE user_id = ? AND article_id = ?");
        $stmt->execute([$user_id, $article_id]);
        
        // Mettre à jour le compteur
        $pdo->prepare("UPDATE articles SET likes_count = likes_count - 1 WHERE id = ?")->execute([$article_id]);
        
        echo json_encode(['success' => true, 'action' => 'removed']);
    }
    else {
        // Toggle (ajouter si pas liké, retirer si liké)
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM user_likes WHERE user_id = ? AND article_id = ?");
        $stmt->execute([$user_id, $article_id]);
        $exists = $stmt->fetchColumn() > 0;
        
        if ($exists) {
            $pdo->prepare("DELETE FROM user_likes WHERE user_id = ? AND article_id = ?")->execute([$user_id, $article_id]);
            $pdo->prepare("UPDATE articles SET likes_count = likes_count - 1 WHERE id = ?")->execute([$article_id]);
            echo json_encode(['success' => true, 'action' => 'removed', 'isLiked' => false]);
        } else {
            $pdo->prepare("INSERT INTO user_likes (user_id, article_id) VALUES (?, ?)")->execute([$user_id, $article_id]);
            $pdo->prepare("UPDATE articles SET likes_count = likes_count + 1 WHERE id = ?")->execute([$article_id]);
            echo json_encode(['success' => true, 'action' => 'added', 'isLiked' => true]);
        }
    }
    exit;
}
?>