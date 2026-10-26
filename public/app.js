'use strict';
// One result from your existing server; no roster in the browser.
const normalizeId = value => String(value).replace(/[\s\u00a0\-\u2010-\u2015\u2212\ufe58\ufe63\uff0d]/g, '');
const $ = id => document.getElementById(id);
const form = $('lookup-form'), input = $('student-id'), revealButton = $('reveal-button');
const loading = $('loading'), result = $('result'), notFound = $('not-found'), requestError = $('request-error');
const validationError = $('validation-error'), stage = $('envelope-stage');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const activeAnimations = new Set();
const REVEAL_DELAY_MIN_MS = 4000;
const REVEAL_DELAY_MAX_MS = 6000;
let state = 'idle', confettiTimer;
reduceMotion.addEventListener('change', event => {
    if (!event.matches) return;
    activeAnimations.forEach(animation => animation.finish());
    $('confetti').replaceChildren();
});
// The suspense timing applies independently of motion preferences.
function waitForReveal(ms) {
    return ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve();
}
async function animate(element, frames, duration, easing = 'ease-out', fadeOnly = false) {
    if (typeof element.animate !== 'function' || (reduceMotion.matches && !fadeOnly)) return;
    const animation = element.animate(frames, { duration: reduceMotion.matches ? 120 : duration, easing });
    activeAnimations.add(animation);
    try { await animation.finished; } catch { /* Canceled effects must not block lookup. */ }
    finally { activeAnimations.delete(animation); }
}
function clearValidation() {
    validationError.hidden = true; validationError.textContent = ''; input.removeAttribute('aria-invalid');
}
input.addEventListener('input', clearValidation);
function clearResult() {
    clearTimeout(confettiTimer);
    for (const id of ['result-section', 'result-heading', 'result-name', 'result-id', 'result-grade', 'result-subject', 'envelope-grade']) $(id).textContent = '';
    result.hidden = true; $('confetti').replaceChildren(); stage.dataset.phase = 'waiting';
}
function celebrate() {
    if (reduceMotion.matches) return;
    const container = $('confetti'), colors = ['#a6c48b', '#eeb27c', '#d6dbb0', '#577a50'];
    container.replaceChildren();
    for (let n = 0; n < 16; n++) {
        const piece = document.createElement('i');
        piece.style.background = colors[n % colors.length]; piece.style.left = `${15 + Math.random() * 70}%`;
        piece.style.setProperty('--drift', `${-55 + Math.random() * 110}px`);
        piece.style.setProperty('--turn', `${-240 + Math.random() * 480}deg`);
        piece.style.animationDelay = `${n * .018}s`; container.appendChild(piece);
    }
    clearTimeout(confettiTimer); confettiTimer = setTimeout(() => container.replaceChildren(), 1800);
}
function resetLookup(clearInput) {
    if (state === 'searching') return;
    state = 'idle'; loading.hidden = true; notFound.hidden = true; requestError.hidden = true;
    $('request-error-copy').textContent = ''; $('not-found-id').textContent = ''; clearResult();
    form.hidden = false; form.removeAttribute('aria-busy'); revealButton.disabled = false;
    if (clearInput) input.value = '';
    clearValidation(); input.focus({ preventScroll: true }); if (!clearInput) input.select();
}
$('another-button').addEventListener('click', () => resetLookup(true));
$('retry-button').addEventListener('click', () => resetLookup(false));
$('network-retry-button').addEventListener('click', () => resetLookup(false));
function revealResult(record) {
    $('result-section').textContent = `Section ${record.section}`;
    $('result-heading').textContent = `Here you go, ${record.firstName.trim().split(/\s+/)[0]}.`;
    $('result-name').textContent = `${record.firstName} ${record.middleInitial ? record.middleInitial + ' ' : ''}${record.lastName}`;
    $('result-id').textContent = record.id; $('result-grade').textContent = record.grade; $('result-subject').textContent = record.subject;
    result.hidden = false; result.focus({ preventScroll: true });
    if (reduceMotion.matches) void animate(result, [{ opacity: 0 }, { opacity: 1 }], 120, 'ease-out', true);
    else void animate(result, [
        { opacity: 0, transform: 'translateY(12px) scale(.98)' },
        { opacity: 1, transform: 'translateY(-3px) scale(1.005)', offset: .72 },
        { opacity: 1, transform: 'translateY(0) scale(1)' }
    ], 350);
    celebrate();
}
async function requestGrade(studentId) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
        const response = await fetch('/api/grade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId }),
            cache: 'no-store',
            credentials: 'same-origin',
            signal: controller.signal
        });
        if (response.status === 404) return { kind: 'not-found' };
        if (!response.ok) {
            return {
                kind: 'error', message: response.status === 400
                    ? 'Please check your full student ID and try again.'
                    : 'The grade service is temporarily unavailable. Please try again later.'
            };
        }
        const payload = await response.json();
        const record = payload && payload.record;
        const fields = ['id', 'lastName', 'firstName', 'middleInitial', 'section', 'subject', 'grade'];
        if (!record || !fields.every(field => typeof record[field] === 'string') ||
            normalizeId(record.id) !== normalizeId(studentId) || !record.firstName.trim() || !/^(?:[1-4]\.\d|5\.0)$/.test(record.grade)) {
            return { kind: 'error', message: 'We couldn’t read your result. Please try again.' };
        }
        return { kind: 'found', record };
    } catch (error) {
        return {
            kind: 'error', message: error && error.name === 'AbortError'
                ? 'The grade lookup took too long. Please try again.'
                : 'We couldn’t reach the grade service. Check your connection and try again.'
        };
    } finally {
        clearTimeout(timeout);
    }
}


