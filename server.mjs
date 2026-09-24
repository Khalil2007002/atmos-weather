import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import apiHandler from './api/[...path].js';

if (existsSync('.env')) {
  try {
    process.loadEnvFile('.env');
  } catch {
    // Ignore if not formatted or already loaded
  }
}

const rootDirectory = fileURLToPath(new URL(process.argv.includes('--dist') ? './dist/' : './', import.meta.url));
const port = Number(process.env.PORT || 4173);
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};
const legalRoutes = new Map([
  ['/privacy', 'privacy.html'],
  ['/terms', 'terms.html'],
  ['/cookies', 'cookies.html'],
]);

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`);
  if (requestUrl.pathname.startsWith('/api/')) {
    await apiHandler(request, response);
    return;
  }

  const requestedFile = legalRoutes.get(requestUrl.pathname)
    || (requestUrl.pathname === '/' ? 'index.html' : requestUrl.pathname.replace(/^\/+/, ''));
  if (requestedFile.startsWith('data/')) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  const filePath = resolve(rootDirectory, normalize(requestedFile));
  if (!filePath.startsWith(rootDirectory) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Atmos is running at http://127.0.0.1:${port}`);
});
