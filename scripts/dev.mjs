import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import gradeHandler from '../api/grade.js';

const PROJECT_DIRECTORY = fileURLToPath(new URL('../', import.meta.url));
const VERCEL_CONFIGURATION = JSON.parse(await readFile(path.join(PROJECT_DIRECTORY, 'vercel.json'), 'utf8'));
const STATIC_HEADERS = Object.fromEntries(VERCEL_CONFIGURATION.headers[0].headers.map(({ key, value }) => [key, value]));
const PUBLIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
]);

// A cancellable bridge drains oversized input instead of destroying the HTTP response socket.
function requestBody(incoming) {
  let cleanup;
  return new ReadableStream({
    start(controller) {
      incoming.pause();
      const onData = chunk => {
        controller.enqueue(new Uint8Array(chunk));
        if (controller.desiredSize <= 0) incoming.pause();
      };
      const onEnd = () => { cleanup(); controller.close(); };
      const onError = error => { cleanup(); controller.error(error); };
      const onAborted = () => onError(new Error('Request aborted'));
      cleanup = () => {
        incoming.off('data', onData);
        incoming.off('end', onEnd);
        incoming.off('error', onError);
        incoming.off('aborted', onAborted);
      };
      incoming.on('data', onData);
      incoming.once('end', onEnd);
      incoming.once('error', onError);
      incoming.once('aborted', onAborted);
    },
    pull() { incoming.resume(); },
    cancel() { cleanup(); incoming.resume(); },
  }, { highWaterMark: 1, size: chunk => chunk.byteLength });
}

export function createDevServer({ publicDirectory = path.join(PROJECT_DIRECTORY, 'public') } = {}) {
  return http.createServer(async (incoming, outgoing) => {
    const finishText = (status, message, extra = {}) => {
      outgoing.writeHead(status, {
        ...STATIC_HEADERS,
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        ...extra,
      });
      outgoing.end(incoming.method === 'HEAD' ? undefined : message);
    };
    try {
      const url = new URL(incoming.url ?? '/', 'http://localhost');
      if (url.pathname === '/api/grade') {
        const method = incoming.method ?? 'GET';
        const headers = new Headers();
        for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
          headers.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1]);
        }
        const request = new Request(url, {
          method,
          headers,
          ...(!['GET', 'HEAD'].includes(method) ? { body: requestBody(incoming), duplex: 'half' } : {}),
        });
        const response = await gradeHandler.fetch(request);
        const responseHeaders = new Headers(STATIC_HEADERS);
        response.headers.forEach((value, key) => responseHeaders.set(key, value));
        outgoing.writeHead(response.status, Object.fromEntries(responseHeaders));
        outgoing.end(method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
        incoming.resume();
        return;
      }
      const asset = PUBLIC_FILES.get(url.pathname);
      if (!asset) { finishText(404, 'Not found.'); return; }
      if (!['GET', 'HEAD'].includes(incoming.method)) {
        finishText(405, 'Use GET to open the page.', { Allow: 'GET, HEAD' });
        return;
      }
      try {
        const contents = await readFile(path.join(publicDirectory, asset[0]));
        outgoing.writeHead(200, { ...STATIC_HEADERS, 'Content-Type': asset[1], 'Cache-Control': 'no-store' });
        outgoing.end(incoming.method === 'HEAD' ? undefined : contents);
      } catch (error) {
        if (error.code === 'ENOENT') { finishText(404, 'Not found.'); return; }
        throw error;
      }
    } catch {
      if (!outgoing.headersSent) finishText(500, 'The local server could not complete this request.');
      else outgoing.end();
    }
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--grades-file') {
      throw new Error('Usage: npm run dev -- --grades-file PATH_TO_PRIVATE_JSON');
    }
    try {
      process.env.GRADES_JSON = await readFile(path.resolve(args[1]), 'utf8');
    } catch {
      throw new Error('The private grades file could not be read. Check its path.');
    }
  }
  const portText = process.env.PORT ?? '3000';
  if (!/^\d+$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) {
    throw new Error('PORT must be a number from 1 to 65535.');
  }
  const server = createDevServer();
  server.on('error', () => { console.error('The local server could not start. Check that the port is available.'); process.exitCode = 1; });
  server.listen(Number(portText), '127.0.0.1', () => {
    console.log(`Grade lookup is running at http://127.0.0.1:${Number(portText)}`);
    if (!process.env.GRADES_JSON) console.log('GRADES_JSON is not set; grade lookup will be unavailable until configured.');
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}


