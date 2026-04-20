/**
 * Claude-powered evaluator for AI output quality checkpoints.
 *
 * Uses Haiku (cheap, fast) to judge three things the structural tests can't:
 *   #1 — Are the generated questions actually relevant to the JD?
 *   #2 — Is the feedback specific to the answer, not generic filler?
 *   #3 — Does the analysis page surface real data vs. placeholders?
 *
 * Cost: ~$0.005 per checkpoint with Haiku. Three checkpoints = ~$0.015/run.
 */

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-haiku-4-5';

export type Verdict = 'PASS' | 'FAIL';

export interface EvaluationResult {
  checkpoint: string;
  verdict: Verdict;
  reason: string;
  durationMs: number;
}

const SYSTEM = `You are an auditor judging whether an AI-generated output meets a
specific quality bar. You respond ONLY with a JSON object of the exact shape:

{ "verdict": "PASS" | "FAIL", "reason": "<one sentence, <=200 chars>" }

Be strict. If the output is generic, placeholder, nonsensical, or disconnected
from the input, return FAIL. If it is clearly specific and relevant, return PASS.`;

async function judge(userPrompt: string, checkpoint: string): Promise<EvaluationResult> {
  const start = Date.now();
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 200,
      system: SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = res.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map((c) => c.text)
      .join('')
      .trim();

    // Tolerant JSON extraction
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Non-JSON response: ${text.slice(0, 200)}`);
    const parsed = JSON.parse(match[0]) as { verdict?: string; reason?: string };

    const verdict: Verdict = parsed.verdict === 'PASS' ? 'PASS' : 'FAIL';
    const reason = (parsed.reason ?? 'no reason given').slice(0, 200);
    return { checkpoint, verdict, reason, durationMs: Date.now() - start };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      checkpoint,
      verdict: 'FAIL',
      reason: `evaluator error: ${msg.slice(0, 150)}`,
      durationMs: Date.now() - start,
    };
  }
}

// ---- Checkpoint #1 — questions relevance -------------------------------------

export async function evaluateQuestions(
  jd: string,
  questions: Array<{ text: string }>
): Promise<EvaluationResult> {
  const prompt = `A candidate pasted this job description:

---JD---
${jd}
---END JD---

An AI generated these practice interview questions:

${questions.map((q, i) => `${i + 1}. ${q.text}`).join('\n')}

Judge: are at least 60% of these questions clearly tailored to the role
described in the JD (not generic)? PASS if yes, FAIL if the questions
feel generic or unrelated to the JD.`;
  return judge(prompt, 'questions_relevance');
}

// ---- Checkpoint #2 — feedback specificity ------------------------------------

export async function evaluateFeedback(
  question: string,
  transcript: string,
  feedback: {
    summary?: string;
    strengths?: Array<{ detail: string }>;
    improvements?: Array<{ detail: string }>;
  }
): Promise<EvaluationResult> {
  const prompt = `The candidate was asked: "${question}"

Their spoken answer transcript was:
"${transcript}"

The AI coach produced this feedback:
- Summary: ${feedback.summary ?? '(missing)'}
- Strengths: ${(feedback.strengths ?? []).map((s) => s.detail).join('; ') || '(none)'}
- Improvements: ${(feedback.improvements ?? []).map((i) => i.detail).join('; ') || '(none)'}

Judge: does the feedback reference specific content from the candidate's
actual answer? PASS if the feedback clearly engages with what the candidate
said. FAIL if it's generic filler that would apply to any answer.`;
  return judge(prompt, 'feedback_specificity');
}

// ---- Checkpoint #3 — analysis page has real data -----------------------------

export async function evaluateAnalysis(observations: {
  hasTranscript: boolean;
  hasMetrics: { wpm?: number; fillerWords?: number; clarity?: number };
  hasStrengths: number;
  hasImprovements: number;
  hasVideoPlayable: boolean;
  summaryText: string | null;
}): Promise<EvaluationResult> {
  // This one is cheap — mostly structural, Claude is used as a tie-breaker on summaryText.
  const structuralProblems: string[] = [];
  if (!observations.hasTranscript) structuralProblems.push('transcript missing');
  if (observations.hasMetrics.wpm == null) structuralProblems.push('wpm missing');
  if (observations.hasMetrics.fillerWords == null) structuralProblems.push('filler count missing');
  if (observations.hasMetrics.clarity == null) structuralProblems.push('clarity missing');
  if (observations.hasStrengths === 0) structuralProblems.push('zero strengths');
  if (observations.hasImprovements === 0) structuralProblems.push('zero improvements');
  if (!observations.hasVideoPlayable) structuralProblems.push('video not playable');

  if (structuralProblems.length > 0) {
    return {
      checkpoint: 'analysis_completeness',
      verdict: 'FAIL',
      reason: `structural: ${structuralProblems.join(', ')}`,
      durationMs: 0,
    };
  }

  // All structural checks pass — let Claude judge the summary text
  const prompt = `The analysis page shows this summary for a candidate's answer:

"${observations.summaryText ?? ''}"

Judge: does this read like real, specific coaching, or like a placeholder /
lorem-ipsum / generic template? PASS if real, FAIL if placeholder.`;
  return judge(prompt, 'analysis_completeness');
}
