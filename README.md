# Adroit Marketiq website

Static HTML, CSS and JavaScript, plus one serverless function that emails form submissions through Google SMTP. Set up for hosting on Vercel.

## Before launch: what you still need to fill in

| What | Where | Currently |
|---|---|---|
| Gmail address, App Password, recipient inbox | Vercel → Project → Settings → Environment Variables | not set; forms return an error until they are |
| WhatsApp number | `src/site.config.json` → `whatsapp` | `WHATSAPP_NUMBER_HERE`; the button opens the enquiry form instead |
| Email, phone, office address | `src/site.config.json` | empty; pages show "to be added" |
| Instagram, Facebook, LinkedIn, YouTube links | `src/site.config.json` → `social` | empty; icons shown dimmed, not clickable |
| Live domain | `src/site.config.json` → `domain` | `YOUR-DOMAIN-HERE`; used for canonical URLs, sitemap, share previews |
| Case studies | `src/pages/work.html`, `src/pages/index.html` | placeholder plates ("Case study coming soon") |
| Articles | `src/pages/insights.html` | titles and summaries only ("Full article publishing soon") |
| Privacy, terms, cookie policies | `src/pages/legal.html` | placeholders; needs legally reviewed text |

After editing anything in `src/`, rebuild the pages on your computer, then deploy:

```bash
node build.js
```

## Deploying to Vercel

Vercel needs no build command. It serves the built `.html` files as they are, installs Nodemailer from `package.json` by itself, and turns `api/send-enquiry.js` into the form endpoint.

1. Put the project on Vercel, either way:
   - **From GitHub:** push this folder to a repository, then in Vercel choose Add New → Project and import it.
   - **From your computer:** install the Vercel CLI (`npm i -g vercel`), then run `vercel` in this folder, and `vercel --prod` to publish.
2. In the project settings, leave Framework Preset as "Other" and the Build Command and Output Directory empty.
3. Add the mail settings under Settings → Environment Variables (see below).
4. Redeploy so the function picks the variables up, then send a test enquiry from the contact page.

`.vercelignore` keeps the page sources, tooling and the PHP version of the handler off Vercel. `vercel.json` sets security and caching headers. `404.html` is used automatically for missing pages.

### Mail settings (environment variables)

| Name | Value |
|---|---|
| `SMTP_USER` | The Gmail or Google Workspace address that sends the mail |
| `SMTP_PASS` | A Google App Password (16 characters), not the normal account password |
| `MAIL_TO` | The inbox that receives enquiries; several can be separated with commas |

To create the App Password: turn on 2-Step Verification for that Google account, then go to https://myaccount.google.com/apppasswords. Google shows the password once.

Optional settings (sender name, auto-reply on or off, rate limit and more) are listed in `.env.example`.

Never put the real password in a file that is uploaded or committed. On Vercel it belongs only in Environment Variables.

### What the endpoint does with each submission

- validates it on the server (the browser validates too, but is never trusted)
- rejects bots: hidden honeypot field, minimum time spent on the form
- refuses posts from other websites
- emails the enquiry to `MAIL_TO`, with Reply-To set to the visitor
- sends the visitor a short confirmation (switch off with `AUTO_REPLY=false`)

Two limits to know about on Vercel:

- **No stored copy.** Vercel functions cannot write files, so there is no CSV backup. If a send fails, the visitor sees an error and the reason appears in the function's logs (Vercel → Project → Logs).
- **Rate limiting is best effort.** The limit of 5 submissions per 10 minutes per visitor is held in the function's memory, which Vercel may reset between requests. For a hard limit, add a rule in Vercel Firewall.

To see the mail error in the browser while testing, set `MAIL_DEBUG=true` temporarily.

## Running it locally

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:8123/. The dev server serves the pages and runs the same form function Vercel does.
To send real mail locally, copy `.env.example` to `.env.local` and fill it in; that file is ignored by git and by Vercel.

## Hosting on a PHP server instead

A PHP version of the same handler is kept in `php/` for cPanel-style hosts (it also keeps a CSV backup in `storage/`).
To use it: set `"formEndpoint": "php/send-enquiry.php"` in `src/site.config.json`, run `node build.js`, fill in `php/config.php`, and upload everything including `vendor/`. It needs PHP 7.4 or newer (tested here on PHP 8.2) with the `openssl` extension. The `.htaccess` files protect `php/config.php`, `storage/` and `vendor/` on Apache.

## How the project is organised

```
src/
  site.config.json     every replaceable business detail, and the form endpoint
  layout.html          the page shell: <head>, SEO tags, scripts
  partials/            header, footer, icons, the six service visuals, shared sections
  pages/               one file per page; a JSON comment at the top sets its title and description
build.js               joins the above into the .html files in the project root
api/send-enquiry.js    the form endpoint (Vercel serverless function, Nodemailer)
dev-server.js          local preview server (not deployed)
vercel.json            Vercel headers and function settings
assets/
  css/  tokens.css     colours, type scale, spacing (the design guide palette)
        base.css       reset, typography, buttons, links, forms
        layout.css     header, menu, footer, loader, page transitions, floating buttons
        sections.css   sections shared between pages (service rail, process, industries, work, insights)
        visuals.css    the six animated service illustrations
        pages.css      home hero
        inner.css      about, services, process, industries, work, insights, contact, legal
  js/   core.js        loader, transitions, menu, smooth scroll, scroll reveals
        sections.js    service rail, process line, industry selector, work filter
        scene.js       Three.js scenes (home hero, dark page headers)
        forms.js       form validation and submission
  images/              see assets/images/ASSETS.md for the full manifest
php/, vendor/, storage/  PHP version of the form handler (PHP hosts only; not sent to Vercel)
```

Libraries are loaded from a CDN (jsDelivr): GSAP with ScrollTrigger and SplitText, Lenis, Three.js. Fonts (Poppins, Inter) come from Google Fonts.

## Behaviour worth knowing

- **Reduced motion:** visitors who ask their device for less motion get the finished layout with no scroll effects, no smooth scrolling and a still hero.
- **No JavaScript:** all content is readable, the industry panels are shown one after another, and forms post normally to a thank-you page.
- **Loader:** shown once per browser session, about 1.5 seconds. Later navigation uses the short page transition instead.
- **Legal, thank-you and 404 pages** are marked `noindex` and left out of the sitemap.
