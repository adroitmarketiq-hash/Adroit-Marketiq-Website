<?php
/**
 * Adroit Marketiq — form endpoint
 *
 * Receives the enquiry form (contact.html) and the subscribe form (insights.html)
 * and emails them through Google SMTP using PHPMailer.
 *
 *   POST form_type=enquiry    full_name, email, phone, service, message, industry
 *   POST form_type=subscribe  email
 *
 * Replies with JSON when called by fetch(); otherwise redirects to thank-you.html
 * or prints a short error page. Settings live in php/config.php.
 */

declare(strict_types=1);

use PHPMailer\PHPMailer\Exception as MailException;
use PHPMailer\PHPMailer\PHPMailer;

require __DIR__ . '/lib/helpers.php';

const AM_GENERIC_FAILURE = 'We could not send your message right now. Please try again in a few minutes, or reach us on WhatsApp.';

/* ---------- Request checks ---------- */

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    am_respond(405, false, 'This address only accepts the enquiry form.');
}

$configFile = __DIR__ . '/config.php';
$config = is_file($configFile) ? require $configFile : null;
if (!is_array($config)) {
    am_log('config.php is missing: copy config.example.php to config.php and fill it in.');
    am_respond(503, false, AM_GENERIC_FAILURE, [], ['code' => 'not_configured']);
}

if (!am_origin_allowed((array) ($config['allowed_origins'] ?? []))) {
    am_respond(403, false, 'This form can only be sent from the Adroit Marketiq website.');
}

$type = am_field('form_type', 20) === 'subscribe' ? 'subscribe' : 'enquiry';
$successMessage = $type === 'subscribe'
    ? 'Subscribed. We will email you when a new insight is published.'
    : 'Enquiry sent. We will reply to the email address you gave us.';

/* ---------- Spam checks ---------- */

// Honeypot: real visitors never see this field. Answer as if it worked, send nothing.
if (am_field('company_website', 200) !== '') {
    am_respond(200, true, $successMessage);
}

// Time check: forms.js reports how long the visitor spent on the form. Bots post instantly.
// Skipped when the value is absent (JavaScript unavailable).
$elapsed = am_field('elapsed_ms', 20);
$minSeconds = (int) ($config['min_seconds'] ?? 3);
if ($elapsed !== '' && ctype_digit($elapsed) && (int) $elapsed < $minSeconds * 1000) {
    am_respond(429, false, 'That was quick. Please wait a moment and send the form again.');
}

/* ---------- Validation ---------- */

$data = [
    'full_name' => am_field('full_name', 120),
    'email'     => am_field('email', 190),
    'phone'     => am_field('phone', 30),
    'service'   => am_field('service', 20),
    'industry'  => am_field('industry', 20),
    'message'   => am_field('message', 4000, true),
];
$errors = [];

if ($data['email'] === '') {
    $errors['email'] = 'Enter your email address.';
} elseif (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
    $errors['email'] = 'Enter an email address in the format name@example.com.';
}

if ($type === 'enquiry') {
    if ($data['full_name'] === '') {
        $errors['full_name'] = 'Enter your full name.';
    }
    if ($data['phone'] !== '') {
        $digits = preg_replace('/\D/', '', $data['phone']);
        if (!preg_match('/^[0-9+()\-.\s]+$/', $data['phone']) || strlen($digits) < 7 || strlen($digits) > 15) {
            $errors['phone'] = 'Enter a phone number with 7 to 15 digits, or leave it empty.';
        }
    }
    if (!isset(AM_SERVICES[$data['service']])) {
        $errors['service'] = 'Choose the service you are interested in.';
    }
    $messageLength = function_exists('mb_strlen') ? mb_strlen($data['message']) : strlen($data['message']);
    if ($messageLength < 10) {
        $errors['message'] = 'Tell us a little about your project (at least 10 characters).';
    }
    if (!isset(AM_INDUSTRIES[$data['industry']])) {
        $data['industry'] = '';
    }
}

if ($errors) {
    am_respond(422, false, 'Please check the highlighted fields and send the form again.', $errors);
}

/* ---------- Rate limit ---------- */

$limit = (array) ($config['rate_limit'] ?? []);
$siteName = (string) ($config['site_name'] ?? 'Adroit Marketiq');
if (am_rate_limited(am_client_ip(), (int) ($limit['max'] ?? 5), (int) ($limit['window'] ?? 600), $siteName)) {
    am_respond(429, false, 'You have sent several messages in a short time. Please wait a few minutes before sending another.');
}

/* ---------- Keep a copy, so a lead survives a mail failure ---------- */

$serviceLabel = AM_SERVICES[$data['service']] ?? '';
$industryLabel = AM_INDUSTRIES[$data['industry']] ?? '';
$stamp = date('Y-m-d H:i:s');

