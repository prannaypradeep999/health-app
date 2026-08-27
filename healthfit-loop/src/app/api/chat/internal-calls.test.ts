import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The chat assistant's tools call our own API routes over HTTP. Three of them
 * addressed those routes as `http://localhost:3000`.
 *
 * On Vercel there is no localhost:3000. The fetch rejects with ECONNREFUSED,
 * the surrounding try/catch turns that into `{success:false}`, and the model —
 * which is told the tool failed but not why — answers the user with a polite
 * offer to work without their data:
 *
 *     "I'm having trouble pulling up your plan data right now."
 *
 * Nothing about that is visible as a failure. The route returns 200, quickly,
 * because failing fast is exactly what a refused connection does:
 *
 *     [TRACE] phase=chat event=ok ms=3154 toolRounds=1 chars=581
 *
 * So the trace says ok, the status says 200, the latency looks healthy, and the
 * feature is completely broken in production while working perfectly in dev.
 * That combination is why this is a source-text guard rather than a behavioural
 * one: there is no observable signal to assert on.
 *
 * `internalFetch` already existed for this exact problem — see the header of
 * `src/lib/utils/internal-fetch.ts`, which documents an earlier outage caused
 * by the same class of mistake in the meal-generation relay. The chat tools
 * were simply never migrated onto it.
 */

const CHAT_ROUTE = join(__dirname, 'route.ts');
const SRC = readFileSync(CHAT_ROUTE, 'utf8');

test('no chat tool addresses our own API as localhost', () => {
  const offenders = SRC.split('\n')
    .map((line, i) => [i + 1, line] as const)
    .filter(([, line]) => line.includes('localhost:3000'));

  assert.deepEqual(
    offenders,
    [],
    `chat/route.ts still hardcodes localhost:3000 at line(s) ` +
      `${offenders.map(([n]) => n).join(', ')} — these resolve in dev and are ` +
      `refused on Vercel, and the failure is swallowed into a friendly message`
  );
});

test('the chat tools call our own API through internalFetch', () => {
  assert.match(
    SRC,
    /import\s*\{[^}]*\binternalFetch\b[^}]*\}\s*from\s*'@\/lib\/utils\/internal-fetch'/,
    'chat/route.ts does not import internalFetch'
  );

  // Every self-directed call goes through the helper. A bare `fetch('/api/...')`
  // has no origin and fails differently but just as silently, so it is caught
  // here too.
  const bareSelfCalls = SRC.split('\n')
    .map((line, i) => [i + 1, line] as const)
    .filter(([, line]) => /\bfetch\(\s*['"`](https?:)?\/\/?[^'"`]*\/api\//.test(line));

  assert.deepEqual(
    bareSelfCalls,
    [],
    `chat/route.ts calls its own API with a bare fetch at line(s) ` +
      `${bareSelfCalls.map(([n]) => n).join(', ')} — use internalFetch so the ` +
      `origin resolves to the production alias and the protection-bypass header ` +
      `is attached`
  );
});

test('every internal call in the chat route still forwards the caller cookies', () => {
  // The tools authenticate as the user by replaying their cookies onto the
  // internal hop. Moving to internalFetch must not drop that: a call that
  // arrives without cookies gets somebody else's answer, or none.
  const internalCalls = SRC.match(/internalFetch\([\s\S]{0,300}?\n\s*\}\)/g) ?? [];
  assert.ok(internalCalls.length >= 3, `expected at least 3 internalFetch calls, found ${internalCalls.length}`);
  for (const call of internalCalls) {
    assert.match(call, /'Cookie'/, `an internalFetch call in chat/route.ts sends no Cookie header:\n${call}`);
  }
});
