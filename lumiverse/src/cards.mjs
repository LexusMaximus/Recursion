// Ported from Recursion src/cards.mjs (MIT License, Copyright (c) 2026 Josh Shapiro).
// Source lines: 12-18, 21-54, 56-58, 60-133, 135-136, 138-142, 143-164, 172-178, 180-211,
// 213-398, 416-418, 457-460, 462-477, 479-512, 514-549, 583-602, 648-725, 727-735, 746-763,
// 765-792, 794-821, 823-828, 830-850, 852-903, 921-973, 1376-1508.
// (11 TEXT_LIMIT is not used by any ported function; not ported.)
// Full license: LICENSE (repo root).
// Dependency additions (marked inline): cards.mjs:14-15, 18 (consts), 56-58 (catalogEntry),
// 583-602 (resolveCatalog).
// 5c additions: 12-13, 16-17, 21-54 (secret-pattern consts), 138 (STATUS), 143-164 (card
// forbidden-pattern consts), 180-211, 213-398, 416-418, 457-460, 468-473, 489-512, 514-549,
// 648-725, 921-973.
// DEVIATION: export added to cleanProviderPromptText (src/cards.mjs:416) so tests can call it directly.
import { compact, hashJson, makeId, nowIso, safeId, truncate } from './core.mjs';
import { unsafeInstructionMatch } from './instruction-safety.mjs';
import { missingPlannedCards } from './card-selection.mjs';
import { summarizeBehaviorPolicyForDiagnostics } from './settings-policy.mjs';

// Dependency of normalizeEvidenceRefs (src/cards.mjs:479-487).
const EVIDENCE_LIMIT = 12;
// Dependency of normalizeEvidenceRefs (src/cards.mjs:479-487).
const EVIDENCE_TEXT_LIMIT = 120;
// Dependency of sanitizeHandCard, plannedCardForJob, selectHand (src/cards.mjs:753, 846, 1394, 1426).
const MAX_TOKEN_ESTIMATE = 1000;
// Dependency of cleanCardPromptText and instructionLines (src/cards.mjs:519, 527).
const CARD_TEXT_LIMIT = Infinity;
// Dependency of normalizeCard (src/cards.mjs:952).
const SUMMARY_LIMIT = 400;
// Dependency of normalizeCard (src/cards.mjs:934).
const INSPECTOR_NOTES_LIMIT = 800;
// Dependency of normalizeCard (src/cards.mjs:966).
const ARBITER_REASON_LIMIT = 240;

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

