import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./', import.meta.url));
const dist = fileURLToPath(new URL('./dist/', import.meta.url));

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(new URL('./index.html', import.meta.url), new URL('./dist/index.html', import.meta.url));
await cp(new URL('./privacy.html', import.meta.url), new URL('./dist/privacy.html', import.meta.url));
await cp(new URL('./terms.html', import.meta.url), new URL('./dist/terms.html', import.meta.url));
await cp(new URL('./cookies.html', import.meta.url), new URL('./dist/cookies.html', import.meta.url));
await cp(new URL('./src/', import.meta.url), new URL('./dist/src/', import.meta.url), { recursive: true });

console.log('Build complete: dist/');
