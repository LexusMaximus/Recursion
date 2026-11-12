// Ours (not ported): Step 5b assert tests for the hand-selection port. No test framework
// (mirrors the Recursion tools/ assert-script pattern). Run from the repo root:
//   bun lumiverse/tests/cards.mjs
import { assert, assertEqual, assertDeepEqual, report } from './helpers.mjs';
import { MINI_DECK } from '../src/deck.ts';
import { CARD_CATALOG, limitCardJobsForHandBudget, selectHand } from '../src/cards.mjs';
import { influencePolicyForSettings } from '../src/settings-policy.mjs';

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`FAIL - ${name}: ${error.message}`);
    process.exitCode = 1;
  }
}

function card(id, family, role, overrides = {}) {
  return {
    id,
    family,
    role,
    status: 'active',
    promptText: `Prompt text for ${id}.`,
    tokenEstimate: 10,
    detailProfile: 'standard',
    emphasis: 'normal',
    evidenceRefs: [],
    ...overrides
  };
}

test('MINI_DECK families exist in CARD_CATALOG and round-trip through sanitizeHandCard (via selectHand) unchanged', () => {
  const catalogFamilies = new Set(CARD_CATALOG.map((entry) => entry.family));
  for (const entry of MINI_DECK) {
    assert(catalogFamilies.has(entry.family), `family missing from CARD_CATALOG: ${entry.family}`);
  }
  const hand = selectHand([...MINI_DECK], { maxCards: 10 });
  assertEqual(hand.cards.length, MINI_DECK.length, 'selected count');
  const byId = new Map(hand.cards.map((card) => [card.id, card]));
  for (const entry of MINI_DECK) {
    assertDeepEqual(byId.get(entry.id), entry, `identity pass for ${entry.id}`);
  }
});

test('selectHand ordering: emphasis rank, then catalog priority, then id', () => {
  const cards = [
    card('norm-frame', 'Scene Frame', 'sceneFrameCard'),
    card('emph-item', 'Items', 'possessionsItemsCard', { emphasis: 'emphasized' }),
    card('a-item', 'Items', 'possessionsItemsCard'),
    card('b-item', 'Items', 'possessionsItemsCard'),
    card('muted-knowledge', 'Knowledge', 'knowledgeSecretsCard', { emphasis: 'muted' })
  ];
  const hand = selectHand(cards, { maxCards: 10 });
  assertDeepEqual(
    hand.cards.map((entry) => entry.id),
    ['emph-item', 'norm-frame', 'a-item', 'b-item', 'muted-knowledge'],
    'expected id sequence'
  );
});

test('maxCards 0 -> cards [] and omissions reason max-cards', () => {
  const hand = selectHand([
    card('c1', 'Scene Frame', 'sceneFrameCard'),
    card('c2', 'Items', 'possessionsItemsCard')
  ], { maxCards: 0 });
  assertEqual(hand.cards.length, 0, 'cards empty');
  assertEqual(hand.omitted.length, 2, 'omission count');
  for (const omission of hand.omitted) {
    assertEqual(omission.reason, 'max-cards', 'omission reason');
  }
});

test('empty deck -> cards [], tokenEstimate 0, no throw', () => {
  const hand = selectHand([]);
  assertEqual(hand.cards.length, 0, 'cards empty');
  assertEqual(hand.tokenEstimate, 0, 'tokenEstimate');
  assertEqual(hand.metadata.sourceCardCount, 0, 'sourceCardCount');
});

test('inactive cards -> reason inactive', () => {
  const hand = selectHand([
    card('gone', 'Items', 'possessionsItemsCard', { status: 'stowed' })
  ]);
  assertEqual(hand.cards.length, 0, 'cards empty');
  assertEqual(hand.omitted.length, 1, 'omission count');
  assertEqual(hand.omitted[0].cardId, 'gone', 'omitted cardId');
  assertEqual(hand.omitted[0].reason, 'inactive', 'omission reason');
});

