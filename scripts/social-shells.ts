import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { renderPreviewPng } from '../functions-social/src/card.ts';
import { injectSocialMeta, resolvePreview, staticImageFile, staticShellPaths } from '../src/socialPreview.ts';

const dist = 'dist';
const html = await readFile(join(dist, 'index.html'), 'utf8');
const paths = staticShellPaths();
const queue = [...paths];

await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const path = queue.shift();
    if (!path) return;
    const preview = resolvePreview(path);
    const page = path === '/' ? join(dist, 'index.html') : join(dist, path.slice(1), 'index.html');
    await mkdir(dirname(page), { recursive: true });
    await writeFile(page, injectSocialMeta(html, preview));
    const image = join(dist, 'og', staticImageFile(path));
    await mkdir(dirname(image), { recursive: true });
    await writeFile(image, await renderPreviewPng(preview));
  }
}));

await mkdir(join('functions-social', 'shell'), { recursive: true });
await writeFile(join('functions-social', 'shell', 'index.html'), await readFile(join(dist, 'index.html'), 'utf8'));
console.log(`Wrote ${paths.length} link previews.`);
