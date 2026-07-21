import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const publicRoot = new URL('../site/public/', import.meta.url);

test('BellField publishes canonical crawler assets', async () => {
  const [index, robots, sitemap] = await Promise.all([
    readFile(new URL('index.html', publicRoot), 'utf8'),
    readFile(new URL('robots.txt', publicRoot), 'utf8'),
    readFile(new URL('sitemap.xml', publicRoot), 'utf8')
  ]);

  assert.match(index, /<link rel="canonical" href="https:\/\/bellfield\.app\/" \/>/);
  assert.match(robots, /^User-agent: \*\r?\nAllow: \/\r?\n/m);
  assert.match(robots, /Sitemap: https:\/\/bellfield\.app\/sitemap\.xml/);
  assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.deepEqual(
    [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]),
    ['https://bellfield.app/']
  );
});
