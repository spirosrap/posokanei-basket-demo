<?php
declare(strict_types=1);

const POSOKANEI_API = 'https://api.posokanei.gov.gr';

$resource = $_GET['resource'] ?? 'stats';

if ($resource === 'image' || $resource === 'retailer-image') {
    forward_image($resource === 'retailer-image' ? 'retailer' : 'product');
    return;
}

if ($resource === 'image-missing-reports') {
    emit_missing_image_reports();
    return;
}

if (extension_loaded('zlib') && !ini_get('zlib.output_compression')) {
    ob_start('ob_gzhandler');
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=60, stale-while-revalidate=300');
header('Access-Control-Allow-Origin: *');

$snapshotFirstResources = [
    'bootstrap',
    'stats',
    'retailers',
    'categories',
    'category-tree',
    'products',
    'products-by-ids',
    'search',
    'barcode',
    'product',
];

if (in_array($resource, $snapshotFirstResources, true) && emit_snapshot_json($resource, $_GET)) {
    return;
}

if ($resource === 'bootstrap' || $resource === 'products-by-ids') {
    http_response_code(503);
    echo json_encode(['error' => 'snapshot_unavailable'], JSON_UNESCAPED_UNICODE);
    return;
}

$method = 'GET';
$path = '';
$query = [];
$body = null;

function clean_string(?string $value, int $maxLength = 160): string
{
    $value = trim((string) $value);
    if (function_exists('mb_substr')) {
        return mb_substr($value, 0, $maxLength, 'UTF-8');
    }
    return substr($value, 0, $maxLength);
}

function clean_int(?string $value, int $default, int $min, int $max): int
{
    $int = filter_var($value, FILTER_VALIDATE_INT);
    if ($int === false) {
        return $default;
    }
    return max($min, min($max, $int));
}

function clean_sort(string $value, array $allowed, string $default): string
{
    return in_array($value, $allowed, true) ? $value : $default;
}

function forward_json(
    string $method,
    string $path,
    array $query = [],
    ?array $body = null,
    string $resource = 'stats'
): void
{
    $url = POSOKANEI_API . $path;
    if ($query) {
        $url .= '?' . http_build_query($query);
    }

    $headers = [
        'Accept: application/json',
        'Accept-Language: el-GR,el;q=0.9,en;q=0.8',
        'Origin: https://posokanei.gov.gr',
        'Referer: https://posokanei.gov.gr/',
        'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 agenticspiros-posokanei-basket-demo/1.0',
    ];

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_ENCODING => '',
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 18,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
    ]);

    if ($body !== null) {
        $payload = json_encode($body, JSON_UNESCAPED_UNICODE);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        curl_setopt($ch, CURLOPT_HTTPHEADER, array_merge($headers, ['Content-Type: application/json']));
    }

    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($response === false || $status < 200 || $status >= 300) {
        if (emit_snapshot_json($resource, $_GET)) {
            return;
        }

        http_response_code(502);
        echo json_encode([
            'error' => 'upstream_unavailable',
            'detail' => $error ?: "PosoKanei API returned HTTP {$status}.",
        ], JSON_UNESCAPED_UNICODE);
        return;
    }

    http_response_code($status);
    echo $response;
}

function forward_image(string $kind = 'product'): void
{
    $kind = in_array($kind, ['product', 'retailer'], true) ? $kind : 'product';
    $id = clean_string($_GET['id'] ?? '', 160);
    $version = clean_string($_GET['v'] ?? '', 80);
    $defaultSize = $kind === 'retailer' ? 240 : 160;
    $maximumSize = $kind === 'retailer' ? 480 : 960;
    $size = clean_int($_GET['size'] ?? null, $defaultSize, 48, $maximumSize);

    if ($id === '' || !preg_match('/^[a-zA-Z0-9_-]+$/', $id)) {
        http_response_code(400);
        header('Content-Type: image/svg+xml; charset=utf-8');
        echo placeholder_svg('??');
        return;
    }

    $version = preg_replace('/[^a-zA-Z0-9._-]/', '', $version);
    $localFallback = find_local_image_fallback($id, $version);
    if (
        $localFallback !== null
        && emit_local_image_fallback($localFallback, $kind, $version !== '', $size)
    ) {
        return;
    }

    $sourceUrl = POSOKANEI_API . '/images/' . $kind . '/' . rawurlencode($id);
    if ($version !== '') {
        $sourceUrl .= '?v=' . rawurlencode($version);
    }

    $cacheSource = 'api.posokanei.gov.gr/images/' . $kind . '/' . rawurlencode($id);
    if ($version !== '') {
        $cacheSource .= '?v=' . rawurlencode($version);
    }
    $cacheUrl = 'https://images.weserv.nl/?' . http_build_query([
        'url' => $cacheSource,
        'w' => $size,
        'h' => $kind === 'retailer' ? (int) round($size / 2) : $size,
        'fit' => 'contain',
        'output' => 'webp',
        'q' => 82,
    ]);
    $cached = fetch_image($cacheUrl, [
        'Accept: image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15 agenticspiros-posokanei-basket-demo/1.0',
    ]);

    if (is_valid_image_response($cached)) {
        emit_image($cached, 'image-cache', $kind, $version !== '', $size);
        return;
    }

    $direct = fetch_image($sourceUrl, [
        'Accept: image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language: el-GR,el;q=0.9,en;q=0.8',
        'Origin: https://posokanei.gov.gr',
        'Referer: https://posokanei.gov.gr/',
        'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15 agenticspiros-posokanei-basket-demo/1.0',
    ]);

    if (is_valid_image_response($direct)) {
        emit_image($direct, 'posokanei', $kind, $version !== '', $size);
        return;
    }

    if ($kind === 'product') {
        record_missing_image_report($id, $version);
    }

    http_response_code(502);
    header('Content-Type: image/svg+xml; charset=utf-8');
    header('Cache-Control: no-store, max-age=0');
    header('X-Posokanei-Image-Source: unavailable');
    header('X-Posokanei-Image-Kind: ' . $kind);
    echo placeholder_svg(strtoupper(substr($id, 0, 2)));
}

