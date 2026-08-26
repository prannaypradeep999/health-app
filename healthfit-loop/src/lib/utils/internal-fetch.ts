/**
 * Calling our own API routes over HTTP, from inside our own API routes.
 *
 * The relay needs a real HTTP hop rather than an in-process call: the point is
 * to get a *fresh function invocation* with its own `maxDuration`. Calling the
 * handler directly would run it inside the caller's already-spent budget, which
 * is the failure this design exists to avoid.
 *
 * What killed that hop on 2026-08-26 was which hostname it picked.
 *
 * Both relay call sites read `NEXT_PUBLIC_BASE_URL`, which is not defined on
 * this project — the configured variable is `NEXT_PUBLIC_APP_URL`. Resolution
 * therefore fell through silently to `VERCEL_URL`, the deployment-specific
 * hostname, and that hostname is behind Vercel Deployment Protection:
 *
 *      [TRACE] phase=restaurants event=fail step=handoff-to-home httpStatus=401
 *
 * The two hostnames really do behave differently, measured rather than assumed:
 *
 *      GET https://fytr-app.vercel.app/api/survey                 -> 404 (ours)
 *      GET https://fytr-<sha>-<team>.vercel.app/api/survey        -> 302 (SSO)
 *
 * Protection covers deployment-specific URLs, not the production alias, so
 * naming the alias is the whole fix — the 404 is our own handler answering,
 * which means the request reached the app. `/api/survey` is the survey route's
 * GET, chosen because it is read-only. The survey route's own hop never broke
 * because it builds its base URL from the incoming request's `Host`, which is
 * already the alias.
 *
 * The bypass header below is defence in depth for the case where an internal
 * call has to reach a protected URL anyway (a preview deployment, say). It is
 * deliberately a header and not a query parameter — Vercel accepts both, but a
 * query parameter puts a credential in a URL, where it lands in access logs.
 * No secret is configured on this project today, and none is needed for the
 * relay to work.
 */

/** Env inputs, injected so the resolution rules can be tested without a platform. */
export interface InternalUrlEnv {
  NEXT_PUBLIC_APP_URL?: string;
  NEXT_PUBLIC_BASE_URL?: string;
  VERCEL_URL?: string;
}

/**
 * Absolute origin for an internal call, with a scheme.
 *
 * `VERCEL_URL` is supplied without a scheme, and it is last because it names a
 * single immutable deployment: a request sent there during a rollout can land on
 * a build that is not the one serving users.
 */
export function resolveInternalBaseUrl(env: InternalUrlEnv): string {
  const configured = env.NEXT_PUBLIC_APP_URL || env.NEXT_PUBLIC_BASE_URL || env.VERCEL_URL;
  if (!configured) return 'http://localhost:3000';
  const trimmed = configured.replace(/\/+$/, '');
  return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
}

/**
 * Headers that get an internal request past Deployment Protection.
 *
 * Returns nothing when the secret is absent, which is the correct behaviour
 * both locally and on a project with protection turned off — adding an empty
 * bypass header would be rejected rather than ignored.
 */
export function protectionBypassHeaders(secret?: string): Record<string, string> {
  return secret ? { 'x-vercel-protection-bypass': secret } : {};
}

/**
 * `fetch` against our own deployment, with the bypass header attached.
 *
 * `path` is root-relative, e.g. `/api/ai/meals/generate-home`.
 */
export function internalFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = resolveInternalBaseUrl(process.env as InternalUrlEnv);
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      ...protectionBypassHeaders(process.env.VERCEL_AUTOMATION_BYPASS_SECRET),
    },
  });
}
