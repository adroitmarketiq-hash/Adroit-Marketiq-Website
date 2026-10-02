/**
 * Adroit Marketiq — form endpoint (Vercel serverless function)
 *
 * Receives the enquiry form (contact.html) and the subscribe form (insights.html)
 * and emails them through Google SMTP using Nodemailer.
 *
 *   POST form_type=enquiry    full_name, email, phone, service, message, industry
 *   POST form_type=subscribe  email
 *
 * Replies with JSON when called by fetch(); otherwise redirects to /thank-you.html
 * or prints a short error page.
 *
 * Settings come from environment variables (Vercel → Project → Settings → Environment Variables).
 * See .env.example for the full list. Required: SMTP_USER, SMTP_PASS, MAIL_TO.
 */

'use strict';

const crypto = require('crypto');
const nodemailer = require('nodemailer');

const SERVICES = {
  seo: 'Search Engine Optimization',
  social: 'Social Media Marketing',
  ads: 'Performance Marketing (Google Ads, Meta Ads)',
  brand: 'Branding & Creative Design',
  web: 'Website Development',
  content: 'Content, Video & Consulting',
  unsure: 'Not sure yet',
};

const INDUSTRIES = {
  retail: 'E-commerce & Retail',
  'real-estate': 'Real Estate',
  education: 'Education',
  healthcare: 'Healthcare',
  travel: 'Hospitality & Travel',
  tech: 'Startups, B2B & SaaS',
};

const GENERIC_FAILURE = 'We could not send your message right now. Please try again in a few minutes, or reach us on WhatsApp.';
const MAX_BODY_BYTES = 64 * 1024;

/* ---------- Small helpers ---------- */

const env = (name, fallback = '') => {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
};

/** A value that is still one of the *_HERE placeholders (or empty) counts as not configured. */
const isPlaceholder = (value) => !value || /_HERE$/.test(String(value).trim());

const escapeHtml = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Trimmed text, capped in length, with control characters removed (newlines kept for multi-line fields). */
function clean(value, max, multiline) {
  if (typeof value !== 'string') return '';
  const text = multiline
    ? value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    : value.replace(/[\u0000-\u001F\u007F]+/g, ' ');
  return text.trim().slice(0, max);
}

/** True when the browser asked for JSON (the fetch() path); false for a plain form post. */
function wantsJson(req) {
  return String(req.headers.accept || '').toLowerCase().includes('application/json') || Boolean(req.headers['x-requested-with']);
}

/** Ends the request: JSON for fetch(); for a plain form post, a redirect on success or a short error page. */
function respond(req, res, status, ok, message, errors = {}, extra = {}) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (wantsJson(req)) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok, message, errors, ...extra }));
    return;
  }

  if (ok) {
    res.statusCode = 303;
    res.setHeader('Location', '/thank-you.html');
    res.end();
    return;
  }

  const items = Object.values(errors).map((error) => `<li>${escapeHtml(error)}</li>`).join('');
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<meta name="robots" content="noindex"><title>Enquiry not sent | Adroit Marketiq</title>' +
      '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#101C35;color:#F5F7FB;font:16px/1.6 system-ui,sans-serif}' +
      'main{max-width:34rem;padding:2rem}h1{font-size:2rem;line-height:1.1;margin:0 0 1rem}a{color:#56C5F5}li{margin:.3rem 0}</style></head>' +
      `<body><main><h1>Your message was not sent.</h1><p>${escapeHtml(message)}</p>${items ? `<ul>${items}</ul>` : ''}` +
      '<p><a href="/contact.html#enquiry">Go back to the form</a></p></main></body></html>'
  );
}

/** Form fields as a plain object. Vercel parses the body for us; elsewhere (dev-server.js) we read the stream. */
async function readFields(req) {
  const parse = (text, type) => {
    if (type.includes('application/json')) {
      try {
        const data = JSON.parse(text);
        return data && typeof data === 'object' ? data : {};
      } catch (error) {
        return {};
      }
    }
    return Object.fromEntries(new URLSearchParams(text));
  };
  const type = String(req.headers['content-type'] || '').toLowerCase();

  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) return parse(req.body.toString('utf8'), type);
    if (typeof req.body === 'string') return parse(req.body, type);
    if (typeof req.body === 'object') return req.body;
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return {};
    chunks.push(chunk);
  }
  return parse(Buffer.concat(chunks).toString('utf8'), type);
}

/** The request must come from this site (or a listed origin). Blocks other sites posting the form. */
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin form posts from some browsers omit the header
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
  try {
    if (new URL(origin).host.toLowerCase() === host) return true;
  } catch (error) {
    return false;
  }
  return env('ALLOWED_ORIGINS')
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean)
    .includes(String(origin).replace(/\/$/, ''));
}

