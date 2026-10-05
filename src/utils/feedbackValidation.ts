import { DIAGNOSIS_PATTERNS, type Diagnosis, type DiagnosisPattern } from './diagnosisTaxonomy';

const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;

/** Optional model output is untrusted, including older persisted responses. */
export function validDiagnosis(value: unknown, transcript: string, duration?: number | null): Diagnosis | undefined {
  if (!object(value) || typeof value.pattern !== 'string' || !Object.hasOwn(DIAGNOSIS_PATTERNS, value.pattern) ||
      !text(value.oneLineFix, 119) || !text(value.evidenceQuote, 199) || !transcript.includes(value.evidenceQuote) ||
      !object(value.drill) || !text(value.drill.title, 160) || !text(value.drill.instructions, 2000) ||
      typeof value.drill.durationMinutes !== 'number' || !Number.isInteger(value.drill.durationMinutes) ||
      value.drill.durationMinutes < 1 || value.drill.durationMinutes > 5) return undefined;
  const pattern = value.pattern as DiagnosisPattern;
  const timestamp = value.evidenceTimestamp;
  return {
    pattern, patternLabel: DIAGNOSIS_PATTERNS[pattern].label,
    oneLineFix: value.oneLineFix, evidenceQuote: value.evidenceQuote,
    // A quote can be verified without a timestamp. Discard unbounded estimates.
    ...(typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp >= 0 &&
      typeof duration === 'number' && Number.isFinite(duration) && timestamp <= duration
      ? { evidenceTimestamp: timestamp } : {}),
    drill: { title: value.drill.title, instructions: value.drill.instructions, durationMinutes: value.drill.durationMinutes },
  };
}

export function safeFeedbackDetails(value: { diagnosis?: unknown; communicationPatterns?: unknown; improvements?: unknown }, transcript: string, duration?: number | null) {
  const patterns: Partial<Record<'usedStructure' | 'clarityLevel' | 'concisenessLevel' | 'exampleQuality', string>> = {};
  if (object(value.communicationPatterns)) {
    for (const key of ['usedStructure', 'clarityLevel', 'concisenessLevel', 'exampleQuality'] as const) {
      const field = value.communicationPatterns[key];
      if (text(field, 500)) patterns[key] = field;
    }
  }
  const improvements = (Array.isArray(value.improvements) ? value.improvements : []).filter(object)
    .filter(item => text(item.area, 500) && text(item.detail, 5000) && text(item.suggestion, 5000))
    .slice(0, 20).map(item => ({
      area: item.area as string, detail: item.detail as string, suggestion: item.suggestion as string,
      priority: (['high', 'medium', 'low'].includes(String(item.priority)) ? item.priority : 'medium') as 'high' | 'medium' | 'low',
      ...(text(item.example, 5000) ? { example: item.example } : {}),
    }));
  return { diagnosis: validDiagnosis(value.diagnosis, transcript, duration),
    communicationPatterns: Object.keys(patterns).length ? patterns : undefined, improvements };
}
