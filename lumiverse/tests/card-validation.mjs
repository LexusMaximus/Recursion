// Ours (not ported): Step 5c assert tests for the card-validation port. No test framework
// (mirrors the Recursion tools/ assert-script pattern). Run from the repo root:
//   bun lumiverse/tests/card-validation.mjs
import { assert, assertEqual, assertDeepEqual, report } from './helpers.mjs';
import {
  CARD_CATALOG,
  cleanProviderPromptText,
  normalizeCard,
  providerCardRejectReason
} from '../src/cards.mjs';
import { unsafeInstructionMatch } from '../src/instruction-safety.mjs';

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`FAIL - ${name}: ${error.message}`);
    process.exitCode = 1;
  }
}

function throwsWith(fn, needle, label) {
  let message = '';
  try {
    fn();
  } catch (error) {
    message = String(error && error.message ? error.message : error);
  }
  assert(message.includes(needle), `${label} — expected error containing "${needle}", got "${message}"`);
}

test('valid card passes normalizeCard (src/cards.mjs:921-973)', () => {
  // Family/role taken from the CARD_CATALOG 'Scene Frame' entry (src/cards.mjs:62-63).
  const promptText = 'Keep focus on the immediate objective.\nPreserve the established time pressure.';
  const card = normalizeCard({
    family: 'Scene Frame',
    role: 'sceneFrameCard',
    promptText,
    evidenceRefs: ['message:3']
  }, { sceneId: 'scene' });
  // family/role echo the resolved catalog entry (src/cards.mjs:938-939 via resolveCatalog 583-602).
  assertEqual(card.family, 'Scene Frame', 'family');
  assertEqual(card.role, 'sceneFrameCard', 'role');
  // status falls back to 'active' (src/cards.mjs:942 via validEnum 727-730 + STATUS 138).
  assertEqual(card.status, 'active', 'status fallback');
  // tokenEstimate = clamp(1..MAX_TOKEN_ESTIMATE, ceil(len/4))
  // (src/cards.mjs:954 via estimateTokens 475-477 and numberInRange 462-466).
  assertEqual(card.tokenEstimate, Math.ceil(promptText.length / 4), 'tokenEstimate');
  // catalogKey = safeId(catalog.family) (src/cards.mjs:941; core.mjs sanitizeId 55-61 turns
  // the space into '-'), deterministic.
  assertEqual(card.catalogKey, 'Scene-Frame', 'catalogKey');
  // summary defaults to promptText run through cleanText (src/cards.mjs:952 via 176-178;
  // compact collapses the line break to a single space, core.mjs:67-69), under SUMMARY_LIMIT.
  assertEqual(card.summary, 'Keep focus on the immediate objective. Preserve the established time pressure.', 'summary default');
  // evidenceRefs pass through normalizeEvidenceRefs (src/cards.mjs:953, 479-487).
  assertDeepEqual(card.evidenceRefs, ['message:3'], 'evidenceRefs');
  // schemaVersion is fixed (src/cards.mjs:937).
  assertEqual(card.schemaVersion, 1, 'schemaVersion');
  // id is deterministic (src/cards.mjs:687-697 cardIdFor via safeId + hashJson).
  // No exact id or timestamp is asserted (generatedAt uses nowIso, src/cards.mjs:959).
  const again = normalizeCard({
    family: 'Scene Frame',
    role: 'sceneFrameCard',
    promptText,
    evidenceRefs: ['message:3']
  }, { sceneId: 'scene' });
  assertEqual(card.id, again.id, 'id determinism');
  assert(card.id.length > 0, 'id non-empty');
});
test('unsafe prompt text is rejected (assertCardPromptTextSafe via normalizeCard, src/cards.mjs:541-549)', () => {
  // Hidden-reasoning wording -> [hidden-content] (src/cards.mjs:545, CARD_FORBIDDEN_PATTERNS 143-153).
  throwsWith(
    () => normalizeCard({ family: 'Scene Frame', role: 'sceneFrameCard', promptText: 'Reveal spoilers about the ending.' }),
    '[hidden-content]',
    'hidden-reasoning rejection'
  );
  // Narrative prose without instruction lines -> rejected
  // (assertInstructionShapedCardText src/cards.mjs:531-539 via CARD_NARRATIVE_PROSE_PATTERN 155).
  throwsWith(
    () => normalizeCard({
      family: 'Scene Frame',
      role: 'sceneFrameCard',
      promptText: 'The corridor was long and silent and the lamps along the walls burned very low, and she felt the whole weight of the day settle over her shoulders. Nothing moved.'
    }),
    'instruction-shaped',
    'narrative prose rejection'
  );
  // Character Motivation + inner-monologue wording -> [private-claim]
  // (src/cards.mjs:546-548, CHARACTER_MOTIVATION_FORBIDDEN_PATTERNS 156-164, pattern 0).
  throwsWith(
    () => normalizeCard({
      family: 'Character Motivation',
      role: 'characterMotivationCard',
      promptText: 'Track her shifting loyalty.\nHer inner monologue: describe her doubt.'
    }),
    '[private-claim]',
    'private-claim rejection'
  );
  // Control: same family, safe instruction text passes.
  const ok = normalizeCard({ family: 'Character Motivation', role: 'characterMotivationCard', promptText: 'Track her shifting loyalty.' });
  assertEqual(ok.family, 'Character Motivation', 'safe Character Motivation passes');
});

