import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadSource, mockDb, RECORDING } from './module-loader';
import { safeFeedbackDetails, validDiagnosis } from '../src/utils/feedbackValidation';

const transcript = 'I think maybe I helped the team deliver the new dashboard.';
const diagnosis = { pattern: 'hedge_cascade', patternLabel: 'Invented label', oneLineFix: 'State your contribution directly.', evidenceQuote: 'I think maybe I helped', evidenceTimestamp: 2,
  drill: { title: 'State your contribution', durationMinutes: 2, instructions: 'Repeat the claim without qualifiers.' } };
const main = { overallScore: 0, summary: 'Clear context.', strengths: [], improvements: [{ area: 'Clarity', detail: 'Hedging', suggestion: 'Be direct.', priority: 'high' }], nextSteps: ['Practice again.'] };
const Callout = loadSource<{ default: React.ComponentType<{ diagnosis?: unknown; transcript: string; duration?: number }> }>('src/components/DiagnosisCallout.tsx', {}).default;

const malformed = [null, {}, { ...diagnosis, drill: undefined }, { ...diagnosis, evidenceQuote: 'Invented quote' },
  { ...diagnosis, pattern: 'unknown' }, { ...diagnosis, drill: { ...diagnosis.drill, durationMinutes: 6 } },
  { ...diagnosis, oneLineFix: {} }, { ...diagnosis, evidenceQuote: '' }, { ...diagnosis, drill: { ...diagnosis.drill, instructions: [] } }];

test('malformed/absent diagnosis never renders; valid exact evidence gets a canonical label and bounded timestamp', () => {
  for (const value of malformed) {
    assert.equal(validDiagnosis(value, transcript, 10), undefined);
    assert.equal(renderToStaticMarkup(React.createElement(Callout, { diagnosis: value, transcript, duration: 10 })), '');
  }
  const rendered = renderToStaticMarkup(React.createElement(Callout, { diagnosis, transcript, duration: 10 }));
  assert.match(rendered, /Hedge cascade/); assert.match(rendered, /I think maybe I helped/); assert.match(rendered, /2 min drill/);
  assert.doesNotMatch(rendered, /Invented label/);
  for (const timestamp of [-1, 11, Infinity, '2']) {
    assert.equal(validDiagnosis({ ...diagnosis, evidenceTimestamp: timestamp }, transcript, 10)?.evidenceTimestamp, undefined);
  }
  assert.equal(validDiagnosis(diagnosis, transcript)?.evidenceTimestamp, undefined);
});

test('optional communication/example/priority objects cannot reach React as child values', () => {
  const result = safeFeedbackDetails({ communicationPatterns: { usedStructure: {}, clarityLevel: 'clear', unexpected: 'ignore' },
    improvements: [{ area: 'Clarity', detail: 'Detail', suggestion: 'Suggestion', example: {}, priority: {} }, null] }, transcript);
  assert.deepEqual(result.communicationPatterns, { clarityLevel: 'clear' });
  assert.deepEqual(result.improvements, [{ area: 'Clarity', detail: 'Detail', suggestion: 'Suggestion', priority: 'medium' }]);
});

for (const cached of [false, true]) {
  test(`${cached ? 'cached' : 'generated'} actual feedback route omits unsafe optional output and preserves usable zero scores`, async () => {
    for (const value of [...malformed, diagnosis, undefined]) {
      const tables = { analyses: cached ? [{ recording_id: RECORDING, overall_score: 0, summary: main.summary, strengths: [], improvements: main.improvements,
        next_steps: main.nextSteps, diagnosis: value, communication_patterns: { usedStructure: {} } }] : [] };
      const db = mockDb(tables, () => ({})); let providerCalls = 0;
      const clients = { getAdmin: () => db };
      const route = loadSource<{ POST(request: Request): Promise<Response> }>('src/app/api/generate-feedback/route.ts', {
        '@/server/clients': clients, './clients': clients,
        '@/server/practice': { ownedRecording: async () => ({ recording: { transcript, duration: 10 }, session: {}, question: {} }), reserveOperation: async () => null, releaseOperation: async () => {} },
        '@/services/claude': { generateFeedback: async () => { providerCalls++; return { ...main, diagnosis: value, communicationPatterns: { usedStructure: {} } }; } },
      });
      const response = await route.POST(new Request('http://localhost/feedback', { method: 'POST', headers: { Authorization: 'Bearer valid' }, body: JSON.stringify({ recordingId: RECORDING }) }));
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.overallScore, 0); assert.equal(body.communicationPatterns, undefined);
      assert.equal(providerCalls, cached ? 0 : 1);
      assert.equal(Boolean(body.diagnosis), value === diagnosis);
      assert.doesNotThrow(() => renderToStaticMarkup(React.createElement(Callout, { diagnosis: body.diagnosis, transcript, duration: 10 })));
      if (!cached) assert.equal(Boolean(tables.analyses[0].diagnosis), value === diagnosis);
    }
  });
}
