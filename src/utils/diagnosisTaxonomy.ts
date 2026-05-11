/**
 * diagnosisTaxonomy.ts
 *
 * Single source of truth for the 8 observable pitch-pattern keys used by:
 *  - The Claude generateFeedback prompt builder (DIAGNOSIS_PROMPT_BLOCK)
 *  - The DiagnosisCallout UI component (labels, drill defaults)
 *
 * No imports -- fully self-contained.
 */

// ---------------------------------------------------------------------------
// 1. DiagnosisPattern -- the 8 observable keys
// ---------------------------------------------------------------------------

export type DiagnosisPattern =
  | 'buried_lede'
  | 'no_specific_example'
  | 'metric_absent'
  | 'hedge_cascade'
  | 'wrong_frame'
  | 'pacing_panic'
  | 'filler_overload'
  | 'closing_collapse';

// ---------------------------------------------------------------------------
// 2. Diagnosis -- shape returned by Claude inside the feedback object
// ---------------------------------------------------------------------------

export interface Diagnosis {
  pattern: DiagnosisPattern;
  patternLabel: string;
  oneLineFix: string;         // <120 chars
  evidenceQuote: string;      // <200 chars, exact transcript span
  evidenceTimestamp?: number; // seconds into recording (optional -- only when Claude can confidently estimate)
  drill: {
    title: string;
    durationMinutes: number;  // 1-5
    instructions: string;     // 2-3 sentences
  };
}

// ---------------------------------------------------------------------------
// 3. PatternDefinition + DIAGNOSIS_PATTERNS record
// ---------------------------------------------------------------------------

export interface PatternDefinition {
  key: DiagnosisPattern;
  label: string;
  definition: string;               // one-sentence definition embedded in the Claude prompt
  defaultDrillTitle: string;        // action verb, 4-8 words
  defaultDrillInstructions: string; // 2-3 sentences telling user what to rehearse
  defaultDrillMinutes: number;      // 1-5
}

export const DIAGNOSIS_PATTERNS: Record<DiagnosisPattern, PatternDefinition> = {

  buried_lede: {
    key: 'buried_lede',
    label: 'Buried lede',
    definition: `The strongest proof point or result was delivered after 60% of the answer had already elapsed, making the opening forgettable.`,
    defaultDrillTitle: 'Lead with the result first',
    defaultDrillInstructions: `Re-record your answer in exactly 60 seconds, but open with the single best outcome or result before saying anything else. Once that result is stated, walk backward through the context and actions that produced it. Aim to have your key proof point spoken aloud within the first 15 seconds.`,
    defaultDrillMinutes: 2,
  },

  no_specific_example: {
    key: 'no_specific_example',
    label: 'No specific example',
    definition: `A skill or quality was claimed without any concrete story, project, or situation to back it up.`,
    defaultDrillTitle: 'Anchor every claim to a real story',
    defaultDrillInstructions: `Write down the claim you made (e.g. "I am a strong communicator"), then immediately identify one real situation where you demonstrated it -- project name, people involved, specific outcome. Re-record your answer using the STAR structure: Situation, Task, Action, Result. Do not use any adjective to describe yourself unless a concrete example follows within the same sentence.`,
    defaultDrillMinutes: 3,
  },

  metric_absent: {
    key: 'metric_absent',
    label: 'Metric absent',
    definition: `A story or accomplishment was described without any quantified outcome -- no number, percentage, time saved, users impacted, or measurable result.`,
    defaultDrillTitle: 'Add one number to your story',
    defaultDrillInstructions: `Review your answer and identify the moment where you described what you did -- then ask yourself: how many, how much, how fast, or by what percentage? Even rough figures ("reduced review time by about 30%", "wrote tests covering roughly 200 edge cases") are far stronger than qualitative-only descriptions. Re-record the answer and ensure at least one concrete metric appears before your conclusion.`,
    defaultDrillMinutes: 2,
  },

  hedge_cascade: {
    key: 'hedge_cascade',
    label: 'Hedge cascade',
    definition: `Three or more qualifiers appeared around the key claim, undermining its credibility (e.g. "I think maybe I sort of helped with...").`,
    defaultDrillTitle: 'State your key claim without qualifiers',
    defaultDrillInstructions: `Read back your answer and highlight every hedge word: think, maybe, sort of, kind of, a little, I guess, probably, try to. Re-record the answer and cut every hedge that does not add genuine accuracy -- replace them with the direct claim. Practice saying the key sentence out loud three times with no qualifiers before recording.`,
    defaultDrillMinutes: 2,
  },

  wrong_frame: {
    key: 'wrong_frame',
    label: 'Wrong frame',
    definition: `The answer addressed a materially different question than the one actually asked, leaving the interviewer's real concern unanswered.`,
    defaultDrillTitle: 'Mirror the question before answering',
    defaultDrillInstructions: `Read the interview question again word for word, and identify the single core thing the interviewer needed to know. Re-record your answer opening with a one-sentence framing that directly addresses that need (e.g. "What you are asking about is X -- here is my experience with exactly that"). Check your answer at the end: does every sentence contribute to answering the original question?`,
    defaultDrillMinutes: 3,
  },

  pacing_panic: {
    key: 'pacing_panic',
    label: 'Pacing panic',
    definition: `Speaking pace was above 180 WPM or below 90 WPM, signaling nerves or hesitation that obscures the substance of the answer.`,
    defaultDrillTitle: 'Re-record at a deliberate 140 WPM pace',
    defaultDrillInstructions: `Read your answer aloud at a calm, deliberate pace -- aim for roughly 140 words per minute (that is about one word every 0.43 seconds). Use a pause of one full second after every key point to let it land before moving on. Record again and focus on pauses over speed; nervous energy almost always produces too-fast delivery, while intentional pauses project confidence.`,
    defaultDrillMinutes: 3,
  },

  filler_overload: {
    key: 'filler_overload',
    label: 'Filler overload',
    definition: `Filler words (um, uh, like, you know, so) made up more than 8% of total words spoken, competing with the substance of the answer.`,
    defaultDrillTitle: 'Replace every filler with a silent pause',
    defaultDrillInstructions: `Re-read your transcript and count every "um", "uh", "like", "you know", and "so" used as a sentence-starter. Re-record the answer, and every time you feel the urge to say a filler word, replace it with 1-2 seconds of deliberate silence instead -- silence sounds confident, fillers do not. Do at least two takes: one for content accuracy, one focused purely on eliminating fillers.`,
    defaultDrillMinutes: 3,
  },

  closing_collapse: {
    key: 'closing_collapse',
    label: 'Closing collapse',
    definition: `The answer had a strong opening and middle but ended weakly or abruptly -- no callback to the original question, trailing off, or running out of steam.`,
    defaultDrillTitle: 'Write and rehearse a crisp closing line',
    defaultDrillInstructions: `Write a single closing sentence that either restates your key result or directly ties back to what the interviewer asked (e.g. "So that is how I have applied that skill in a real-world context"). Practice delivering that line with a full stop -- no trailing "...and yeah, so..." -- until it feels natural. Re-record the answer and ensure the final sentence is your strongest, not your weakest.`,
    defaultDrillMinutes: 2,
  },
};

