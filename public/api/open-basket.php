<?php
declare(strict_types=1);

const CACHE_PREFIX = "<?php exit; ?>\n";

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow');

$code = (string) ($_GET['code'] ?? '');
if (preg_match('/^[a-zA-Z0-9_-]{10,32}$/', $code) !== 1) not_found();

$cacheFile = __DIR__ . '/short-link-cache.php';
$raw = is_file($cacheFile) ? file_get_contents($cacheFile) : false;
if (!is_string($raw) || !str_starts_with($raw, CACHE_PREFIX)) not_found();
$cache = json_decode(substr($raw, strlen(CACHE_PREFIX)), true);
$entry = is_array($cache) ? ($cache[$code] ?? null) : null;
$url = is_array($entry) ? (string) ($entry['url'] ?? '') : '';
if (!valid_basket_url($url)) not_found();

http_response_code(302);
header('Location: ' . $url);
exit;

function valid_basket_url(string $value): bool
{
    $url = parse_url($value);
    if (!is_array($url)) return false;
    if (($url['scheme'] ?? '') !== 'https') return false;
    if (strtolower((string) ($url['host'] ?? '')) !== 'kalathitimon.com') return false;
    if (($url['path'] ?? '') !== '/' || isset($url['fragment'])) return false;
    $query = [];
    parse_str((string) ($url['query'] ?? ''), $query);
    $token = $query['basket'] ?? null;
    return count($query) === 1
        && is_string($token)
        && $token !== ''
        && strlen($token) <= 8192
        && preg_match('/^[a-zA-Z0-9_-]+$/', $token) === 1;
}

function not_found(): never
{
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Basket link not found.';
    exit;
}