async function openEnvelope(record) {
    if (reduceMotion.matches) return;
    $('loading-title').textContent = 'A little reveal, just for you.';
    $('loading-copy').textContent = 'Opening your midterm envelope…';
    $('envelope-grade').textContent = record.grade; // Always the actual result.
    stage.dataset.phase = 'wiggling';
    await animate($('envelope'), [
        { transform: 'rotate(0)' }, { transform: 'rotate(-6deg)', offset: .2 },
        { transform: 'rotate(6deg)', offset: .4 }, { transform: 'rotate(-4deg)', offset: .6 },
        { transform: 'rotate(3deg)', offset: .8 }, { transform: 'rotate(0)' }
    ], 280, 'ease-in-out');
    if (reduceMotion.matches) return;
    stage.dataset.phase = 'open';
    await animate($('envelope-flap'), [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(180deg)' }], 250, 'ease-in-out');
    if (reduceMotion.matches) return;
    stage.dataset.phase = 'revealed';
    await animate($('envelope-letter'), [
        { transform: 'translateY(0)' }, { transform: 'translateY(-94px)', offset: .8 },
        { transform: 'translateY(-88px)' }
    ], 460, 'cubic-bezier(.2,.7,.25,1)');
    if (!reduceMotion.matches) await animate(loading, [{ opacity: 1 }, { opacity: 0 }], 130);
}
if (window.location.protocol === 'file:' && document.body.dataset.demo !== 'true') {
    $('server-note').hidden = false; revealButton.disabled = true;
}
form.addEventListener('submit', async event => {
    event.preventDefault();
    if (state !== 'idle' || (window.location.protocol === 'file:' && document.body.dataset.demo !== 'true')) return;
    clearValidation();
    const enteredId = input.value.trim();
    if (!/^\d{10,11}$/.test(normalizeId(enteredId))) {
        validationError.textContent = enteredId ? 'Please enter your full student ID, for example 2024-1-00000.' : 'Enter your student ID to start the reveal.';
        validationError.hidden = false; input.setAttribute('aria-invalid', 'true'); input.focus(); return;
    }
    state = 'searching'; clearResult(); requestError.hidden = true; notFound.hidden = true;
    revealButton.disabled = true; input.disabled = true; form.setAttribute('aria-busy', 'true');
    const startedAt = performance.now();
    // Choose once per valid lookup, independently of the student or grade.
    const revealDelay = REVEAL_DELAY_MIN_MS + Math.floor(Math.random() * (REVEAL_DELAY_MAX_MS - REVEAL_DELAY_MIN_MS + 1));
    const lookup = requestGrade(enteredId); // Fetch starts before the animation.
    try {
        await animate(form, [{ opacity: 1 }, { opacity: 0 }], 180, 'ease-out', true);
        form.hidden = true;
        $('loading-title').textContent = 'Your envelope is on its way…';
        $('loading-copy').textContent = 'Finding your midterm result.';
        loading.hidden = false; loading.focus({ preventScroll: true });
        const outcome = await lookup;
        if (outcome.kind === 'found') {
            await waitForReveal(Math.max(0, revealDelay - (performance.now() - startedAt)));
            await openEnvelope(outcome.record);
            loading.hidden = true; form.removeAttribute('aria-busy'); revealResult(outcome.record);
        } else {
            loading.hidden = true; form.removeAttribute('aria-busy');
            const panel = outcome.kind === 'not-found' ? notFound : requestError;
            if (outcome.kind === 'not-found') $('not-found-id').textContent = enteredId;
            else $('request-error-copy').textContent = outcome.message;
            panel.hidden = false; panel.focus({ preventScroll: true });
        }
    } catch {
        loading.hidden = true; form.hidden = true;
        $('request-error-copy').textContent = 'We couldn’t show your result. Please try again.';
        requestError.hidden = false; requestError.focus({ preventScroll: true });
    } finally {
        form.removeAttribute('aria-busy'); input.disabled = false; revealButton.disabled = false; state = 'done';
    }
});
