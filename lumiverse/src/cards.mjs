// Ported from Recursion src/cards.mjs (MIT License, Copyright (c) 2026 Josh Shapiro).
// Source lines: 14-15, 18, 56-58, 60-133, 135-136, 139-142, 172-178, 462-466, 475-477,
// 479-487, 583-602, 727-735, 746-763, 765-792, 794-821, 823-828, 830-850, 852-903, 1376-1508.
// Full license: LICENSE (repo root).
// Dependency additions (marked inline): cards.mjs:14-15, 18 (consts), 56-58 (catalogEntry),
// 583-602 (resolveCatalog); STATUS (cards.mjs:138) is unused by the ported functions and not ported.
import { compact, makeId, nowIso, safeId, truncate } from './core.mjs';
import { missingPlannedCards } from './card-selection.mjs';
import { summarizeBehaviorPolicyForDiagnostics } from './settings-policy.mjs';

// Dependency of normalizeEvidenceRefs (src/cards.mjs:479-487).
const EVIDENCE_LIMIT = 12;
// Dependency of normalizeEvidenceRefs (src/cards.mjs:479-487).
const EVIDENCE_TEXT_LIMIT = 120;
// Dependency of sanitizeHandCard, plannedCardForJob, selectHand (src/cards.mjs:753, 846, 1394, 1426).
const MAX_TOKEN_ESTIMATE = 1000;

// Dependency of CARD_CATALOG (src/cards.mjs:61).
function catalogEntry(entry) {
  return Object.freeze(entry);
}

export const CARD_CATALOG = Object.freeze([
  catalogEntry({
    family: 'Scene Frame',
    role: 'sceneFrameCard',
    priority: 100,
    description: 'Current situation, useful next exchange, and established limits without inventing a pause.'
  }),
  catalogEntry({
    family: 'Active Cast',
    role: 'activeCastCard',
    priority: 95,
    description: 'Who is present, visible state, and current conversational or physical role.'
  }),
  catalogEntry({
    family: 'Scene Constraints',
    role: 'sceneConstraintsCard',
    priority: 98,
    description: 'Hard limits, contradiction traps, timing, access, visibility, and plausibility constraints.'
  }),
  catalogEntry({
    family: 'Knowledge',
    role: 'knowledgeSecretsCard',
    priority: 92,
    description: 'What each character knows, how they interpret claims, what remains uncertain, and what they can reasonably learn.'
  }),
  catalogEntry({
    family: 'Consequences',
    role: 'clocksConsequencesCard',
    priority: 90,
    description: 'Deadlines, countdowns, delayed consequences, and escalation triggers.'
  }),
  catalogEntry({
    family: 'Character Motivation',
    role: 'characterMotivationCard',
    priority: 88,
    description: 'Established goals, personal stakes, and pressures that make each character respond differently.'
  }),
  catalogEntry({
    family: 'Relationship',
    role: 'dialogueRelationshipCard',
    priority: 84,
    description: 'Relationship history, trust, concern, obligations, and willingness to cooperate under uncertainty.'
  }),
  catalogEntry({
    family: 'Social Subtext',
    role: 'socialSubtextCard',
    priority: 82,
    description: 'Scene-observable implied social meaning such as humor, veiled pressure, invitation, boundaries, status, and face.'
  }),
  catalogEntry({
    family: 'Realism',
    role: 'realismCard',
    priority: 83,
    description: 'Scene-specific emotional and conversational plausibility: relevant stakes, surprising claims, proportionate replies, and evidence-grounded interpretations of intent.'
  }),
  catalogEntry({
    family: 'Items',
    role: 'possessionsItemsCard',
    priority: 78,
    description: 'Important held, carried, worn, hidden, lost, stolen, or controlled objects and who has them.'
  }),
  catalogEntry({
    family: 'Environment',
    role: 'environmentAffordancesCard',
    priority: 76,
    description: 'Spatial layout, sensory texture, hazards, obstacles, exits, and usable environmental affordances.'
  }),
  catalogEntry({
    family: 'Open Threads',
    role: 'openThreadsCard',
    priority: 72,
    description: 'Unresolved questions, immediate promises, pending actions, and near-term pressures.'
  })
]);