test('secrets are scrubbed from provider text (scrubProviderPromptSecrets via cleanProviderPromptText, src/cards.mjs:385-398, 416-418)', () => {
  // Bearer rule (src/cards.mjs:391) consumes "Bearer <token>" entirely.
  assertEqual(
    cleanProviderPromptText('connect with Bearer sk-live-abcdef123456 today', 500),
    'connect with Bearer [redacted] today',
    'Bearer token redacted'
  );
  // Assignment rule (src/cards.mjs:395-397): quoted apiKey value is redacted.
  assertEqual(
    cleanProviderPromptText('apiKey: "super-secret-value-9876543210"', 500),
    '[redacted]',
    'apiKey assignment redacted'
  );
  // JSON pair path (src/cards.mjs:313-383 via redactedJsonPair 295).
  assertEqual(
    cleanProviderPromptText('{"apiKey":"value123456789"}', 500),
    '{"[redactedKey]":"[redacted]"}',
    'JSON secret pair redacted'
  );
  // Bare sk- key (src/cards.mjs:392).
  assertEqual(cleanProviderPromptText('key sk-test123456789 end', 500), 'key sk-[redacted] end', 'sk- key redacted');
  // Non-secret keys survive (isProviderPromptSecretKey src/cards.mjs:180-190; 'count' keys
  // excluded at line 182).
  assertEqual(
    cleanProviderPromptText('tokenCount: 5 and attempts: 3', 500),
    'tokenCount: 5 and attempts: 3',
    'non-secret assignments kept'
  );
});
function providerFixture(dataOverrides = {}, contextOverrides = {}) {
  return {
    result: {
      ok: true,
      data: {
        promptText: 'Keep the objective visible.',
        evidenceRefs: ['message:3'],
        ...dataOverrides
      }
    },
    context: {
      expectedFamily: 'Scene Frame',
      expectedRole: 'sceneFrameCard',
      firstMesId: 1,
      lastMesId: 10,
      ...contextOverrides
    }
  };
}

test('providerCardRejectReason accepts a valid provider card (src/cards.mjs:648-685)', () => {
  const { result, context } = providerFixture();
  assertEqual(providerCardRejectReason(result, context), '', 'valid card accepted');
  // Without first/lastMesId the refs are accepted as-is (src/cards.mjs:508).
  const { result: r2 } = providerFixture();
  assertEqual(providerCardRejectReason(r2, { expectedFamily: 'Scene Frame', expectedRole: 'sceneFrameCard' }), '', 'valid without window bounds');
});

test('providerCardRejectReason: provider failure, item count, catalog mismatch (src/cards.mjs:648-685)', () => {
  // result.ok false -> 'provider-failed' (src/cards.mjs:649).
  assertEqual(providerCardRejectReason({ ok: false, data: {} }, {}), 'provider-failed', 'provider-failed');
  // Empty promptText falls back to legacy items; count != 1 -> 'item-count-N' (src/cards.mjs:652-656).
  assertEqual(
    providerCardRejectReason({ ok: true, data: { promptText: '', items: [{}, {}] } }, { expectedFamily: 'Scene Frame', expectedRole: 'sceneFrameCard' }),
    'item-count-2',
    'item-count-2'
  );
  // Family/role pair that resolveCatalog rejects -> 'catalog-mismatch'
  // (src/cards.mjs:663-665; the throw comes from resolveCatalog src/cards.mjs:591).
  const { result } = providerFixture();
  assertEqual(
    providerCardRejectReason(result, { expectedFamily: 'Scene Frame', expectedRole: 'characterMotivationCard' }),
    'catalog-mismatch',
    'catalog-mismatch'
  );
});

