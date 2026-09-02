/**
 * build.js
 * ----------------------------------------------------------------------
 * این اسکریپت رو GitHub Actions به‌صورت خودکار اجرا می‌کنه (و می‌تونی خودت هم
 * دستی با `node scripts/build.js` اجرا کنی).
 *
 * کارهایی که انجام می‌ده:
 *   ۱. فایل data/listings.json رو می‌خونه (لیست همه‌ی آگهی‌ها)
 *   ۲. برای هر آگهی که "slug" نداره، یه اسلاگ (لینک اختصاصی) از روی
 *      عنوانش می‌سازه و به خودِ فایل listings.json برمی‌گردونه (ذخیره می‌کنه)
 *   ۳. برای هر آگهی یک صفحه‌ی HTML مستقل و قابل ایندکس در گوگل، داخل
 *      پوشه‌ی ad/ می‌سازه (عنوان، توضیحات، canonical و JSON-LD مخصوص خودش)
 *   ۴. sitemap.xml و robots.txt رو به‌روز می‌کنه
 *
 * یعنی تو فقط کافیه آگهی جدید رو به data/listings.json اضافه کنی و پوش
 * کنی؛ بقیه‌ش (لینک‌سازی، صفحه‌سازی، sitemap) خودکاره.
 * ----------------------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE_URL = 'https://kareava.ir';
const LISTINGS_PATH = path.join(ROOT, 'data', 'listings.json');
const AD_DIR = path.join(ROOT, 'ad');
// عکس آگهی‌ها همون‌جایی هستن که index.html هست (پوشه‌ی اصلی سایت) — دقیقاً
// مثل چیزی که در کارت‌های index.html استفاده می‌شه: url('${l.img}')
const IMG_BASE = SITE_URL + '/';
const IMG_REL = '../'; // چون صفحات ad/*.html یک پوشه پایین‌تر از ریشه هستن

const CATEGORIES = {
  construction: 'ساختمان و تاسیسات',
  auto: 'خودرو و تعمیرگاه',
  beauty: 'آرایشی و زیبایی',
  tech: 'کامپیوتر، موبایل و فناوری',
  home: 'خدمات منزل و نظافت',
  education: 'آموزش و تدریس',
  food: 'خوراک، کیترینگ و قنادی',
  art: 'هنر، صنایع دستی و طراحی',
  health: 'سلامت و پزشکی',
  other: 'سایر مشاغل'
};

/* ---------- تبدیل عنوان فارسی به یک اسلاگ (بخش انتهایی لینک) ---------- */
function slugify(title, city) {
  let s = (title + ' ' + (city || '')).trim();
  // حذف نویسه‌های نامناسب برای URL؛ حروف فارسی/عربی و اعداد و فاصله نگه داشته می‌شن
  s = s.replace(/[^\u0600-\u06FF0-9a-zA-Z\s-]/g, '');
  s = s.trim().replace(/\s+/g, '-');
  s = s.replace(/-+/g, '-');
  // طول لینک رو معقول نگه می‌داریم؛ هم برای زیبایی URL هم چون بعضی سیستم‌فایل‌ها
  // (از جمله بعضی هاست‌ها) روی طول بایتی نام فایل محدودیت دارن (فارسی هر حرف ۲ بایته)
  s = truncateBytes(s, 90);
  return s || 'agahi';
}

// برش امن یک رشته‌ی UTF-8 طوری که از N بایت بیشتر نشه و وسط یک کاراکتر قطع نشه
function truncateBytes(str, maxBytes) {
  let buf = Buffer.from(str, 'utf8');
  if (buf.length <= maxBytes) return str;
  buf = buf.slice(0, maxBytes);
  // اگر وسط یک کاراکتر چندبایتی بریده شده، از انتها کم می‌کنیم تا معتبر باشه
  let out = buf.toString('utf8');
  while (out.includes('\uFFFD')) {
    buf = buf.slice(0, buf.length - 1);
    out = buf.toString('utf8');
  }
  return out.replace(/-+$/, '');
}

