<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=60, stale-while-revalidate=300');

const POSOKANEI_API = 'https://api.posokanei.gov.gr';

$resource = $_GET['resource'] ?? 'stats';
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

function forward_json(string $method, string $path, array $query = [], ?array $body = null): void
{
    $url = POSOKANEI_API . $path;
    if ($query) {
        $url .= '?' . http_build_query($query);
    }

    $headers = [
        'Accept: application/json',
        'User-Agent: agenticspiros-posokanei-basket-demo/1.0',
    ];

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
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

    if ($response === false || $status < 200 || $status >= 500) {
        http_response_code(502);
        echo json_encode([
            'error' => 'upstream_unavailable',
            'detail' => $error ?: 'PosoKanei API did not respond successfully.',
        ], JSON_UNESCAPED_UNICODE);
        return;
    }

    http_response_code($status);
    echo $response;
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

forward_json($method, $path, $query, $body);