/**
 * Sliding-window limit per visitor, held in memory. A serverless function keeps its memory only
 * while that instance stays warm, so this slows a burst rather than guaranteeing a hard cap.
 * Only a hash of the IP address is kept, and only for the length of the window.
 */
const recentHits = new Map();
function rateLimited(req) {
  const max = Number(env('RATE_LIMIT_MAX', '5'));
  const windowMs = Number(env('RATE_LIMIT_WINDOW_SECONDS', '600')) * 1000;
  const ip = String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '').split(',')[0].trim();
  const key = crypto.createHash('sha256').update(ip).digest('hex');
  const now = Date.now();

  for (const [storedKey, times] of recentHits) {
    const fresh = times.filter((time) => time > now - windowMs);
    if (fresh.length) recentHits.set(storedKey, fresh);
    else recentHits.delete(storedKey);
  }

  const times = recentHits.get(key) || [];
  if (times.length >= max) return true;
  recentHits.set(key, [...times, now]);
  return false;
}

/* ---------- Email bodies ---------- */

function emailHtml(heading, rows, siteName) {
  const body = Object.entries(rows)
    .filter(([, value]) => value !== '')
    .map(
      ([label, value]) =>
        '<tr><td style="padding:10px 16px 10px 0;border-bottom:1px solid #E3E8F2;color:#5C6883;font-size:12px;letter-spacing:.08em;text-transform:uppercase;vertical-align:top;white-space:nowrap">' +
        `${escapeHtml(label)}</td><td style="padding:10px 0;border-bottom:1px solid #E3E8F2;color:#101C35;font-size:15px;line-height:1.5">` +
        `${escapeHtml(value).replace(/\n/g, '<br>')}</td></tr>`
    )
    .join('');
  return (
    '<div style="background:#F5F7FB;padding:24px;font-family:Arial,Helvetica,sans-serif">' +
    '<div style="max-width:620px;margin:0 auto;background:#FFFFFF;border-top:3px solid #1673E6">' +
    `<div style="padding:24px 28px 8px"><p style="margin:0 0 6px;color:#1673E6;font-size:12px;letter-spacing:.14em;text-transform:uppercase">${escapeHtml(siteName)}</p>` +
    `<h1 style="margin:0;color:#101C35;font-size:22px;line-height:1.25">${escapeHtml(heading)}</h1></div>` +
    `<div style="padding:8px 28px 28px"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${body}</table></div>` +
    '</div></div>'
  );
}

function emailText(heading, rows) {
  const lines = Object.entries(rows)
    .filter(([, value]) => value !== '')
    .map(([label, value]) => `${label}: ${value}`);
  return [heading, '-'.repeat(heading.length), '', ...lines].join('\n') + '\n';
}