function uniqueSlug(base, id, used) {
  let slug = base;
  if (used.has(slug)) slug = `${base}-${id}`;
  let n = 2;
  while (used.has(slug)) { slug = `${base}-${id}-${n}`; n++; }
  used.add(slug);
  return slug;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function truncate(str, n) {
  str = String(str || '').replace(/\s+/g, ' ').trim();
  return str.length > n ? str.slice(0, n - 1).trim() + '…' : str;
}

function fmtPrice(p) {
  if (!p || p === 0) return 'توافقی';
  return Number(p).toLocaleString('fa-IR') + ' تومان';
}

/* ---------- خواندن آگهی‌ها ---------- */
if (!fs.existsSync(LISTINGS_PATH)) {
  console.error('data/listings.json پیدا نشد!');
  process.exit(1);
}
const listings = JSON.parse(fs.readFileSync(LISTINGS_PATH, 'utf8'));

const usedSlugs = new Set(listings.filter(l => l.slug).map(l => l.slug));
let changed = false;
for (const l of listings) {
  if (!l.slug) {
    const base = slugify(l.title, l.city);
    l.slug = uniqueSlug(base, l.id, usedSlugs);
    changed = true;
    console.log(`لینک جدید ساخته شد: /ad/${l.slug}.html  (برای «${l.title}»)`);
  }
  if (!l.createdAt) { l.createdAt = Date.now(); changed = true; }
}

if (changed) {
  fs.writeFileSync(LISTINGS_PATH, JSON.stringify(listings, null, 2), 'utf8');
  console.log('data/listings.json به‌روزرسانی شد.');
}

/* ---------- ساخت پوشه‌ی ad ---------- */
if (!fs.existsSync(AD_DIR)) fs.mkdirSync(AD_DIR, { recursive: true });

const pageTemplate = (l) => {
  const catLabel = CATEGORIES[l.category] || 'سایر مشاغل';
  const title = `${l.title} در ${l.city} | کار اوا`;
  const desc = truncate(l.desc || l.title, 155);
  const url = `${SITE_URL}/ad/${l.slug}.html`;
  const img = l.img ? IMG_BASE + l.img : `${SITE_URL}/logo-social.png`; // برای og:image باید آدرس کامل باشه
  const imgSrc = l.img ? IMG_REL + l.img : ''; // برای <img src> داخل خود صفحه، نسبیه

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="کار اوا">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img}">
<meta property="og:locale" content="fa_IR">
<link rel="icon" href="../favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="../apple-touch-icon.png">
<link rel="stylesheet" href="../styles.css">
<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Service",
  "name": l.title,
  "description": l.desc || l.title,
  "areaServed": l.city,
  "category": catLabel,
  "url": url,
  "image": img,
  "provider": {
    "@type": "LocalBusiness",
    "name": l.title,
    "address": { "@type": "PostalAddress", "addressLocality": l.city, "addressCountry": "IR" },
    "telephone": l.phone ? ("+98" + String(l.phone).replace(/^0/, '')) : undefined
  },
  "offers": {
    "@type": "Offer",
    "price": l.price || 0,
    "priceCurrency": "IRR",
    "availability": "https://schema.org/InStock"
  }
}, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "کار اوا", "item": SITE_URL + "/" },
    { "@type": "ListItem", "position": 2, "name": catLabel, "item": SITE_URL + "/?cat=" + l.category },
    { "@type": "ListItem", "position": 3, "name": l.title, "item": url }
  ]
}, null, 2)}
</script>
</head>
<body class="ad-page">
<header class="ad-header">
  <a class="ad-logo" href="../index.html"><img src="../logo-icon-1024.png" alt="کار اوا" class="logo-img">کار اوا</a>
  <a class="ad-back" href="../index.html">← بازگشت به همه‌ی آگهی‌ها</a>
</header>

<main class="ad-main">
  <nav class="ad-breadcrumb" aria-label="مسیر صفحه">
    <a href="../index.html">کار اوا</a> ›
    <a href="../index.html?cat=${l.category}">${escapeHtml(catLabel)}</a> ›
    <span>${escapeHtml(l.title)}</span>
  </nav>

  <article class="ad-card">
    ${l.img ? `<img class="ad-img" src="${imgSrc}" alt="${escapeHtml(l.title)}" loading="lazy">` : `<div class="ad-img ad-img-empty">بدون عکس</div>`}
    <span class="ad-cat">${escapeHtml(catLabel)}</span>
    <h1 class="ad-title">${escapeHtml(l.title)}</h1>
    <div class="ad-price">${fmtPrice(l.price)}</div>
    <div class="ad-meta"><span>📍 ${escapeHtml(l.city)}</span></div>
    <p class="ad-desc">${escapeHtml(l.desc || '')}</p>

    <div class="ad-phone-box">
      <div class="ad-phone-label">شماره تماس برای سفارش و همکاری</div>
      ${l.phone
        ? `<a class="ad-phone-link" href="tel:${l.phone}" dir="ltr">${l.phone}</a>`
        : `<div class="ad-phone-empty">شماره تماسی برای این کسب‌وکار ثبت نشده</div>`}
    </div>

    <a class="ad-cta" href="../index.html">مشاهده‌ی همه‌ی آگهی‌های ${escapeHtml(catLabel)}</a>
  </article>
</main>

<footer class="ad-footer">کار اوا — بازارچه معرفی کسب‌وکار، اصناف و صاحبان حرفه در سراسر ایران · <a href="../support.html">پشتیبانی</a></footer>
</body>
</html>
`;
};

for (const l of listings) {
  const filePath = path.join(AD_DIR, `${l.slug}.html`);
  fs.writeFileSync(filePath, pageTemplate(l), 'utf8');
}
console.log(`${listings.length} صفحه‌ی آگهی در ad/ ساخته/به‌روزرسانی شد.`);

/* ---------- sitemap.xml ---------- */
const staticUrls = [
  { loc: `${SITE_URL}/`, priority: '1.0' },
  { loc: `${SITE_URL}/support.html`, priority: '0.4' },
  { loc: `${SITE_URL}/post-ad.html`, priority: '0.6' },
  { loc: `${SITE_URL}/pro-ad.html`, priority: '0.6' }
];
const catUrls = Object.keys(CATEGORIES).map(c => ({ loc: `${SITE_URL}/?cat=${c}`, priority: '0.5' }));
const adUrls = listings.map(l => ({
  loc: `${SITE_URL}/ad/${l.slug}.html`,
  priority: '0.8',
  lastmod: new Date(l.createdAt || Date.now()).toISOString().slice(0, 10)
}));

const allUrls = [...staticUrls, ...catUrls, ...adUrls];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(u => `  <url>
    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap, 'utf8');
console.log('sitemap.xml ساخته شد با', allUrls.length, 'آدرس.');

/* ---------- robots.txt ---------- */
const robots = `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;
fs.writeFileSync(path.join(ROOT, 'robots.txt'), robots, 'utf8');
console.log('robots.txt ساخته شد.');
