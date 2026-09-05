#!/usr/bin/env node
// Push öncesi SEO, güvenlik ve mobil uyumluluk kontrolleri.
// Bağımlılık gerektirmez; sadece Node.js'in yerleşik fs modülünü kullanır.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = process.cwd();
const errors = [];
const warnings = [];

function findFiles(dir, ext, list = []) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules' || entry === 'scripts') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) findFiles(full, ext, list);
    else if (extname(entry) === ext) list.push(full);
  }
  return list;
}

const htmlFiles = findFiles(root, '.html');
const cssFiles = findFiles(root, '.css');
const jsFiles = findFiles(root, '.js').filter((f) => !f.endsWith('pre-push-check.mjs'));

// ---------- SEO ----------
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const rel = file.replace(root + '/', '');

  if (!/<title>[^<]{5,}<\/title>/i.test(html)) errors.push(`[SEO] ${rel}: <title> etiketi eksik veya çok kısa`);
  const descMatch = html.match(/<meta\s+name=["']description["']\s+content=(["'])(.*?)\1/i);
  if (!descMatch || descMatch[2].length < 20) errors.push(`[SEO] ${rel}: meta description eksik veya çok kısa`);
  if (!/<html[^>]+lang=/i.test(html)) errors.push(`[SEO] ${rel}: <html> etiketinde lang özniteliği eksik`);
  if (!/<link[^>]+rel=["']canonical["']/i.test(html)) warnings.push(`[SEO] ${rel}: canonical link etiketi eksik`);
  if (!/<meta[^>]+property=["']og:title["']/i.test(html)) warnings.push(`[SEO] ${rel}: og:title (Open Graph) etiketi eksik`);

  const imgTags = html.match(/<img[^>]*>/gi) || [];
  for (const img of imgTags) {
    if (!/alt=["'][^"']*["']/i.test(img)) errors.push(`[SEO] ${rel}: <img> etiketinde alt özniteliği eksik -> ${img.slice(0, 60)}`);
  }
}

if (!existsSync(join(root, 'robots.txt'))) errors.push('[SEO] robots.txt dosyası bulunamadı');
if (!existsSync(join(root, 'sitemap.xml'))) warnings.push('[SEO] sitemap.xml dosyası bulunamadı');

// ---------- Mobil Uyumluluk ----------
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const rel = file.replace(root + '/', '');
  if (!/<meta\s+name=["']viewport["']/i.test(html)) errors.push(`[Mobil] ${rel}: viewport meta etiketi eksik`);
}

let mediaQueryCount = 0;
for (const file of cssFiles) {
  const css = readFileSync(file, 'utf8');
  mediaQueryCount += (css.match(/@media/gi) || []).length;
}
if (mediaQueryCount === 0) errors.push('[Mobil] Hiçbir CSS dosyasında @media sorgusu bulunamadı (responsive tasarım kontrolü)');

// ---------- Güvenlik ----------
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const rel = file.replace(root + '/', '');

  // target=_blank olan linkler rel=noopener içermeli (reverse tabnabbing koruması)
  const blankLinks = html.match(/<a[^>]+target=["']_blank["'][^>]*>/gi) || [];
  for (const link of blankLinks) {
    if (!/rel=["'][^"']*noopener/i.test(link)) {
      errors.push(`[Güvenlik] ${rel}: target="_blank" linkinde rel="noopener" eksik -> ${link.slice(0, 60)}`);
    }
  }

  // Inline event handler kullanımı (onclick=, onload= vb.)
  const inlineHandlers = html.match(/\son[a-z]+=["']/gi) || [];
  if (inlineHandlers.length > 0) {
    warnings.push(`[Güvenlik] ${rel}: ${inlineHandlers.length} adet inline event handler bulundu (onclick vb.), harici JS tercih edilmeli`);
  }

  // http:// (mixed content) referansları
  const httpRefs = html.match(/(src|href)=["']http:\/\/[^"']+["']/gi) || [];
  if (httpRefs.length > 0) {
    errors.push(`[Güvenlik] ${rel}: güvensiz http:// kaynak referansı bulundu (mixed content riski)`);
  }
}

// Basit gizli anahtar / secret taraması
const secretPattern = /(api[_-]?key|secret|password|token)\s*[:=]\s*["'][A-Za-z0-9_\-]{8,}["']/gi;
for (const file of [...htmlFiles, ...cssFiles, ...jsFiles]) {
  const content = readFileSync(file, 'utf8');
  const rel = file.replace(root + '/', '');
  const matches = content.match(secretPattern);
  if (matches) errors.push(`[Güvenlik] ${rel}: olası gizli anahtar/parola tespit edildi -> ${matches[0]}`);
}

// ---------- Sonuç ----------
if (warnings.length) {
  console.log('\nUYARILAR:');
  for (const w of warnings) console.log('  ⚠️  ' + w);
}

if (errors.length) {
  console.log('\nHATALAR (push engellendi):');
  for (const e of errors) console.log('  ❌ ' + e);
  console.log(`\n${errors.length} hata bulundu. Lütfen düzeltip tekrar deneyin.\n`);
  process.exit(1);
}

console.log('\n✅ SEO, güvenlik ve mobil uyumluluk kontrolleri başarılı.\n');
