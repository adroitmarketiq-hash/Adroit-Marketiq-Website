#!/usr/bin/env node
/**
 * Adroit Marketiq — local preview server
 *
 *   npm run dev            → http://localhost:8123
 *   PORT=3000 npm run dev
 *
 * Serves the built pages and runs api/send-enquiry.js the way Vercel does, so the forms
 * can be tried locally. Reads mail settings from .env.local if that file exists.
 * This file is for local use only; it is not deployed.
 */

'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8123;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// The same folders Vercel leaves out (.vercelignore), so local behaviour matches production.
const PRIVATE = /^\/(src|php|vendor|storage|node_modules|\.claude|\.env|\.git)(\/|$|\.)|^\/(build\.js|dev-server\.js|README\.md|composer\.(json|lock)|package(-lock)?\.json)$/;

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || line.trim().startsWith('#')) continue;
    const value = match[2].replace(/\s+#.*$/, '').replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}
loadEnvFile(path.join(ROOT, '.env.local'));

// Reloads the function only when its file changes, so edits show up without a restart
// while its in-memory state (the rate limiter) survives between requests, as on Vercel.
let functionStamp = 0;
function loadFunction() {
  const file = require.resolve('./api/send-enquiry.js');
  const stamp = fs.statSync(file).mtimeMs;
  if (stamp !== functionStamp) {
    delete require.cache[file];
    functionStamp = stamp;
  }
  return require(file);
}

function sendFile(res, file, status = 200) {
  res.writeHead(status, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

function notFound(res) {
  const page = path.join(ROOT, '404.html');
  if (fs.existsSync(page)) return sendFile(res, page, 404);
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch (error) {
      return notFound(res);
    }

    if (pathname === '/api/send-enquiry') {
      try {
        await loadFunction()(req, res);
      } catch (error) {
        console.error(error);
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Function error: ' + error.message);
      }
      return;
    }

    if (PRIVATE.test(pathname)) return notFound(res);

    let file = path.normalize(path.join(ROOT, pathname));
    if (!file.startsWith(ROOT)) return notFound(res); // no escaping the project folder
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return notFound(res);
    sendFile(res, file);
  })
  .listen(PORT, () => {
    const configured = process.env.SMTP_USER && !/_HERE$/.test(process.env.SMTP_USER);
    console.log(`Adroit Marketiq preview: http://localhost:${PORT}`);
    console.log(configured ? 'Mail: configured from the environment.' : 'Mail: not configured (forms will report a send failure). See .env.example.');
  });
