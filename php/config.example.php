<?php
/**
 * Adroit Marketiq — form mail settings (template)
 *
 * 1. Copy this file to config.php (same folder).
 * 2. Fill in the three *_HERE values below.
 * 3. Keep config.php out of version control and never share it.
 *
 * Google SMTP setup
 * -----------------
 *  - Turn on 2-Step Verification for the Google account that will send the mail.
 *  - Create an App Password: https://myaccount.google.com/apppasswords
 *    (choose "Mail"; Google shows a 16-character password once).
 *  - Use that App Password below. Your normal Google password will not work.
 *  - For Google Workspace, an admin must allow App Passwords or SMTP relay.
 *
 * The password can also be supplied through the ADROIT_SMTP_PASSWORD environment
 * variable, which keeps it out of this file entirely.
 */

return [
    'smtp' => [
        'host'       => 'smtp.gmail.com',
        'port'       => 587,
        'encryption' => 'tls',                            // 'tls' = STARTTLS on 587 (recommended), 'ssl' = port 465,
                                                          // 'none' = unencrypted, for a local test server only
        'username'   => 'YOUR_GMAIL_ADDRESS_HERE',        // full address, e.g. hello@your-domain.com
        'password'   => getenv('ADROIT_SMTP_PASSWORD') ?: 'YOUR_GOOGLE_APP_PASSWORD_HERE',
    ],

    // Who the email appears to come from. Gmail always sends as the account above,
    // so leave 'email' empty unless you have set up a "Send mail as" alias.
    'from' => [
        'email' => '',
        'name'  => 'Adroit Marketiq Website',
    ],

    // Where enquiries and subscriptions are delivered. Add more rows for more inboxes.
    'to' => [
        ['email' => 'RECIPIENT_EMAIL_HERE', 'name' => 'Adroit Marketiq'],
    ],

    'site_name' => 'Adroit Marketiq',

    // Send the visitor a short confirmation that their enquiry arrived.
    'auto_reply' => true,

    // Keep a CSV copy of every submission in /storage, so a lead is never lost
    // if the mail server is unreachable. Set to false to switch this off.
    'store_csv' => true,

    // Extra sites allowed to post to this endpoint, e.g. ['https://www.your-domain.com'].
    // The site's own host is always allowed.
    'allowed_origins' => [],

    // Spam controls
    'rate_limit'  => ['max' => 5, 'window' => 600],      // 5 submissions per 10 minutes per visitor
    'min_seconds' => 3,                                   // forms sent faster than this are treated as bots

    // true = include the technical mail error in the JSON response (development only).
    'debug' => false,
];
