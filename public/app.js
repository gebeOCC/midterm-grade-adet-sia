'use strict';
// The browser requests one result from the server; no roster is shipped here.
const normalizeId = value => String(value).replace(/[\s\u00a0\-\u2010-\u2015\u2212]/g, '');
const form = document.getElementById('lookup-form');
const input = document.getElementById('student-id');
const revealButton = document.getElementById('reveal-button');
const loading = document.getElementById('loading');
const result = document.getElementById('result');
const notFound = document.getElementById('not-found');
const requestError = document.getElementById('request-error');
const validationError = document.getElementById('validation-error');
const loadingTitle = document.getElementById('loading-title');
const loadingCopy = document.getElementById('loading-copy');
const progressFill = document.getElementById('progress-fill');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = values => values[randomInt(0, values.length - 1)];
// These playful messages are random; they never depend on the student's grade.
const suspenseOpeners = [
  { title: 'Are you ready?', copy: 'Your midterm moment is coming. Take a tiny breath.' },
  { title: 'Is your grade good?', copy: 'Let’s see… this envelope isn’t giving any spoilers.' },
  { title: 'The envelope has arrived.', copy: 'It has your result. It also has dramatic timing.' },
  { title: 'Your midterm moment…', copy: 'A little mystery before the big reveal.' },
  { title: 'A little suspense first.', copy: 'One student ID. One sealed envelope. Here we go.' },
  { title: 'Ready for the reveal?', copy: 'No more clicks. Just a tiny bit of suspense.' },
  { title: 'One click. Here we go.', copy: 'You’ve done your part. Let the drumroll begin.' },
  { title: 'The spotlight is on.', copy: 'Your grade is waiting for its grand entrance.' },
  { title: 'Let’s make this dramatic.', copy: 'Imagine the lights dimming and a tiny drum rolling.' },
  { title: 'A tiny drumroll, please.', copy: 'Your hard work deserves a little entrance music.' }
];
const suspenseTeasers = [
  { title: 'Wait for it…', copy: 'The envelope has a flair for dramatic entrances.' },
  { title: 'No spoilers yet.', copy: 'Even the confetti has signed a silence agreement.' },
  { title: 'Suspense is loading…', copy: 'The little progress bar is doing its best acting.' },
  { title: 'Hold that thought…', copy: 'We’re adding one small pinch of dramatic tension.' },
  { title: 'The envelope knows.', copy: 'We asked for a hint. It said, “Nice try.”' },
  { title: 'Plot twist incoming…', copy: 'The envelope wants its own theme song first.' },
  { title: 'Cue the music.', copy: 'A very tiny orchestra is warming up backstage.' },
  { title: 'Deep breath in…', copy: 'And out. You’ve got this moment.' },
  { title: 'The number is shy.', copy: 'It’s practicing its entrance behind the curtain.' },
  { title: 'Almost spilling the beans.', copy: 'But the envelope insists on doing this properly.' },
  { title: 'Suspense level: rising.', copy: 'This tiny envelope is taking its role very seriously.' },
  { title: 'Did someone say reveal?', copy: 'The confetti heard its cue a little too early.' },
  { title: 'One little mystery…', copy: 'The answer is waiting on the other side.' },
  { title: 'The drumroll continues.', copy: 'Somewhere, a tiny drummer is giving it everything.' },
  { title: 'Keep your eyes here.', copy: 'Your result is getting ready for the spotlight.' },
  { title: 'Red carpet? Ready.', copy: 'Apparently one little number needs the full treatment.' },
  { title: 'The curtain is moving…', copy: 'Just a breeze. Your reveal is still on its way.' },
  { title: 'A moment of mystery.', copy: 'Imagine an extremely dramatic camera zoom right now.' },
  { title: 'Still with us?', copy: 'Good. The envelope appreciates a patient audience.' },
  { title: 'We asked the envelope…', copy: '“Can we show it?” It whispered, “Make it dramatic.”' },
  { title: 'The plot thickens.', copy: 'Mostly because the envelope used too much glue.' },
  { title: 'Your result is backstage.', copy: 'The stage manager says it’s nearly showtime.' },
  { title: 'Tiny dramatic pause…', copy: 'Every good reveal needs at least one of these.' },
  { title: 'The confetti is ready.', copy: 'It has been training for this exact moment.' },
  { title: 'What’s in the envelope?', copy: 'Your midterm grade. We’re just being theatrical.' },
  { title: 'Shhh… listen closely.', copy: 'That’s the sound of a very suspenseful envelope.' },
  { title: 'One more little moment.', copy: 'The spotlight operator is finding the perfect angle.' },
  { title: 'Suspiciously quiet…', copy: 'The tiny orchestra is waiting for its big cue.' },
  { title: 'A number with an entrance.', copy: 'Apparently walking onstage normally wasn’t an option.' },
  { title: 'The mystery has a name.', copy: 'It’s called your midterm grade. Reveal coming soon.' }
];
const suspenseFinales = [
  { title: 'Okay, let’s see…', copy: 'The suspense has had its moment. Yours is next.' },
  { title: 'Here it comes…', copy: 'Opening the envelope. Eyes on the next moment.' },
  { title: 'The curtain is lifting.', copy: 'Your midterm result is about to take the stage.' },
  { title: 'Ready or not…', copy: 'Your little midterm moment is finally here.' },
  { title: 'Enough mystery.', copy: 'Let’s give that result its grand entrance.' },
  { title: 'This is the moment.', copy: 'One last drumroll… and then your grade.' },
  { title: 'Drumroll, please…', copy: 'The envelope is opening in just a moment.' },
  { title: 'Let’s open it.', copy: 'No more plot twists. Your result is coming up.' },
  { title: 'Your reveal is next.', copy: 'The confetti is in position. Here we go.' },
  { title: 'And now… your grade.', copy: 'Thanks for joining this very tiny dramatic production.' }
];
let state = 'idle';
let lastOpeningTitle = '';