// ---------------------------------------------------------------------------
// 4. DIAGNOSIS_PROMPT_BLOCK -- embedded verbatim into the Claude generateFeedback prompt
// ---------------------------------------------------------------------------

const _patternLines = Object.values(DIAGNOSIS_PATTERNS)
  .map((p) => `  ${p.key} -- ${p.label}: ${p.definition}`)
  .join('\n');

export const DIAGNOSIS_PROMPT_BLOCK: string = `
---
DIAGNOSIS INSTRUCTIONS (read carefully before responding):

Identify the SINGLE most-impactful observable pattern from the list below that hurt this interview answer.
If the answer was genuinely strong and no pattern clearly applies, omit the "diagnosis" key entirely from your JSON response -- do not force a pattern.

STRICT RULES:
- Base your diagnosis ONLY on what is directly observable in the transcript text or the provided speech metrics (WPM, filler ratio).
- NEVER speculate about the speaker's psychology, personality, emotional state, confidence level, status anxiety, or any internal state not visible in the transcript or metrics.
- NEVER diagnose based on tone, voice quality, or non-verbal signals unless they are explicitly provided as a metric.
- Your evidenceQuote MUST be an exact verbatim span copied from the transcript -- do not paraphrase or reconstruct it.
- evidenceQuote must be under 200 characters.
- oneLineFix must be under 120 characters and must be an actionable instruction, not a description of the problem.
- evidenceTimestamp (seconds into the recording) is OPTIONAL -- only include it if you can confidently estimate it from speech pacing or a timestamp in the provided data.

PATTERN LIST (key -- Label: definition):
${_patternLines}

REQUIRED JSON SHAPE (include as the "diagnosis" sub-key in your response object, or omit entirely if no pattern applies):
{
  "diagnosis": {
    "pattern": "<one of the 8 keys above>",
    "patternLabel": "<human-readable label, e.g. Buried lede>",
    "oneLineFix": "<actionable fix, under 120 chars>",
    "evidenceQuote": "<exact verbatim transcript span, under 200 chars>",
    "evidenceTimestamp": "<number of seconds -- OPTIONAL, omit if uncertain>",
    "drill": {
      "title": "<action verb phrase, 4-8 words>",
      "durationMinutes": "<integer 1-5>",
      "instructions": "<2-3 sentences telling the user exactly what to re-record or rehearse>"
    }
  }
}
---
`;
