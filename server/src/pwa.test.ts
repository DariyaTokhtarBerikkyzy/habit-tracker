import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/public');
const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, 'manifest.webmanifest'), 'utf8'));

// PNG: сигнатура и размеры в заголовке IHDR.
function pngSize(file: string) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${file} не PNG`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

test('манифест: обязательные поля для установки на телефон', () => {
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.ok(manifest.name && manifest.short_name);
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
  assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
});

test('манифест: иконки 192 и 512 px существуют и имеют заявленный размер', () => {
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  for (const icon of manifest.icons as { src: string; sizes: string }[]) {
    const { width, height } = pngSize(path.join(publicDir, icon.src));
    assert.equal(`${width}x${height}`, icon.sizes, icon.src);
  }
  assert.ok((manifest.icons as { purpose: string }[]).some((i) => i.purpose === 'maskable'));
});

test('apple-touch-icon 180×180 для iPhone', () => {
  assert.deepEqual(pngSize(path.join(publicDir, 'apple-touch-icon.png')), { width: 180, height: 180 });
});

test('index.html подключает манифест и иконку для iPhone', () => {
  const html = fs.readFileSync(path.resolve(publicDir, '../index.html'), 'utf8');
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon"/);
  assert.match(html, /name="theme-color"/);
});

test('Service Worker кэширует оболочку, но не запросы к API', () => {
  const sw = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
  assert.match(sw, /addEventListener\('fetch'/);
  assert.match(sw, /startsWith\('\/api\/'\)/);
  assert.match(sw, /addEventListener\('push'/);
});