const CATALOG_BY_FAMILY = new Map(CARD_CATALOG.map((entry) => [entry.family, entry]));
const CATALOG_BY_ROLE = new Map(CARD_CATALOG.map((entry) => [entry.role, entry]));
// src/cards.mjs:139-142.
const EMPHASIS = new Set(['normal', 'emphasized', 'muted']);
const DETAIL = new Set(['compact', 'standard', 'expanded']);
const ORIGIN = new Set(['cache', 'generated', 'fallback', 'authored']);
const EMPHASIS_PRIORITY = Object.freeze({ emphasized: 0, normal: 1, muted: 2 });

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cleanText(value, limit) {
  return truncate(compact(value ?? '', limit), limit);
}

function numberInRange(value, fallback, min, max) {
  const number = Number(value);
  const resolved = Number.isFinite(number) ? number : fallback;
  return Math.min(max, Math.max(min, Math.round(resolved)));
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || '').length / 4));
}

function normalizeEvidenceRefs(value) {
  const list = Array.isArray(value)
    ? value
    : (value === undefined || value === null || value === '' ? [] : [value]);
  return list
    .map((entry) => cleanText(entry, EVIDENCE_TEXT_LIMIT))
    .filter(Boolean)
    .slice(0, EVIDENCE_LIMIT);
}

// Dependency of plannedCardForJob (src/cards.mjs:832).
function resolveCatalog(input, { strict = true, allowDefault = false } = {}) {
  const source = asObject(input);
  const family = String(source.family ?? '').trim();
  const role = String(source.role ?? source.roleId ?? '').trim();
  const familyCatalog = CATALOG_BY_FAMILY.get(family);
  const roleCatalog = CATALOG_BY_ROLE.get(role);
  if (familyCatalog && roleCatalog && familyCatalog.role !== roleCatalog.role) {
    if (!strict) return null;
    throw new Error(`Card family and role mismatch: ${family} / ${role}`);
  }
  if (familyCatalog) return familyCatalog;
  if (roleCatalog) return roleCatalog;
  if (!family && !role) {
    if (allowDefault) return CARD_CATALOG[0];
    if (!strict) return null;
    throw new Error('Card family or role is required.');
  }
  if (!strict) return null;
  throw new Error(`Unknown card catalog family or role: ${family || role}`);
}

function validEnum(value, allowed, fallback) {
  const text = String(value ?? '').trim();
  return allowed.has(text) ? text : fallback;
}

function optionalEnum(value, allowed) {
  const text = String(value ?? '').trim();
  return allowed.has(text) ? text : '';
}

function sanitizeHandCard(card) {
  const handCard = {
    id: String(card.id || ''),
    family: String(card.family || ''),
    role: String(card.role || ''),
    status: 'active',
    promptText: String(card.promptText || ''),
    tokenEstimate: numberInRange(card.tokenEstimate, estimateTokens(card.promptText), 1, MAX_TOKEN_ESTIMATE),
    detailProfile: validEnum(card.detailProfile, DETAIL, 'standard'),
    emphasis: validEnum(card.emphasis, EMPHASIS, 'normal'),
    evidenceRefs: normalizeEvidenceRefs(card.evidenceRefs)
  };
  const origin = optionalEnum(card.origin, ORIGIN);
  if (origin) handCard.origin = origin;
  if (Array.isArray(card.sourceCardIds) && card.sourceCardIds.length) handCard.sourceCardIds = [...new Set(card.sourceCardIds.map(String).filter(Boolean))];
  if (card.deckCardId) handCard.deckCardId = String(card.deckCardId);
  return handCard;
}

