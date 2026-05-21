export type FeedbackMode = 'coaching' | 'brutal';

export interface FeedbackModeConfig {
  mode: FeedbackMode;
  systemPromptAddition: string;
  responseInstructionAddition: string;
}

type EnvLike = Record<string, string | undefined>;

const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);

export function isBrutalFeedbackEnabled(env: EnvLike = process.env): boolean {
  return TRUE_VALUES.has((
    env.NEXT_PUBLIC_ENABLE_BRUTAL_FEEDBACK
      ?? env.ENABLE_BRUTAL_FEEDBACK
      ?? ''
  ).toLowerCase());
}

export function getRequestedFeedbackMode(env: EnvLike = process.env): FeedbackMode {
  return isBrutalFeedbackEnabled(env) ? 'brutal' : 'coaching';
}

export function resolveFeedbackMode(
  requestedMode: FeedbackMode | string | undefined,
  env: EnvLike = process.env
): FeedbackMode {
  if (requestedMode === 'brutal' && isBrutalFeedbackEnabled(env)) {
    return 'brutal';
  }

  return 'coaching';
}

const COACHING_CONFIG: FeedbackModeConfig = {
  mode: 'coaching',
  systemPromptAddition: `
Feedback Mode: coaching.
Use a supportive, constructive interview-coach tone. Be honest and specific, but keep the default experience encouraging and confidence-building.`,
  responseInstructionAddition: `
Tone requirements for coaching mode:
- Keep feedback supportive and constructive.
- Name concrete issues without exaggerating interview risk.
- Preserve the existing coach-like user experience.`,
};

const BRUTAL_CONFIG: FeedbackModeConfig = {
  mode: 'brutal',
  systemPromptAddition: `
Feedback Mode: brutal feedback.
You are giving candid hiring manager feedback after hearing this answer in a real interview. Be direct about what would make the candidate seem weak, vague, unprepared, rambling, or risky to hire.

Brutal does NOT mean cruel. Do not insult the person, mock them, use profanity, speculate about protected traits, or make personal judgments. Attack the answer, not the candidate.

Your job is to say the quiet part out loud:
- What would make a hiring manager hesitate?
- What part could cost them the interview?
- Where did they sound generic, evasive, junior, unfocused, or over-rehearsed?
- What is the highest-impact fix that would make the answer sharper before the next interview?`,
  responseInstructionAddition: `
Tone requirements for brutal mode:
- Use hiring manager candor: direct, specific, and outcome-focused.
- Avoid generic encouragement, motivational filler, and soft praise unless it is earned by a specific observation.
- Put the highest-impact fix first in improvements and next steps.
- Frame high-priority issues as rejection risk or "this could cost them the interview" when the transcript supports it.
- Give sharper rewrites/framework examples that show what a stronger candidate would say.
- Be blunt, not cruel: no insults, no profanity, no personal attacks, no protected-class judgments.`,
};

export function getFeedbackModeConfig(mode: FeedbackMode): FeedbackModeConfig {
  return mode === 'brutal' ? BRUTAL_CONFIG : COACHING_CONFIG;
}
