// Ported from Recursion src/settings.mjs (MIT License, Copyright (c) 2026 Josh Shapiro).
// Source lines: 19-22, 38-39, 43-47, 60-68 (trimmed defaults), 87-91 (injection defaults),
// 136-139, 147-153, 161-172, 32-33 + 174-194 (5a additions). Full license: LICENSE (repo root).
// REDUCED: normalizeSettings below replaces src/settings.mjs:395-444 (see DEVIATION comment).
const STRENGTHS = new Set(['light', 'balanced', 'strong']);
const REASONING_LEVELS = new Set(['low', 'medium', 'high', 'ultra']);
const FOOTPRINTS = new Set(['compact', 'normal', 'rich']);
const FOCUS = new Set(['balanced', 'character', 'constraints', 'scene', 'plot']);
const CARD_BUDGET_MIN = 0;
const CARD_BUDGET_MAX = 20;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

// Trimmed defaults: only the fields the reduced normalizeSettings reads
// (src/settings.mjs:60-68, injection defaults from src/settings.mjs:87-91).
const DEFAULT_RECURSION_SETTINGS = deepFreeze({
  strength: 'balanced',
  cardsPerTurn: 6,
  reasoningLevel: 'medium',
  promptFootprint: 'compact',
  focus: 'balanced',
  injection: {
    placement: 'in_prompt',
    role: 'system',
    depth: 1
  },
});

function enumValue(value, allowed, fallback) {
  const normalized = String(value ?? fallback).trim().toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}

function numberInRange(value, fallback, min, max) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function normalizeCardBudgetSettings(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const raw = source.cardsPerTurn;
  const valueIsNumeric = typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '');
  const targetCards = Math.round(numberInRange(
    valueIsNumeric ? raw : undefined,
    DEFAULT_RECURSION_SETTINGS.cardsPerTurn,
    CARD_BUDGET_MIN,
    CARD_BUDGET_MAX
  ));
  return { targetCards };
}

// DEVIATION: replaces src/settings.mjs:395-444. The source normalizeSettings pulled ~7 other
// modules (card-selection, pre-process-decks, post-process-decks, post-process-editing,
// retention-policy, story-form, provider-capability) that 5b's call chain does not use.
// This reduced version produces exactly the fields influencePolicyForSettings
// (src/settings-policy.mjs:111-127) reads — strength, cardsPerTurn, reasoningLevel,
// promptFootprint, focus, injection — with the same defaults as src/settings.mjs:60-68
// (injection defaults are the source defaults from src/settings.mjs:87-91; the source
// normalizeInjectionSettings path is ported as a 5a addition below — src/settings.mjs:187-194).
export function normalizeSettings(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    strength: enumValue(source.strength, STRENGTHS, DEFAULT_RECURSION_SETTINGS.strength),
    cardsPerTurn: normalizeCardBudgetSettings(source).targetCards,
    reasoningLevel: enumValue(source.reasoningLevel, REASONING_LEVELS, DEFAULT_RECURSION_SETTINGS.reasoningLevel),
    promptFootprint: enumValue(source.promptFootprint, FOOTPRINTS, DEFAULT_RECURSION_SETTINGS.promptFootprint),
    focus: enumValue(source.focus, FOCUS, DEFAULT_RECURSION_SETTINGS.focus),
    injection: { ...DEFAULT_RECURSION_SETTINGS.injection }
  };
}

// 5a additions (packet injection plan). INJECTION_PLACEMENTS / INJECTION_ROLES:
// src/settings.mjs:32-33. normalizeInjectionDepth: src/settings.mjs:174-185 (uses
// DEFAULT_RECURSION_SETTINGS.injection and enumValue, both already present above).
// normalizeInjectionSettings: src/settings.mjs:187-194.
const INJECTION_PLACEMENTS = new Set(['in_prompt', 'in_chat']);
const INJECTION_ROLES = new Set(['system', 'user', 'assistant']);

function normalizeInjectionDepth(value) {
  const fallback = DEFAULT_RECURSION_SETTINGS.injection.depth;
  if (value === null || value === undefined) return fallback;
  if (Array.isArray(value) || typeof value === 'boolean' || typeof value === 'object') return fallback;
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed || trimmed === 'default') return fallback;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(Math.min(10, Math.max(0, number)));
}

export function normalizeInjectionSettings(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    placement: enumValue(source.placement, INJECTION_PLACEMENTS, DEFAULT_RECURSION_SETTINGS.injection.placement),
    role: enumValue(source.role, INJECTION_ROLES, DEFAULT_RECURSION_SETTINGS.injection.role),
    depth: normalizeInjectionDepth(source.depth)
  };
}
