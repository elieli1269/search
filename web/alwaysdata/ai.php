<?php
declare(strict_types=1);

/**
 * Deploy this file outside the public repository when possible. Set GROQ_API_KEY
 * in Alwaysdata's environment variables; never place it in this file.
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: https://nexaccount.alwaysdata.net');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Méthode non autorisée']); exit; }

$key = getenv('GROQ_API_KEY');
if (!$key) { http_response_code(503); echo json_encode(['error' => 'Assistant non configuré']); exit; }

session_start();
$now = time();
$requests = array_values(array_filter($_SESSION['nexa_ai_requests'] ?? [], fn ($at) => $at > $now - 60));
if (count($requests) >= 20) { http_response_code(429); echo json_encode(['error' => 'Trop de demandes, réessayez dans un instant.']); exit; }
$requests[] = $now;
$_SESSION['nexa_ai_requests'] = $requests;

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input) || ($input['action'] ?? '') !== 'chat' || !is_array($input['messages'] ?? null)) {
  http_response_code(400); echo json_encode(['error' => 'Demande invalide']); exit;
}

$payload = json_encode([
  'model' => $input['model'] ?? 'llama-3.3-70b-versatile',
  'messages' => array_slice($input['messages'], -12),
  'temperature' => max(0, min(1, (float) ($input['temperature'] ?? 0.25))),
  'max_tokens' => min(1200, max(1, (int) ($input['maxTokens'] ?? 600)))
]);
$curl = curl_init('https://api.groq.com/openai/v1/chat/completions');
curl_setopt_array($curl, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $key, 'Content-Type: application/json']]);
$body = curl_exec($curl);
$status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
curl_close($curl);
if ($body === false || $status < 200 || $status >= 300) { http_response_code(502); echo json_encode(['error' => 'L’assistant est indisponible.']); exit; }
$response = json_decode($body, true);
echo json_encode(['content' => $response['choices'][0]['message']['content'] ?? '']);
