import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getFeedbackModeConfig,
  resolveFeedbackMode,
  type FeedbackMode,
} from '../src/services/feedbackMode';

test('resolveFeedbackMode defaults to coaching when no mode is requested', () => {
  assert.equal(resolveFeedbackMode(undefined, {}), 'coaching');
});

test('resolveFeedbackMode ignores brutal requests unless server flag is enabled', () => {
  assert.equal(resolveFeedbackMode('brutal', {}), 'coaching');
  assert.equal(resolveFeedbackMode('brutal', { ENABLE_BRUTAL_FEEDBACK: 'false' }), 'coaching');
  assert.equal(resolveFeedbackMode('brutal', { ENABLE_BRUTAL_FEEDBACK: '0' }), 'coaching');
});

test('resolveFeedbackMode allows brutal mode when server flag is enabled', () => {
  assert.equal(resolveFeedbackMode('brutal', { ENABLE_BRUTAL_FEEDBACK: 'true' }), 'brutal');
  assert.equal(resolveFeedbackMode('brutal', { ENABLE_BRUTAL_FEEDBACK: '1' }), 'brutal');
});

test('resolveFeedbackMode treats unknown requested modes as coaching', () => {
  assert.equal(resolveFeedbackMode('mean' as FeedbackMode, { ENABLE_BRUTAL_FEEDBACK: 'true' }), 'coaching');
});

test('brutal config encodes candid hiring-manager feedback without cruelty', () => {
  const config = getFeedbackModeConfig('brutal');
  const contract = `${config.systemPromptAddition}\n${config.responseInstructionAddition}`.toLowerCase();

  assert.match(contract, /hiring manager/);
  assert.match(contract, /candid|candor/);
  assert.match(contract, /rejection risk|cost them the interview|fail/);
  assert.match(contract, /no generic encouragement|avoid generic encouragement|do not use generic encouragement/);
  assert.match(contract, /not cruel|no cruelty|do not insult|no insults/);
  assert.match(contract, /highest-impact|highest impact|biggest fix/);
});

test('coaching config preserves the default supportive mode', () => {
  const config = getFeedbackModeConfig('coaching');
  const contract = `${config.systemPromptAddition}\n${config.responseInstructionAddition}`.toLowerCase();

  assert.match(contract, /supportive|constructive|coach/);
  assert.doesNotMatch(contract, /brutal feedback/);
  assert.doesNotMatch(contract, /cost them the interview/);
});
