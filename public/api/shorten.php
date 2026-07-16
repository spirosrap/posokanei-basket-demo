<?php
declare(strict_types=1);

const LIVE_ORIGIN = 'https://agenticspiros.com';
const LIVE_PATH = '/demo/posokanei-basket/';
const CACHE_PREFIX = "<?php exit; ?>\n";
const MAX_SHARE_TOKEN_LENGTH = 8192;
const MAX_CACHE_ENTRIES = 5000;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('X-Content-Type-Options: nosniff');

$requestMethod = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
$isLocalOrigin = is_string($requestOrigin)
    && preg_match('#^http://(?:127\.0\.0\.1|localhost)(?::\d{1,5})?$#', $requestOrigin) === 1;
$isAllowedOrigin = $requestOrigin === '' || $requestOrigin === LIVE_ORIGIN || $isLocalOrigin;
if (!$isAllowedOrigin) emit_error(403, 'origin_not_allowed');
if ($isLocalOrigin) {
    header('Access-Control-Allow-Origin: ' . $requestOrigin);
    header('Access-Control-Allow-Headers: Accept, Content-Type');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Vary: Origin');
}

if ($requestMethod === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($requestMethod !== 'POST') emit_error(405, 'method_not_allowed');

$contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
if (!str_starts_with($contentType, 'application/json')) {
    emit_error(415, 'content_type_not_supported');
}

$contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($contentLength < 1 || $contentLength > 12000) emit_error(413, 'invalid_request_size');

$raw = file_get_contents('php://input');
$payload = is_string($raw) ? json_decode($raw, true) : null;
if (!is_array($payload) || !is_string($payload['url'] ?? null)) {
    emit_error(400, 'invalid_request');
}

$longUrl = canonical_basket_url($payload['url']);
$cacheFile = __DIR__ . '/short-link-cache.php';
$lockFile = __DIR__ . '/short-link-lock.php';
$lock = fopen($lockFile, 'c');
if ($lock === false || !flock($lock, LOCK_EX)) emit_error(503, 'shortener_unavailable');

$cache = read_short_link_cache($cacheFile);
foreach ($cache as $code => $entry) {
    if (
        valid_short_code((string) $code)
        && is_array($entry)
        && hash_equals((string) ($entry['url'] ?? ''), $longUrl)
    ) {
        unlock_cache($lock);
        emit_success(short_url((string) $code), true);
    }
}

$code = create_short_code($longUrl, $cache);
$cache[$code] = ['url' => $longUrl, 'created_at' => time()];
uasort($cache, static fn(array $left, array $right): int =>
    ((int) ($left['created_at'] ?? 0)) <=> ((int) ($right['created_at'] ?? 0))
);
if (count($cache) > MAX_CACHE_ENTRIES) {
    $cache = array_slice($cache, -MAX_CACHE_ENTRIES, null, true);
}
if (!write_short_link_cache($cacheFile, $cache)) {
    unlock_cache($lock);
    emit_error(503, 'shortener_unavailable');
}
unlock_cache($lock);
emit_success(short_url($code), false);

function canonical_basket_url(string $value): string
{
    if (strlen($value) > 10000) emit_error(400, 'invalid_basket_url');
    $url = parse_url($value);
    if (!is_array($url)) emit_error(400, 'invalid_basket_url');
    if (($url['scheme'] ?? '') !== 'https') emit_error(400, 'invalid_basket_url');
    if (strtolower((string) ($url['host'] ?? '')) !== 'agenticspiros.com') {
        emit_error(400, 'invalid_basket_url');
    }
    if (($url['path'] ?? '') !== LIVE_PATH || isset($url['fragment'])) {
        emit_error(400, 'invalid_basket_url');
    }

    $query = [];
    parse_str((string) ($url['query'] ?? ''), $query);
    $token = $query['basket'] ?? null;
    if (
        count($query) !== 1
        || !is_string($token)
        || $token === ''
        || strlen($token) > MAX_SHARE_TOKEN_LENGTH
        || preg_match('/^[a-zA-Z0-9_-]+$/', $token) !== 1
    ) {
        emit_error(400, 'invalid_basket_url');
    }

    return LIVE_ORIGIN . LIVE_PATH . '?basket=' . rawurlencode($token);
}

function create_short_code(string $longUrl, array $cache): string
{
    $digest = rtrim(strtr(base64_encode(hash('sha256', $longUrl, true)), '+/', '-_'), '=');
    for ($length = 10; $length <= 32; $length += 2) {
        $code = substr($digest, 0, $length);
        $entry = $cache[$code] ?? null;
        if (!is_array($entry) || hash_equals((string) ($entry['url'] ?? ''), $longUrl)) {
            return $code;
        }
    }
    emit_error(503, 'short_code_collision');
}

function short_url(string $code): string
{
    return LIVE_ORIGIN . LIVE_PATH . 's/' . $code;
}

function valid_short_code(string $value): bool
{
    return preg_match('/^[a-zA-Z0-9_-]{10,32}$/', $value) === 1;
}

function read_short_link_cache(string $path): array
{
    if (!is_file($path)) return [];
    $raw = file_get_contents($path);
    if (!is_string($raw) || !str_starts_with($raw, CACHE_PREFIX)) return [];
    $decoded = json_decode(substr($raw, strlen(CACHE_PREFIX)), true);
    return is_array($decoded) ? $decoded : [];
}

function write_short_link_cache(string $path, array $cache): bool
{
    $json = json_encode($cache, JSON_UNESCAPED_SLASHES);
    if (!is_string($json)) return false;
    $temporary = $path . '.' . bin2hex(random_bytes(6)) . '.php';
    $written = file_put_contents($temporary, CACHE_PREFIX . $json, LOCK_EX);
    if ($written === false || !rename($temporary, $path)) {
        @unlink($temporary);
        return false;
    }
    return true;
}

function unlock_cache($lock): void
{
    flock($lock, LOCK_UN);
    fclose($lock);
}

function emit_success(string $shortUrl, bool $cached): never
{
    http_response_code(200);
    echo json_encode(['short_url' => $shortUrl, 'provider' => 'self', 'cached' => $cached], JSON_UNESCAPED_SLASHES);
    exit;
}

function emit_error(int $status, string $error): never
{
    http_response_code($status);
    echo json_encode(['error' => $error], JSON_UNESCAPED_SLASHES);
    exit;
}
