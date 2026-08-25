import { FOOD_FALLBACKS, WORKOUT_FALLBACKS } from '../src/lib/external/fallback-images';

async function check(label: string, url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15_000) });
    console.log(`${res.ok ? '✅' : '❌'} ${res.status}  ${label}  ${url}`);
    return res.ok;
  } catch (err) {
    console.log(`❌ ERR   ${label}  ${url}  ${(err as Error).message}`);
    return false;
  }
}

async function main() {
  const entries = [
    ...Object.entries(FOOD_FALLBACKS).map(([k, v]) => [`food/${k}`, v] as const),
    ...Object.entries(WORKOUT_FALLBACKS).map(([k, v]) => [`workout/${k}`, v] as const),
  ];
  const results = await Promise.all(entries.map(([k, v]) => check(k, v)));
  const dead = results.filter(r => !r).length;
  console.log(`\n${entries.length - dead}/${entries.length} fallback images live`);
  if (dead > 0) process.exit(1);
}

main();
