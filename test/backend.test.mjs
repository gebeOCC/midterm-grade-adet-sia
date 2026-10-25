import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import gradeHandler from '../api/grade.js';
import { normalizeStudentId } from '../lib/grades.js';
import { createDevServer } from '../scripts/dev.mjs';

// Entirely fictional records: this test file can be committed publicly.
const STUDENT = Object.freeze({
    id: '2099-1-00001',
    lastName: 'Example',
    firstName: 'Student One',
    middleInitial: 'A.',
    section: '3C',
    subject: 'Example Subject',
    grade: '1.0',
});
const SECOND = Object.freeze({ ...STUDENT, id: '2099-1-000002', firstName: 'Student Two', middleInitial: '', grade: '2.0' });
const initialEnvironment = process.env.GRADES_JSON;
beforeEach(() => configure());
after(() => {
    if (initialEnvironment === undefined) delete process.env.GRADES_JSON;
    else process.env.GRADES_JSON = initialEnvironment;
});

function configure(records = [STUDENT, SECOND]) {
    process.env.GRADES_JSON = JSON.stringify(records);
}

function request(body, options = {}) {
    const { headers = {}, method = 'POST' } = options;
    return new Request('http://localhost/api/grade', {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        ...(!['GET', 'HEAD'].includes(method) && body !== undefined
            ? { body: typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body) }
            : {}),
    });
}

function lookup(studentId = STUDENT.id, options) {
    return gradeHandler.fetch(request({ studentId }, options));
}

function assertPrivateResponse(response) {
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('cdn-cache-control'), 'no-store');
    assert.equal(response.headers.get('vercel-cdn-cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(response.headers.get('content-type'), /^application\/json/);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
}

test('returns only the matching record and preserves decimal grade strings', async () => {
    configure();
    const response = await lookup();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { record: STUDENT });
    assertPrivateResponse(response);
});

test('accepts compact IDs, whitespace and supported Unicode dash variants', async t => {
    configure();
    for (const id of ['2099100001', ' 2099 - 1 - 00001 ', '2099\u20111\u201100001', '2099\u20141\u221200001', '2099\uff0d1\uff0d00001']) {
        await t.test(id, async () => {
            const response = await lookup(id);
            assert.equal(response.status, 200);
            assert.deepEqual(await response.json(), { record: STUDENT });
        });
    }
});

test('accepts supplied eleven-digit IDs and empty middle initials', async () => {
    configure();
    const response = await lookup('20991000002');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { record: SECOND });
});

test('unknown IDs return no record, roster, suggestions or count', async () => {
    configure();
    const response = await lookup('2099-1-99999');
    assert.equal(response.status, 404);
    assert.deepEqual(Object.keys(await response.json()), ['error']);
    assertPrivateResponse(response);
});

test('rejects invalid IDs rather than stripping arbitrary characters', async t => {
    configure();
    for (const id of ['', null, 2099100001, [], {}, '2099a1a00001', '2099/1/00001', '209910001', '209910000001', '２０９９１００００１', ' '.repeat(81) + STUDENT.id]) {
        await t.test(JSON.stringify(id), async () => {
            const response = await lookup(id);
            assert.equal(response.status, 400);
            assertPrivateResponse(response);
        });
    }
    assert.equal(normalizeStudentId(STUDENT.id), '2099100001');
});

test('rejects malformed or ambiguous request shapes', async t => {
    configure();
    for (const body of ['{', '', 'null', '[]', '"2099100001"', '{}', '{"studentId":"2099100001","all":true}', '{"id":"2099100001"}']) {
        await t.test(JSON.stringify(body), async () => {
            assert.equal((await gradeHandler.fetch(request(body))).status, 400);
        });
    }
    assert.equal((await gradeHandler.fetch(request(undefined))).status, 400);
});

test('rejects invalid UTF-8 instead of silently replacing bytes', async () => {
    configure();
    assert.equal((await gradeHandler.fetch(request(new Uint8Array([0xff, 0xfe])))).status, 400);
});

test('requires POST and advertises the supported method', async t => {
    configure();
    for (const method of ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS']) {
        await t.test(method, async () => {
            const response = await gradeHandler.fetch(request(undefined, { method }));
            assert.equal(response.status, 405);
            assert.equal(response.headers.get('allow'), 'POST');
            assertPrivateResponse(response);
        });
    }
});

test('requires application/json and accepts its charset parameter', async () => {
    configure();
    const rejected = await lookup(STUDENT.id, { headers: { 'Content-Type': 'text/plain' } });
    assert.equal(rejected.status, 415);
    assertPrivateResponse(rejected);
    assert.equal((await lookup(STUDENT.id, { headers: { 'Content-Type': 'Application/JSON; charset=utf-8' } })).status, 200);
});

test('accepts exactly 512 bytes and rejects a declared larger body', async () => {
    configure();
    const valid = JSON.stringify({ studentId: STUDENT.id }).padEnd(512, ' ');
    assert.equal((await gradeHandler.fetch(request(valid, { headers: { 'Content-Length': '512' } }))).status, 200);
    const response = await gradeHandler.fetch(request(valid, { headers: { 'Content-Length': '513' } }));
    assert.equal(response.status, 413);
    assertPrivateResponse(response);
    assert.equal((await gradeHandler.fetch(request(valid, { headers: { 'Content-Length': 'invalid' } }))).status, 400);
});