function catalogPriority(card) {
  return CATALOG_BY_FAMILY.get(card.family)?.priority ?? CATALOG_BY_ROLE.get(card.role)?.priority ?? 0;
}

function behaviorPolicyForHand(policy) {
  return policy && typeof policy === 'object' && !Array.isArray(policy) ? policy : null;
}

function boostedFamilySet(policy) {
  return new Set(Array.isArray(policy?.focus?.boostedFamilies) ? policy.focus.boostedFamilies : []);
}

function focusDelta(a, b, policy) {
  const boosted = boostedFamilySet(policy);
  const aBoosted = boosted.has(a.family) ? 1 : 0;
  const bBoosted = boosted.has(b.family) ? 1 : 0;
  return bBoosted - aBoosted;
}

function sortCardsForHand(a, b, policy = null) {
  const emphasisDelta = (EMPHASIS_PRIORITY[a.emphasis] ?? 1) - (EMPHASIS_PRIORITY[b.emphasis] ?? 1);
  if (emphasisDelta !== 0) return emphasisDelta;
  const boostedDelta = focusDelta(a, b, policy);
  if (boostedDelta !== 0) return boostedDelta;
  const priorityDelta = catalogPriority(b) - catalogPriority(a);
  if (priorityDelta !== 0) return priorityDelta;
  return String(a.id || '').localeCompare(String(b.id || ''));
}

function forcedFamilyOrder(values = []) {
  const order = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    const family = String(value || '').trim();
    if (family && !order.has(family)) order.set(family, order.size);
  }
  return order;
}

function forcedCardOrder(values = []) {
  const order = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    const id = String(value || '').trim();
    if (id && !order.has(id)) order.set(id, order.size);
  }
  return order;
}

function forcedFamilyOmission(family) {
  const cleanFamily = String(family || '').trim();
  if (!cleanFamily) return null;
  return {
    cardId: `manual-forced-${safeId(cleanFamily)}`,
    family: cleanFamily,
    reason: 'manual-forced-provider-failed',
    tokenEstimate: 0
  };
}

function effectiveMaxCardsForPolicy(maxCards, policy) {
  const base = numberInRange(maxCards, 6, 0, 64);
  if (!policy) return base;
  const ceiling = numberInRange(policy.cardBudget?.targetCards, base, 0, 64);
  return Math.min(base, ceiling);
}

function plannedCardForJob(job) {
  const source = asObject(job);
  const catalog = resolveCatalog({
    family: source.family,
    role: source.role ?? source.roleId
  }, { strict: false });
  if (!catalog) return null;
  return {
    job: { ...source },
    family: catalog.family,
    role: catalog.role,
    emphasis: validEnum(source.emphasis, EMPHASIS, 'normal'),
    tokenEstimate: numberInRange(
      source.tokenEstimate ?? source.tokenCost,
      estimateTokens(source.reason || catalog.description),
      1,
      MAX_TOKEN_ESTIMATE
    ),
    id: source.id || `planned-${safeId(catalog.family)}`
  };
}