/* ---------- Handler ---------- */

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return respond(req, res, 405, false, 'This address only accepts the enquiry form.');
  }

  if (!originAllowed(req)) {
    return respond(req, res, 403, false, 'This form can only be sent from the Adroit Marketiq website.');
  }

  const fields = await readFields(req);
  const type = clean(fields.form_type, 20) === 'subscribe' ? 'subscribe' : 'enquiry';
  const successMessage =
    type === 'subscribe'
      ? 'Subscribed. We will email you when a new insight is published.'
      : 'Enquiry sent. We will reply to the email address you gave us.';

  /* Spam checks */

  // Honeypot: real visitors never see this field. Answer as if it worked, send nothing.
  if (clean(fields.company_website, 200) !== '') {
    return respond(req, res, 200, true, successMessage);
  }

  // Time check: forms.js reports how long the visitor spent on the form. Bots post instantly.
  // Skipped when the value is absent (JavaScript unavailable).
  const elapsed = clean(fields.elapsed_ms, 20);
  const minSeconds = Number(env('MIN_SECONDS', '3'));
  if (/^\d+$/.test(elapsed) && Number(elapsed) < minSeconds * 1000) {
    return respond(req, res, 429, false, 'That was quick. Please wait a moment and send the form again.');
  }

  /* Validation (the browser validates too, but is never trusted) */

  const data = {
    full_name: clean(fields.full_name, 120),
    email: clean(fields.email, 190),
    phone: clean(fields.phone, 30),
    service: clean(fields.service, 20),
    industry: clean(fields.industry, 20),
    message: clean(fields.message, 4000, true),
  };
  const errors = {};

  if (!data.email) {
    errors.email = 'Enter your email address.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) {
    errors.email = 'Enter an email address in the format name@example.com.';
  }

  if (type === 'enquiry') {
    if (!data.full_name) errors.full_name = 'Enter your full name.';
    if (data.phone) {
      const digits = data.phone.replace(/\D/g, '').length;
      if (!/^[0-9+()\-.\s]+$/.test(data.phone) || digits < 7 || digits > 15) {
        errors.phone = 'Enter a phone number with 7 to 15 digits, or leave it empty.';
      }
    }
    if (!Object.prototype.hasOwnProperty.call(SERVICES, data.service)) {
      errors.service = 'Choose the service you are interested in.';
    }
    if (data.message.length < 10) {
      errors.message = 'Tell us a little about your project (at least 10 characters).';
    }
    if (!Object.prototype.hasOwnProperty.call(INDUSTRIES, data.industry)) data.industry = '';
  }

  if (Object.keys(errors).length) {
    return respond(req, res, 422, false, 'Please check the highlighted fields and send the form again.', errors);
  }

  if (rateLimited(req)) {
    return respond(req, res, 429, false, 'You have sent several messages in a short time. Please wait a few minutes before sending another.');
  }

  /* Send */

  const user = env('SMTP_USER');
  const pass = env('SMTP_PASS');
  const recipients = env('MAIL_TO')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => !isPlaceholder(item));

  if (isPlaceholder(user) || isPlaceholder(pass) || !recipients.length) {
    console.error('Mail is not configured: set SMTP_USER, SMTP_PASS and MAIL_TO in the environment variables.');
    return respond(req, res, 503, false, GENERIC_FAILURE, {}, { code: 'not_configured' });
  }

  const siteName = env('SITE_NAME', 'Adroit Marketiq');
  const secureMode = env('SMTP_SECURE', 'starttls'); // starttls (587) | ssl (465) | none (local test server only)
  const transport = nodemailer.createTransport({
    host: env('SMTP_HOST', 'smtp.gmail.com'),
    port: Number(env('SMTP_PORT', '587')),
    secure: secureMode === 'ssl',
    requireTLS: secureMode === 'starttls',
    ignoreTLS: secureMode === 'none',
    auth: { user, pass: pass.replace(/\s+/g, '') }, // Google shows App Passwords in groups of four
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  // Gmail always sends as the signed-in account; MAIL_FROM is only for a configured "Send mail as" alias.
  const from = { name: env('MAIL_FROM_NAME', `${siteName} Website`), address: env('MAIL_FROM', user) };

  const serviceLabel = SERVICES[data.service] || '';
  const industryLabel = INDUSTRIES[data.industry] || '';
  const received = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  let heading;
  let rows;
  let subject;
  let replyTo;
  if (type === 'subscribe') {
    heading = 'New insights subscriber';
    rows = { Email: data.email, Received: received };
    subject = `New subscriber: ${data.email}`;
    replyTo = data.email;
  } else {
    heading = `New enquiry from ${data.full_name}`;
    rows = {
      'Full name': data.full_name,
      Email: data.email,
      Phone: data.phone,
      'Service required': serviceLabel,
      Industry: industryLabel,
      'Project description': data.message,
      Received: received,
    };
    subject = `New enquiry: ${serviceLabel} (${data.full_name})`;
    // Replying in your mail app goes straight to the visitor.
    replyTo = { name: data.full_name, address: data.email };
  }

  try {
    await transport.sendMail({
      from,
      to: recipients,
      replyTo,
      subject,
      text: emailText(heading, rows),
      html: emailHtml(heading, rows, siteName),
    });
  } catch (error) {
    console.error('Send failed:', error.message);
    const extra = { code: 'send_failed' };
    if (env('MAIL_DEBUG') === 'true') extra.detail = error.message;
    return respond(req, res, 502, false, GENERIC_FAILURE, {}, extra);
  }

  // Confirmation to the visitor. A failure here never fails the request.
  if (type === 'enquiry' && env('AUTO_REPLY', 'true') !== 'false') {
    const intro = `Thank you, ${data.full_name}. Your enquiry has reached us and we will reply to this address.`;
    const replyRows = { 'Service required': serviceLabel, 'Your message': data.message };
    try {
      await transport.sendMail({
        from,
        to: { name: data.full_name, address: data.email },
        subject: `We received your enquiry | ${siteName}`,
        text: emailText(intro, replyRows),
        html: emailHtml(intro, replyRows, siteName),
      });
    } catch (error) {
      console.error('Auto-reply failed:', error.message);
    }
  }

  return respond(req, res, 200, true, successMessage);
};
