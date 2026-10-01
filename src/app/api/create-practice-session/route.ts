import { NextResponse } from 'next/server';
import { authenticate, fail, readJson, requireUuid } from '@/server/http';
import { ApiError } from '@/server/errors';
import { getAdmin } from '@/server/clients';
import { reserveOperation, sessionContext } from '@/server/practice';
export async function POST(request: Request) {
  try {
    const user = await authenticate(request);
    const body = await readJson(request);
    const context = sessionContext(body);
    if (!Array.isArray(body.questions) || body.questions.length < 1 || body.questions.length > 10) throw new ApiError(400, 'Invalid questions.');
    const questions = body.questions.map(q => {
      if (!q || typeof q !== 'object') throw new ApiError(400, 'Invalid question.');
      requireUuid(q.id, 'question ID');
      if (typeof q.text !== 'string' || !q.text.trim() || q.text.length > 2_000 ||
          !['technical','behavioral','situational','challenge','opening','closing'].includes(q.type) ||
          !Number.isInteger(q.difficulty) || q.difficulty < 1 || q.difficulty > 5) throw new ApiError(400, 'Invalid question.');
      return { id: q.id, text: q.text, type: q.type, difficulty: q.difficulty };
    });
    if (new Set(questions.map(q => q.id)).size !== questions.length) throw new ApiError(400, 'Duplicate question IDs.');
    await reserveOperation(user.id, 'session');
    const { data, error } = await getAdmin().rpc('create_practice_session', {
      p_user_id: user.id, p_session_type: context.sessionType, p_context: context.context, p_questions: questions,
    });
    if (error?.message === 'quota_exhausted') throw new ApiError(402, 'Your free practice allowance is used.', 'quota_exhausted');
    if (error || !data) throw new Error('Practice session could not be saved');
    return NextResponse.json({ sessionId: data });
  } catch (error) { return fail(error); }
}