export function limitCardJobsForHandBudget(cardJobs = [], { maxCards = 6, behaviorPolicy = null, forcedFamilies = [], reservedCardSlots = 0 } = {}) {
  const policy = behaviorPolicyForHand(behaviorPolicy);
  const requestedCardLimit = numberInRange(maxCards, 6, 0, 64);
  const forcedOrder = forcedFamilyOrder(forcedFamilies);
  const cardLimit = Math.max(0, effectiveMaxCardsForPolicy(requestedCardLimit, policy) - reservedCardSlots, forcedOrder.size);
  const planned = (Array.isArray(cardJobs) ? cardJobs : [])
    .map((job, index) => {
      const card = plannedCardForJob(job);
      return card ? { ...card, index } : null;
    })
    .filter(Boolean);
  if (!planned.length || planned.length <= cardLimit) {
    return {
      cardJobs: planned.map((entry) => entry.job),
      omitted: [],
      metadata: {
        maxCards: cardLimit,
        requestedMaxCards: requestedCardLimit,
        requestedCount: planned.length,
        keptCount: planned.length,
        omittedCount: 0
      }
    };
  }
  const sorted = planned.slice().sort((a, b) => {
    const aForced = forcedOrder.has(a.family);
    const bForced = forcedOrder.has(b.family);
    if (aForced !== bForced) return aForced ? -1 : 1;
    if (aForced && bForced) return forcedOrder.get(a.family) - forcedOrder.get(b.family);
    return a.index - b.index;
  });
  const keptIndexes = new Set(sorted.slice(0, cardLimit).map((entry) => entry.index));
  const kept = sorted.filter((entry) => keptIndexes.has(entry.index));
  const omitted = sorted.filter((entry) => !keptIndexes.has(entry.index));
  return {
    cardJobs: kept.map((entry) => entry.job),
    omitted: omitted.map((entry) => ({
      family: entry.family,
      role: entry.role,
      reason: 'max-cards',
      tokenEstimate: entry.tokenEstimate
    })),
    metadata: {
      maxCards: cardLimit,
      requestedMaxCards: requestedCardLimit,
      requestedCount: planned.length,
      keptCount: kept.length,
      omittedCount: omitted.length,
      forcedFamilies: [...forcedOrder.keys()]
    }
  };
}