if (!empty($config['store_csv'])) {
    if ($type === 'subscribe') {
        am_csv_append('subscribers.csv', ['Date', 'Email'], [$stamp, $data['email']]);
    } else {
        am_csv_append(
            'enquiries.csv',
            ['Date', 'Full name', 'Email', 'Phone', 'Service', 'Industry', 'Project description'],
            [$stamp, $data['full_name'], $data['email'], $data['phone'], $serviceLabel, $industryLabel, $data['message']]
        );
    }
}

/* ---------- Send ---------- */

$smtp = (array) ($config['smtp'] ?? []);
$recipients = array_values(array_filter((array) ($config['to'] ?? []), static function ($to) {
    return is_array($to) && !am_is_placeholder($to['email'] ?? '');
}));

if (am_is_placeholder($smtp['username'] ?? '') || am_is_placeholder($smtp['password'] ?? '') || !$recipients) {
    am_log('Mail is not configured: set smtp.username, smtp.password and to[] in php/config.php.');
    am_respond(503, false, AM_GENERIC_FAILURE, [], ['code' => 'not_configured']);
}

$autoload = __DIR__ . '/../vendor/autoload.php';
if (!is_file($autoload)) {
    am_log('vendor/autoload.php is missing: upload the vendor folder or run "composer install".');
    am_respond(503, false, AM_GENERIC_FAILURE, [], ['code' => 'mailer_missing']);
}
require $autoload;

/** A PHPMailer instance already connected to the configured SMTP account. */
$newMailer = static function () use ($smtp, $config, $siteName): PHPMailer {
    $mail = new PHPMailer(true);
    $mail->isSMTP();
    $mail->Host = (string) ($smtp['host'] ?? 'smtp.gmail.com');
    $mail->Port = (int) ($smtp['port'] ?? 587);
    $mail->SMTPAuth = true;
    $mail->Username = (string) $smtp['username'];
    $mail->Password = str_replace(' ', '', (string) $smtp['password']); // Google shows App Passwords in groups of four
    $encryption = (string) ($smtp['encryption'] ?? 'tls');
    if ($encryption === 'none') {
        // Unencrypted: only for a local test server such as MailHog. Never use with Google.
        $mail->SMTPSecure = '';
        $mail->SMTPAutoTLS = false;
    } else {
        $mail->SMTPSecure = $encryption === 'ssl' ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
    }
    $mail->CharSet = PHPMailer::CHARSET_UTF8;
    $mail->Timeout = 15;

    $from = (array) ($config['from'] ?? []);
    $fromEmail = am_is_placeholder($from['email'] ?? '') ? (string) $smtp['username'] : (string) $from['email'];
    $mail->setFrom($fromEmail, (string) ($from['name'] ?? $siteName));
    return $mail;
};

try {
    $mail = $newMailer();
    foreach ($recipients as $to) {
        $mail->addAddress((string) $to['email'], (string) ($to['name'] ?? ''));
    }

    if ($type === 'subscribe') {
        $heading = 'New insights subscriber';
        $rows = ['Email' => $data['email'], 'Received' => $stamp];
        $mail->addReplyTo($data['email']);
        $mail->Subject = 'New subscriber: ' . $data['email'];
    } else {
        $heading = 'New enquiry from ' . $data['full_name'];
        $rows = [
            'Full name'           => $data['full_name'],
            'Email'               => $data['email'],
            'Phone'               => $data['phone'],
            'Service required'    => $serviceLabel,
            'Industry'            => $industryLabel,
            'Project description' => $data['message'],
            'Received'            => $stamp,
        ];
        // Replying in your mail app goes straight to the visitor.
        $mail->addReplyTo($data['email'], $data['full_name']);
        $mail->Subject = 'New enquiry: ' . $serviceLabel . ' (' . $data['full_name'] . ')';
    }

    $mail->isHTML(true);
    $mail->Body = am_email_html($heading, $rows, $siteName);
    $mail->AltBody = am_email_text($heading, $rows);
    $mail->send();
} catch (MailException $error) {
    am_log('Send failed: ' . $error->getMessage());
    $extra = ['code' => 'send_failed'];
    if (!empty($config['debug'])) {
        $extra['detail'] = $error->getMessage();
    }
    am_respond(502, false, AM_GENERIC_FAILURE, [], $extra);
}

/* ---------- Confirmation to the visitor (never blocks the response) ---------- */

if ($type === 'enquiry' && !empty($config['auto_reply'])) {
    try {
        $reply = $newMailer();
        $reply->addAddress($data['email'], $data['full_name']);
        $reply->Subject = 'We received your enquiry | ' . $siteName;
        $replyRows = ['Service required' => $serviceLabel, 'Your message' => $data['message']];
        $intro = 'Thank you, ' . $data['full_name'] . '. Your enquiry has reached us and we will reply to this address.';
        $reply->isHTML(true);
        $reply->Body = am_email_html($intro, $replyRows, $siteName);
        $reply->AltBody = am_email_text($intro, $replyRows);
        $reply->send();
    } catch (MailException $error) {
        am_log('Auto-reply failed: ' . $error->getMessage());
    }
}

am_respond(200, true, $successMessage);
