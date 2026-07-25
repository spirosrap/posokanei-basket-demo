<?php
declare(strict_types=1);

if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'HEAD'], true)) {
    header('Allow: GET, HEAD');
    http_response_code(405);
    return;
}

$jsonPath = __DIR__ . '/../data/price-changes.json';
$gzipPath = $jsonPath . '.gz';
$acceptEncoding = strtolower((string) ($_SERVER['HTTP_ACCEPT_ENCODING'] ?? ''));
$useGzip = strpos($acceptEncoding, 'gzip') !== false && is_file($gzipPath);
$filePath = $useGzip ? $gzipPath : $jsonPath;

if (!is_file($filePath)) {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    http_response_code(503);
    echo json_encode(['error' => 'price_changes_unavailable'], JSON_UNESCAPED_SLASHES);
    return;
}

$modifiedAt = (int) filemtime($filePath);
$size = (int) filesize($filePath);
$etag = '"' . sha1($modifiedAt . ':' . $size . ':' . ($useGzip ? 'gzip' : 'identity')) . '"';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=300, stale-while-revalidate=300');
header('Vary: Accept-Encoding');
header('ETag: ' . $etag);
header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $modifiedAt) . ' GMT');
header('X-Content-Type-Options: nosniff');
header('Access-Control-Allow-Origin: *');
if ($useGzip) {
    header('Content-Encoding: gzip');
}

if (trim((string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) {
    http_response_code(304);
    return;
}

header('Content-Length: ' . $size);
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'HEAD') {
    return;
}

readfile($filePath);