export function selectHand(cards = [], { maxCards = 6, maxTokens = 700, behaviorPolicy = null, forcedFamilies = [], forcedCardIds = [], selectionOrder = null, selectionDiagnostics = null } = {}) {
  const policy = behaviorPolicyForHand(behaviorPolicy);
  const requestedCardLimit = numberInRange(maxCards, 6, 0, 64);
  const forcedOrder = forcedFamilyOrder(forcedFamilies);
  const forcedCardOrderMap = forcedCardOrder(forcedCardIds);
  let cardLimit = Math.max(effectiveMaxCardsForPolicy(requestedCardLimit, policy), forcedOrder.size);
  const tokenLimit = numberInRange(maxTokens, 700, 0, 20000);
  const active = [];
  const omitted = [];

  for (const card of Array.isArray(cards) ? cards : []) {
    if (card?.status === 'active') {
      active.push(card);
    } else if (card?.id) {
      omitted.push({
        cardId: card.id,
        family: card.family || '',
        reason: 'inactive',
        tokenEstimate: numberInRange(card.tokenEstimate, 0, 0, MAX_TOKEN_ESTIMATE)
      });
    }
  }

  const selected = [];
  let tokenEstimate = 0;
  const priorityRank = (card) => Math.min(...[card.id, ...(card.sourceCardIds || [])]
    .map((id) => forcedCardOrderMap.get(id) ?? Infinity));
  const priorityCount = active.filter((card) => Number.isFinite(priorityRank(card)) || forcedOrder.has(card.family)).length;
  cardLimit = Math.max(cardLimit, priorityCount);
  const selectedPriorityIds = new Set();
  const selectionRanks = new Map((selectionOrder || []).map((key, index) => [key, index]));
  const selectionRank = (card) => Math.min(selectionRanks.get(card.id) ?? Infinity, selectionRanks.get(card.family) ?? Infinity);
  const sortedCards = active.slice().sort((a, b) => {
    const aForcedCard = Number.isFinite(priorityRank(a));
    const bForcedCard = Number.isFinite(priorityRank(b));
    if (aForcedCard !== bForcedCard) return aForcedCard ? -1 : 1;
    if (aForcedCard && bForcedCard) return priorityRank(a) - priorityRank(b);
    const aForced = forcedOrder.has(a.family);
    const bForced = forcedOrder.has(b.family);
    if (aForced !== bForced) return aForced ? -1 : 1;
    if (aForced && bForced) return forcedOrder.get(a.family) - forcedOrder.get(b.family);
    if (Array.isArray(selectionOrder)) {
      const aRank = selectionRank(a);
      const bRank = selectionRank(b);
      if (aRank !== bRank) return aRank - bRank;
      return 0;
    }
    return sortCardsForHand(a, b, policy);
  });
  for (const card of sortedCards) {
    const cardTokens = numberInRange(card.tokenEstimate, estimateTokens(card.promptText), 1, MAX_TOKEN_ESTIMATE);
    if (selected.length >= cardLimit) {
      omitted.push({
        cardId: card.id,
        family: card.family || '',
        reason: 'max-cards',
        tokenEstimate: cardTokens
      });
      continue;
    }
    tokenEstimate += cardTokens;
    for (const id of [card.id, ...(card.sourceCardIds || [])]) {
      if (forcedCardOrderMap.has(id)) selectedPriorityIds.add(id);
    }
    selected.push(sanitizeHandCard({
      ...card,
      tokenEstimate: cardTokens
    }));
  }

  const activeFamilies = new Set(active.map((card) => String(card.family || '').trim()).filter(Boolean));
  for (const family of forcedOrder.keys()) {
    if (!activeFamilies.has(family)) {
      const omission = forcedFamilyOmission(family);
      if (omission) omitted.push(omission);
    }
  }

  const missing = missingPlannedCards(selected, selectionDiagnostics?.retained || []);
  const behaviorPolicyMetadata = policy
    ? {
        ...summarizeBehaviorPolicyForDiagnostics(policy, {
          effectiveFootprint: policy.footprint?.level,
          selectedFamilies: selected.map((card) => card.family),
          planShaping: [
            policy.focus?.level && policy.focus.level !== 'balanced' ? 'focus-family-ordering' : '',
            Number.isFinite(policy.cardBudget?.targetCards) && policy.cardBudget.targetCards < requestedCardLimit ? 'card-budget-ceiling' : ''
          ]
        }),
        effectiveMaxCards: cardLimit
      }
    : null;
  return {
    handId: makeId('hand'),
    cards: selected,
    omitted,
    tokenEstimate,
    composedAt: nowIso(),
    metadata: {
      maxCards: cardLimit,
      requestedMaxCards: requestedCardLimit,
      maxTokens: tokenLimit,
      ...(selectionDiagnostics ? { selection: {
        ...selectionDiagnostics,
        selectedCount: selected.length,
        authoredCount: selected.filter((card) => card.origin === 'authored').length,
        generatedCount: selected.filter((card) => card.origin !== 'authored').length,
        shortfallCount: Math.max(0, Number(selectionDiagnostics.targetCount || 0) - selected.length),
        missingPlannedCards: missing,
        shortfallReasons: [
          ...(selectionDiagnostics.shortfallReason ? [selectionDiagnostics.shortfallReason] : []),
          ...(missing.length ? ['planned-card-missing'] : [])
        ],
        selected: selected.map((card) => ({
          id: card.id, family: card.family,
          source: card.origin || 'cache',
          mandatory: [card.id, ...(card.sourceCardIds || [])].some((id) => forcedCardOrderMap.has(id)) || forcedOrder.has(card.family)
        })),
        handOmissions: omitted.map(({ cardId, family, reason }) => ({ cardId, family, reason }))
      } } : {}),
      selectedCount: selected.length,
      omittedCount: omitted.length,
      forcedFamilies: [...forcedOrder.keys()],
      forcedCardIds: [...forcedCardOrderMap.keys()],
      selectedForcedFamilies: selected.map((card) => card.family).filter((family) => forcedOrder.has(family)),
      selectedForcedCardIds: [...forcedCardOrderMap.keys()].filter((id) => selectedPriorityIds.has(id)),
      diagnostics: [],
      tokenBudgetExceeded: tokenLimit > 0 && tokenEstimate > tokenLimit,
      sourceCardCount: Array.isArray(cards) ? cards.length : 0,
      ...(behaviorPolicyMetadata ? { behaviorPolicy: behaviorPolicyMetadata } : {})
    }
  };
}