function makeSuspenseSequence() {
  const opening = pick(suspenseOpeners.filter(message => message.title !== lastOpeningTitle));
  lastOpeningTitle = opening.title;
  const bag = [...suspenseTeasers];
  const middle = Array.from({ length: randomInt(2, 4) }, () => bag.splice(randomInt(0, bag.length - 1), 1)[0]);
  return [opening, ...middle, pick(suspenseFinales)];
}

function clearValidation() {
  validationError.hidden = true;
  validationError.textContent = '';
  input.removeAttribute('aria-invalid');
}
input.addEventListener('input', clearValidation);

function clearResult() {
  for (const id of ['result-section', 'result-heading', 'result-name', 'result-id', 'result-grade', 'result-subject']) {
    document.getElementById(id).textContent = '';
  }
  result.hidden = true;
  document.getElementById('confetti').replaceChildren();
}

function celebrate() {
  if (reduceMotion.matches) return;
  const container = document.getElementById('confetti');
  container.replaceChildren();
  ['#a6c48b', '#eeb27c', '#d6dbb0', '#577a50'].forEach((color, index) => {
    for (let n = 0; n < 4; n++) {
      const piece = document.createElement('i');
      piece.style.background = color;
      piece.style.left = `${5 + Math.random() * 90}%`;
      piece.style.animationDelay = `${(index * 4 + n) * 0.035}s`;
      container.appendChild(piece);
    }
  });
  setTimeout(() => container.replaceChildren(), 2200);
}

function resetLookup(clearInput) {
  if (state === 'searching') return;
  state = 'idle';
  loading.hidden = true;
  notFound.hidden = true;
  requestError.hidden = true;
  document.getElementById('request-error-copy').textContent = '';
  document.getElementById('not-found-id').textContent = '';
  clearResult();
  form.hidden = false;
  form.removeAttribute('aria-busy');
  revealButton.disabled = false;
  if (clearInput) input.value = '';
  clearValidation();
  input.focus();
  if (!clearInput) input.select();
}
document.getElementById('another-button').addEventListener('click', () => resetLookup(true));
document.getElementById('retry-button').addEventListener('click', () => resetLookup(false));
document.getElementById('network-retry-button').addEventListener('click', () => resetLookup(false));