test('enforces the byte limit on streamed bodies without Content-Length', async () => {
    configure();
    let cancelled = false;
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(new Uint8Array(300).fill(32));
            controller.enqueue(new Uint8Array(213).fill(32));
        },
        cancel() { cancelled = true; },
    });
    const response = await gradeHandler.fetch(new Request('http://localhost/api/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: stream,
        duplex: 'half',
    }));
    assert.equal(response.status, 413);
    assert.equal(cancelled, true);
    assertPrivateResponse(response);
});

test('fails closed for missing, invalid or non-array server configuration', async t => {
    for (const source of [undefined, '', '{SECRET_DATA', '{}', '[]', 'null']) {
        await t.test(String(source), async () => {
            if (source === undefined) delete process.env.GRADES_JSON;
            else process.env.GRADES_JSON = source;
            const response = await lookup();
            assert.equal(response.status, 503);
            assert.deepEqual(await response.json(), { error: 'Grade lookup is temporarily unavailable. Please try again later.' });
            assertPrivateResponse(response);
        });
    }
});

test('one malformed record disables the entire roster', async t => {
    for (const invalid of [
        { ...SECOND, grade: 2 },
        { ...SECOND, grade: '0.9' },
        { ...SECOND, grade: '5.1' },
        { ...SECOND, grade: '2' },
        { ...SECOND, grade: '2.00' },
        { ...SECOND, firstName: '' },
        { ...SECOND, middleInitial: null },
        { ...SECOND, subject: 'x'.repeat(181) },
        { ...SECOND, id: 'not-an-id' },
        { ...SECOND, privateNote: 'SECRET_DATA' },
        null,
    ]) {
        await t.test(JSON.stringify(invalid), async () => {
            configure([STUDENT, invalid]);
            const response = await lookup();
            assert.equal(response.status, 503);
            assert.equal((await response.text()).includes('SECRET_DATA'), false);
        });
    }
});

test('normalized duplicate IDs disable the entire roster', async () => {
    configure([STUDENT, { ...SECOND, id: '2099\u20141\u201400001' }]);
    assert.equal((await lookup()).status, 503);
});

test('refreshes valid and invalid caches when GRADES_JSON changes', async () => {
    configure();
    assert.equal((await lookup()).status, 200);
    process.env.GRADES_JSON = 'broken';
    assert.equal((await lookup()).status, 503);
    assert.equal((await lookup()).status, 503);
    configure([{ ...STUDENT, grade: '3.5' }]);
    assert.equal((await (await lookup()).json()).record.grade, '3.5');
});

test('local server exposes only public assets and the grade endpoint', async t => {
    configure();
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'midterm-grade-test-'));
    const publicDirectory = path.join(temporaryDirectory, 'public');
    await mkdir(publicDirectory);
    await Promise.all([
        writeFile(path.join(publicDirectory, 'index.html'), '<!doctype html><title>Test page</title>'),
        writeFile(path.join(publicDirectory, 'app.js'), '/* Example only */'),
        writeFile(path.join(publicDirectory, 'styles.css'), 'body { color: black; }'),
        writeFile(path.join(temporaryDirectory, 'private-grades.json'), 'SECRET_DATA'),
    ]);
    const server = createDevServer({ publicDirectory });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    t.after(async () => {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        // Verify the target stays inside the OS temporary directory before recursive cleanup.
        const resolved = path.resolve(temporaryDirectory);
        const temporaryRoot = path.resolve(os.tmpdir()) + path.sep;
        assert.ok(resolved.startsWith(temporaryRoot) && path.basename(resolved).startsWith('midterm-grade-test-'));
        await rm(resolved, { recursive: true, force: true });
    });

    for (const asset of ['/', '/index.html', '/app.js', '/styles.css']) {
        await t.test(`serves ${asset}`, async () => {
            const response = await fetch(baseUrl + asset);
            assert.equal(response.status, 200);
            assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
            await response.text();
        });
    }
    for (const hidden of ['/api/grade.js', '/lib/grades.js', '/private-grades.json', '/.env', '/package.json', '/vercel.json', '/scripts/dev.mjs', '/test/backend.test.mjs', '/public/index.html', '/%2e%2e/private-grades.json']) {
        await t.test(`hides ${hidden}`, async () => {
            const response = await fetch(baseUrl + hidden);
            assert.equal(response.status, 404);
            assert.equal((await response.text()).includes('SECRET_DATA'), false);
        });
    }
    const response = await fetch(baseUrl + '/api/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: STUDENT.id }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { record: STUDENT });
    assertPrivateResponse(response);

    const methodResponse = await fetch(baseUrl + '/api/grade');
    assert.equal(methodResponse.status, 405);
    assert.equal(methodResponse.headers.get('allow'), 'POST');
    await methodResponse.text();

    // Native http writes force chunked encoding, exercising the dev adapter's cancellation path.
    const oversize = await new Promise((resolve, reject) => {
        const outgoing = http.request(baseUrl + '/api/grade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        }, incoming => {
            incoming.resume();
            incoming.once('end', () => resolve(incoming.statusCode));
        });
        outgoing.once('error', reject);
        outgoing.write(' '.repeat(300));
        outgoing.end(' '.repeat(213));
    });
    assert.equal(oversize, 413);
});



