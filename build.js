#!/usr/bin/env node
/**
 * Adroit Marketiq — static site build
 *
 *   node build.js          build every page once
 *   node build.js --watch  rebuild when anything in /src changes
 *
 * Reads   src/layout.html, src/partials/*.html, src/pages/*.html, src/site.config.json
 * Writes  plain static .html files to the project root, plus sitemap.xml and robots.txt
 *
 * Template syntax (deliberately tiny):
 *   {{> partial-name key="value"}}   include src/partials/partial-name.html; keys become {{key}} inside it
 *   {{site.name}} {{page.title}}     values from site.config.json / the page's front matter
 *   {{helper.whatsappHref}}          computed values, see buildHelpers()
 *
 * Each page starts with a JSON front-matter comment:
 *   <!--
 *   { "title": "...", "description": "...", "nav": "about", "header": "light" }
 *   -->
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const PAGES = path.join(SRC, 'pages');
const PARTIALS = path.join(SRC, 'partials');

const read = (file) => fs.readFileSync(file, 'utf8');
const isSet = (value) => Boolean(value) && !/_HERE$/.test(String(value).trim());
const escapeHtml = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function buildHelpers(site) {
  const digits = String(site.whatsapp || '').replace(/\D/g, '');
  const hasWhatsapp = isSet(site.whatsapp) && digits.length > 6;
  const pending = (label) => `<span class="pending">${label} to be added</span>`;

  const socialNames = { instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn', youtube: 'YouTube' };
  const socialLinks = Object.entries(socialNames)
    .map(([key, label]) => {
      const url = site.social && site.social[key];
      const icon = `<svg class="icon" aria-hidden="true"><use href="#i-${key}"/></svg>`;
      return isSet(url)
        ? `<li><a class="social-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">${icon}<span>${label}</span></a></li>`
        : `<li><span class="social-link is-pending" title="${label} profile link to be added in src/site.config.json">${icon}<span>${label}</span></span></li>`;
    })
    .join('\n          ');

  return {
    // Until a real number is supplied the WhatsApp button falls back to the contact page.
    whatsappHref: hasWhatsapp
      ? `https://wa.me/${digits}?text=${encodeURIComponent(site.whatsappMessage || '')}`
      : 'contact.html#enquiry',
    whatsappAttrs: hasWhatsapp ? 'target="_blank" rel="noopener"' : 'data-whatsapp-pending',
    whatsappLabel: hasWhatsapp ? 'Chat with us on WhatsApp' : 'Message us (WhatsApp number to be added)',
    emailHtml: isSet(site.email)
      ? `<a class="link" href="mailto:${escapeHtml(site.email)}">${escapeHtml(site.email)}</a>`
      : pending('Email'),
    phoneHtml: isSet(site.phone)
      ? `<a class="link" href="tel:${escapeHtml(String(site.phone).replace(/[^\d+]/g, ''))}">${escapeHtml(site.phone)}</a>`
      : pending('Phone number'),
    addressHtml: isSet(site.address) ? escapeHtml(site.address) : pending('Office address'),
    socialLinks,
    sameAs: JSON.stringify(Object.values(site.social || {}).filter(isSet)),
  };
}

function lookup(scope, dotted) {
  return dotted.split('.').reduce((value, key) => (value == null ? undefined : value[key]), scope);
}

function render(template, scope, depth = 0) {
  if (depth > 12) throw new Error('Partials are nested too deeply (circular include?)');

  // {{> partial key="value"}}
  let out = template.replace(/\{\{>\s*([\w\-/]+)((?:\s+[\w-]+="[^"]*")*)\s*\}\}/g, (_, name, rawArgs) => {
    const file = path.join(PARTIALS, `${name}.html`);
    if (!fs.existsSync(file)) throw new Error(`Missing partial: src/partials/${name}.html`);
    const args = {};
    rawArgs.replace(/([\w-]+)="([^"]*)"/g, (__, key, value) => (args[key] = value));
    return render(read(file), { ...scope, ...args }, depth + 1);
  });

  // {{value}} — unknown keys are left empty rather than printed
  out = out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const value = lookup(scope, key);
    return value == null ? '' : String(value);
  });

  return out;
}

function parsePage(file) {
  const raw = read(file);
  const match = raw.match(/^\s*<!--\s*(\{[\s\S]*?\})\s*-->/);
  if (!match) throw new Error(`${path.basename(file)} is missing its JSON front-matter comment`);
  return { meta: JSON.parse(match[1]), body: raw.slice(match[0].length).trim() };
}

function build() {
  const started = Date.now();
  const site = JSON.parse(read(path.join(SRC, 'site.config.json')));
  site.domain = String(site.domain || '').replace(/\/$/, '');
  const helper = buildHelpers(site);
  const layout = read(path.join(SRC, 'layout.html'));
  const built = [];

  for (const name of fs.readdirSync(PAGES).filter((f) => f.endsWith('.html')).sort()) {
    const { meta, body } = parsePage(path.join(PAGES, name));
    const page = {
      header: 'light',
      nav: '',
      bodyClass: '',
      index: true,
      ...meta,
      file: name,
      url: `${site.domain}/${name === 'index.html' ? '' : name}`,
    };
    page.robots = page.index ? 'index, follow' : 'noindex, follow';
    page.scripts = (meta.scripts || [])
      .map((src) =>
        src.endsWith('.mjs') || src.includes('scene')
          ? `<script type="module" src="${src}"></script>`
          : `<script defer src="${src}"></script>`
      )
      .join('\n  ');

    const scope = { site, page, helper };
    scope.content = render(body, scope);
    scope.schema = page.schema ? render(`{{> ${page.schema}}}`, scope) : '';

    let html = render(layout, scope);
    // Mark the current page in every navigation list.
    if (page.nav) {
      html = html.replace(new RegExp(`data-nav="${page.nav}"`, 'g'), `data-nav="${page.nav}" aria-current="page"`);
    }
    html = html.replace('<!doctype html>', `<!doctype html>\n<!-- Generated by build.js from src/pages/${name}. Edit the source, not this file. -->`);

    fs.writeFileSync(path.join(ROOT, name), html);
    built.push(page);
  }

  const today = new Date().toISOString().slice(0, 10);
  const sitemap =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    built
      .filter((p) => p.index)
      .map((p) => `  <url><loc>${p.url}</loc><lastmod>${today}</lastmod><priority>${p.file === 'index.html' ? '1.0' : '0.7'}</priority></url>`)
      .join('\n') +
    `\n</urlset>\n`;
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap);
  fs.writeFileSync(
    path.join(ROOT, 'robots.txt'),
    `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /php/\nDisallow: /storage/\nDisallow: /vendor/\nDisallow: /src/\n\nSitemap: ${site.domain}/sitemap.xml\n`
  );

  console.log(`Built ${built.length} pages in ${Date.now() - started}ms: ${built.map((p) => p.file).join(', ')}`);
}

try {
  build();
} catch (error) {
  console.error(`Build failed: ${error.message}`);
  process.exitCode = 1;
}

if (process.argv.includes('--watch')) {
  let timer;
  fs.watch(SRC, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        build();
      } catch (error) {
        console.error(`Build failed: ${error.message}`);
      }
    }, 120);
  });
  console.log('Watching src/ for changes…');
}
