import { NextResponse } from 'next/server';
import { generateQuestions } from '@/services/claude';
import { authenticate, fail, readJson } from '@/server/http';
import { reserveOperation, sessionContext } from '@/server/practice';
export async function POST(request: Request) {
  try {
    const user = await authenticate(request);
    const context = sessionContext(await readJson(request));
    await reserveOperation(user.id, 'questions');
    const questions = await generateQuestions(context);
    return NextResponse.json({ questions, sessionType: context.sessionType, generatedAt: new Date().toISOString() });
  } catch (error) { return fail(error); }
}
export async function GET() { return NextResponse.json({ error: 'Use POST.' }, { status: 405 }); }
