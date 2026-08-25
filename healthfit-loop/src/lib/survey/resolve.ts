import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { getAuthUserId } from '@/lib/auth';

/**
 * The authenticated-user / survey_id / guest_session lookup, in that order.
 *
 * This sequence is copy-pasted into 18 API route files. The recipe route needed
 * a nineteenth copy, which is a good moment to stop making copies. The other
 * call sites are unchanged by this commit and can migrate later; what matters
 * is that new code calls this one.
 *
 * The `'undefined'` / `'null'` string checks are not paranoia — cookies get
 * written by client code that interpolated an undefined value, and the literal
 * four-character string reaches Prisma as a perfectly valid-looking id.
 *
 * Unlike the 18 copies, the branches fall through rather than being `else if`.
 * A signed-in user who filled the survey as a guest and has not had it linked
 * yet is a real state, and returning null for them means generating a recipe
 * with no restrictions.
 */
export async function resolveSurveyResponse() {
  const cookieStore = await cookies();
  const clean = (v: string | null | undefined) =>
    !v || v === 'undefined' || v === 'null' ? undefined : v;

  const userId = clean(await getAuthUserId());
  const surveyId = clean(cookieStore.get('survey_id')?.value);
  const sessionId = clean(cookieStore.get('guest_session')?.value);

  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { activeSurvey: true },
    });
    if (user?.activeSurvey) return user.activeSurvey;
  }
  if (surveyId) {
    const survey = await prisma.surveyResponse.findUnique({ where: { id: surveyId } });
    if (survey) return survey;
  }
  if (sessionId) {
    return prisma.surveyResponse.findFirst({ where: { sessionId } });
  }
  return null;
}
