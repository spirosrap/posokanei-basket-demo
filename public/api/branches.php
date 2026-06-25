<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    return;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method_not_allowed'], JSON_UNESCAPED_SLASHES);
    return;
}

const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.openstreetmap.fr/api/interpreter',
];

$input = json_decode(file_get_contents('php://input') ?: '{}', true);
if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid_json'], JSON_UNESCAPED_SLASHES);
    return;
}

$lat = clean_float($input['lat'] ?? null);
$lon = clean_float($input['lon'] ?? null);
$radiusKm = clean_float($input['radiusKm'] ?? 5.0);

if ($lat === null || $lon === null || $lat < -90 || $lat > 90 || $lon < -180 || $lon > 180) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid_coordinates'], JSON_UNESCAPED_SLASHES);
    return;
}

$radiusMeters = max(500, min(15000, (int) round(($radiusKm ?? 5.0) * 1000)));
$query = sprintf(
    '[out:json][timeout:18];(node["shop"="supermarket"](around:%d,%.7F,%.7F);way["shop"="supermarket"](around:%d,%.7F,%.7F);relation["shop"="supermarket"](around:%d,%.7F,%.7F););out center tags 80;',
    $radiusMeters,
    $lat,
    $lon,
    $radiusMeters,
    $lat,
    $lon,
    $radiusMeters,
    $lat,
    $lon
);

try {
    $payload = fetch_overpass($query);
    $payload['source'] = 'openstreetmap-overpass';
    $payload['queried_at'] = gmdate('c');
    $payload['radius_meters'] = $radiusMeters;
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    http_response_code(502);
    echo json_encode([
        'error' => 'overpass_unavailable',
        'detail' => $error->getMessage(),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function clean_float(mixed $value): ?float
{
    if ($value === null || $value === '') {
        return null;
    }
    $float = filter_var($value, FILTER_VALIDATE_FLOAT);
    return $float === false ? null : (float) $float;
}

function fetch_overpass(string $query): array
{
    $errors = [];

    foreach (OVERPASS_ENDPOINTS as $endpoint) {
        $ch = curl_init($endpoint);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_ENCODING => '',
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_TIMEOUT => 24,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query(['data' => $query]),
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
                'Content-Type: application/x-www-form-urlencoded',
                'User-Agent: agenticspiros-posokanei-basket-demo/1.0 (+https://github.com/spirosrap/posokanei-basket-demo)',
            ],
        ]);

        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($response !== false && $status >= 200 && $status < 300) {
            $decoded = json_decode($response, true);
            if (is_array($decoded)) {
                return $decoded;
            }
            $errors[] = $endpoint . ' returned invalid JSON';
            continue;
        }

        $errors[] = $error ?: $endpoint . ' returned HTTP ' . $status;
    }

    throw new RuntimeException(implode('; ', $errors) ?: 'Overpass did not respond.');
}
