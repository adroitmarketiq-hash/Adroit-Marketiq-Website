<?php
/**
 * Adroit Marketiq — helpers for the form endpoint (send-enquiry.php).
 * Not reachable from the web: see php/.htaccess.
 */

declare(strict_types=1);

const AM_STORAGE = __DIR__ . '/../../storage';

const AM_SERVICES = [
    'seo'     => 'Search Engine Optimization',
    'social'  => 'Social Media Marketing',
    'ads'     => 'Performance Marketing (Google Ads, Meta Ads)',
    'brand'   => 'Branding & Creative Design',
    'web'     => 'Website Development',
    'content' => 'Content, Video & Consulting',
    'unsure'  => 'Not sure yet',
];

const AM_INDUSTRIES = [
    'retail'      => 'E-commerce & Retail',
    'real-estate' => 'Real Estate',
    'education'   => 'Education',
    'healthcare'  => 'Healthcare',
    'travel'      => 'Hospitality & Travel',
    'tech'        => 'Startups, B2B & SaaS',
];

/** True when the browser asked for JSON (the fetch() path); false for a plain form post. */
function am_wants_json(): bool
{
    $accept = $_SERVER['HTTP_ACCEPT'] ?? '';
    $requestedWith = $_SERVER['HTTP_X_REQUESTED_WITH'] ?? '';
    return stripos($accept, 'application/json') !== false || $requestedWith !== '';
}

/**
 * Ends the request. JSON for fetch(); for a plain form post, a redirect on
 * success or a small self-contained page listing what went wrong.
 */
function am_respond(int $status, bool $ok, string $message, array $errors = [], array $extra = []): void
{
    http_response_code($status);
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');

    if (am_wants_json()) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => $ok, 'message' => $message, 'errors' => (object) $errors] + $extra, JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($ok) {
        header('Location: ../thank-you.html', true, 303);
        exit;
    }

    header('Content-Type: text/html; charset=utf-8');
    $items = '';
    foreach ($errors as $error) {
        $items .= '<li>' . am_e($error) . '</li>';
    }
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<meta name="robots" content="noindex"><title>Enquiry not sent | Adroit Marketiq</title>'
        . '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#101C35;color:#F5F7FB;font:16px/1.6 system-ui,sans-serif}'
        . 'main{max-width:34rem;padding:2rem}h1{font-size:2rem;line-height:1.1;margin:0 0 1rem}a{color:#56C5F5}li{margin:.3rem 0}</style></head>'
        . '<body><main><h1>Your message was not sent.</h1><p>' . am_e($message) . '</p>'
        . ($items !== '' ? '<ul>' . $items . '</ul>' : '')
        . '<p><a href="../contact.html#enquiry">Go back to the form</a></p></main></body></html>';
    exit;
}

function am_e(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** Reads a posted field as trimmed text, capped in length, with control characters removed. */
function am_field(string $name, int $max = 200, bool $multiline = false): string
{
    $value = $_POST[$name] ?? '';
    if (!is_string($value)) {
        return '';
    }
    $value = str_replace("\0", '', $value);
    $value = $multiline
        ? preg_replace('/[^\P{C}\n\t]/u', '', str_replace(["\r\n", "\r"], "\n", $value))
        : preg_replace('/[\p{C}]+/u', ' ', $value);
    $value = trim((string) $value);
    return function_exists('mb_substr') ? mb_substr($value, 0, $max) : substr($value, 0, $max);
}

/** A value that is still one of the *_HERE placeholders (or empty) counts as not configured. */
function am_is_placeholder($value): bool
{
    return !is_string($value) || $value === '' || (bool) preg_match('/_HERE$/', $value);
}

function am_client_ip(): string
{
    return (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
}

/** The request must come from this site (or a listed origin). Blocks other sites posting the form. */
function am_origin_allowed(array $allowed): bool
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin === '') {
        return true; // same-origin form posts from some browsers omit the header
    }
    $host = $_SERVER['HTTP_HOST'] ?? '';
    $originHost = (string) parse_url($origin, PHP_URL_HOST);
    $originPort = parse_url($origin, PHP_URL_PORT);
    $originAuthority = $originHost . ($originPort ? ':' . $originPort : '');
    if ($host !== '' && (strcasecmp($originAuthority, $host) === 0 || strcasecmp($originHost, $host) === 0)) {
        return true;
    }
    foreach ($allowed as $candidate) {
        if (strcasecmp(rtrim((string) $candidate, '/'), rtrim($origin, '/')) === 0) {
            return true;
        }
    }
    return false;
}