function image_missing_reports_path(): string
{
    return dirname(__DIR__) . '/data/image-missing-reports.json';
}

function read_missing_image_reports(): array
{
    $path = image_missing_reports_path();
    if (!is_file($path)) return [];

    $handle = fopen($path, 'rb');
    if ($handle === false) return [];
    try {
        if (!flock($handle, LOCK_SH)) return [];
        $body = stream_get_contents($handle);
        flock($handle, LOCK_UN);
    } finally {
        fclose($handle);
    }

    $decoded = is_string($body) ? json_decode($body, true) : null;
    $reports = is_array($decoded) ? ($decoded['reports'] ?? []) : [];
    return is_array($reports) ? $reports : [];
}

function record_missing_image_report(string $id, string $version): void
{
    if (!preg_match('/^[a-zA-Z0-9_-]+$/', $id)) return;
    $version = preg_replace('/[^a-zA-Z0-9._-]/', '', $version);
    $path = image_missing_reports_path();
    $directory = dirname($path);
    if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) return;

    $handle = fopen($path, 'c+');
    if ($handle === false) return;
    try {
        if (!flock($handle, LOCK_EX)) return;
        rewind($handle);
        $body = stream_get_contents($handle);
        $decoded = is_string($body) && $body !== '' ? json_decode($body, true) : null;
        $existing = is_array($decoded) ? ($decoded['reports'] ?? []) : [];
        $minimumTimestamp = time() - 86400;
        $reportsById = [];
        if (is_array($existing)) {
            foreach ($existing as $report) {
                if (!is_array($report)) continue;
                $rawReportId = $report['id'] ?? '';
                $rawReportVersion = $report['version'] ?? '';
                $reportId = is_scalar($rawReportId)
                    ? clean_string((string) $rawReportId, 160)
                    : '';
                $rawReportedAt = $report['reported_at'] ?? 0;
                $reportedAt = is_scalar($rawReportedAt) ? (int) $rawReportedAt : 0;
                if (!preg_match('/^[a-zA-Z0-9_-]+$/', $reportId) || $reportedAt < $minimumTimestamp) {
                    continue;
                }
                $reportsById[$reportId] = [
                    'id' => $reportId,
                    'version' => preg_replace(
                        '/[^a-zA-Z0-9._-]/',
                        '',
                        is_scalar($rawReportVersion)
                            ? clean_string((string) $rawReportVersion, 80)
                            : ''
                    ),
                    'reported_at' => $reportedAt,
                ];
            }
        }
        $reportsById[$id] = [
            'id' => $id,
            'version' => $version,
            'reported_at' => time(),
        ];
        uasort($reportsById, static fn(array $left, array $right): int =>
            $right['reported_at'] <=> $left['reported_at']
        );
        $reports = array_slice(array_values($reportsById), 0, 2000);
        $payload = json_encode([
            'generated_at' => gmdate(DATE_ATOM),
            'reports' => $reports,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (!is_string($payload)) return;
        rewind($handle);
        ftruncate($handle, 0);
        fwrite($handle, $payload . "\n");
        fflush($handle);
        flock($handle, LOCK_UN);
    } finally {
        fclose($handle);
    }
}

function emit_missing_image_reports(): void
{
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, max-age=0');
    header('Access-Control-Allow-Origin: *');
    echo json_encode([
        'generated_at' => gmdate(DATE_ATOM),
        'reports' => read_missing_image_reports(),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function find_local_image_fallback(string $id, string $version): ?string
{
    $directory = dirname(__DIR__) . '/data/image-fallbacks';
    if (!is_dir($directory)) return null;
    $suffix = $version !== '' ? '-' . $version : '';
    $base = $directory . '/' . $id . $suffix;
    foreach (['jpg', 'png', 'webp', 'gif', 'avif'] as $extension) {
        $candidate = $base . '.' . $extension;
        if (is_file($candidate) && filesize($candidate) > 100) return $candidate;
    }
    return null;
}

function emit_local_image_fallback(
    string $path,
    string $kind,
    bool $immutable,
    int $size
): bool {
    $fileSize = (int) filesize($path);
    if ($fileSize > 300000) {
        $cached = fetch_local_image_derivative($path, $kind, $size);
        if (is_valid_image_response($cached)) {
            emit_image($cached, 'local-image-cache', $kind, $immutable, $size);
            return true;
        }
    }

    $extension = strtolower((string) pathinfo($path, PATHINFO_EXTENSION));
    $contentTypes = [
        'jpg' => 'image/jpeg',
        'png' => 'image/png',
        'webp' => 'image/webp',
        'gif' => 'image/gif',
        'avif' => 'image/avif',
    ];
    $contentType = $contentTypes[$extension] ?? '';
    $body = $contentType !== '' ? file_get_contents($path) : false;
    if ($body === false || strlen($body) <= 100) return false;

    http_response_code(200);
    header('Content-Type: ' . $contentType);
    header(
        $immutable
            ? 'Cache-Control: public, max-age=31536000, immutable'
            : 'Cache-Control: public, max-age=604800, stale-while-revalidate=2592000'
    );
    header('Access-Control-Allow-Origin: *');
    header('X-Posokanei-Image-Source: local-fallback');
    header('X-Posokanei-Image-Kind: ' . $kind);
    header('X-Posokanei-Image-Size: ' . $size);
    header('Content-Length: ' . strlen($body));
    echo $body;
    return true;
}

function fetch_local_image_derivative(string $path, string $kind, int $size): array
{
    $host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
    $host = preg_replace('/:\d+$/', '', $host);
    if (!in_array($host, ['kalathitimon.com', 'www.kalathitimon.com', 'agenticspiros.com'], true)) {
        return ['status' => 0, 'body' => '', 'content_type' => ''];
    }

    $scriptName = (string) ($_SERVER['SCRIPT_NAME'] ?? '/api/posokanei.php');
    $appBase = str_replace('\\', '/', dirname(dirname($scriptName)));
    if ($appBase === '/' || $appBase === '.') $appBase = '';
    $staticUrl = 'https://' . $host . $appBase
        . '/data/image-fallbacks/' . rawurlencode(basename($path));
    $cacheUrl = 'https://images.weserv.nl/?' . http_build_query([
        'url' => $staticUrl,
        'w' => $size,
        'h' => $kind === 'retailer' ? (int) round($size / 2) : $size,
        'fit' => 'contain',
        'output' => 'webp',
        'q' => 82,
    ]);
    return fetch_image($cacheUrl, [
        'Accept: image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
            . 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15 '
            . 'agenticspiros-posokanei-basket-demo/1.0',
    ]);
}

function fetch_image(string $url, array $headers): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_ENCODING => '',
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 18,
        CURLOPT_HTTPHEADER => $headers,
    ]);

    $body = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $contentType = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    $error = curl_error($ch);
    curl_close($ch);

    return [
        'body' => $body,
        'status' => $status,
        'content_type' => $contentType,
        'error' => $error,
    ];
}

function is_valid_image_response(array $response): bool
{
    if (($response['body'] ?? false) === false) return false;
    if (($response['status'] ?? 0) < 200 || ($response['status'] ?? 0) >= 300) return false;
    if (!str_starts_with(strtolower((string) ($response['content_type'] ?? '')), 'image/')) return false;
    return strlen((string) ($response['body'] ?? '')) > 100;
}

function emit_image(
    array $response,
    string $source,
    string $kind = 'product',
    bool $immutable = false,
    int $size = 0
): void
{
    http_response_code(200);
    header('Content-Type: ' . (string) $response['content_type']);
    header(
        $immutable
            ? 'Cache-Control: public, max-age=31536000, immutable'
            : 'Cache-Control: public, max-age=604800, stale-while-revalidate=2592000'
    );
    header('Access-Control-Allow-Origin: *');
    header('X-Posokanei-Image-Source: ' . $source);
    header('X-Posokanei-Image-Kind: ' . $kind);
    if ($size > 0) {
        header('X-Posokanei-Image-Size: ' . $size);
    }
    echo $response['body'];
}

function placeholder_svg(string $label): string
{
    $label = htmlspecialchars(substr($label, 0, 2), ENT_QUOTES, 'UTF-8');
    return '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160" role="img" aria-label="Product image unavailable"><rect width="160" height="160" rx="18" fill="#e0f2fe"/><text x="80" y="89" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#475569">' . $label . '</text></svg>';
}

function emit_snapshot_json(string $resource, array $request): bool
{
    $started = microtime(true);
    try {
        $payload = snapshot_payload($resource, $request);
        if ($payload === null) {
            return false;
        }

        header('X-Posokanei-Source: snapshot');
        header('Server-Timing: snapshot;dur=' . number_format((microtime(true) - $started) * 1000, 1, '.', ''));
        http_response_code(200);
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        return true;
    } catch (Throwable $error) {
        return false;
    }
}

function snapshot_payload(string $resource, array $request): ?array
{
    if ($resource === 'bootstrap') {
        return snapshot_bootstrap_payload($request);
    }

    if (in_array($resource, ['stats', 'retailers', 'categories', 'category-tree'], true)) {
        $meta = read_snapshot_meta();
        if (!is_array($meta)) {
            return null;
        }

        if ($resource === 'stats') {
            $stats = is_array($meta['stats'] ?? null) ? $meta['stats'] : [];
            $retailers = is_array($meta['retailers'] ?? null) ? $meta['retailers'] : [];
            $generatedAt = (string) ($meta['generated_at'] ?? '');
            return array_merge($stats, [
                'total_products' => (int) ($stats['total_products'] ?? $stats['active_products'] ?? 0),
                'active_products' => (int) ($stats['active_products'] ?? $stats['total_products'] ?? 0),
                'retailer_count' => (int) ($stats['retailer_count'] ?? count($retailers)),
                'source' => 'snapshot',
                'snapshotGeneratedAt' => $generatedAt,
                'snapshot_generated_at' => $generatedAt,
            ]);
        }

        if ($resource === 'retailers') {
            $country = clean_string($request['countries'] ?? 'GR', 8);
            $retailers = first_array(['products' => $meta['retailers'] ?? []]);
            if ($country !== '') {
                $retailers = array_values(array_filter($retailers, static function ($retailer) use ($country): bool {
                    return strtoupper((string) ($retailer['country'] ?? '')) === strtoupper($country);
                }));
            }
            return [
                'retailers' => $retailers,
                'source' => 'snapshot',
                'snapshot_generated_at' => (string) ($meta['generated_at'] ?? ''),
            ];
        }

        $categories = first_array(['products' => $meta['categories'] ?? []]);
        return [
            'categories' => $categories,
            'source' => 'snapshot',
            'snapshot_generated_at' => (string) ($meta['generated_at'] ?? ''),
        ];
    }

    if ($resource === 'products-by-ids' && ($_GET['details'] ?? '') === '1') {
        return snapshot_product_details_payload($request);
    }

    if (in_array($resource, ['products', 'products-by-ids', 'search', 'barcode', 'product'], true)) {
        $snapshot = read_snapshot();
        if (!is_array($snapshot)) {
            return null;
        }
        return snapshot_products_payload($snapshot, $resource, $request);
    }

    return null;
}

function read_snapshot_meta(): ?array
{
    $meta = read_json_file(__DIR__ . '/../data/catalog-meta.json');
    if (is_array($meta)) {
        return $meta;
    }

    $snapshot = read_snapshot();
    if (!is_array($snapshot)) {
        return null;
    }

    return reconcile_snapshot_meta([
        'generated_at' => $snapshot['generated_at'] ?? '',
        'source' => $snapshot['source'] ?? POSOKANEI_API,
        'stats' => $snapshot['stats'] ?? [],
        'categories' => $snapshot['categories'] ?? [],
        'retailers' => $snapshot['retailers'] ?? [],
    ], $snapshot);
}

function snapshot_bootstrap_payload(array $request): ?array
{
    $snapshot = read_snapshot();
    if (!is_array($snapshot)) {
        return null;
    }

    $meta = read_snapshot_meta();
    if (!is_array($meta)) {
        $meta = [
            'generated_at' => $snapshot['generated_at'] ?? '',
            'source' => $snapshot['source'] ?? POSOKANEI_API,
            'stats' => $snapshot['stats'] ?? [],
            'categories' => $snapshot['categories'] ?? [],
            'retailers' => $snapshot['retailers'] ?? [],
        ];
    }
    $meta = reconcile_snapshot_meta($meta, $snapshot);

    $productRequest = $request;
    $productRequest['page'] = '1';
    $productRequest['page_size'] = (string) clean_int($request['page_size'] ?? null, 30, 1, 60);
    $productPayload = snapshot_products_payload($snapshot, 'products', $productRequest);

    $basketProducts = [];
    if (clean_string($request['ids'] ?? '', 4000) !== '') {
        $basketPayload = snapshot_products_payload($snapshot, 'products-by-ids', $request);
        $basketProducts = first_array(['products' => $basketPayload['products'] ?? []]);
    }

    $stats = is_array($meta['stats'] ?? null) ? $meta['stats'] : [];
    $retailers = first_array(['products' => $meta['retailers'] ?? []]);
    $retailers = array_values(array_filter($retailers, static function ($retailer): bool {
        return strtoupper((string) ($retailer['country'] ?? 'GR')) === 'GR';
    }));

    $categories = first_array(['products' => $meta['categories'] ?? []]);
    $categories = array_values(array_filter($categories, static function ($category): bool {
        return (int) ($category['product_count'] ?? $category['total_product_count'] ?? 0) > 0;
    }));
    usort($categories, static function ($left, $right): int {
        $countOrder = (int) ($right['product_count'] ?? $right['total_product_count'] ?? 0)
            <=> (int) ($left['product_count'] ?? $left['total_product_count'] ?? 0);
        if ($countOrder !== 0) return $countOrder;
        return strcoll(
            (string) ($left['category_name'] ?? $left['name'] ?? ''),
            (string) ($right['category_name'] ?? $right['name'] ?? '')
        );
    });
    $categoryLimit = clean_int($request['category_limit'] ?? null, 80, 1, 120);
    $generatedAt = (string) ($meta['generated_at'] ?? $snapshot['generated_at'] ?? '');

    return [
        'stats' => array_merge($stats, [
            'total_products' => (int) ($stats['total_products'] ?? count($snapshot['products'] ?? [])),
            'active_products' => (int) ($stats['active_products'] ?? $stats['total_products'] ?? count($snapshot['products'] ?? [])),
            'retailer_count' => (int) ($stats['retailer_count'] ?? count($retailers)),
            'source' => 'snapshot',
            'snapshot_generated_at' => $generatedAt,
        ]),
        'retailers' => $retailers,
        'categories' => array_slice($categories, 0, $categoryLimit),
        'products' => $productPayload,
        'basket_products' => $basketProducts,
        'source' => 'snapshot',
        'snapshot_generated_at' => $generatedAt,
    ];
}

function reconcile_snapshot_meta(array $meta, array $snapshot): array
{
    $products = first_array(['products' => $snapshot['products'] ?? []]);
    $snapshotStats = is_array($snapshot['stats'] ?? null) ? $snapshot['stats'] : [];
    $metaStats = is_array($meta['stats'] ?? null) ? $meta['stats'] : [];
    $snapshotGeneratedAt = (string) ($snapshot['generated_at'] ?? '');
    $metaGeneratedAt = (string) ($meta['generated_at'] ?? '');
    $productCount = count($products);

    if ($snapshotGeneratedAt !== '' && $snapshotGeneratedAt !== $metaGeneratedAt) {
        $meta['generated_at'] = $snapshotGeneratedAt;
    }

    $stats = array_merge($metaStats, $snapshotStats);
    if ($productCount > 0) {
        $stats['total_products'] = $productCount;
        $stats['active_products'] = $productCount;
    }

    $snapshotRetailers = first_array(['products' => $snapshot['retailers'] ?? []]);
    if ($snapshotRetailers !== []) {
        $meta['retailers'] = $snapshotRetailers;
        $stats['retailer_count'] = count($snapshotRetailers);
    }

    if (!isset($meta['categories']) || !is_array($meta['categories'])) {
        $meta['categories'] = $snapshot['categories'] ?? [];
    }

    $meta['stats'] = $stats;
    return $meta;
}

function read_snapshot(): ?array
{
    $runtimePath = __DIR__ . '/../data/catalog-runtime.json';
    if (is_file($runtimePath)) {
        $runtime = read_json_file($runtimePath);
        if (is_array($runtime)) return $runtime;
    }
    return read_json_file(__DIR__ . '/../data/catalog.json');
}

function snapshot_product_details_payload(array $request): ?array
{
    $detailsPath = __DIR__ . '/../data/catalog-details.jsonl';
    if (!is_file($detailsPath)) return null;

    $rawIds = clean_string($request['ids'] ?? '', 8192);
    $ids = array_values(array_unique(array_filter(
        explode(',', $rawIds),
        static fn($id): bool => preg_match('/^[a-zA-Z0-9_-]{1,120}$/', $id) === 1
    )));
    $ids = array_slice($ids, 0, 60);
    $wanted = array_fill_keys($ids, true);
    $productsById = [];
    $handle = fopen($detailsPath, 'rb');
    if ($handle === false) return null;

    while ($wanted !== [] && ($line = fgets($handle)) !== false) {
        $product = json_decode($line, true);
        if (!is_array($product)) continue;
        $id = (string) ($product['id'] ?? '');
        if ($id !== '' && isset($wanted[$id])) {
            $product['source'] = 'snapshot';
            $productsById[$id] = $product;
            unset($wanted[$id]);
        }
    }
    fclose($handle);

    $matches = [];
    foreach ($ids as $id) {
        if (isset($productsById[$id])) $matches[] = $productsById[$id];
    }
    $meta = read_snapshot_meta();

    return [
        'products' => $matches,
        'total' => count($matches),
        'requested' => count($ids),
        'source' => 'snapshot',
        'snapshot_generated_at' => (string) ($meta['generated_at'] ?? ''),
    ];
}

function read_json_file(string $path): ?array
{
    if (!is_file($path)) {
        return null;
    }
    $raw = file_get_contents($path);
    if ($raw === false) {
        return null;
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : null;
}

function snapshot_products_payload(array $snapshot, string $resource, array $request): array
{
    $started = microtime(true);
    $products = first_array(['products' => $snapshot['products'] ?? []]);
    $generatedAt = (string) ($snapshot['generated_at'] ?? '');

    if ($resource === 'products-by-ids') {
        $rawIds = clean_string($request['ids'] ?? '', 8192);
        $ids = array_values(array_unique(array_filter(
            explode(',', $rawIds),
            static fn($id): bool => preg_match('/^[a-zA-Z0-9_-]{1,120}$/', $id) === 1
        )));
        $ids = array_slice($ids, 0, 60);
        $productsById = [];
        $wanted = array_fill_keys($ids, true);

        foreach ($products as $product) {
            if (!is_array($product)) continue;
            $id = (string) ($product['id'] ?? $product['product_id'] ?? $product['gtin'] ?? '');
            if ($id !== '' && isset($wanted[$id])) {
                $product['source'] = 'snapshot';
                $productsById[$id] = $product;
            }
        }

        $matches = [];
        foreach ($ids as $id) {
            if (isset($productsById[$id])) $matches[] = $productsById[$id];
        }

        return [
            'products' => $matches,
            'total' => count($matches),
            'requested' => count($ids),
            'source' => 'snapshot',
            'snapshot_generated_at' => $generatedAt,
        ];
    }

    if ($resource === 'barcode') {
        $barcode = preg_replace('/[^0-9]/', '', (string) ($request['barcode'] ?? ''));
        $match = find_snapshot_product($products, static function ($product) use ($barcode): bool {
            if ($barcode === '') return false;
            if ((string) ($product['gtin'] ?? '') === $barcode) return true;
            if ((string) ($product['barcode'] ?? '') === $barcode) return true;
            $barcodes = first_array(['products' => $product['barcodes'] ?? []]);
            return in_array($barcode, array_map('strval', $barcodes), true);
        });
        return $match ?? [
            'error' => 'not_found',
            'source' => 'snapshot',
            'snapshot_generated_at' => $generatedAt,
        ];
    }

    if ($resource === 'product') {
        $id = clean_string($request['id'] ?? '', 120);
        $match = find_snapshot_product($products, static function ($product) use ($id): bool {
            return $id !== '' && in_array($id, [
                (string) ($product['id'] ?? ''),
                (string) ($product['product_id'] ?? ''),
                (string) ($product['gtin'] ?? ''),
            ], true);
        });
        return $match ?? [
            'error' => 'not_found',
            'source' => 'snapshot',
            'snapshot_generated_at' => $generatedAt,
        ];
    }

    $page = clean_int($request['page'] ?? null, 1, 1, 500);
    $pageSize = clean_int($request['page_size'] ?? null, 30, 1, 60);
    $title = clean_string($request['title'] ?? '', 160);
    $categoryId = clean_string($request['category_id'] ?? $request['category'] ?? '', 120);
    $barcode = preg_match('/^\d{8,14}$/', $title) ? $title : '';

    $filtered = array_values(array_filter($products, static function ($product) use ($title, $categoryId, $barcode): bool {
        if (!snapshot_product_available_in_gr($product)) {
            return false;
        }
        if ($categoryId !== '' && !snapshot_product_matches_category($product, $categoryId)) {
            return false;
        }
        if ($barcode !== '') {
            return (string) ($product['gtin'] ?? $product['barcode'] ?? '') === $barcode;
        }
        if ($title === '') {
            return true;
        }
        return text_contains(snapshot_product_text($product), $title);
    }));

    $sortBy = clean_sort($request['sort_by'] ?? 'name', ['name', 'price_asc', 'unit_price'], 'name');
    $sortOrder = clean_sort($request['sort_order'] ?? 'asc', ['asc', 'desc'], 'asc');
    $direction = $sortOrder === 'desc' ? SORT_DESC : SORT_ASC;
    $names = array_map(static fn($product): string => (string) ($product['name'] ?? ''), $filtered);
    if ($sortBy === 'price_asc' || $sortBy === 'unit_price') {
        $sortValues = array_map(
            $sortBy === 'unit_price' ? 'snapshot_min_unit_price' : 'snapshot_min_price',
            $filtered
        );
        array_multisort($sortValues, $direction, SORT_NUMERIC, $names, SORT_ASC, SORT_LOCALE_STRING, $filtered);
    } else {
        array_multisort($names, $direction, SORT_LOCALE_STRING, $filtered);
    }

    $total = count($filtered);
    $totalPages = max(1, (int) ceil($total / $pageSize));
    $offset = ($page - 1) * $pageSize;

    return [
        'products' => array_slice($filtered, $offset, $pageSize),
        'total' => $total,
        'page' => $page,
        'page_size' => $pageSize,
        'total_pages' => $totalPages,
        'has_next' => $page < $totalPages,
        'query_time_ms' => (int) round((microtime(true) - $started) * 1000),
        'source' => 'snapshot',
        'snapshot_generated_at' => $generatedAt,
    ];
}

function find_snapshot_product(array $products, callable $predicate): ?array
{
    foreach ($products as $product) {
        if (is_array($product) && $predicate($product)) {
            $product['source'] = 'snapshot';
            return $product;
        }
    }
    return null;
}

function snapshot_product_available_in_gr(array $product): bool
{
    $countries = first_array(['products' => $product['available_countries'] ?? []]);
    if ($countries !== []) {
        return in_array('GR', array_map('strtoupper', array_map('strval', $countries)), true);
    }

    $prices = first_array([
        'products' => $product['retailer_prices']
            ?? $product['prices']
            ?? $product['retailers']
            ?? $product['offers']
            ?? $product['daily_prices']
            ?? [],
    ]);
    foreach ($prices as $price) {
        if (!is_array($price)) continue;
        $country = strtoupper((string) ($price['country'] ?? 'GR'));
        if ($country === 'GR') return true;
    }
    return $prices === [];
}

function snapshot_product_matches_category(array $product, string $categoryId): bool
{
    if ((string) ($product['category'] ?? '') === $categoryId) return true;
    if ((string) ($product['subcategory'] ?? '') === $categoryId) return true;
    $categoryIds = first_array(['products' => $product['category_ids'] ?? []]);
    return in_array($categoryId, array_map('strval', $categoryIds), true);
}

function snapshot_product_text(array $product): string
{
    return implode(' ', array_filter([
        $product['name'] ?? '',
        $product['brand'] ?? '',
        $product['category'] ?? '',
        $product['subcategory'] ?? '',
        $product['gtin'] ?? '',
        $product['barcode'] ?? '',
        $product['unit_quantity'] ?? '',
        $product['unit'] ?? '',
    ], static fn($value): bool => $value !== null && $value !== ''));
}

function text_contains(string $haystack, string $needle): bool
{
    $haystack = lower_text($haystack);
    $needle = lower_text($needle);
    if ($needle === '') return true;
    if (function_exists('mb_strpos')) {
        return mb_strpos($haystack, $needle, 0, 'UTF-8') !== false;
    }
    return strpos($haystack, $needle) !== false;
}

function lower_text(string $value): string
{
    if (function_exists('mb_strtolower')) {
        return mb_strtolower($value, 'UTF-8');
    }
    return strtolower($value);
}

function snapshot_min_price(array $product): float
{
    $stored = (float) ($product['min_price'] ?? 0);
    if ($stored > 0 && is_finite($stored)) return $stored;
    $prices = first_array([
        'products' => $product['retailer_prices']
            ?? $product['prices']
            ?? $product['retailers']
            ?? $product['offers']
            ?? $product['daily_prices']
            ?? [],
    ]);
    $min = INF;
    foreach ($prices as $entry) {
        if (!is_array($entry)) continue;
        $price = (float) ($entry['price'] ?? $entry['final_price'] ?? $entry['value'] ?? INF);
        if (is_finite($price) && $price < $min) $min = $price;
    }
    return is_finite($min) ? $min : INF;
}

function snapshot_min_unit_price(array $product): float
{
    $stored = (float) ($product['min_unit_price'] ?? 0);
    if ($stored > 0 && is_finite($stored)) return $stored;
    $prices = first_array([
        'products' => $product['retailer_prices']
            ?? $product['prices']
            ?? $product['retailers']
            ?? $product['offers']
            ?? $product['daily_prices']
            ?? [],
    ]);
    $unitQuantity = (float) ($product['unit_quantity'] ?? 0);
    $min = INF;
    foreach ($prices as $entry) {
        if (!is_array($entry)) continue;
        $normalized = (float) ($entry['price_normalized'] ?? $entry['unit_price'] ?? INF);
        if ((!is_finite($normalized) || $normalized <= 0) && $unitQuantity > 0) {
            $price = (float) ($entry['price'] ?? $entry['final_price'] ?? $entry['value'] ?? INF);
            $normalized = is_finite($price) ? $price / $unitQuantity : INF;
        }
        if (is_finite($normalized) && $normalized > 0 && $normalized < $min) {
            $min = $normalized;
        }
    }
    return is_finite($min) ? $min : INF;
}

function first_array($raw): array
{
    if (is_array($raw) && is_list_array($raw)) return $raw;
    if (!is_array($raw)) return [];
    foreach (['products', 'items', 'results', 'data', 'rows', 'product_results'] as $key) {
        if (isset($raw[$key]) && is_array($raw[$key])) return $raw[$key];
    }
    return [];
}

function is_list_array(array $value): bool
{
    if ($value === []) return true;
    return array_keys($value) === range(0, count($value) - 1);
}

switch ($resource) {
    case 'stats':
        $path = '/meta/stats';
        break;

    case 'retailers':
        $path = '/meta/retailers';
        $query = ['countries' => clean_string($_GET['countries'] ?? 'GR', 8)];
        break;

    case 'categories':
        $path = '/meta/categories';
        break;

    case 'category-tree':
        $path = '/meta/categories/tree';
        $query = [
            'include_counts' => 'true',
            'include_hidden' => 'false',
        ];
        break;

    case 'products':
        $path = '/products';
        $query = [
            'page' => clean_int($_GET['page'] ?? null, 1, 1, 500),
            'page_size' => clean_int($_GET['page_size'] ?? null, 24, 1, 60),
            'sort_by' => clean_sort($_GET['sort_by'] ?? 'name', ['name', 'price_asc', 'unit_price'], 'name'),
            'sort_order' => clean_sort($_GET['sort_order'] ?? 'asc', ['asc', 'desc'], 'asc'),
            'countries' => clean_string($_GET['countries'] ?? 'GR', 8),
        ];
        $category = clean_string($_GET['category'] ?? '', 120);
        if ($category !== '') {
            $query['category'] = $category;
        }
        break;

    case 'search':
        $method = 'POST';
        $path = '/products/search';
        $page = clean_int($_GET['page'] ?? null, 1, 1, 500);
        $pageSize = clean_int($_GET['page_size'] ?? null, 24, 1, 60);
        $body = [
            'page' => $page,
            'page_size' => $pageSize,
            'sort_by' => clean_sort($_GET['sort_by'] ?? 'name', ['name', 'price_asc', 'unit_price'], 'name'),
            'sort_order' => clean_sort($_GET['sort_order'] ?? 'asc', ['asc', 'desc'], 'asc'),
            'countries' => [clean_string($_GET['countries'] ?? 'GR', 8)],
        ];
        $title = clean_string($_GET['title'] ?? '', 160);
        $categoryId = clean_string($_GET['category_id'] ?? '', 120);
        if ($title !== '') {
            $body['title'] = $title;
        }
        if ($categoryId !== '') {
            $body['category_id'] = $categoryId;
        }
        if (!isset($body['title']) && !isset($body['category_id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'missing_search_parameter'], JSON_UNESCAPED_UNICODE);
            return;
        }
        break;

    case 'barcode':
        $barcode = preg_replace('/[^0-9]/', '', (string) ($_GET['barcode'] ?? ''));
        if ($barcode === '' || strlen($barcode) > 32) {
            http_response_code(400);
            echo json_encode(['error' => 'invalid_barcode'], JSON_UNESCAPED_UNICODE);
            return;
        }
        $path = '/products/barcode/' . rawurlencode($barcode);
        $query = [
            'countries' => 'GR',
            'include_tax' => 'true',
        ];
        break;

    case 'product':
        $id = clean_string($_GET['id'] ?? '', 120);
        if ($id === '' || !preg_match('/^[a-zA-Z0-9_-]+$/', $id)) {
            http_response_code(400);
            echo json_encode(['error' => 'invalid_product_id'], JSON_UNESCAPED_UNICODE);
            return;
        }
        $path = '/products/' . rawurlencode($id);
        $query = [
            'sort_retailers' => 'asc',
            'countries' => 'GR',
            'include_tax' => 'true',
        ];
        break;

    default:
        http_response_code(404);
        echo json_encode(['error' => 'unknown_resource'], JSON_UNESCAPED_UNICODE);
        return;
}

forward_json($method, $path, $query, $body, $resource);