test('tight maxTokens -> metadata.tokenBudgetExceeded true', () => {
  const cards = [
    card('t1', 'Scene Frame', 'sceneFrameCard', { tokenEstimate: 300 }),
    card('t2', 'Items', 'possessionsItemsCard', { tokenEstimate: 300 })
  ];
  assertEqual(selectHand(cards).metadata.tokenBudgetExceeded, false, 'default budget (700) not exceeded by 600');
  assertEqual(selectHand(cards, { maxTokens: 500 }).metadata.tokenBudgetExceeded, true, 'tight budget exceeded');
});

test('forcedFamilies selected first; missing forced family -> manual-forced-provider-failed', () => {
  const hand = selectHand([
    card('frame', 'Scene Frame', 'sceneFrameCard'),
    card('item', 'Items', 'possessionsItemsCard')
  ], { maxCards: 5, forcedFamilies: ['Items', 'Knowledge'] });
  assertEqual(hand.cards[0].id, 'item', 'forced family sorted first');
  const failed = hand.omitted.find((entry) => entry.reason === 'manual-forced-provider-failed');
  assert(failed, 'missing forced family omission present');
  assertEqual(failed.family, 'Knowledge', 'omission family');
  assertEqual(failed.cardId, 'manual-forced-Knowledge', 'omission cardId');
  assertDeepEqual(hand.metadata.forcedFamilies, ['Items', 'Knowledge'], 'metadata.forcedFamilies');
  assertDeepEqual(hand.metadata.selectedForcedFamilies, ['Items'], 'metadata.selectedForcedFamilies');
});

test('forcedCardIds prioritized; metadata.selectedForcedCardIds populated', () => {
  const hand = selectHand([
    card('low', 'Items', 'possessionsItemsCard'),
    card('high', 'Scene Frame', 'sceneFrameCard'),
    card('mid', 'Knowledge', 'knowledgeSecretsCard')
  ], { forcedCardIds: ['low'] });
  assertEqual(hand.cards[0].id, 'low', 'forced card sorted first');
  assertDeepEqual(hand.metadata.forcedCardIds, ['low'], 'metadata.forcedCardIds');
  assertDeepEqual(hand.metadata.selectedForcedCardIds, ['low'], 'metadata.selectedForcedCardIds');
});

test('hand shape; invalid enums fall back to standard/normal', () => {
  const hand = selectHand([
    card('x', 'Items', 'possessionsItemsCard', { detailProfile: 'bogus', emphasis: 'weird' })
  ]);
  const entry = hand.cards[0];
  assertDeepEqual(
    Object.keys(entry),
    ['id', 'family', 'role', 'status', 'promptText', 'tokenEstimate', 'detailProfile', 'emphasis', 'evidenceRefs'],
    'hand card shape'
  );
  assertEqual(entry.status, 'active', 'status');
  assertEqual(entry.detailProfile, 'standard', 'invalid detailProfile fallback');
  assertEqual(entry.emphasis, 'normal', 'invalid emphasis fallback');
});

test('handId matches /^hand-/ and composedAt is ISO (format only)', () => {
  const hand = selectHand([card('y', 'Items', 'possessionsItemsCard')]);
  assert(/^hand-/.test(hand.handId), `handId format: ${hand.handId}`);
  assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(hand.composedAt), `composedAt format: ${hand.composedAt}`);
});

test('limitCardJobsForHandBudget: kept+omitted = requested', () => {
  const jobs = [
    { family: 'Scene Frame', role: 'sceneFrameCard', tokenEstimate: 10 },
    { family: 'Active Cast', role: 'activeCastCard', tokenEstimate: 10 },
    { family: 'Knowledge', role: 'knowledgeSecretsCard', tokenEstimate: 10 },
    { family: 'Items', role: 'possessionsItemsCard', tokenEstimate: 10 },
    { family: 'Open Threads', role: 'openThreadsCard', tokenEstimate: 10 }
  ];
  const result = limitCardJobsForHandBudget(jobs, { maxCards: 3 });
  assertEqual(result.cardJobs.length + result.omitted.length, jobs.length, 'kept+omitted = requested');
  assertEqual(result.metadata.keptCount, 3, 'keptCount');
  assertEqual(result.metadata.omittedCount, 2, 'omittedCount');
  for (const omission of result.omitted) {
    assertEqual(omission.reason, 'max-cards', 'omission reason');
  }
});

