import { findGrade, normalizeStudentId } from '../lib/grades.js';

const MAX_BODY_BYTES = 512;
const RESPONSE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

function json(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), { status, headers: { ...RESPONSE_HEADERS, ...headers } });
}

class BodyTooLarge extends Error {}

async function readJson(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Invalid body');
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        throw new BodyTooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') {
      return json(405, { error: 'Use POST to look up a grade.' }, { Allow: 'POST' });
    }
    const mediaType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
    if (mediaType !== 'application/json') {
      return json(415, { error: 'Send the student ID as JSON.' });
    }
    const contentLength = request.headers.get('content-length');
    if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_BODY_BYTES)) {
      return json(/^\d+$/.test(contentLength) ? 413 : 400, { error: 'Invalid request body.' });
    }
    let body;
    try {
      body = await readJson(request);
    } catch (error) {
      return json(error instanceof BodyTooLarge ? 413 : 400, { error: 'Invalid request body.' });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)
        || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'studentId')) {
      return json(400, { error: 'Enter a valid student ID.' });
    }
    const normalizedId = normalizeStudentId(body.studentId);
    if (!normalizedId) return json(400, { error: 'Enter a valid student ID.' });
    let record;
    try {
      record = findGrade(normalizedId);
    } catch {
      return json(503, { error: 'Grade lookup is temporarily unavailable. Please try again later.' });
    }
    if (!record) return json(404, { error: 'No grade was found for this student ID.' });
    return json(200, { record });
  },
};