// Dependency of normalizeCard (src/cards.mjs:942).
const STATUS = new Set(['candidate', 'active', 'stowed', 'stale', 'discarded']);
// Dependency of assertCardPromptTextSafe (src/cards.mjs:541-549).
const CARD_FORBIDDEN_PATTERNS = Object.freeze([
  /\bhidden\s+chain[-\s]of[-\s]thought\b/i,
  /\bchain[-\s]of[-\s]thought\b/i,
  /\bprivate\s+chain[-\s]of[-\s]thought\b/i,
  /\b(hidden|private|secret|undisclosed)\s+(internal\s+)?thoughts?\b/i,
  /\b(private|hidden|secret|undisclosed)\s+(character\s+)?motives?\b/i,
  /\b(hidden|private|secret|undisclosed)\s+future[-\s]+(plans?|plot|story)\b/i,
  /\breveal\s+future\s+plans?\b/i,
  /\b(hidden|private|secret|undisclosed)\s+spoilers?\b/i,
  /\breveal\s+spoilers?\b/i
]);
const CARD_INSTRUCTION_LINE_START_PATTERN = /^(Keep|Preserve|Respect|Use|Avoid|Do not|Track|Hold|Maintain|Show|Withhold|Reveal only|Ensure|Treat|Anchor|Continue)\b/i;
const CARD_NARRATIVE_PROSE_PATTERN = /\b(?:had|was|were|stood|walked|looked|felt|smelled|tasted|sounded|realized|remembered|thought)\b[\s\S]{80,}[.!?]\s+[A-Z]/i;
const CHARACTER_MOTIVATION_FORBIDDEN_PATTERNS = Object.freeze([
  /\b(?:thinks?|thoughts?|inner\s+monologue|internal\s+monologue)\s*:/i,
  /\b(?:secret|hidden|private|undisclosed)\s+(?:thoughts?|motives?|motivations?|plans?|intentions?)\b/i,
  /\breveal\s+(?:their\s+|his\s+|her\s+|my\s+|our\s+)?(?:inner|private|hidden|secret)\s+thoughts?\b/i,
  /\b[A-Z][A-Za-z0-9_.-]*\s+(?:secretly|privately|silently)\s+(?:wants?|plans?|intends?|hopes?|fears?|feels?|knows?|believes?)\b/i,
  /\b(?:he|she|they)\s+(?:secretly|privately|silently)\s+(?:wants?|plans?|intends?|hopes?|fears?|feels?|knows?|believes?)\b/i,
  /(?:^|[\s"'])I\s+(?:secretly|privately|silently|really|actually)\s+(?:want|wants|plan|plans|intend|intends|hope|hopes|fear|fears|feel|feels|know|knows|believe|believes)\b/i,
  /(?:^|[\s"'])I\s+(?:will|would|can|could|should)\s+never\s+reveal\b/i
]);
// Dependency of isProviderPromptSecretKey, shouldRedactProviderPromptAssignment and
// scrubProviderPromptSecrets (src/cards.mjs:180-211, 385-398).
const PROVIDER_PROMPT_SECRET_KEY_SUFFIXES = Object.freeze([
  'apikey',
  'authorization',
  'auth',
  'authentication',
  'authheader',
  'cookie',
  'cookieheader',
  'token',
  'password',
  'secret',
  'session',
  'sessionkey',
  'bearer',
  'privatekey',
  'credential',
  'credentials'
]);
const PROVIDER_PROMPT_SECRET_KEY_QUALIFIERS = Object.freeze([
  'hash',
  'value',
  'header',
  'pem',
  'material',
  'body',
  'text',
  'string',
  'id'
]);
const PROVIDER_PROMPT_SECRET_ASSIGNMENT_PATTERN = /\b([A-Za-z][A-Za-z0-9_-]*)\s*([:=])\s*("[^"]*"|'[^']*'|Bearer\s+[\s\S]*?|[\s\S]*?)(?=\s+(?:[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*|\[[^\]]+\])?\s*[:=]|[{\[])|[,;\n]|$)/gi;
const PROVIDER_PROMPT_BRACKET_ASSIGNMENT_PATTERN = /\[[\\"']+([A-Za-z][A-Za-z0-9_-]*)[\\"']+\]\s*[:=]\s*("[^"]*"|'[^']*'|Bearer\s+[\s\S]*?|[\s\S]*?)(?=\s+(?:[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*|\[[^\]]+\])?\s*[:=]|[{\[])|[,;\n]|$)/gi;
const PROVIDER_PROMPT_SINGLE_QUOTED_PAIR_PATTERN = /'([^']+)'\s*:\s*('(?:[^'\\]|\\.)*'|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/g;
const PROVIDER_PROMPT_MALFORMED_SECRET_JSON_PAIR_PATTERN = /(["'])([A-Za-z0-9_.-]*(?:apiKey|authorization|auth|cookie|token|password|secret|session|bearer|privateKey|credential)[A-Za-z0-9_.-]*)\1\s*:\s*(["'])([^"'}\]]+)\3/gi;
const PROVIDER_PROMPT_AMBIGUOUS_COLON_KEYS = new Set(['bearer', 'secret', 'session', 'token']);

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

// src/cards.mjs:180-211. Dependency of scrubProviderPromptSecrets (cards.mjs:385-398).
function isProviderPromptSecretKey(value) {
  const key = providerPromptKey(value);
  if (!key || key.endsWith('count')) return false;
  return PROVIDER_PROMPT_SECRET_KEY_SUFFIXES.some((suffix) => {
    if (key === suffix || key.endsWith(suffix)) return true;
    return PROVIDER_PROMPT_SECRET_KEY_QUALIFIERS.some((qualifier) => {
      const compound = `${suffix}${qualifier}`;
      return key === compound || key.endsWith(compound);
    });
  });
}

function providerPromptKey(value) {
  return String(value ?? '').replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
}

function isHighConfidenceSecretAssignmentValue(value) {
  const text = String(value ?? '').replace(/^["']|["']$/g, '').toLowerCase();
  return /\bbearer\s+\S+/.test(text)
    || /\bsk-[a-z0-9_-]+\b/i.test(text)
    || /\braw[-_\s]/.test(text)
    || /\b(api[-_\s]*key|authorization|credential|password|private[-_\s]*key|secret[-_\s]*value|session[-_\s]*key|token[-_\s]*value)\b/.test(text)
    || /[a-z0-9_+/=-]{24,}/i.test(text);
}

function shouldRedactProviderPromptAssignment(key, delimiter, value) {
  if (!isProviderPromptSecretKey(key)) return false;
  if (delimiter === ':' && PROVIDER_PROMPT_AMBIGUOUS_COLON_KEYS.has(providerPromptKey(key))) {
    return isHighConfidenceSecretAssignmentValue(value);
  }
  return true;
}

// src/cards.mjs:213-398. Dependency of scrubProviderPromptSecrets (cards.mjs:385-398).
function jsonQuoteInfo(text, start) {
  if (text[start] === '"' || text[start] === "'") {
    return { quote: text[start], contentStart: start + 1, escaped: false };
  }
  if (text[start] === '\\' && (text[start + 1] === '"' || text[start + 1] === "'")) {
    return { quote: text[start + 1], contentStart: start + 2, escaped: true };
  }
  return null;
}

function jsonStringBounds(text, start) {
  const info = jsonQuoteInfo(text, start);
  const quote = info?.quote;
  if (quote !== '"' && quote !== "'") return -1;
  let index = info.contentStart;
  while (index < text.length) {
    const char = text[index];
    if (info.escaped) {
      if (char === '\\' && text[index + 1] === quote && text[index - 1] !== '\\') {
        return { start, contentStart: info.contentStart, contentEnd: index, end: index + 1, quote, escaped: true };
      }
      index += 1;
      continue;
    }
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (char === quote) {
      return { start, contentStart: info.contentStart, contentEnd: index, end: index, quote, escaped: false };
    }
    index += 1;
  }
  return -1;
}

function jsonStringEnd(text, start) {
  const bounds = jsonStringBounds(text, start);
  return bounds === -1 ? -1 : bounds.end;
}

function jsonNestedEnd(text, start, open, close) {
  let depth = 0;
  let index = start;
  while (index < text.length) {
    const char = text[index];
    if (jsonQuoteInfo(text, index)) {
      const end = jsonStringEnd(text, index);
      if (end < 0) return -1;
      index = end + 1;
      continue;
    }
    if (char === open) depth += 1;
    if (char === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
    index += 1;
  }
  return -1;
}

function jsonPrimitiveEnd(text, start) {
  let index = start;
  while (index < text.length && !/[\s,}\]]/.test(text[index])) index += 1;
  return index > start ? index - 1 : -1;
}

function jsonValueEnd(text, start) {
  const char = text[start];
  if (jsonQuoteInfo(text, start)) return jsonStringEnd(text, start);
  if (char === '{') return jsonNestedEnd(text, start, '{', '}');
  if (char === '[') return jsonNestedEnd(text, start, '[', ']');
  return jsonPrimitiveEnd(text, start);
}

function redactedJsonPair(bounds) {
  if (bounds?.escaped) {
    const quote = bounds.quote === "'" ? "\\'" : '\\"';
    return `${quote}[redactedKey]${quote}:${quote}[redacted]${quote}`;
  }
  if (bounds?.quote === "'") return "'[redactedKey]':'[redacted]'";
  return '"[redactedKey]":"[redacted]"';
}

function scrubJsonStringContent(text, bounds) {
  const prefix = text.slice(bounds.start, bounds.contentStart);
  const suffix = text.slice(bounds.contentEnd, bounds.end + 1);
  const originalContent = text.slice(bounds.contentStart, bounds.contentEnd);
  let content = originalContent;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const normalized = content.replace(/\\+(["'])/g, '\\$1');
    const scrubbed = scrubProviderPromptSecrets(normalized);
    if (scrubbed === normalized && normalized !== content) break;
    if (scrubbed === content) break;
    content = scrubbed;
  }
  return `${prefix}${content === originalContent.replace(/\\+(["'])/g, '\\$1') ? originalContent : content}${suffix}`;
}

function redactJsonSecretPairs(value) {
  const text = String(value ?? '');
  let output = '';
  let index = 0;
  while (index < text.length) {
    let keyStart = -1;
    for (let cursor = index; cursor < text.length; cursor += 1) {
      if (jsonQuoteInfo(text, cursor)) {
        keyStart = cursor;
        break;
      }
    }
    if (keyStart < 0) {
      output += text.slice(index);
      break;
    }

    const keyBounds = jsonStringBounds(text, keyStart);
    if (keyBounds === -1) {
      output += text.slice(index);
      break;
    }
    const keyEnd = keyBounds.end;

    let colonIndex = keyEnd + 1;
    while (colonIndex < text.length && /\s/.test(text[colonIndex])) colonIndex += 1;
    if (text[colonIndex] !== ':') {
      output += text.slice(index, keyEnd + 1);
      index = keyEnd + 1;
      continue;
    }

    let valueStart = colonIndex + 1;
    while (valueStart < text.length && /\s/.test(text[valueStart])) valueStart += 1;
    const valueEnd = jsonValueEnd(text, valueStart);
    if (valueEnd < 0) {
      const key = text.slice(keyBounds.contentStart, keyBounds.contentEnd);
      if (isProviderPromptSecretKey(key)) {
        output += `${text.slice(index, keyStart)}${redactedJsonPair(keyBounds)}`;
        break;
      }
      output += text.slice(index, keyEnd + 1);
      index = keyEnd + 1;
      continue;
    }

    const key = text.slice(keyBounds.contentStart, keyBounds.contentEnd);
    if (!isProviderPromptSecretKey(key)) {
      if (text[valueStart] === '{' || text[valueStart] === '[') {
        output += text.slice(index, valueStart);
        output += redactJsonSecretPairs(text.slice(valueStart, valueEnd + 1));
        index = valueEnd + 1;
        continue;
      }
      const valueBounds = jsonStringBounds(text, valueStart);
      if (valueBounds !== -1) {
        output += text.slice(index, valueStart);
        output += scrubJsonStringContent(text, valueBounds);
        index = valueEnd + 1;
        continue;
      }
      output += text.slice(index, valueEnd + 1);
      index = valueEnd + 1;
      continue;
    }

    output += `${text.slice(index, keyStart)}${redactedJsonPair(keyBounds)}`;
    index = valueEnd + 1;
  }
  return output;
}

function scrubProviderPromptSecrets(value) {
  return redactJsonSecretPairs(value)
    .replace(PROVIDER_PROMPT_SINGLE_QUOTED_PAIR_PATTERN, (match, key) => (isProviderPromptSecretKey(key) ? "'[redactedKey]':'[redacted]'" : match))
    .replace(PROVIDER_PROMPT_MALFORMED_SECRET_JSON_PAIR_PATTERN, (match, keyQuote, key, valueQuote) => (
      isProviderPromptSecretKey(key) ? `${keyQuote}[redactedKey]${keyQuote}:${valueQuote}[redacted]${valueQuote}` : match
    ))
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, 'sk-[redacted]')
    .replace(/\bprivate[-_\s]*secret\b/gi, '[redacted]')
    .replace(PROVIDER_PROMPT_BRACKET_ASSIGNMENT_PATTERN, (match, key) => (isProviderPromptSecretKey(key) ? '[redacted]' : match))
    .replace(PROVIDER_PROMPT_SECRET_ASSIGNMENT_PATTERN, (match, key, delimiter, assignmentValue) => (
      shouldRedactProviderPromptAssignment(key, delimiter, assignmentValue) ? '[redacted]' : match
    ));
}

// src/cards.mjs:416-418. Dependency of providerCardRejectReason (cards.mjs:682).
// DEVIATION: export added so tests can call it directly (source line 416).
export function cleanProviderPromptText(value, limit) {
  return cleanText(scrubProviderPromptSecrets(value), limit);
}

// src/cards.mjs:457-460. Dependency of normalizeCard (cards.mjs:934).
function cleanOptionalText(value, limit) {
  const text = cleanText(value, limit);
  return text || undefined;
}

// src/cards.mjs:468-473. Dependency of normalizeCard (cards.mjs:933) and hasValidMessageEvidenceRefs (cards.mjs:506-507).
function optionalNumber(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : undefined;
}

// src/cards.mjs:489-493. Dependency of messageEvidenceRefs and hasValidMessageEvidenceRefs (cards.mjs:496, 502).
function evidenceRefEntries(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

// src/cards.mjs:495-499. Dependency of hasValidMessageEvidenceRefs (cards.mjs:504).
function messageEvidenceRefs(value) {
  return evidenceRefEntries(value)
    .flatMap((entry) => [...String(entry ?? '').matchAll(/\bmessage:(\d+)\b/gi)].map((match) => Number(match[1])))
    .filter((entry) => Number.isSafeInteger(entry));
}

// src/cards.mjs:501-512. Dependency of providerCardRejectReason (cards.mjs:668).
function hasValidMessageEvidenceRefs(value, context = {}) {
  const entries = evidenceRefEntries(value);
  if (!entries.length || entries.some(entry => typeof entry !== 'string' || !/^message:\d+$/i.test(entry.trim()))) return false;
  const refs = messageEvidenceRefs(value);
  if (refs.length !== entries.length) return false;
  const firstMesId = optionalNumber(context.firstMesId);
  const lastMesId = optionalNumber(context.lastMesId);
  if (firstMesId === undefined || lastMesId === undefined) return true;
  const minMesId = Math.min(firstMesId, lastMesId);
  const maxMesId = Math.max(firstMesId, lastMesId);
  return refs.every((entry) => entry >= minMesId && entry <= maxMesId);
}

// src/cards.mjs:514-522. Dependency of normalizeCard (cards.mjs:925).
function cleanCardPromptText(value) {
  // Keep the structure the model was asked to produce. Flattening here makes
  // later instruction lines invisible to validation and prompt composition.
  return String(value ?? '')
    .split(/\r\n?|\n/)
    .map((line) => cleanText(line, CARD_TEXT_LIMIT))
    .filter(Boolean)
    .join('\n');
}

// src/cards.mjs:524-529. Dependency of assertInstructionShapedCardText (cards.mjs:532).
function instructionLines(promptText) {
  return String(promptText || '')
    .split(/\n+|;\s+/)
    .map((line) => cleanText(line.replace(/^\s*(?:[-*+\u2022]\s*|\d+[.)]\s+)/, ''), CARD_TEXT_LIMIT))
    .filter(Boolean);
}

// src/cards.mjs:531-539. Dependency of assertCardPromptTextSafe (cards.mjs:542).
function assertInstructionShapedCardText(promptText) {
  const lines = instructionLines(promptText);
  if (lines.length === 0) throw new Error('Card promptText must be instruction-shaped.');
  const instructionLineCount = lines.filter((line) => CARD_INSTRUCTION_LINE_START_PATTERN.test(line)).length;
  const proseLike = CARD_NARRATIVE_PROSE_PATTERN.test(lines.join(' '));
  if (proseLike && instructionLineCount === 0) {
    throw new Error('Card promptText must be instruction-shaped, not narrative prose.');
  }
}

// src/cards.mjs:541-549. Dependency of normalizeCard (cards.mjs:927).
function assertCardPromptTextSafe(catalog, promptText) {
  assertInstructionShapedCardText(promptText);
  // The shared matcher preserves instruction boundaries and checks wrapped phrases.
  const hiddenMatch = unsafeInstructionMatch(promptText, CARD_FORBIDDEN_PATTERNS);
  if (hiddenMatch) throw new Error('Card promptText contains unsafe hidden-reasoning wording [hidden-content]: "' + hiddenMatch + '".');
  if (catalog.family !== 'Character Motivation') return;
  const motiveMatch = unsafeInstructionMatch(promptText, CHARACTER_MOTIVATION_FORBIDDEN_PATTERNS);
  if (motiveMatch) throw new Error('Character Motivation promptText contains unsafe internal-thought wording [private-claim]: "' + motiveMatch + '".');
}

// src/cards.mjs:648-685. Exported in source.
export function providerCardRejectReason(result, context = {}) {
  if (!result?.ok) return 'provider-failed';
  const data = asObject(result.data);
  let item = data;
  if (!String(data.promptText || '').trim()) {
    const legacyItems = Array.isArray(data.items)
      ? data.items
      : (Array.isArray(data.cards) ? data.cards : []);
    if (legacyItems.length !== 1) return `item-count-${legacyItems.length}`;
    item = asObject(legacyItems[0]);
  }
  const expectedRole = String(context.expectedRole || '').trim();
  const expectedFamily = String(context.expectedFamily || '').trim();
  let catalog = null;
  try {
    catalog = resolveCatalog({ role: expectedRole, family: expectedFamily }, { strict: true });
  } catch {
    return 'catalog-mismatch';
  }
  const evidenceRefs = item.evidenceRefs ?? item.evidence;
  if (!hasValidMessageEvidenceRefs(evidenceRefs, context)) return 'evidence-message-missing';
  try {
    normalizeCard({
      promptText: item.promptText ?? item.text ?? item.claim,
      summary: item.summary,
      evidenceRefs,
      role: catalog.role,
      family: catalog.family,
      detailProfile: context.detailProfile || item.detailProfile || 'standard',
      emphasis: context.emphasis || item.emphasis || 'normal',
      inspectorNotes: item.inspectorNotes,
      origin: item.origin || 'provider'
    }, context);
  } catch (error) {
    return cleanProviderPromptText(error?.message || error || 'normalization-failed', 240);
  }
  return '';
}

// src/cards.mjs:687-697. Dependency of normalizeCard (cards.mjs:930).
function cardIdFor(input, catalog, promptText, context) {
  const seed = `card-${safeId(catalog.family)}-${hashJson({
    family: catalog.family,
    role: catalog.role,
    promptText,
    sceneId: context.sceneId,
    snapshotHash: context.snapshotHash,
    sourceRevisionHash: context.sourceRevisionHash
  })}`;
  return safeId(input.id, seed);
}

// src/cards.mjs:699-725. Dependency of normalizeCard (cards.mjs:929).
function sourceContext(input, context) {
  const source = asObject(input.source);
  const freshness = asObject(input.freshness);
  const snapshotHash = String(
    context.snapshotHash
      ?? input.snapshotHash
      ?? source.snapshotHash
      ?? source.fingerprint
      ?? freshness.sourceFingerprint
      ?? ''
  );
  const sourceRevisionHash = String(
    context.sourceRevisionHash
      ?? input.sourceRevisionHash
      ?? source.sourceRevisionHash
      ?? freshness.sourceRevisionHash
      ?? snapshotHash
  );
  return {
    sceneId: String(context.sceneId ?? input.sceneId ?? 'scene').trim() || 'scene',
    chatId: String(context.chatId ?? source.chatId ?? input.chatId ?? '').trim(),
    firstMesId: numberInRange(context.firstMesId ?? source.firstMesId ?? input.firstMesId, 0, 0, Number.MAX_SAFE_INTEGER),
    lastMesId: numberInRange(context.lastMesId ?? source.lastMesId ?? input.lastMesId, 0, 0, Number.MAX_SAFE_INTEGER),
    snapshotHash,
    sourceRevisionHash
  };
}

// src/cards.mjs:921-973. Exported in source.
export function normalizeCard(input = {}, context = {}) {
  const source = asObject(input);
  const ctx = asObject(context);
  const catalog = resolveCatalog(source);
  const promptText = cleanCardPromptText(source.promptText ?? source.text ?? source.claim);
  if (!promptText) throw new Error('Card promptText is required.');
  assertCardPromptTextSafe(catalog, promptText);

  const normalizedSource = sourceContext(source, ctx);
  const id = cardIdFor(source, catalog, promptText, normalizedSource);
  const freshness = asObject(source.freshness);
  const arbiter = asObject(source.arbiter);
  const expiresAfterMesId = optionalNumber(freshness.expiresAfterMesId ?? source.expiresAfterMesId);
  const inspectorNotes = cleanOptionalText(source.inspectorNotes, INSPECTOR_NOTES_LIMIT);
  const card = {
    id,
    schemaVersion: 1,
    family: catalog.family,
    role: catalog.role,
    sceneId: normalizedSource.sceneId,
    catalogKey: safeId(catalog.family),
    status: validEnum(source.status, STATUS, 'active'),
    source: {
      chatId: normalizedSource.chatId,
      firstMesId: normalizedSource.firstMesId,
      lastMesId: normalizedSource.lastMesId,
      fingerprint: normalizedSource.snapshotHash,
      snapshotHash: normalizedSource.snapshotHash,
      sourceRevisionHash: normalizedSource.sourceRevisionHash
    },
    promptText,
    summary: cleanText(source.summary || promptText, SUMMARY_LIMIT),
    evidenceRefs: normalizeEvidenceRefs(source.evidenceRefs ?? source.evidence),
    tokenEstimate: numberInRange(source.tokenEstimate ?? source.tokenCost, estimateTokens(promptText), 1, MAX_TOKEN_ESTIMATE),
    detailProfile: validEnum(source.detailProfile, DETAIL, 'standard'),
    emphasis: validEnum(source.emphasis, EMPHASIS, 'normal'),
    origin: optionalEnum(source.origin, ORIGIN),
    freshness: {
      generatedAt: String(freshness.generatedAt ?? source.generatedAt ?? nowIso()),
      sourceFingerprint: String(normalizedSource.snapshotHash || freshness.sourceFingerprint || ''),
      sourceRevisionHash: String(normalizedSource.sourceRevisionHash || freshness.sourceRevisionHash || ''),
      expiresAfterMesId
    },
    arbiter: {
      lastDecisionId: String(arbiter.lastDecisionId ?? source.decisionId ?? ctx.decisionId ?? ''),
      reason: cleanText(arbiter.reason ?? source.reason ?? '', ARBITER_REASON_LIMIT)
    }
  };
  if (!card.origin) delete card.origin;
  if (inspectorNotes) card.inspectorNotes = inspectorNotes;
  if (card.freshness.expiresAfterMesId === undefined) delete card.freshness.expiresAfterMesId;
  return card;
}
