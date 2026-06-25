<?php
declare(strict_types=1);

const POSOKANEI_API = 'https://api.posokanei.gov.gr';

$resource = $_GET['resource'] ?? 'stats';

if ($resource === 'image') {
    forward_image();
    return;
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=60, stale-while-revalidate=300');
header('Access-Control-Allow-Origin: *');

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

function forward_image(): void
{
    $id = clean_string($_GET['id'] ?? '', 160);
    $version = clean_string($_GET['v'] ?? '', 80);

    if ($id === '' || !preg_match('/^[a-zA-Z0-9_-]+$/', $id)) {
        http_response_code(400);
        header('Content-Type: image/svg+xml; charset=utf-8');
        echo placeholder_svg('??');
        return;
    }

    $version = preg_replace('/[^a-zA-Z0-9._-]/', '', $version);
    $sourceUrl = POSOKANEI_API . '/images/product/' . rawurlencode($id);
    if ($version !== '') {
        $sourceUrl .= '?v=' . rawurlencode($version);
    }

    $direct = fetch_image($sourceUrl, [
        'Accept: image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language: el-GR,el;q=0.9,en;q=0.8',
        'Origin: https://posokanei.gov.gr',
        'Referer: https://posokanei.gov.gr/',
        'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15 agenticspiros-posokanei-basket-demo/1.0',
    ]);

    if (is_valid_image_response($direct)) {
        emit_image($direct, 'posokanei');
        return;
    }

    $cacheSource = 'api.posokanei.gov.gr/images/product/' . rawurlencode($id);
    if ($version !== '') {
        $cacheSource .= '?v=' . rawurlencode($version);
    }
    $cacheUrl = 'https://images.weserv.nl/?' . http_build_query([
        'url' => $cacheSource,
        'w' => 160,
        'h' => 160,
        'fit' => 'contain',
        'output' => 'webp',
    ]);
    $cached = fetch_image($cacheUrl, [
        'Accept: image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15 agenticspiros-posokanei-basket-demo/1.0',
    ]);

    if (is_valid_image_response($cached)) {
        emit_image($cached, 'image-cache');
        return;
    }

    http_response_code(502);
    header('Content-Type: image/svg+xml; charset=utf-8');
    header('Cache-Control: public, max-age=300, stale-while-revalidate=3600');
    header('X-Posokanei-Image-Source: unavailable');
    echo placeholder_svg(strtoupper(substr($id, 0, 2)));
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

function emit_image(array $response, string $source): void
{
    http_response_code(200);
    header('Content-Type: ' . (string) $response['content_type']);
    header('Cache-Control: public, max-age=86400, stale-while-revalidate=604800');
    header('Access-Control-Allow-Origin: *');
    header('X-Posokanei-Image-Source: ' . $source);
    echo $response['body'];
}

function placeholder_svg(string $label): string
{
    $label = htmlspecialchars(substr($label, 0, 2), ENT_QUOTES, 'UTF-8');
    return '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160" role="img" aria-label="Product image unavailable"><rect width="160" height="160" rx="18" fill="#e0f2fe"/><text x="80" y="89" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#475569">' . $label . '</text></svg>';
}

function emit_snapshot_json(string $resource, array $request): bool
{
    try {
        $payload = snapshot_payload($resource, $request);
        if ($payload === null) {
            return false;
        }

        header('X-Posokanei-Source: snapshot');
        http_response_code(200);
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        return true;
    } catch (Throwable $error) {
        return false;
    }
}

function snapshot_payload(string $resource, array $request): ?array
{
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

    if (in_array($resource, ['products', 'search', 'barcode', 'product'], true)) {
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

    return [
        'generated_at' => $snapshot['generated_at'] ?? '',
        'source' => $snapshot['source'] ?? POSOKANEI_API,
        'stats' => $snapshot['stats'] ?? [],
        'categories' => $snapshot['categories'] ?? [],
        'retailers' => $snapshot['retailers'] ?? [],
    ];
}

function read_snapshot(): ?array
{
    return read_json_file(__DIR__ . '/../data/catalog.json');
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

    usort($filtered, static function ($a, $b) use ($request): int {
        $sortBy = clean_sort($request['sort_by'] ?? 'name', ['name', 'price_asc', 'unit_price'], 'name');
        $sortOrder = clean_sort($request['sort_order'] ?? 'asc', ['asc', 'desc'], 'asc');
        if ($sortBy === 'price_asc' || $sortBy === 'unit_price') {
            $left = snapshot_min_price($a);
            $right = snapshot_min_price($b);
            $result = $left <=> $right;
        } else {
            $result = strcoll((string) ($a['name'] ?? ''), (string) ($b['name'] ?? ''));
        }
        return $sortOrder === 'desc' ? -$result : $result;
    });

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
