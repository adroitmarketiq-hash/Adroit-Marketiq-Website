# Image asset manifest

Every image used on the site, where it appears and where it came from.
To replace one, save a new file over the old one with the same name and size
(1600×1000 for the large version, 800×500 for the `-800` version); no code changes needed.

## Brand (`assets/images/brand/`)

All derived from `assets/images/Adroit Marketiq Growth Logo.png` (the supplied logo, kept as the master).
The shapes and colours are untouched; only the white background was removed, and for the
reversed version the navy wordmark was switched to white so it reads on dark sections.

| File | Used for |
|---|---|
| `logo.webp` | Header on light pages |
| `logo-reversed.webp` | Header on dark pages and after scrolling, footer |
| `logo-mark.webp` | Loader, page-transition cover, founder plate (About) |
| `favicon-32.png`, `/favicon.ico` | Browser tab icon |
| `apple-touch-icon.png`, `icon-512.png` | Home-screen icon, Organization schema logo |
| `og-image.jpg` | Preview image when a page is shared |

If the designer can supply an official SVG and an official reversed logo, replace these files with them.

## Photography

Royalty-free photos from Unsplash (Unsplash License: free for commercial use, attribution not required).

| File | Appears on | Photographer | Source |
|---|---|---|---|
| `industries/retail.jpg` | Industry selector: Retail | @mercantile | https://unsplash.com/photos/P3pI6xzovu0 |
| `industries/real-estate.jpg` | Industry selector: Real Estate | @aviwerde | https://unsplash.com/photos/hHz4yrvxwlA |
| `industries/education.jpg` | Industry selector: Education | @idbronskiy | https://unsplash.com/photos/gdZ9GPNi_VM |
| `industries/healthcare.jpg` | Industry selector: Healthcare | @tashakostyuk | https://unsplash.com/@tashakostyuk |
| `industries/travel.jpg` | Industry selector: Travel | @worldwanderer2024 | https://unsplash.com/photos/fU136rnvN0I |
| `industries/tech.jpg` | Industry selector: Tech | @tecnic | https://unsplash.com/photos/EyRIpXtcCEU |
| `blog/seo-strategy.jpg` | Home (Insights), Insights feature article | @hjrc33 | https://unsplash.com/photos/1FxMET2U5dU |
| `blog/social-presence.jpg` | Insights list | @art_maltsev | https://unsplash.com/photos/tULmzUFniwA |
| `blog/ai-in-marketing.jpg` | Insights list | @jonakoh | https://unsplash.com/photos/r5lbaK3fDaM |
| `blog/google-vs-meta.jpg` | Insights list | @ayumikubo | https://unsplash.com/photos/g8LeTWksLJI |
| `about/studio.jpg` | About: studio image | @gomi_design | https://unsplash.com/photos/HPF5e282XCc |

Each photo has an `-800.jpg` companion used on small screens.

## Generated in the browser (no image files)

| Visual | Source |
|---|---|
| Home hero "growth ecosystem" and the data field behind dark page headers | `assets/js/scene.js` (Three.js) |
| Six service illustrations | `src/partials/viz-*.html`, `assets/css/visuals.css` |
| Icons | `src/partials/icons.html` (one SVG sprite) |
| Case-study placeholder plates | `src/partials/plate.html` |

## Still to be supplied

- Real project imagery for `assets/images/work/` once case studies are approved.
- A founder portrait, if one should replace the logo plate on the About page.