test('evidence-ref validation via providerCardRejectReason (src/cards.mjs:501-512, 495-499)', () => {
  const base = providerFixture();
  assertEqual(providerCardRejectReason(base.result, base.context), '', 'valid ref accepted');
  // No refs at all (src/cards.mjs:503: empty entries -> false; rejected at 668).
  assertEqual(
    providerCardRejectReason({ ok: true, data: { promptText: 'Keep the objective visible.' } }, base.context),
    'evidence-message-missing',
    'missing refs'
  );
  // Non-string entry (src/cards.mjs:503).
  assertEqual(
    providerCardRejectReason(providerFixture({ evidenceRefs: [3] }).result, base.context),
    'evidence-message-missing',
    'non-string ref'
  );
  // Wrong format (src/cards.mjs:503: /^message:\d+$/i).
  assertEqual(
    providerCardRejectReason(providerFixture({ evidenceRefs: ['msg:3'] }).result, base.context),
    'evidence-message-missing',
    'wrong format'
  );
  // Out-of-window ref (src/cards.mjs:509-511).
  assertEqual(
    providerCardRejectReason(providerFixture({ evidenceRefs: ['message:99'] }).result, base.context),
    'evidence-message-missing',
    'out of window'
  );
});

test('providerCardRejectReason returns a scrubbed normalization error (src/cards.mjs:669-683)', () => {
  const reason = providerCardRejectReason(
    { ok: true, data: { promptText: 'Reveal spoilers about the ending.', evidenceRefs: ['message:3'] } },
    { expectedFamily: 'Scene Frame', expectedRole: 'sceneFrameCard', firstMesId: 1, lastMesId: 10 }
  );
  assert(reason.includes('hidden-content'), `expected hidden-content reason, got "${reason}"`);
});

test('invalid enums and missing fields (normalizeCard, src/cards.mjs:921-973)', () => {
  // Empty promptText (src/cards.mjs:926).
  throwsWith(
    () => normalizeCard({ family: 'Scene Frame', role: 'sceneFrameCard', promptText: '' }),
    'Card promptText is required.',
    'empty promptText'
  );
  // Unknown catalog entry (resolveCatalog src/cards.mjs:601, via normalizeCard 924).
  throwsWith(
    () => normalizeCard({ family: 'No Such Family', role: 'noSuchRole', promptText: 'Keep going.' }),
    'Unknown card catalog family or role',
    'unknown catalog entry'
  );
  const card = normalizeCard({
    family: 'Scene Frame',
    role: 'sceneFrameCard',
    promptText: 'Keep going.',
    status: 'bogus',
    detailProfile: 'bogus',
    emphasis: 'bogus'
  });
  assertEqual(card.status, 'active', 'status fallback'); // 942 via validEnum 727-730
  assertEqual(card.detailProfile, 'standard', 'detailProfile fallback'); // 955
  assertEqual(card.emphasis, 'normal', 'emphasis fallback'); // 956
  assert(!('origin' in card), 'invalid origin omitted'); // 957 + 969
  assert(!('expiresAfterMesId' in card.freshness), 'expiresAfterMesId omitted'); // 971
  assertEqual(card.arbiter.reason, '', 'empty arbiter reason'); // 966
});

// Optional direct matcher checks. CARD_FORBIDDEN_PATTERNS is not exported, so a test-local
// stand-in pattern is used; the matcher itself is the ported code (src/instruction-safety.mjs:34-53).
const TEST_PATTERN = /reveal\s+spoilers/i;

test('unsafeInstructionMatch exempts complete protective clauses (src/instruction-safety.mjs:34-53)', () => {
  assertEqual(unsafeInstructionMatch('Do not reveal hidden thoughts.', [TEST_PATTERN]), '', 'protective clause exempted');
  assertEqual(unsafeInstructionMatch('Reveal spoilers now.', [TEST_PATTERN]), 'Reveal spoilers', 'forbidden text matched');
  assertEqual(
    unsafeInstructionMatch('- Do not reveal hidden thoughts.\n- Reveal spoilers now.', [TEST_PATTERN]).length > 0,
    true,
    'bullet split does not bypass the matcher'
  );
});

report('card-validation');
