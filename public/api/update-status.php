<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=300, stale-while-revalidate=900');
header('Access-Control-Allow-Origin: *');

const POSOKANEI_API = 'https://api.posokanei.gov.gr';
const CACHE_TTL_SECONDS = 1800;
const MIN_REFRESH_SECONDS = 300;

$cacheFile = __DIR__ . '/update-status-cache.json';
$forceRefresh = ($_GET['refresh'] ?? '') === '1';
$previous = read_cache($cacheFile);
$cacheAge = isset($previous['checked_at']) ? time() - strtotime((string) $previous['checked_at']) : null;

if (
    !$forceRefresh
    && is_array($previous)
    && $cacheAge !== null
    && $cacheAge >= 0
    && $cacheAge < CACHE_TTL_SECONDS
) {
    echo json_encode($previous, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    return;
}

if (
    $forceRefresh
    && is_array($previous)
    && $cacheAge !== null
    && $cacheAge >= 0
    && $cacheAge < MIN_REFRESH_SECONDS
) {
    echo json_encode($previous, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    return;
}

try {
    $status = build_update_status(is_array($previous) ? $previous : null);
    @file_put_contents($cacheFile, json_encode($status, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n", LOCK_EX);
    echo json_encode($status, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    $snapshot = read_snapshot(__DIR__ . '/../data/catalog.json');
    if (is_array($snapshot)) {
        http_response_code(200);
        echo json_encode(snapshot_status($snapshot, $error->getMessage()), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        return;
    }

    http_response_code(is_array($previous) ? 200 : 502);
    echo json_encode([
        'status' => 'stale',
        'error' => 'update_check_failed',
        'detail' => $error->getMessage(),
        'checked_at' => $previous['checked_at'] ?? gmdate('c'),
        'changed_since_last_check' => false,
        'stats' => $previous['stats'] ?? null,
        'sampled_products' => $previous['sampled_products'] ?? 0,
        'fingerprint' => $previous['fingerprint'] ?? '',
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function read_cache(string $cacheFile): ?array
{
    if (!is_file($cacheFile)) return null;
    $raw = file_get_contents($cacheFile);
    if ($raw === false) return null;
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : null;
}

function read_snapshot(string $snapshotFile): ?array
{
    if (!is_file($snapshotFile)) return null;
    $raw = file_get_contents($snapshotFile);
    if ($raw === false) return null;
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : null;
}

function snapshot_status(array $snapshot, string $detail): array
{
    $stats = is_array($snapshot['stats'] ?? null) ? $snapshot['stats'] : [];
    $products = is_array($snapshot['products'] ?? null) ? $snapshot['products'] : [];
    $retailers = is_array($snapshot['retailers'] ?? null) ? $snapshot['retailers'] : [];
    $generatedAt = (string) ($snapshot['generated_at'] ?? gmdate('c'));

    return [
        'status' => 'snapshot',
        'error' => 'live_proxy_blocked',
        'detail' => $detail,
        'checked_at' => $generatedAt,
        'changed_since_last_check' => false,
        'stats' => [
            'total_products' => count($products) ?: (int) ($stats['total_products'] ?? 0),
            'active_products' => count($products) ?: (int) ($stats['active_products'] ?? $stats['total_products'] ?? 0),
            'retailer_count' => count($retailers) ?: (int) ($stats['retailer_count'] ?? 0),
            'products_on_discount' => (int) ($stats['products_on_discount'] ?? 0),
        ],
        'sampled_products' => 0,
        'fingerprint' => hash('sha256', $generatedAt . ':' . count($products)),
        'snapshot_generated_at' => $generatedAt,
        'next_suggested_check_after' => gmdate('c', strtotime($generatedAt) + CACHE_TTL_SECONDS),
    ];
}

function build_update_status(?array $previous): array
{
    $stats = upstream_json('GET', '/meta/stats');
    $samples = [];
    foreach (['γάλα', 'καφές', 'γιαούρτι', 'ψωμί'] as $term) {
        $raw = upstream_json('POST', '/products/search', [], [
            'title' => $term,
            'countries' => ['GR'],
            'page' => 1,
            'page_size' => 5,
            'sort_by' => 'name',
            'sort_order' => 'asc',
        ]);
        $samples[$term] = normalize_sample_products(first_array($raw));
    }

    $fingerprintPayload = [
        'active_products' => $stats['active_products'] ?? $stats['total_products'] ?? null,
        'retailer_count' => $stats['retailer_count'] ?? null,
        'products_on_discount' => $stats['products_on_discount'] ?? null,
        'samples' => $samples,
    ];
    $fingerprint = hash('sha256', json_encode($fingerprintPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

    return [
        'status' => 'ok',
        'checked_at' => gmdate('c'),
        'previous_checked_at' => $previous['checked_at'] ?? null,
        'changed_since_last_check' => is_array($previous)
            && isset($previous['fingerprint'])
            && $previous['fingerprint'] !== $fingerprint,
        'stats' => [
            'total_products' => (int) ($stats['total_products'] ?? 0),
            'active_products' => (int) ($stats['active_products'] ?? $stats['total_products'] ?? 0),
            'retailer_count' => (int) ($stats['retailer_count'] ?? 0),
            'products_on_discount' => (int) ($stats['products_on_discount'] ?? 0),
        ],
        'sampled_products' => array_sum(array_map('count', $samples)),
        'fingerprint' => $fingerprint,
        'sample_terms' => array_keys($samples),
        'next_suggested_check_after' => gmdate('c', time() + CACHE_TTL_SECONDS),
    ];
}

function upstream_json(string $method, string $path, array $query = [], ?array $body = null): array
{
    $url = POSOKANEI_API . $path;
    if ($query) $url .= '?' . http_build_query($query);

    $headers = [
        'Accept: application/json',
        'Accept-Language: el-GR,el;q=0.9,en;q=0.8',
        'Origin: https://posokanei.gov.gr',
        'Referer: https://posokanei.gov.gr/',
        'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 agenticspiros-posokanei-update-check/1.0',
    ];
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_ENCODING => '',
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
        curl_setopt($ch, CURLOPT_HTTPHEADER, array_merge($headers, ['Content-Type: application/json']));
    }

    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($response === false || $status < 200 || $status >= 300) {
        throw new RuntimeException($error ?: "Upstream returned HTTP {$status}");
    }

    $decoded = json_decode($response, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('Upstream returned invalid JSON.');
    }
    return $decoded;
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

function normalize_sample_products(array $products): array
{
    return array_map(static function ($product): array {
        $prices = [];
        foreach (first_array([
            'products' => $product['retailer_prices']
                ?? $product['prices']
                ?? $product['retailers']
                ?? $product['offers']
                ?? $product['daily_prices']
                ?? [],
        ]) as $priceRow) {
            if (!is_array($priceRow)) continue;
            $retailer = $priceRow['retailer_id']
                ?? $priceRow['retailer']
                ?? $priceRow['chain_id']
                ?? $priceRow['name']
                ?? null;
            $price = $priceRow['price'] ?? $priceRow['final_price'] ?? $priceRow['value'] ?? null;
            if ($retailer !== null && is_numeric($price)) {
                $prices[(string) $retailer] = round((float) $price, 4);
            }
        }
        ksort($prices);
        return [
            'id' => (string) ($product['id'] ?? $product['gtin'] ?? $product['barcode'] ?? ''),
            'name' => (string) ($product['name'] ?? $product['title'] ?? ''),
            'updated_at' => (string) ($product['updated_at'] ?? ''),
            'prices' => $prices,
        ];
    }, $products);
}