function revealResult(record) {
  document.getElementById('result-section').textContent = `Section ${record.section}`;
  document.getElementById('result-heading').textContent = `Here you go, ${record.firstName.split(' ')[0]}.`;
  document.getElementById('result-name').textContent = `${record.firstName} ${record.middleInitial ? record.middleInitial + ' ' : ''}${record.lastName}`;
  document.getElementById('result-id').textContent = record.id;
  document.getElementById('result-grade').textContent = record.grade;
  document.getElementById('result-subject').textContent = record.subject;
  result.classList.add('enter');
  result.hidden = false;
  result.focus({ preventScroll: true });
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
      return { kind: 'error', message: response.status === 400
        ? 'Please check your full student ID and try again.'
        : 'The grade service is temporarily unavailable. Please try again later.' };
    }
    const payload = await response.json();
    const record = payload && payload.record;
    const fields = ['id', 'lastName', 'firstName', 'middleInitial', 'section', 'subject', 'grade'];
    if (!record || !fields.every(field => typeof record[field] === 'string') ||
        normalizeId(record.id) !== normalizeId(studentId) || !/^\d\.\d$/.test(record.grade)) {
      return { kind: 'error', message: 'We couldn’t read your result. Please try again.' };
    }
    return { kind: 'found', record };
  } catch (error) {
    return { kind: 'error', message: error && error.name === 'AbortError'
      ? 'The grade lookup took too long. Please try again.'
      : 'We couldn’t reach the grade service. Check your connection and try again.' };
  } finally {
    clearTimeout(timeout);
  }
}

async function playSuspense() {
  const messages = reduceMotion.matches
    ? [{ title: 'Your midterm moment…', copy: 'Opening your grade envelope.' }]
    : makeSuspenseSequence();
  const beats = messages.map(() => reduceMotion.matches ? 450 : randomInt(1000, 1450));
  progressFill.style.animationDuration = `${beats.reduce((sum, ms) => sum + ms, 0)}ms`;
  loadingTitle.textContent = messages[0].title;
  loadingCopy.textContent = messages[0].copy;
  loading.hidden = false;
  for (let index = 0; index < messages.length; index++) {
    if (index > 0) {
      loadingTitle.textContent = messages[index].title;
      loadingCopy.textContent = messages[index].copy;
    }
    await wait(beats[index]);
  }
}

if (window.location && window.location.protocol === 'file:') {
  document.getElementById('server-note').hidden = false;
  revealButton.disabled = true;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (state !== 'idle' || (window.location && window.location.protocol === 'file:')) return;
  clearValidation();
  const enteredId = input.value.trim();
  const normalizedId = normalizeId(enteredId);
  if (!/^\d{10,11}$/.test(normalizedId)) {
    validationError.textContent = enteredId ? 'Please enter your full student ID, for example 2024-1-00000.' : 'Enter your student ID to start the reveal.';
    validationError.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    return;
  }
  state = 'searching';
  clearResult();
  requestError.hidden = true;
  revealButton.disabled = true;
  form.hidden = true;
  form.setAttribute('aria-busy', 'true');
  let lookupComplete = false;
  const lookup = requestGrade(enteredId).then(outcome => {
    lookupComplete = true;
    return outcome;
  });
  await playSuspense();
  if (!lookupComplete) {
    loadingTitle.textContent = 'One more moment…';
    loadingCopy.textContent = 'Your grade is still on its way. Hang tight.';
  }
  const outcome = await lookup;
  loading.hidden = true;
  form.removeAttribute('aria-busy');
  revealButton.disabled = false;
  state = 'done';
  if (outcome.kind === 'found') {
    revealResult(outcome.record);
  } else if (outcome.kind === 'not-found') {
    document.getElementById('not-found-id').textContent = enteredId;
    notFound.classList.add('enter');
    notFound.hidden = false;
    notFound.focus({ preventScroll: true });
  } else {
    document.getElementById('request-error-copy').textContent = outcome.message;
    requestError.classList.add('enter');
    requestError.hidden = false;
    requestError.focus({ preventScroll: true });
  }
});
