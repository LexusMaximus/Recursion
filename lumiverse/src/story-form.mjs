// Ported from Recursion src/story-form.mjs (MIT License, Copyright (c) 2026 Josh Shapiro).
// Full license: LICENSE (repo root).
// Source lines: 1-82 (UNKNOWN_STORY_FORM 19-26, normalizeStoryForm 54-74,
// storyFormInstruction 76-82). Cut: 83-276 (storyFormPromptBlock, arbiter/override
// tooling — not reached by the packet composer).
import { compact, redact, truncate } from './core.mjs';

export const STORY_FORM_SCHEMA = 'recursion.storyForm.v1';

const VALID_TENSES = new Set(['past', 'present', 'mixed', 'unknown']);
const VALID_POVS = new Set([
  'first-person',
  'second-person',
  'third-person-limited',
  'third-person-omniscient',
  'mixed',
  'unknown'
]);
const VALID_CONFIDENCE = new Set(['high', 'medium', 'low']);
const SAFE_MESSAGE_REF = /^message:\d{1,12}$/;
const SECRET_TEXT_PATTERN = /(private[-_\s]*secret|inspector[-_\s]*only|\bsk-[a-z0-9_-]+|\bbearer\s+[a-z0-9._-]+)/i;
const MAX_REASON = 220;

export const UNKNOWN_STORY_FORM = Object.freeze({
  schema: STORY_FORM_SCHEMA,
  tense: 'unknown',
  pov: 'unknown',
  confidence: 'low',
  evidenceRefs: Object.freeze([]),
  reason: 'story form unavailable'
});

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function safeText(value, limit = MAX_REASON) {
  return truncate(compact(String(redact(value ?? '', { maxString: limit }) ?? '')
    .replace(new RegExp(SECRET_TEXT_PATTERN.source, 'ig'), '[redacted]')), limit);
}

function enumValue(value, allowed, fallback) {
  const text = String(value ?? '').trim().toLowerCase();
  return allowed.has(text) ? text : fallback;
}

function safeEvidenceRefs(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((entry) => safeText(entry, 80))
    .filter((entry) => SAFE_MESSAGE_REF.test(entry)))]
    .slice(0, 8);
}

export function storyFormFallbackReason(storyForm = {}) {
  if (storyForm.tense === 'unknown' || storyForm.pov === 'unknown') return 'story form unavailable';
  return 'story form normalized';
}

export function normalizeStoryForm(value = {}, fallback = UNKNOWN_STORY_FORM) {
  const source = asObject(value);
  if (source.schema !== STORY_FORM_SCHEMA) {
    return {
      ...UNKNOWN_STORY_FORM,
      reason: safeText(asObject(fallback).reason || UNKNOWN_STORY_FORM.reason)
    };
  }
  const tense = enumValue(source.tense, VALID_TENSES, 'unknown');
  const pov = enumValue(source.pov, VALID_POVS, 'unknown');
  const confidence = enumValue(source.confidence, VALID_CONFIDENCE, 'low');
  const reason = safeText(source.reason || '', MAX_REASON) || storyFormFallbackReason({ tense, pov });
  return {
    schema: STORY_FORM_SCHEMA,
    tense,
    pov,
    confidence,
    evidenceRefs: safeEvidenceRefs(source.evidenceRefs),
    reason
  };
}

export function storyFormInstruction(storyForm = UNKNOWN_STORY_FORM) {
  const form = normalizeStoryForm(storyForm);
  if (form.tense === 'unknown' || form.pov === 'unknown' || form.confidence === 'low') {
    return "Write the next reply in the active chat's established story form.";
  }
  return `Write the next reply in ${form.tense} tense, ${form.pov} POV.`;
}