test('limitCardJobsForHandBudget: forced families survive first', () => {
  const result = limitCardJobsForHandBudget([
    { family: 'Scene Frame', role: 'sceneFrameCard', tokenEstimate: 10 },
    { family: 'Items', role: 'possessionsItemsCard', tokenEstimate: 10 },
    { family: 'Knowledge', role: 'knowledgeSecretsCard', tokenEstimate: 10 }
  ], { maxCards: 2, forcedFamilies: ['Knowledge'] });
  assertDeepEqual(result.cardJobs.map((job) => job.family), ['Knowledge', 'Scene Frame'], 'kept families');
  assertDeepEqual(result.omitted.map((entry) => entry.family), ['Items'], 'omitted families');
});

test('limitCardJobsForHandBudget: reservedCardSlots reduces the limit; empty input -> empty result', () => {
  const result = limitCardJobsForHandBudget([
    { family: 'Scene Frame', role: 'sceneFrameCard', tokenEstimate: 10 },
    { family: 'Items', role: 'possessionsItemsCard', tokenEstimate: 10 }
  ], { maxCards: 3, reservedCardSlots: 2 });
  assertEqual(result.metadata.maxCards, 1, 'reduced cardLimit');
  assertEqual(result.cardJobs.length, 1, 'kept count');
  assertEqual(result.omitted.length, 1, 'omitted count');
  const empty = limitCardJobsForHandBudget([], { maxCards: 3 });
  assertDeepEqual(empty.cardJobs, [], 'empty cardJobs');
  assertDeepEqual(empty.omitted, [], 'empty omitted');
  assertEqual(empty.metadata.requestedCount, 0, 'requestedCount');
});

test('reduced normalizeSettings defaults give the source default policy values', () => {
  const policy = influencePolicyForSettings({});
  assertEqual(policy.strength.level, 'balanced', 'strength');
  assertEqual(policy.focus.level, 'balanced', 'focus');
  assertEqual(policy.footprint.level, 'compact', 'footprint (settings.mjs:67 default)');
  assertDeepEqual(policy.cardBudget, { targetCards: 6 }, 'cardBudget (settings.mjs:61 default)');
  assertEqual(policy.reasoningLevel, 'medium', 'reasoningLevel (settings.mjs:66 default)');
  const custom = influencePolicyForSettings({ strength: 'strong', promptFootprint: 'rich', focus: 'plot', cardsPerTurn: 3 });
  assertEqual(custom.strength.level, 'strong', 'custom strength');
  assertEqual(custom.footprint.level, 'rich', 'custom footprint');
  assertEqual(custom.focus.level, 'plot', 'custom focus');
  assertDeepEqual(custom.cardBudget, { targetCards: 3 }, 'custom cardBudget');
});

test('policy.injection from reduced normalizeSettings equals source defaults and appears in the policy', () => {
  const policy = influencePolicyForSettings({});
  assert('injection' in policy, 'injection key present in policy');
  assertDeepEqual(policy.injection, { placement: 'in_prompt', role: 'system', depth: 1 }, 'injection defaults');
});

test('resolveCatalog resolves a MINI_DECK family/role (via limitCardJobsForHandBudget; resolveCatalog is not exported)', () => {
  const entry = MINI_DECK[0];
  const good = limitCardJobsForHandBudget([{ family: entry.family, role: entry.role, tokenEstimate: 10 }], { maxCards: 4 });
  assertEqual(good.cardJobs.length, 1, 'MINI_DECK family/role resolved');
  assertEqual(good.omitted.length, 0, 'nothing omitted');
  const bad = limitCardJobsForHandBudget([{ family: 'No Such Family', role: 'nope', tokenEstimate: 10 }], { maxCards: 4 });
  assertEqual(bad.cardJobs.length, 0, 'unknown family dropped (resolveCatalog -> null)');
});

report('cards');



