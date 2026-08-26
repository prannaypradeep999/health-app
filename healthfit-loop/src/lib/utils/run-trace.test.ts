import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTrace, tracePhase } from './run-trace';

test('every line starts with the grep anchor', () => {
  // `vercel logs | grep '\[TRACE\]'` is the whole point; if the prefix moves,
  // the post-run review silently returns nothing.
  assert.ok(formatTrace('plan1', 'restaurants', 'start').startsWith('[TRACE] '));
});

test('the correlation key, phase and event are always present', () => {
  const line = formatTrace('cmt9ldt76', 'home-meals', 'ok', { ms: 1234 });
  assert.match(line, /run=cmt9ldt76/);
  assert.match(line, /phase=home-meals/);
  assert.match(line, /event=ok/);
  assert.match(line, /ms=1234/);
});

test('a missing run id is explicit rather than blank', () => {
  // `run=` with nothing after it would silently join with the next key.
  assert.match(formatTrace(undefined, 'survey', 'start'), /run=unknown/);
  assert.match(formatTrace('', 'survey', 'start'), /run=unknown/);
});

test('null and undefined fields are dropped, not printed', () => {
  const line = formatTrace('p', 'groceries', 'ok', { a: null, b: undefined, c: 0 });
  assert.doesNotMatch(line, /a=/);
  assert.doesNotMatch(line, /b=/);
  // Zero is a real value and must survive.
  assert.match(line, /c=0/);
});

test('false survives, because it is a real outcome', () => {
  assert.match(formatTrace('p', 'restaurants', 'ok', { linksOk: false }), /linksOk=false/);
});

test('whitespace in a value cannot break key=value parsing', () => {
  const line = formatTrace('p', 'chat', 'fail', { error: 'connect ETIMEDOUT upstream' });
  assert.match(line, /error=connect_ETIMEDOUT_upstream/);
  assert.equal(line.split(' ').length, 5); // [TRACE], run, phase, event, error
});

test('tracePhase records duration and returns the value', async () => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (l: string) => { lines.push(l); };
  try {
    const result = await tracePhase('p1', 'workouts', async () => 'done');
    assert.equal(result, 'done');
  } finally {
    console.log = original;
  }
  assert.equal(lines.length, 2);
  assert.match(lines[0], /phase=workouts event=start/);
  assert.match(lines[1], /phase=workouts event=ok ms=\d+/);
});

test('tracePhase reports a failure and still rethrows it', async () => {
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => {};
  console.error = (l: string) => { errors.push(l); };
  try {
    await assert.rejects(
      () => tracePhase('p1', 'restaurants', async () => { throw new Error('perplexity 429'); }),
      /perplexity 429/
    );
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  assert.equal(errors.length, 1);
  assert.match(errors[0], /phase=restaurants event=fail/);
  assert.match(errors[0], /error=perplexity_429/);
});