function am_ensure_storage(): bool
{
    if (!is_dir(AM_STORAGE) && !@mkdir(AM_STORAGE, 0750, true)) {
        return false;
    }
    return is_writable(AM_STORAGE);
}

/**
 * Sliding-window limit per visitor. Only a salted hash of the IP address is stored,
 * and each record is discarded once its window has passed.
 */
function am_rate_limited(string $ip, int $max, int $window, string $salt): bool
{
    if (!am_ensure_storage()) {
        return false; // cannot track; the honeypot and time check still apply
    }
    $dir = AM_STORAGE . '/ratelimit';
    if (!is_dir($dir)) {
        @mkdir($dir, 0750, true);
    }
    $file = $dir . '/' . hash('sha256', $salt . '|' . $ip) . '.json';
    $now = time();

    $handle = @fopen($file, 'c+');
    if (!$handle) {
        return false;
    }
    flock($handle, LOCK_EX);
    $raw = stream_get_contents($handle);
    $hits = array_values(array_filter((array) json_decode($raw ?: '[]', true), static function ($t) use ($now, $window) {
        return is_int($t) && $t > $now - $window;
    }));
    $limited = count($hits) >= $max;
    if (!$limited) {
        $hits[] = $now;
    }
    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode($hits));
    flock($handle, LOCK_UN);
    fclose($handle);

    // occasional clean-up of expired records
    if (random_int(1, 20) === 1) {
        foreach (glob($dir . '/*.json') ?: [] as $old) {
            if (filemtime($old) < $now - $window) {
                @unlink($old);
            }
        }
    }
    return $limited;
}

/** Appends one row to a CSV in /storage. Cells that could be read as formulas are neutralised. */
function am_csv_append(string $filename, array $header, array $row): bool
{
    if (!am_ensure_storage()) {
        return false;
    }
    $file = AM_STORAGE . '/' . $filename;
    $isNew = !file_exists($file);
    $handle = @fopen($file, 'a');
    if (!$handle) {
        return false;
    }
    $safe = array_map(static function ($cell) {
        $cell = (string) $cell;
        return preg_match('/^[=+\-@\t\r]/', $cell) ? "'" . $cell : $cell;
    }, $row);
    flock($handle, LOCK_EX);
    if ($isNew) {
        fputcsv($handle, $header, ',', '"', '\\');
    }
    fputcsv($handle, $safe, ',', '"', '\\');
    flock($handle, LOCK_UN);
    fclose($handle);
    return true;
}

function am_log(string $message): void
{
    if (am_ensure_storage()) {
        @file_put_contents(AM_STORAGE . '/mail-errors.log', '[' . date('c') . '] ' . $message . PHP_EOL, FILE_APPEND | LOCK_EX);
    }
}

/** HTML body for the notification the agency receives. $rows is label => value. */
function am_email_html(string $heading, array $rows, string $siteName): string
{
    $body = '';
    foreach ($rows as $label => $value) {
        if ($value === '') {
            continue;
        }
        $body .= '<tr><td style="padding:10px 16px 10px 0;border-bottom:1px solid #E3E8F2;color:#5C6883;font-size:12px;letter-spacing:.08em;text-transform:uppercase;vertical-align:top;white-space:nowrap">'
            . am_e((string) $label) . '</td><td style="padding:10px 0;border-bottom:1px solid #E3E8F2;color:#101C35;font-size:15px;line-height:1.5">'
            . nl2br(am_e((string) $value)) . '</td></tr>';
    }
    return '<div style="background:#F5F7FB;padding:24px;font-family:Arial,Helvetica,sans-serif">'
        . '<div style="max-width:620px;margin:0 auto;background:#FFFFFF;border-top:3px solid #1673E6">'
        . '<div style="padding:24px 28px 8px"><p style="margin:0 0 6px;color:#1673E6;font-size:12px;letter-spacing:.14em;text-transform:uppercase">' . am_e($siteName) . '</p>'
        . '<h1 style="margin:0;color:#101C35;font-size:22px;line-height:1.25">' . am_e($heading) . '</h1></div>'
        . '<div style="padding:8px 28px 28px"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">' . $body . '</table></div>'
        . '</div></div>';
}

function am_email_text(string $heading, array $rows): string
{
    $lines = [$heading, str_repeat('-', strlen($heading)), ''];
    foreach ($rows as $label => $value) {
        if ($value !== '') {
            $lines[] = $label . ': ' . $value;
        }
    }
    return implode("\n", $lines) . "\n";
}
