// @bun
// src/core.mjs
var SECRET_KEY_SUFFIXES = [
  "apikey",
  "authorization",
  "cookie",
  "token",
  "password",
  "secret",
  "sessionkey",
  "bearer",
  "privatekey",
  "credentials",
  "authheader"
];
var FORBIDDEN_DIAGNOSTIC_KEY_PARTS = [
  "rawprompt",
  "rawresponse",
  "providerprompt",
  "providerresponse",
  "hiddenreasoning",
  "privatestoryplan",
  "privateplan",
  "sessionid"
];
var FORBIDDEN_DIAGNOSTIC_KEY_SUFFIXES = new Set(["body", "data", "payload", "text", "value"]);
var PROVIDER_REASONING_DIAGNOSTIC_KEYS = new Set([
  "reasoning",
  "reasoningcontent",
  "reasoningdetails"
]);
function normalizeKey(value) {
  return String(value ?? "").replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
}
function isSecretKey(value) {
  const key = normalizeKey(value);
  if (!key || key.endsWith("count"))
    return false;
  if (PROVIDER_REASONING_DIAGNOSTIC_KEYS.has(key))
    return true;
  if (isForbiddenDiagnosticKey(key))
    return true;
  return SECRET_KEY_SUFFIXES.some((suffix) => key.endsWith(suffix));
}
function isForbiddenDiagnosticKey(key) {
  for (const part of FORBIDDEN_DIAGNOSTIC_KEY_PARTS) {
    let index = key.indexOf(part);
    while (index >= 0) {
      const suffix = key.slice(index + part.length);
      if (!suffix || FORBIDDEN_DIAGNOSTIC_KEY_SUFFIXES.has(suffix))
        return true;
      index = key.indexOf(part, index + part.length);
    }
  }
  return false;
}
function sanitizeId(value) {
  return String(value ?? "").trim().replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^[.-]+|[.-]+$/g, "").replace(/^-+|-+$/g, "").slice(0, 96);
}
function compact(value, limit = 1e4) {
  return truncate(String(value ?? "").replace(/\s+/g, " ").trim(), limit);
}
function truncate(value, limit = 200) {
  const text = String(value ?? "");
  const numericLimit = Number(limit);
  const cap = numericLimit === Infinity ? text.length : Math.max(0, Math.floor(numericLimit) || 0);
  if (text.length <= cap)
    return text;
  if (cap <= 3)
    return ".".repeat(cap);
  return `${text.slice(0, cap - 3)}...`;
}
function safeId(value, fallback = "item") {
  return sanitizeId(value) || sanitizeId(fallback) || "item";
}
function stableStringify(value) {
  const visiting = new WeakSet;
  function normalize(input) {
    if (!input || typeof input !== "object")
      return input;
    if (visiting.has(input))
      return "[Circular]";
    visiting.add(input);
    try {
      if (Array.isArray(input))
        return input.map((entry) => normalize(entry));
      return Object.fromEntries(Object.keys(input).sort().map((key) => [key, normalize(input[key])]));
    } finally {
      visiting.delete(input);
    }
  }
  return JSON.stringify(normalize(value));
}
function fnv1a(value) {
  let hash = 2166136261;
  for (const char of String(value ?? "")) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
function hashJson(value) {
  return fnv1a(stableStringify(value));
}
function redact(value, { maxString = 500 } = {}) {
  const visiting = new WeakSet;
  function visit(input, key = "") {
    if (isSecretKey(key))
      return "[redacted]";
    if (typeof input === "string")
      return truncate(input, maxString);
    if (!input || typeof input !== "object")
      return input;
    if (visiting.has(input))
      return "[Circular]";
    visiting.add(input);
    try {
      if (Array.isArray(input))
        return input.map((entry) => visit(entry));
      return Object.fromEntries(Object.entries(input).map(([childKey, child]) => [childKey, visit(child, childKey)]));
    } finally {
      visiting.delete(input);
    }
  }
  return visit(value);
}
function nowIso() {
  return new Date().toISOString();
}
function makeId(prefix = "id") {
  return `${safeId(prefix)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// src/instruction-safety.mjs
var VALIDATION_RULES = new Set(["model-reasoning", "character-interiority", "unrevealed-story"]);
var SUBJECT = String.raw`(?:(?:all|any|the|their|his|her)\s+)?(?:(?:hidden|private|secret|undisclosed)\s+)?(?:(?:internal|character)\s+)?(?:thoughts?|motives?|motivations?|intentions?|desires?|(?:future[-\s]+)?(?:plans?|plot|story)|spoilers?|chain[-\s]of[-\s]thought|unrevealed\s+facts?|out-of-character\s+analysis)`;
var NAME_WORD = String.raw`(?!(?:and|or|but|then|unless|except|instead|until|when|whenever|if|once|after|before|without|save|provided|providing|assuming|should|as|only|reveal|expose|disclose|invent|assert|confirm|print|show|describe)\b)[a-z][a-z'-]*`;
var CHARACTER = String.raw`(?:for|of)\s+` + NAME_WORD + String.raw`(?:\s+` + NAME_WORD + "){0,3}";
var UNESTABLISHED = String.raw`(?:that|which)\s+(?:has|have)\s+not\s+been\s+established(?:\s+in\s+the\s+scene)?`;
var OBJECT = SUBJECT + "(?:\\s+" + CHARACTER + ")?(?:\\s+" + UNESTABLISHED + ")?";
var OBJECTS = OBJECT + String.raw`(?:\s*(?:,\s*(?:(?:and|or)\s+)?|(?:and|or)\s+)` + OBJECT + ")*";
var FACT = String.raw`(?:(?:known|established|proven|certain|confirmed|settled|objective)\s+)?(?:facts?|truth)`;
var OBSERVATION = String.raw`(?:subtext|interpretations?|inferences?|guidance)`;
var GROUNDED = String.raw`(?:scene-observable|observable|evidence-grounded|explicitly\s+inferred|deniable\s+when\s+uncertain)`;
var PROTECTIVE = [
  new RegExp(String.raw`^(?:do not|don't|never)\s+(?:reveal|expose|disclose|invent|assert|confirm|print|show|describe)\s+` + OBJECTS + String.raw`(?:\s+(?:to\s+(?:the\s+)?(?:reader|player)|in\s+(?:the\s+)?(?:narration|story|response)))?$`, "i"),
  new RegExp(String.raw`^avoid\s+(?:revealing|exposing|disclosing|inventing|asserting|confirming|printing|showing|describing)\s+` + OBJECTS + String.raw`(?:\s+(?:to\s+(?:the\s+)?(?:reader|player)|in\s+(?:the\s+)?(?:narration|story|response)))?$`, "i"),
  new RegExp(String.raw`^(?:do not|don't|never)\s+treat\s+` + OBJECTS + String.raw`\s+as\s+(?:known|established|proven|certain)(?:\s+facts?)?$`, "i"),
  new RegExp(String.raw`^(?:avoid\s+(?:presenting|portraying|stating|framing|treating|depicting)|(?:do not|don't|never)\s+(?:present|portray|state|frame|treat|depict))\s+` + OBJECTS + String.raw`\s+as\s+` + FACT + "$", "i"),
  new RegExp("^keep\\s+" + OBSERVATION + "\\s+" + GROUNDED + "(?:,\\s*" + GROUNDED + ")*" + String.raw`,?\s+and\s+separate\s+from\s+` + OBJECTS + String.raw`\s+as\s+` + FACT + "$", "i"),
  new RegExp("^withhold\\s+" + OBJECTS + "$", "i"),
  new RegExp("^keep\\s+" + OBJECTS + String.raw`\s+(?:private|hidden|unrevealed|uncertain|unknown|out\s+of\s+(?:the\s+)?(?:narration|story|response))$`, "i")
];
function protectiveClause(clause) {
  return PROTECTIVE.some((pattern) => pattern.test(clause));
}
function unsafeInstructionMatch(text, patterns) {
  const clauses = String(text || "").replace(/^[ \t]*[-*][ \t]*\[[^\]\n]+\][ \t]*(?:[-*+][ \t]*)?/gm, "- ").replace(/^[ \t]*(?:[-*+\u2022][ \t]*|\d+[.)][ \t]+)/gm, "\x00").split(/([.!?;]+|\r?\n(?=\u0000(?!(?:and|or|but|then|unless|except|instead|until|when|whenever|if|once|after|before|without|save|provided|providing|assuming|should|as|only|for|of|that|which)\b)|[ \t]*(?:do not|don't|never|avoid|withhold|keep|respond|answer|use|preserve|follow|treat|allow|respect|maintain|ground|let|focus|address|acknowledge|distinguish|recognize|leave|limit|reveal|expose|disclose|invent|assert|confirm|print|show|describe)\b))/i);
  const unprotected = clauses.map((part) => {
    const clause = part.replace(/\u0000/g, "");
    return protectiveClause(clause.trim()) ? "" : clause;
  }).join("");
  for (const pattern of patterns) {
    const match = unprotected.match(pattern);
    if (match)
      return match[0].slice(0, 80);
  }
  return "";
}

// src/card-selection.mjs
function missingPlannedCards(cards = [], requirements = []) {
  return requirements.filter((job) => !cards.some((card) => {
    if (card?.status !== "active" || !String(card.promptText || "").trim())
      return false;
    if (job.cardId)
      return card.origin === "authored" && card.id === job.cardId;
    return card.origin !== "authored" && card.family === job.family && (job.sourceCardIds || []).every((id) => (card.sourceCardIds || []).includes(id));
  })).map(({ family = "", cardId = "", sourceCardIds = [] }) => ({ family, cardId, sourceCardIds }));
}

// src/settings.mjs
var STRENGTHS = new Set(["light", "balanced", "strong"]);
var REASONING_LEVELS = new Set(["low", "medium", "high", "ultra"]);
var FOOTPRINTS = new Set(["compact", "normal", "rich"]);
var FOCUS = new Set(["balanced", "character", "constraints", "scene", "plot"]);
var CARD_BUDGET_MIN = 0;
var CARD_BUDGET_MAX = 20;
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value))
    return value;
  for (const child of Object.values(value))
    deepFreeze(child);
  return Object.freeze(value);
}
var DEFAULT_RECURSION_SETTINGS = deepFreeze({
  strength: "balanced",
  cardsPerTurn: 6,
  reasoningLevel: "medium",
  promptFootprint: "compact",
  focus: "balanced",
  injection: {
    placement: "in_prompt",
    role: "system",
    depth: 1
  }
});
function enumValue(value, allowed, fallback) {
  const normalized = String(value ?? fallback).trim().toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}
function numberInRange(value, fallback, min, max) {
  if (value === null || value === undefined)
    return fallback;
  if (typeof value === "string" && value.trim() === "")
    return fallback;
  const number = Number(value);
  if (!Number.isFinite(number))
    return fallback;
  return Math.min(max, Math.max(min, number));
}
function normalizeCardBudgetSettings(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const raw = source.cardsPerTurn;
  const valueIsNumeric = typeof raw === "number" || typeof raw === "string" && raw.trim() !== "";
  const targetCards = Math.round(numberInRange(valueIsNumeric ? raw : undefined, DEFAULT_RECURSION_SETTINGS.cardsPerTurn, CARD_BUDGET_MIN, CARD_BUDGET_MAX));
  return { targetCards };
}
function normalizeSettings(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    strength: enumValue(source.strength, STRENGTHS, DEFAULT_RECURSION_SETTINGS.strength),
    cardsPerTurn: normalizeCardBudgetSettings(source).targetCards,
    reasoningLevel: enumValue(source.reasoningLevel, REASONING_LEVELS, DEFAULT_RECURSION_SETTINGS.reasoningLevel),
    promptFootprint: enumValue(source.promptFootprint, FOOTPRINTS, DEFAULT_RECURSION_SETTINGS.promptFootprint),
    focus: enumValue(source.focus, FOCUS, DEFAULT_RECURSION_SETTINGS.focus),
    injection: { ...DEFAULT_RECURSION_SETTINGS.injection }
  };
}
var INJECTION_PLACEMENTS = new Set(["in_prompt", "in_chat"]);
var INJECTION_ROLES = new Set(["system", "user", "assistant"]);
function normalizeInjectionDepth(value) {
  const fallback = DEFAULT_RECURSION_SETTINGS.injection.depth;
  if (value === null || value === undefined)
    return fallback;
  if (Array.isArray(value) || typeof value === "boolean" || typeof value === "object")
    return fallback;
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed || trimmed === "default")
      return fallback;
  }
  const number = Number(value);
  if (!Number.isFinite(number))
    return fallback;
  return Math.round(Math.min(10, Math.max(0, number)));
}
function normalizeInjectionSettings(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    placement: enumValue(source.placement, INJECTION_PLACEMENTS, DEFAULT_RECURSION_SETTINGS.injection.placement),
    role: enumValue(source.role, INJECTION_ROLES, DEFAULT_RECURSION_SETTINGS.injection.role),
    depth: normalizeInjectionDepth(source.depth)
  };
}

// src/settings-policy.mjs
var FOOTPRINT_SECTION_BUDGETS = Object.freeze({
  compact: Object.freeze({ guidance: 900, cardEvidence: 12000, guardrails: 700 }),
  normal: Object.freeze({ guidance: 1800, cardEvidence: 30000, guardrails: 900 }),
  rich: Object.freeze({ guidance: 3200, cardEvidence: 60000, guardrails: 1200 })
});
var FOCUS_BOOSTED_FAMILIES = Object.freeze({
  balanced: Object.freeze([]),
  character: Object.freeze(["Active Cast", "Character Motivation", "Relationship", "Social Subtext", "Realism", "Knowledge"]),
  constraints: Object.freeze(["Scene Constraints", "Items", "Consequences", "Scene Frame", "Knowledge"]),
  scene: Object.freeze(["Scene Frame", "Environment", "Items", "Active Cast"]),
  plot: Object.freeze(["Open Threads", "Consequences", "Knowledge", "Scene Frame"])
});
var STRENGTH_POLICIES = Object.freeze({
  light: Object.freeze({
    level: "light",
    cacheReuse: "prefer",
    refreshPressure: "low",
    selectionPressure: "lean",
    composerAssertiveness: "soft",
    arbiterLine: "Strength: Light. Prefer valid cache, avoid churn, and refresh only when relevance or drift risk is clear. Do not drop critical scene constraints.",
    composerLine: "Strength: Light. Write sparse, gentle guidance; raw selected cards remain evidence."
  }),
  balanced: Object.freeze({
    level: "balanced",
    cacheReuse: "normal",
    refreshPressure: "normal",
    selectionPressure: "normal",
    composerAssertiveness: "normal",
    arbiterLine: "Strength: Balanced. Use normal refresh, lifecycle, and hand pressure for this scene.",
    composerLine: "Strength: Balanced. Write concise Recursion guidance for using the selected raw cards."
  }),
  strong: Object.freeze({
    level: "strong",
    cacheReuse: "cautious",
    refreshPressure: "high",
    selectionPressure: "full",
    composerAssertiveness: "firm",
    arbiterLine: "Strength: Strong. Prefer firm current-turn guidance and refresh weak/stale coverage when relevance is plausible. Do not increase footprint size.",
    composerLine: "Strength: Strong. Phrase selected constraints firmly and preserve evidence-backed guardrails while leaving raw cards intact."
  })
});
var FOOTPRINT_POLICIES = Object.freeze({
  compact: Object.freeze({
    level: "compact",
    allowedProfiles: Object.freeze(["compact"]),
    preferredProfile: "compact",
    detailPressure: "compact",
    arbiterLine: "Prompt Footprint: Compact. Keep compact unless a safety or hard scene-constraint reason requires temporary expansion.",
    composerLine: "Prompt Footprint: Compact. Use shorter guidance over every selected card; do not truncate raw selected card text."
  }),
  normal: Object.freeze({
    level: "normal",
    allowedProfiles: Object.freeze(["compact", "normal"]),
    preferredProfile: "normal",
    detailPressure: "normal",
    arbiterLine: "Prompt Footprint: Normal. Compact or Normal are allowed freely; Rich requires a high-risk reason.",
    composerLine: "Prompt Footprint: Normal. Use balanced guidance detail over the full selected raw card evidence."
  }),
  rich: Object.freeze({
    level: "rich",
    allowedProfiles: Object.freeze(["compact", "normal", "rich"]),
    preferredProfile: "rich",
    detailPressure: "rich",
    arbiterLine: "Prompt Footprint: Rich. Use Rich when useful, but still permit Normal or Compact for simple turns.",
    composerLine: "Prompt Footprint: Rich. Use richer guidance when relevant without broad lore recap or distant-story planning."
  })
});
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value ?? "").trim()).filter(Boolean))];
}
function focusPolicyFor(level) {
  const focus = Object.prototype.hasOwnProperty.call(FOCUS_BOOSTED_FAMILIES, level) ? level : "balanced";
  const boostedFamilies = [...FOCUS_BOOSTED_FAMILIES[focus]];
  return {
    level: focus,
    boostedFamilies,
    arbiterLine: focus === "balanced" ? "Focus: Balanced. Do not boost a family; prefer the Arbiter-selected current turn relevance." : `Focus: ${focus[0].toUpperCase()}${focus.slice(1)}. Prefer ${boostedFamilies.join(", ")} when relevant; do not ignore critical non-${focus} scene constraints.`,
    composerLine: focus === "balanced" ? "Focus: Balanced. Compose in Arbiter priority order." : `Focus: ${focus[0].toUpperCase()}${focus.slice(1)}. Keep boosted-family guidance earlier under budget pressure when evidence supports it.`
  };
}
function influencePolicyForSettings(settings = {}) {
  const normalized = normalizeSettings(settings);
  const strength = STRENGTH_POLICIES[normalized.strength] || STRENGTH_POLICIES.balanced;
  const footprint = FOOTPRINT_POLICIES[normalized.promptFootprint] || FOOTPRINT_POLICIES.normal;
  const cardBudget = normalizeCardBudgetSettings(normalized);
  return {
    strength: clone(strength),
    focus: focusPolicyFor(normalized.focus),
    footprint: {
      ...clone(footprint),
      sectionBudgets: { ...FOOTPRINT_SECTION_BUDGETS[footprint.level] }
    },
    cardBudget,
    reasoningLevel: normalized.reasoningLevel,
    injection: clone(normalized.injection)
  };
}
function summarizeBehaviorPolicyForDiagnostics(policy, context = {}) {
  const source = policy || influencePolicyForSettings({});
  const boostedFamilies = uniqueStrings(source.focus?.boostedFamilies);
  const selectedFamilies = uniqueStrings(context.selectedFamilies);
  const boosted = new Set(boostedFamilies);
  return {
    strength: source.strength?.level || "balanced",
    focus: source.focus?.level || "balanced",
    storedFootprint: source.footprint?.level || "normal",
    effectiveFootprint: String(context.effectiveFootprint || source.footprint?.effectiveLevel || source.footprint?.level || "normal"),
    footprintOverrideReason: String(context.footprintOverrideReason || source.footprint?.footprintOverrideReason || ""),
    boostedFamilies,
    selectedBoostedCards: selectedFamilies.filter((family) => boosted.has(family)).length,
    planShaping: uniqueStrings(context.planShaping).slice(0, 12)
  };
}

// src/cards.mjs
var EVIDENCE_LIMIT = 12;
var EVIDENCE_TEXT_LIMIT = 120;
var MAX_TOKEN_ESTIMATE = 1000;
function catalogEntry(entry) {
  return Object.freeze(entry);
}
var CARD_CATALOG = Object.freeze([
  catalogEntry({
    family: "Scene Frame",
    role: "sceneFrameCard",
    priority: 100,
    description: "Current situation, useful next exchange, and established limits without inventing a pause."
  }),
  catalogEntry({
    family: "Active Cast",
    role: "activeCastCard",
    priority: 95,
    description: "Who is present, visible state, and current conversational or physical role."
  }),
  catalogEntry({
    family: "Scene Constraints",
    role: "sceneConstraintsCard",
    priority: 98,
    description: "Hard limits, contradiction traps, timing, access, visibility, and plausibility constraints."
  }),
  catalogEntry({
    family: "Knowledge",
    role: "knowledgeSecretsCard",
    priority: 92,
    description: "What each character knows, how they interpret claims, what remains uncertain, and what they can reasonably learn."
  }),
  catalogEntry({
    family: "Consequences",
    role: "clocksConsequencesCard",
    priority: 90,
    description: "Deadlines, countdowns, delayed consequences, and escalation triggers."
  }),
  catalogEntry({
    family: "Character Motivation",
    role: "characterMotivationCard",
    priority: 88,
    description: "Established goals, personal stakes, and pressures that make each character respond differently."
  }),
  catalogEntry({
    family: "Relationship",
    role: "dialogueRelationshipCard",
    priority: 84,
    description: "Relationship history, trust, concern, obligations, and willingness to cooperate under uncertainty."
  }),
  catalogEntry({
    family: "Social Subtext",
    role: "socialSubtextCard",
    priority: 82,
    description: "Scene-observable implied social meaning such as humor, veiled pressure, invitation, boundaries, status, and face."
  }),
  catalogEntry({
    family: "Realism",
    role: "realismCard",
    priority: 83,
    description: "Scene-specific emotional and conversational plausibility: relevant stakes, surprising claims, proportionate replies, and evidence-grounded interpretations of intent."
  }),
  catalogEntry({
    family: "Items",
    role: "possessionsItemsCard",
    priority: 78,
    description: "Important held, carried, worn, hidden, lost, stolen, or controlled objects and who has them."
  }),
  catalogEntry({
    family: "Environment",
    role: "environmentAffordancesCard",
    priority: 76,
    description: "Spatial layout, sensory texture, hazards, obstacles, exits, and usable environmental affordances."
  }),
  catalogEntry({
    family: "Open Threads",
    role: "openThreadsCard",
    priority: 72,
    description: "Unresolved questions, immediate promises, pending actions, and near-term pressures."
  })
]);
var CATALOG_BY_FAMILY = new Map(CARD_CATALOG.map((entry) => [entry.family, entry]));
var CATALOG_BY_ROLE = new Map(CARD_CATALOG.map((entry) => [entry.role, entry]));
var EMPHASIS = new Set(["normal", "emphasized", "muted"]);
var DETAIL = new Set(["compact", "standard", "expanded"]);
var ORIGIN = new Set(["cache", "generated", "fallback", "authored"]);
var EMPHASIS_PRIORITY = Object.freeze({ emphasized: 0, normal: 1, muted: 2 });
var STATUS = new Set(["candidate", "active", "stowed", "stale", "discarded"]);
var CARD_FORBIDDEN_PATTERNS = Object.freeze([
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
var CHARACTER_MOTIVATION_FORBIDDEN_PATTERNS = Object.freeze([
  /\b(?:thinks?|thoughts?|inner\s+monologue|internal\s+monologue)\s*:/i,
  /\b(?:secret|hidden|private|undisclosed)\s+(?:thoughts?|motives?|motivations?|plans?|intentions?)\b/i,
  /\breveal\s+(?:their\s+|his\s+|her\s+|my\s+|our\s+)?(?:inner|private|hidden|secret)\s+thoughts?\b/i,
  /\b[A-Z][A-Za-z0-9_.-]*\s+(?:secretly|privately|silently)\s+(?:wants?|plans?|intends?|hopes?|fears?|feels?|knows?|believes?)\b/i,
  /\b(?:he|she|they)\s+(?:secretly|privately|silently)\s+(?:wants?|plans?|intends?|hopes?|fears?|feels?|knows?|believes?)\b/i,
  /(?:^|[\s"'])I\s+(?:secretly|privately|silently|really|actually)\s+(?:want|wants|plan|plans|intend|intends|hope|hopes|fear|fears|feel|feels|know|knows|believe|believes)\b/i,
  /(?:^|[\s"'])I\s+(?:will|would|can|could|should)\s+never\s+reveal\b/i
]);
var PROVIDER_PROMPT_SECRET_KEY_SUFFIXES = Object.freeze([
  "apikey",
  "authorization",
  "auth",
  "authentication",
  "authheader",
  "cookie",
  "cookieheader",
  "token",
  "password",
  "secret",
  "session",
  "sessionkey",
  "bearer",
  "privatekey",
  "credential",
  "credentials"
]);
var PROVIDER_PROMPT_SECRET_KEY_QUALIFIERS = Object.freeze([
  "hash",
  "value",
  "header",
  "pem",
  "material",
  "body",
  "text",
  "string",
  "id"
]);
var PROVIDER_PROMPT_AMBIGUOUS_COLON_KEYS = new Set(["bearer", "secret", "session", "token"]);
function cleanText(value, limit) {
  return truncate(compact(value ?? "", limit), limit);
}
function numberInRange2(value, fallback, min, max) {
  const number = Number(value);
  const resolved = Number.isFinite(number) ? number : fallback;
  return Math.min(max, Math.max(min, Math.round(resolved)));
}
function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || "").length / 4));
}
function normalizeEvidenceRefs(value) {
  const list = Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value];
  return list.map((entry) => cleanText(entry, EVIDENCE_TEXT_LIMIT)).filter(Boolean).slice(0, EVIDENCE_LIMIT);
}
function validEnum(value, allowed, fallback) {
  const text = String(value ?? "").trim();
  return allowed.has(text) ? text : fallback;
}
function optionalEnum(value, allowed) {
  const text = String(value ?? "").trim();
  return allowed.has(text) ? text : "";
}
function sanitizeHandCard(card) {
  const handCard = {
    id: String(card.id || ""),
    family: String(card.family || ""),
    role: String(card.role || ""),
    status: "active",
    promptText: String(card.promptText || ""),
    tokenEstimate: numberInRange2(card.tokenEstimate, estimateTokens(card.promptText), 1, MAX_TOKEN_ESTIMATE),
    detailProfile: validEnum(card.detailProfile, DETAIL, "standard"),
    emphasis: validEnum(card.emphasis, EMPHASIS, "normal"),
    evidenceRefs: normalizeEvidenceRefs(card.evidenceRefs)
  };
  const origin = optionalEnum(card.origin, ORIGIN);
  if (origin)
    handCard.origin = origin;
  if (Array.isArray(card.sourceCardIds) && card.sourceCardIds.length)
    handCard.sourceCardIds = [...new Set(card.sourceCardIds.map(String).filter(Boolean))];
  if (card.deckCardId)
    handCard.deckCardId = String(card.deckCardId);
  return handCard;
}
function catalogPriority(card) {
  return CATALOG_BY_FAMILY.get(card.family)?.priority ?? CATALOG_BY_ROLE.get(card.role)?.priority ?? 0;
}
function behaviorPolicyForHand(policy) {
  return policy && typeof policy === "object" && !Array.isArray(policy) ? policy : null;
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
  if (emphasisDelta !== 0)
    return emphasisDelta;
  const boostedDelta = focusDelta(a, b, policy);
  if (boostedDelta !== 0)
    return boostedDelta;
  const priorityDelta = catalogPriority(b) - catalogPriority(a);
  if (priorityDelta !== 0)
    return priorityDelta;
  return String(a.id || "").localeCompare(String(b.id || ""));
}
function forcedFamilyOrder(values = []) {
  const order = new Map;
  for (const value of Array.isArray(values) ? values : []) {
    const family = String(value || "").trim();
    if (family && !order.has(family))
      order.set(family, order.size);
  }
  return order;
}
function forcedCardOrder(values = []) {
  const order = new Map;
  for (const value of Array.isArray(values) ? values : []) {
    const id = String(value || "").trim();
    if (id && !order.has(id))
      order.set(id, order.size);
  }
  return order;
}
function forcedFamilyOmission(family) {
  const cleanFamily = String(family || "").trim();
  if (!cleanFamily)
    return null;
  return {
    cardId: `manual-forced-${safeId(cleanFamily)}`,
    family: cleanFamily,
    reason: "manual-forced-provider-failed",
    tokenEstimate: 0
  };
}
function effectiveMaxCardsForPolicy(maxCards, policy) {
  const base = numberInRange2(maxCards, 6, 0, 64);
  if (!policy)
    return base;
  const ceiling = numberInRange2(policy.cardBudget?.targetCards, base, 0, 64);
  return Math.min(base, ceiling);
}
function selectHand(cards = [], { maxCards = 6, maxTokens = 700, behaviorPolicy = null, forcedFamilies = [], forcedCardIds = [], selectionOrder = null, selectionDiagnostics = null } = {}) {
  const policy = behaviorPolicyForHand(behaviorPolicy);
  const requestedCardLimit = numberInRange2(maxCards, 6, 0, 64);
  const forcedOrder = forcedFamilyOrder(forcedFamilies);
  const forcedCardOrderMap = forcedCardOrder(forcedCardIds);
  let cardLimit = Math.max(effectiveMaxCardsForPolicy(requestedCardLimit, policy), forcedOrder.size);
  const tokenLimit = numberInRange2(maxTokens, 700, 0, 20000);
  const active = [];
  const omitted = [];
  for (const card of Array.isArray(cards) ? cards : []) {
    if (card?.status === "active") {
      active.push(card);
    } else if (card?.id) {
      omitted.push({
        cardId: card.id,
        family: card.family || "",
        reason: "inactive",
        tokenEstimate: numberInRange2(card.tokenEstimate, 0, 0, MAX_TOKEN_ESTIMATE)
      });
    }
  }
  const selected = [];
  let tokenEstimate = 0;
  const priorityRank = (card) => Math.min(...[card.id, ...card.sourceCardIds || []].map((id) => forcedCardOrderMap.get(id) ?? Infinity));
  const priorityCount = active.filter((card) => Number.isFinite(priorityRank(card)) || forcedOrder.has(card.family)).length;
  cardLimit = Math.max(cardLimit, priorityCount);
  const selectedPriorityIds = new Set;
  const selectionRanks = new Map((selectionOrder || []).map((key, index) => [key, index]));
  const selectionRank = (card) => Math.min(selectionRanks.get(card.id) ?? Infinity, selectionRanks.get(card.family) ?? Infinity);
  const sortedCards = active.slice().sort((a, b) => {
    const aForcedCard = Number.isFinite(priorityRank(a));
    const bForcedCard = Number.isFinite(priorityRank(b));
    if (aForcedCard !== bForcedCard)
      return aForcedCard ? -1 : 1;
    if (aForcedCard && bForcedCard)
      return priorityRank(a) - priorityRank(b);
    const aForced = forcedOrder.has(a.family);
    const bForced = forcedOrder.has(b.family);
    if (aForced !== bForced)
      return aForced ? -1 : 1;
    if (aForced && bForced)
      return forcedOrder.get(a.family) - forcedOrder.get(b.family);
    if (Array.isArray(selectionOrder)) {
      const aRank = selectionRank(a);
      const bRank = selectionRank(b);
      if (aRank !== bRank)
        return aRank - bRank;
      return 0;
    }
    return sortCardsForHand(a, b, policy);
  });
  for (const card of sortedCards) {
    const cardTokens = numberInRange2(card.tokenEstimate, estimateTokens(card.promptText), 1, MAX_TOKEN_ESTIMATE);
    if (selected.length >= cardLimit) {
      omitted.push({
        cardId: card.id,
        family: card.family || "",
        reason: "max-cards",
        tokenEstimate: cardTokens
      });
      continue;
    }
    tokenEstimate += cardTokens;
    for (const id of [card.id, ...card.sourceCardIds || []]) {
      if (forcedCardOrderMap.has(id))
        selectedPriorityIds.add(id);
    }
    selected.push(sanitizeHandCard({
      ...card,
      tokenEstimate: cardTokens
    }));
  }
  const activeFamilies = new Set(active.map((card) => String(card.family || "").trim()).filter(Boolean));
  for (const family of forcedOrder.keys()) {
    if (!activeFamilies.has(family)) {
      const omission = forcedFamilyOmission(family);
      if (omission)
        omitted.push(omission);
    }
  }
  const missing = missingPlannedCards(selected, selectionDiagnostics?.retained || []);
  const behaviorPolicyMetadata = policy ? {
    ...summarizeBehaviorPolicyForDiagnostics(policy, {
      effectiveFootprint: policy.footprint?.level,
      selectedFamilies: selected.map((card) => card.family),
      planShaping: [
        policy.focus?.level && policy.focus.level !== "balanced" ? "focus-family-ordering" : "",
        Number.isFinite(policy.cardBudget?.targetCards) && policy.cardBudget.targetCards < requestedCardLimit ? "card-budget-ceiling" : ""
      ]
    }),
    effectiveMaxCards: cardLimit
  } : null;
  return {
    handId: makeId("hand"),
    cards: selected,
    omitted,
    tokenEstimate,
    composedAt: nowIso(),
    metadata: {
      maxCards: cardLimit,
      requestedMaxCards: requestedCardLimit,
      maxTokens: tokenLimit,
      ...selectionDiagnostics ? { selection: {
        ...selectionDiagnostics,
        selectedCount: selected.length,
        authoredCount: selected.filter((card) => card.origin === "authored").length,
        generatedCount: selected.filter((card) => card.origin !== "authored").length,
        shortfallCount: Math.max(0, Number(selectionDiagnostics.targetCount || 0) - selected.length),
        missingPlannedCards: missing,
        shortfallReasons: [
          ...selectionDiagnostics.shortfallReason ? [selectionDiagnostics.shortfallReason] : [],
          ...missing.length ? ["planned-card-missing"] : []
        ],
        selected: selected.map((card) => ({
          id: card.id,
          family: card.family,
          source: card.origin || "cache",
          mandatory: [card.id, ...card.sourceCardIds || []].some((id) => forcedCardOrderMap.has(id)) || forcedOrder.has(card.family)
        })),
        handOmissions: omitted.map(({ cardId, family, reason }) => ({ cardId, family, reason }))
      } } : {},
      selectedCount: selected.length,
      omittedCount: omitted.length,
      forcedFamilies: [...forcedOrder.keys()],
      forcedCardIds: [...forcedCardOrderMap.keys()],
      selectedForcedFamilies: selected.map((card) => card.family).filter((family) => forcedOrder.has(family)),
      selectedForcedCardIds: [...forcedCardOrderMap.keys()].filter((id) => selectedPriorityIds.has(id)),
      diagnostics: [],
      tokenBudgetExceeded: tokenLimit > 0 && tokenEstimate > tokenLimit,
      sourceCardCount: Array.isArray(cards) ? cards.length : 0,
      ...behaviorPolicyMetadata ? { behaviorPolicy: behaviorPolicyMetadata } : {}
    }
  };
}

// src/deck.ts
function estimateTokens2(text) {
  return Math.max(1, Math.ceil(text.length / 4));
}
function catalogRole(family) {
  const entry = CARD_CATALOG.find((candidate) => candidate.family === family);
  if (!entry)
    throw new Error(`MINI_DECK family is not in CARD_CATALOG: ${family}`);
  return entry.role;
}
function deckCard(family, id, promptText) {
  return Object.freeze({
    id,
    family,
    role: catalogRole(family),
    status: "active",
    promptText,
    tokenEstimate: estimateTokens2(promptText),
    detailProfile: "standard",
    emphasis: "normal",
    evidenceRefs: []
  });
}
var MINI_DECK = Object.freeze([
  deckCard("Scene Frame", "scene-frame-1", "State the current situation and the useful next exchange; do not invent a pause."),
  deckCard("Active Cast", "active-cast-1", "Name who is present and their current conversational or physical role."),
  deckCard("Scene Constraints", "scene-constraints-1", "Hold the hard limits the scene has already established; contradict none of them."),
  deckCard("Knowledge", "knowledge-1", "Track what each character knows and what stays uncertain to them."),
  deckCard("Open Threads", "open-threads-1", "Carry the unresolved questions and pending actions into this exchange.")
]);

// src/safe-values.mjs
function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

// src/story-form.mjs
var STORY_FORM_SCHEMA = "recursion.storyForm.v1";
var VALID_TENSES = new Set(["past", "present", "mixed", "unknown"]);
var VALID_POVS = new Set([
  "first-person",
  "second-person",
  "third-person-limited",
  "third-person-omniscient",
  "mixed",
  "unknown"
]);
var VALID_CONFIDENCE = new Set(["high", "medium", "low"]);
var SAFE_MESSAGE_REF = /^message:\d{1,12}$/;
var SECRET_TEXT_PATTERN = /(private[-_\s]*secret|inspector[-_\s]*only|\bsk-[a-z0-9_-]+|\bbearer\s+[a-z0-9._-]+)/i;
var MAX_REASON = 220;
var UNKNOWN_STORY_FORM = Object.freeze({
  schema: STORY_FORM_SCHEMA,
  tense: "unknown",
  pov: "unknown",
  confidence: "low",
  evidenceRefs: Object.freeze([]),
  reason: "story form unavailable"
});
function asObject2(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function safeText(value, limit = MAX_REASON) {
  return truncate(compact(String(redact(value ?? "", { maxString: limit }) ?? "").replace(new RegExp(SECRET_TEXT_PATTERN.source, "ig"), "[redacted]")), limit);
}
function enumValue2(value, allowed, fallback) {
  const text = String(value ?? "").trim().toLowerCase();
  return allowed.has(text) ? text : fallback;
}
function safeEvidenceRefs(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((entry) => safeText(entry, 80)).filter((entry) => SAFE_MESSAGE_REF.test(entry)))].slice(0, 8);
}
function storyFormFallbackReason(storyForm = {}) {
  if (storyForm.tense === "unknown" || storyForm.pov === "unknown")
    return "story form unavailable";
  return "story form normalized";
}
function normalizeStoryForm(value = {}, fallback = UNKNOWN_STORY_FORM) {
  const source = asObject2(value);
  if (source.schema !== STORY_FORM_SCHEMA) {
    return {
      ...UNKNOWN_STORY_FORM,
      reason: safeText(asObject2(fallback).reason || UNKNOWN_STORY_FORM.reason)
    };
  }
  const tense = enumValue2(source.tense, VALID_TENSES, "unknown");
  const pov = enumValue2(source.pov, VALID_POVS, "unknown");
  const confidence = enumValue2(source.confidence, VALID_CONFIDENCE, "low");
  const reason = safeText(source.reason || "", MAX_REASON) || storyFormFallbackReason({ tense, pov });
  return {
    schema: STORY_FORM_SCHEMA,
    tense,
    pov,
    confidence,
    evidenceRefs: safeEvidenceRefs(source.evidenceRefs),
    reason
  };
}
function storyFormInstruction(storyForm = UNKNOWN_STORY_FORM) {
  const form = normalizeStoryForm(storyForm);
  if (form.tense === "unknown" || form.pov === "unknown" || form.confidence === "low") {
    return "Write the next reply in the active chat's established story form.";
  }
  return `Write the next reply in ${form.tense} tense, ${form.pov} POV.`;
}

// src/packet.mjs
var PROMPT_PACKET_VERSION = 5;
var GUIDANCE_SCHEMA = "recursion.guidanceComposer.v1";
var PACKET_VERSION = PROMPT_PACKET_VERSION;
var VALID_FOOTPRINTS = new Set(["compact", "normal", "rich"]);
var SECTION_KEYS = Object.freeze(["guidance", "cardEvidence", "guardrails"]);
var VALID_INJECTION_PLACEMENTS = new Set(["in_prompt", "in_chat"]);
var VALID_INJECTION_ROLES = new Set(["system", "user", "assistant"]);
var EMPHASIS2 = new Set(["normal", "emphasized", "muted"]);
var DETAIL_PROFILES = new Set(["compact", "standard", "expanded"]);
var MAX_CARD_TEXT = Infinity;
var MAX_EVIDENCE_TEXT = 160;
var MAX_OMISSION_REASON = 160;
var MAX_GUIDANCE_TEXT = 6000;
var MAX_DIAGNOSTIC_TEXT = 180;
var MAX_PACKET_SECTION = 1e5;
var SAFE_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,120}$/;
var SAFE_REF_PATTERN = /^(message|card|scene|source|turn):[A-Za-z0-9_.:-]{1,96}$/;
var SAFE_OMISSION_REASONS = new Set(["token-budget", "max-cards", "inactive", "budget_exceeded", "reasoner_dropped", "manual-forced-provider-failed", "unspecified"]);
var VALID_GUIDANCE_DROP_REASONS = new Set(["duplicate", "lower-priority", "unsupported", "unsafe"]);
var VALID_GUIDANCE_STATUSES = new Set(["used", "missing", "fallback-raw-only"]);
var VALID_FAMILIES = new Set([
  "Authored",
  "Scene Frame",
  "Active Cast",
  "Character Motivation",
  "Relationship",
  "Social Subtext",
  "Realism",
  "Scene Constraints",
  "Knowledge",
  "Consequences",
  "Environment",
  "Items",
  "Open Threads"
]);
var SECRET_TEXT_PATTERN2 = /(private[-_\s]*secret|inspector[-_\s]*only|source[-_\s]*should[-_\s]*not[-_\s]*leak|freshness[-_\s]*should[-_\s]*not[-_\s]*leak|arbiter[-_\s]*should[-_\s]*not[-_\s]*leak|\bsk-[a-z0-9_-]+|\bbearer\s+[a-z0-9._-]+)/i;
var FOOTPRINT_BUDGETS = FOOTPRINT_SECTION_BUDGETS;
var STATIC_GUARDRAILS = Object.freeze([
  "Output only the story reply, without planning, self-correction, or discussion of prompts. Keep Recursion analysis invisible.",
  "Explicit user instructions and established story facts outrank generated cards and guidance. Treat generated interpretations as tentative, not new constraints. Preserve player control and established knowledge boundaries.",
  "Follow the established viewpoint and current positions. Preserve actions already completed and discoveries. Update reactions when information or precautions change stakes; prior fear need not persist. Unresolved causes do not erase mitigated risks. Allow answers and progress without forcing calm or agreement. Recognize changed intentions and premises without assuming feasibility. Revisit earlier questions when relevant; leave room for the player to explain."
]);
var INJECTION_TEMPLATE = Object.freeze([
  Object.freeze({ id: "guidance", promptKey: "recursion.guidance", title: "Recursion Guidance", placement: "in_prompt", depth: 1, role: "system" }),
  Object.freeze({ id: "cardEvidence", promptKey: "recursion.cardEvidence", title: "Recursion Card Evidence", placement: "in_prompt", depth: 1, role: "system" }),
  Object.freeze({ id: "guardrails", promptKey: "recursion.guardrails", title: "Recursion Guardrails", placement: "in_prompt", depth: 1, role: "system" })
]);
var DYNAMIC_FORBIDDEN_PATTERNS = Object.freeze([
  /\bhidden\s+chain[-\s]of[-\s]thought\b/i,
  /\bchain[-\s]of[-\s]thought\b/i,
  /\b(hidden|private|secret|undisclosed)\s+(internal\s+)?thoughts?\b/i,
  /\b(private|hidden|secret|undisclosed)\s+(character\s+)?motives?\b/i,
  /\b(secret|hidden|private|undisclosed)\s+future[-\s]+(plans?|plot|story)\b/i,
  /\breveal\s+future\s+plans?\b/i,
  /\b(hidden|private|secret|undisclosed)\s+spoilers?\b/i,
  /\breveal\s+spoilers?\b/i
]);
function cleanText2(value, limit) {
  return truncate(compact(value ?? "", limit), limit);
}
function safeTextSource(value, limit) {
  const redacted = redact(value, { maxString: limit });
  if (redacted === undefined || redacted === null)
    return "";
  if (["string", "number", "boolean", "bigint"].includes(typeof redacted))
    return String(redacted);
  try {
    return JSON.stringify(redacted);
  } catch {
    return "";
  }
}
function safeText2(value, limit) {
  return cleanText2(safeTextSource(value, limit).replace(new RegExp(SECRET_TEXT_PATTERN2.source, "ig"), "[redacted]"), limit);
}
function safeCardPromptText(value, limit) {
  return safeTextSource(value, limit).replace(new RegExp(SECRET_TEXT_PATTERN2.source, "ig"), "[redacted]").split(/\n+/).map((line) => cleanText2(line, limit)).filter(Boolean).join(`
`);
}
function safeOptionalText(value, limit) {
  const text = safeText2(value, limit);
  return text || undefined;
}
function safePromptId(value, fallbackPrefix = "id") {
  const text = safeOptionalText(value, 120);
  if (!text)
    return "";
  if (SAFE_ID_PATTERN.test(text) && !SECRET_TEXT_PATTERN2.test(text))
    return text;
  return `${fallbackPrefix}-${hashJson(text).slice(0, 12)}`;
}
function safeFamily(value) {
  const family = cleanText2(value, 120);
  return VALID_FAMILIES.has(family) ? family : "Open Threads";
}
function cleanEnum(value, allowed, fallback) {
  const text = String(value ?? "").trim();
  return allowed.has(text) ? text : fallback;
}
function numberInRange3(value, fallback, min, max) {
  const number = Number(value);
  const resolved = Number.isFinite(number) ? number : fallback;
  return Math.min(max, Math.max(min, Math.round(resolved)));
}
function estimateTokens3(text) {
  return Math.max(1, Math.ceil(String(text || "").length / 4));
}
function normalizeFootprint(settings = {}) {
  const footprint = String(settings?.promptFootprint ?? "").trim();
  return VALID_FOOTPRINTS.has(footprint) ? footprint : "normal";
}
function behaviorPolicyFrom(settings = {}, behaviorPolicy = null) {
  if (behaviorPolicy && typeof behaviorPolicy === "object" && !Array.isArray(behaviorPolicy))
    return behaviorPolicy;
  if (settings?.behaviorPolicy && typeof settings.behaviorPolicy === "object" && !Array.isArray(settings.behaviorPolicy)) {
    return settings.behaviorPolicy;
  }
  return influencePolicyForSettings(settings);
}
function footprintForPolicy(settings = {}, behaviorPolicy = null) {
  const policyFootprint = String(behaviorPolicy?.footprint?.effectiveLevel ?? behaviorPolicy?.footprint?.level ?? "").trim();
  return VALID_FOOTPRINTS.has(policyFootprint) ? policyFootprint : normalizeFootprint(settings);
}
function budgetsForPolicy(behaviorPolicy, footprint) {
  const source = asObject(behaviorPolicy?.footprint?.sectionBudgets);
  const valid = Object.fromEntries(SECTION_KEYS.map((section) => {
    const value = Number(source[section]);
    return [section, Number.isFinite(value) && value > 0 ? Math.round(value) : null];
  }));
  if (SECTION_KEYS.every((section) => Number.isFinite(valid[section]) && valid[section] > 0))
    return valid;
  return FOOTPRINT_BUDGETS[footprint] || FOOTPRINT_BUDGETS.normal;
}
function safeEvidenceRef(value) {
  const text = safeOptionalText(value, MAX_EVIDENCE_TEXT);
  if (!text)
    return null;
  return SAFE_REF_PATTERN.test(text) && !SECRET_TEXT_PATTERN2.test(text) ? text : null;
}
function normalizeEvidenceRefs2(value) {
  const source = Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value];
  return source.map((entry) => safeEvidenceRef(entry)).filter(Boolean).slice(0, 12);
}
function safeOmissionReason(value) {
  const reason = safeOptionalText(value, MAX_OMISSION_REASON);
  if (!reason)
    return "";
  return SAFE_OMISSION_REASONS.has(reason) ? reason : "unspecified";
}
function cardId(card, index) {
  const raw = safePromptId(card.id ?? card.cardId, "card");
  if (raw)
    return raw;
  return `card-${index + 1}-${hashJson(card.promptText ?? "")}`;
}
function normalizeCard(card, index) {
  const source = asObject(card);
  const promptText = safeCardPromptText(source.promptText, MAX_CARD_TEXT);
  const id = cardId(source, index);
  const tokenEstimate = numberInRange3(source.tokenEstimate, estimateTokens3(promptText), 0, 1e5);
  return {
    id,
    family: safeFamily(source.family),
    promptText,
    emphasis: cleanEnum(source.emphasis, EMPHASIS2, "normal"),
    tokenEstimate,
    detailProfile: cleanEnum(source.detailProfile, DETAIL_PROFILES, "standard"),
    evidenceRefs: normalizeEvidenceRefs2(source.evidenceRefs)
  };
}
function normalizeCards(hand = {}) {
  return (Array.isArray(hand?.cards) ? hand.cards : []).map((card, index) => normalizeCard(card, index)).filter((card) => card.promptText);
}
function normalizeOmissions(hand = {}) {
  return (Array.isArray(hand?.omitted) ? hand.omitted : []).map((omission) => {
    const source = asObject(omission);
    const cardIdValue = safePromptId(source.cardId ?? source.id, "omitted");
    const reason = safeOmissionReason(source.reason);
    if (!cardIdValue && !reason)
      return null;
    return {
      cardId: cardIdValue || "",
      family: safeFamily(source.family),
      reason: reason || "",
      tokenEstimate: numberInRange3(source.tokenEstimate, 0, 0, 1e5)
    };
  }).filter(Boolean);
}
function selectedCardRef(card) {
  return {
    cardId: card.id,
    family: card.family,
    emphasis: card.emphasis,
    tokenEstimate: card.tokenEstimate,
    detailProfile: card.detailProfile,
    evidenceRefs: [...card.evidenceRefs]
  };
}
function promptCard(card) {
  return {
    id: card.id,
    family: card.family,
    promptText: card.promptText,
    emphasis: card.emphasis,
    tokenEstimate: card.tokenEstimate,
    detailProfile: card.detailProfile,
    evidenceRefs: [...card.evidenceRefs]
  };
}
function cardEvidenceLine(card) {
  const emphasis = card.emphasis === "normal" ? "" : ` ${card.emphasis}`;
  const text = String(card.promptText || "").split(/\n+/).map((line) => safeText2(line, MAX_CARD_TEXT)).filter(Boolean);
  if (text.length <= 1)
    return `- [${card.family || "Card"}${emphasis}] ${text[0] || ""}`;
  return [
    `- [${card.family || "Card"}${emphasis}] ${text[0]}`,
    ...text.slice(1).map((line) => `  ${line}`)
  ].join(`
`);
}
function buildCardEvidenceSection(cards) {
  const lines = [
    "Private Recursion card evidence for the next assistant message.",
    "Use these cards silently as evidence. Preserve their hard constraints, subtext, and open threads while keeping card labels out of final prose.",
    "Card evidence:"
  ];
  for (const card of cards) {
    lines.push(cardEvidenceLine(card));
  }
  return {
    text: lines.join(`
`),
    sourceIds: cards.map((card) => card.id),
    cards: cards.map((card) => promptCard(card))
  };
}
function buildGuardrailsSection() {
  return {
    text: ["Guardrails:", ...STATIC_GUARDRAILS.map((line) => `- ${line}`)].join(`
`),
    sourceIds: []
  };
}
function snapshotField(snapshot, key) {
  return safeText2(asObject(snapshot)[key], 200);
}
function snapshotHash(snapshot) {
  return hashJson(asObject(snapshot));
}
function uniqueStrings2(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => safePromptId(value, "guidance-source")).filter(Boolean))];
}
function cleanStringList(value, limit = MAX_DIAGNOSTIC_TEXT, max = 16) {
  return (Array.isArray(value) ? value : []).map((entry) => safeText2(entry, limit)).filter(Boolean).slice(0, max);
}
function assertTextSafe(label, text) {
  const match = unsafeInstructionMatch(text, DYNAMIC_FORBIDDEN_PATTERNS);
  if (match)
    throw new Error(label + ' contains disallowed hidden reasoning wording [hidden-content]: "' + match + '".');
}
function hiddenReasoningDetected(text) {
  try {
    assertTextSafe("guidance", text);
    return false;
  } catch {
    return true;
  }
}
function filterGuidanceIds(value, allowedIds) {
  if (!Array.isArray(value))
    return { ids: [], invalidCount: 0, rawCount: 0 };
  const ids = [];
  let invalidCount = 0;
  for (const entry of value) {
    const id = safePromptId(entry, "guidance-source");
    if (id && allowedIds.has(id))
      ids.push(id);
    else
      invalidCount += 1;
  }
  return { ids: uniqueStrings2(ids), invalidCount, rawCount: value.length };
}
function filterGuidanceOmissions(value, allowedIds) {
  if (!Array.isArray(value))
    return { omissions: [], invalidCount: 0 };
  const omissions = [];
  let invalidCount = 0;
  for (const entry of value) {
    const source = asObject(entry);
    const id = safePromptId(source.id ?? source.cardId, "guidance-omitted");
    const reason = cleanEnum(source.reason, VALID_GUIDANCE_DROP_REASONS, "");
    if (id && allowedIds.has(id) && reason) {
      omissions.push({ id, reason });
    } else {
      invalidCount += 1;
    }
  }
  return { omissions, invalidCount };
}
function normalizePrecomposedGuidance(value, allowedIds) {
  const source = asObject(value);
  const text = safeCardPromptText(source.text ?? source.guidanceText, MAX_GUIDANCE_TEXT);
  if (!text || hiddenReasoningDetected(text)) {
    return guidanceFallback("fallback-raw-only", "precomposed-guidance-invalid");
  }
  const sourceIds = filterGuidanceIds(source.sourceCardIds, allowedIds);
  const guardrailIds = filterGuidanceIds(source.guardrailCardIds, allowedIds);
  const omitted = filterGuidanceOmissions(source.omittedCardIds, allowedIds);
  const status = VALID_GUIDANCE_STATUSES.has(source.status) ? source.status : "used";
  const diagnostics = cleanStringList(source.diagnostics, MAX_DIAGNOSTIC_TEXT, 16);
  return {
    schema: GUIDANCE_SCHEMA,
    status,
    text,
    sourceCardIds: sourceIds.ids,
    guardrailCardIds: guardrailIds.ids,
    omittedCardIds: omitted.omissions,
    diagnostics,
    invalidSourceIdCount: sourceIds.invalidCount + guardrailIds.invalidCount + omitted.invalidCount,
    fallbackReason: status === "fallback-raw-only" ? safeText2(source.fallbackReason || diagnostics[0] || status, MAX_DIAGNOSTIC_TEXT) : ""
  };
}
function guidanceFallback(status, reason) {
  return {
    schema: GUIDANCE_SCHEMA,
    status,
    text: "Guidance unavailable; use supported card analysis subject to the established scene and user instructions.",
    sourceCardIds: [],
    guardrailCardIds: [],
    omittedCardIds: [],
    diagnostics: reason ? [safeText2(reason, MAX_DIAGNOSTIC_TEXT)] : [],
    invalidSourceIdCount: 0,
    fallbackReason: safeText2(reason || status, MAX_DIAGNOSTIC_TEXT)
  };
}
async function composeGuidanceForCards({
  hand = {},
  cards: inputCards = null,
  snapshot = {},
  settings = {},
  behaviorPolicy = null,
  runId = makeId("prompt-run"),
  precomposedGuidance = null,
  storyForm = UNKNOWN_STORY_FORM
} = {}) {
  const cards = Array.isArray(inputCards) ? inputCards.map((card, index) => normalizeCard(card, index)).filter((card) => card.promptText) : normalizeCards(hand);
  const sourceSnapshotHash = snapshotHash(snapshot);
  const allowedIds = new Set(cards.map((card) => card.id));
  if (precomposedGuidance)
    return normalizePrecomposedGuidance(precomposedGuidance, allowedIds);
  return guidanceFallback("missing", "guidance_router_missing");
}
function buildGuidanceSection(guidance, storyForm = UNKNOWN_STORY_FORM) {
  const text = safeCardPromptText(guidance?.text, MAX_GUIDANCE_TEXT);
  return [
    "Private Recursion guidance for the next assistant message.",
    storyFormInstruction(storyForm),
    "Guidance:",
    text || "Guidance unavailable; use supported card analysis subject to the established scene and user instructions."
  ].join(`
`);
}
function buildInjectionPlan(sectionSources, budgets, injectionSettings = {}) {
  const injection = normalizeInjectionSettings(injectionSettings);
  return INJECTION_TEMPLATE.map((block) => ({
    ...block,
    placement: injection.placement,
    depth: injection.depth,
    role: injection.role,
    section: block.id,
    sourceIds: [...sectionSources?.[block.id] || []],
    maxChars: Math.min(MAX_PACKET_SECTION, budgets[block.id] || MAX_PACKET_SECTION)
  }));
}
function baseDiagnostics({
  runId,
  snapshotHash: sourceSnapshotHash,
  footprint,
  budgets,
  cards,
  omissions,
  behaviorPolicy = null,
  guidance,
  storyForm = UNKNOWN_STORY_FORM,
  pipelineMode = "segmented",
  planDiagnostics = []
}) {
  const normalizedStoryForm = normalizeStoryForm(storyForm);
  return {
    runId,
    composerLane: guidance?.status === "used" ? "guidance" : "utility",
    reasonerStatus: "skipped",
    guidanceStatus: guidance?.status || "missing",
    guidanceFallbackReason: guidance?.fallbackReason || "",
    guidanceInvalidSourceIdCount: Number(guidance?.invalidSourceIdCount || 0),
    guidanceSourceCardIds: [...guidance?.sourceCardIds || []],
    guidanceGuardrailCardIds: [...guidance?.guardrailCardIds || []],
    guidanceOmittedCardIds: [...guidance?.omittedCardIds || []],
    guidanceDiagnostics: [...guidance?.diagnostics || []],
    snapshotHash: sourceSnapshotHash,
    sectionBudgets: { ...budgets },
    selectedCardCount: cards.length,
    omissionCount: omissions.length,
    selectedTokenEstimate: cards.reduce((sum, card) => sum + card.tokenEstimate, 0),
    sectionHashes: null,
    footprint,
    pipelineMode,
    planDiagnostics: uniqueStrings2(planDiagnostics).slice(0, 24),
    storyFormTense: normalizedStoryForm.tense,
    storyFormPov: normalizedStoryForm.pov,
    storyFormConfidence: normalizedStoryForm.confidence,
    behaviorPolicy: summarizeBehaviorPolicyForDiagnostics(behaviorPolicy, {
      effectiveFootprint: footprint,
      selectedFamilies: cards.map((card) => card.family)
    })
  };
}
function withSectionHashes(packet) {
  return {
    ...packet,
    diagnostics: {
      ...packet.diagnostics,
      sectionHashes: Object.fromEntries(SECTION_KEYS.map((section) => [section, hashJson(packet.sections[section])]))
    }
  };
}
function buildPacket({
  packetId,
  runId,
  snapshot,
  footprint,
  budgets,
  cards,
  omissions,
  guidance,
  sections,
  sectionSources,
  injectionSettings,
  behaviorPolicy,
  diagnostics,
  planDiagnostics,
  composedAt,
  storyForm = UNKNOWN_STORY_FORM,
  pipelineMode = "segmented"
}) {
  const sourceSnapshotHash = snapshotHash(snapshot);
  const normalizedStoryForm = normalizeStoryForm(storyForm);
  return withSectionHashes({
    packetId,
    packetVersion: PACKET_VERSION,
    packetKind: "recursion.cardPacket.v1",
    snapshotHash: sourceSnapshotHash,
    chatId: snapshotField(snapshot, "chatId"),
    sceneFingerprint: snapshotField(snapshot, "sceneFingerprint"),
    turnFingerprint: snapshotField(snapshot, "turnFingerprint"),
    footprint,
    pipelineMode,
    storyForm: normalizedStoryForm,
    guidance: {
      schema: GUIDANCE_SCHEMA,
      status: guidance.status,
      text: guidance.text,
      sourceCardIds: [...guidance.sourceCardIds],
      guardrailCardIds: [...guidance.guardrailCardIds],
      omittedCardIds: [...guidance.omittedCardIds],
      diagnostics: [...guidance.diagnostics]
    },
    cardEvidence: cards.map((card) => promptCard(card)),
    packetGuardrails: {
      staticText: STATIC_GUARDRAILS.join(" "),
      sourceCardIds: [...guidance.guardrailCardIds]
    },
    sections,
    selectedCardRefs: cards.map((card) => selectedCardRef(card)),
    omissions,
    injectionPlan: buildInjectionPlan(sectionSources, budgets, injectionSettings),
    diagnostics: diagnostics || baseDiagnostics({
      runId,
      snapshotHash: sourceSnapshotHash,
      footprint,
      budgets,
      cards,
      omissions,
      behaviorPolicy,
      guidance,
      storyForm: normalizedStoryForm,
      pipelineMode,
      planDiagnostics
    }),
    composedAt
  });
}
async function composePromptPacket({
  hand = {},
  snapshot = {},
  settings = {},
  behaviorPolicy = null,
  runId = makeId("prompt-run"),
  precomposedGuidance = null,
  storyForm = UNKNOWN_STORY_FORM,
  pipelineMode = "segmented",
  planDiagnostics = []
} = {}) {
  const policy = behaviorPolicyFrom(settings, behaviorPolicy);
  const normalizedStoryForm = normalizeStoryForm(storyForm);
  const footprint = footprintForPolicy(settings, policy);
  const budgets = budgetsForPolicy(policy, footprint);
  const injectionSettings = normalizeInjectionSettings(settings?.injection);
  const cards = normalizeCards(hand);
  const promptRunId = safePromptId(runId, "prompt-run") || makeId("prompt-run");
  const omissions = normalizeOmissions(hand);
  const packetId = makeId("prompt-packet");
  const composedAt = nowIso();
  const evidence = buildCardEvidenceSection(cards);
  const guardrails = buildGuardrailsSection();
  const guidance = await composeGuidanceForCards({
    hand,
    cards,
    snapshot,
    settings,
    behaviorPolicy: policy,
    runId: promptRunId,
    precomposedGuidance,
    storyForm: normalizedStoryForm
  });
  const sections = {
    guidance: buildGuidanceSection(guidance, normalizedStoryForm),
    cardEvidence: evidence.text,
    guardrails: guardrails.text
  };
  const sectionSources = {
    guidance: guidance.sourceCardIds,
    cardEvidence: evidence.sourceIds,
    guardrails: uniqueStrings2([...guardrails.sourceIds, ...guidance.guardrailCardIds])
  };
  let packet = buildPacket({
    packetId,
    runId: promptRunId,
    snapshot,
    footprint,
    budgets,
    cards,
    omissions,
    guidance,
    sections,
    sectionSources,
    injectionSettings,
    behaviorPolicy: policy,
    planDiagnostics,
    composedAt,
    storyForm: normalizedStoryForm,
    pipelineMode
  });
  validatePromptPacket(packet);
  validatePromptPacket(packet);
  return packet;
}
function assertRequiredString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
}
function assertArray(value, label) {
  if (!Array.isArray(value))
    throw new Error(`${label} must be an array.`);
}
function validateInjectionPlan(packet) {
  assertArray(packet.injectionPlan, "injectionPlan");
  const seen = new Set;
  const templateById = new Map(INJECTION_TEMPLATE.map((block) => [block.id, block]));
  for (const block of packet.injectionPlan) {
    assertRequiredString(block?.id, "injectionPlan.id");
    assertRequiredString(block?.promptKey, "injectionPlan.promptKey");
    assertRequiredString(block?.title, "injectionPlan.title");
    assertRequiredString(block?.placement, "injectionPlan.placement");
    assertRequiredString(block?.role, "injectionPlan.role");
    if (!SECTION_KEYS.includes(block.id))
      throw new Error(`Unknown injection plan section: ${block.id}`);
    if (seen.has(block.id))
      throw new Error(`Duplicate injection plan section: ${block.id}`);
    const expected = templateById.get(block.id);
    if (block.section !== block.id)
      throw new Error("injectionPlan.section must match id.");
    if (block.promptKey !== expected.promptKey)
      throw new Error("injectionPlan.promptKey is invalid.");
    if (block.title !== expected.title)
      throw new Error("injectionPlan.title is invalid.");
    if (!VALID_INJECTION_PLACEMENTS.has(block.placement))
      throw new Error("injectionPlan.placement is invalid.");
    if (!VALID_INJECTION_ROLES.has(block.role))
      throw new Error("injectionPlan.role is invalid.");
    if (Array.isArray(block.depth) || typeof block.depth === "boolean" || typeof block.depth === "object") {
      throw new Error("injectionPlan.depth is invalid.");
    }
    const depth = Number(block.depth);
    if (!Number.isInteger(depth) || depth < 0 || depth > 10)
      throw new Error("injectionPlan.depth is invalid.");
    const maxChars = Number(block.maxChars);
    if (!Number.isInteger(maxChars) || maxChars < 0 || maxChars > MAX_PACKET_SECTION)
      throw new Error("injectionPlan.maxChars is invalid.");
    assertArray(block?.sourceIds, "injectionPlan.sourceIds");
    for (const sourceId of block.sourceIds) {
      if (typeof sourceId !== "string" || !SAFE_ID_PATTERN.test(sourceId))
        throw new Error("injectionPlan.sourceIds must be safe strings.");
    }
    seen.add(block.id);
  }
  for (const section of SECTION_KEYS) {
    if (!seen.has(section))
      throw new Error(`Missing injection plan section: ${section}`);
  }
}
function validatePromptPacket(packet) {
  const source = asObject(packet);
  assertRequiredString(source.packetId, "packetId");
  if (source.packetVersion !== PACKET_VERSION)
    throw new Error("packetVersion is invalid.");
  assertRequiredString(source.snapshotHash, "snapshotHash");
  assertRequiredString(source.chatId, "chatId");
  assertRequiredString(source.sceneFingerprint, "sceneFingerprint");
  assertRequiredString(source.turnFingerprint, "turnFingerprint");
  if (!VALID_FOOTPRINTS.has(source.footprint))
    throw new Error("footprint is invalid.");
  assertRequiredString(source.composedAt, "composedAt");
  const sections = asObject(source.sections);
  for (const section of SECTION_KEYS) {
    assertRequiredString(sections[section], `sections.${section}`);
    assertTextSafe(`Prompt packet ${section}`, sections[section]);
  }
  assertArray(source.selectedCardRefs, "selectedCardRefs");
  assertArray(source.omissions, "omissions");
  validateInjectionPlan(source);
  if (!source.diagnostics || typeof source.diagnostics !== "object" || Array.isArray(source.diagnostics)) {
    throw new Error("diagnostics must be an object.");
  }
  assertRequiredString(source.diagnostics.runId, "diagnostics.runId");
  assertRequiredString(source.diagnostics.composerLane, "diagnostics.composerLane");
  assertRequiredString(source.diagnostics.reasonerStatus, "diagnostics.reasonerStatus");
  assertRequiredString(source.diagnostics.guidanceStatus, "diagnostics.guidanceStatus");
  if (!VALID_GUIDANCE_STATUSES.has(source.diagnostics.guidanceStatus))
    throw new Error("diagnostics.guidanceStatus is invalid.");
  return source;
}
function packetToPromptBlocks(packet) {
  const source = validatePromptPacket(packet);
  const budgets = asObject(source.diagnostics?.sectionBudgets);
  return source.injectionPlan.map((plan) => {
    const rawText = String(source.sections[plan.id] ?? "");
    const maxChars = numberInRange3(plan.maxChars ?? budgets[plan.id], rawText.length, 0, MAX_PACKET_SECTION);
    const text = truncate(rawText, maxChars);
    return {
      id: plan.id,
      promptKey: plan.promptKey,
      title: plan.title,
      packetId: source.packetId,
      section: plan.id,
      placement: plan.placement,
      depth: Number(plan.depth),
      role: plan.role,
      text,
      hash: hashJson(text),
      sourceIds: [...plan.sourceIds]
    };
  });
}

// src/backend.ts
var composePacket = composePromptPacket;
var SETTINGS_PATH = "global/settings.json";
var DEFAULT_SETTINGS = { enabled: true, connectionId: "" };
var WINDOW_SIZE = 20;
var INTERCEPTOR_TIMEOUT_MS = 30000;
var RAW_BUDGET_MS = INTERCEPTOR_TIMEOUT_MS - 5000;
var MAX_PROMPT_LINE_CHARS = 400;
var RECURSION_GUIDANCE_NAME = "Recursion Guidance";
var lastKnownUserId = "";
var windowedMessages = [];
async function loadOrCreateSettings() {
  const exists = await spindle.storage.exists(SETTINGS_PATH);
  if (!exists) {
    await spindle.storage.setJson(SETTINGS_PATH, DEFAULT_SETTINGS, { indent: 2 });
    spindle.log.info("settings: created default");
    return;
  }
  const settings = await spindle.storage.getJson(SETTINGS_PATH, { fallback: DEFAULT_SETTINGS });
  spindle.log.info(`settings: loaded existing ${JSON.stringify(settings)}`);
}
try {
  await loadOrCreateSettings();
} catch (error) {
  const errorClass = error instanceof Error ? error.name : "non-Error";
  spindle.log.error(`settings: failed to load or create errorClass=${errorClass} errorLength=${String(error).length}`);
}
function messageText(content) {
  if (typeof content === "string")
    return content;
  if (!Array.isArray(content))
    return "";
  return content.filter((part) => part?.type === "text").map((part) => String(part?.text ?? "")).filter((line) => line.trim()).join(`
`);
}
function buildWindow(messages) {
  const asPlain = (message) => {
    const msg = message;
    return {
      role: typeof msg?.role === "string" ? msg.role : "",
      content: messageText(msg?.content)
    };
  };
  let history = messages.filter((message) => message?.__isChatHistory === true).map(asPlain).filter((m) => (m.role === "user" || m.role === "assistant") && m.content.trim());
  if (history.length === 0) {
    history = messages.map(asPlain).filter((m) => (m.role === "user" || m.role === "assistant") && m.content.trim());
  }
  return history.slice(-WINDOW_SIZE);
}
function buildSnapshot(chatId, window) {
  return {
    chatId,
    sceneFingerprint: hashJson(window),
    turnFingerprint: hashJson({
      chatId,
      messageCount: window.length,
      lastRole: window[window.length - 1]?.role ?? ""
    })
  };
}
var GUIDANCE_SYSTEM_PROMPT = "You are the Recursion guidance composer. Read the recent chat below and reply with ONLY a JSON object, no prose, no markdown: " + '{"text": "<1-4 sentences of concrete scene guidance for the next assistant reply>", "sourceCardIds": ["<relevant card id>"]}. ' + `Allowed card ids: ${MINI_DECK.map((card) => card.id).join(", ")}.`;
function buildModelMessages(window) {
  const transcript = window.map((m) => `${m.role}: ${truncate(m.content, MAX_PROMPT_LINE_CHARS)}`).join(`
`);
  return [
    { role: "system", content: GUIDANCE_SYSTEM_PROMPT },
    { role: "user", content: `Recent chat (oldest first):
${transcript}` }
  ];
}
function parseGuidanceContent(rawContent) {
  if (typeof rawContent !== "string") {
    throw new Error("unexpected result shape \u2014 content is not a string");
  }
  let text = rawContent.trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced)
    text = fenced[1].trim();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`JSON.parse failed \u2014 ${error instanceof Error ? error.message : String(error)}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("parsed guidance JSON is not an object");
  }
  const guidanceText = typeof parsed.text === "string" ? parsed.text.trim() : "";
  if (!guidanceText)
    throw new Error("guidance text missing or empty");
  const rawIds = parsed.sourceCardIds;
  const sourceCardIds = Array.isArray(rawIds) ? rawIds.filter((id) => typeof id === "string") : [];
  return { status: "used", text: guidanceText, sourceCardIds };
}
var interceptorRegistered = false;
function tryRegisterInterceptor() {
  if (interceptorRegistered)
    return;
  if (!spindle.permissions.has("interceptor"))
    return;
  spindle.registerInterceptor(async (messages, context) => {
    let settings;
    try {
      settings = await spindle.storage.getJson(SETTINGS_PATH, {
        fallback: DEFAULT_SETTINGS
      });
    } catch {
      spindle.log.warn(`pipeline: settings read failed promptMessages unchanged=${messages.length}`);
      return messages;
    }
    if (settings.enabled === false) {
      spindle.log.info(`pipeline: disabled promptMessages unchanged=${messages.length}`);
      return messages;
    }
    const contextUserId = typeof context?.userId === "string" ? context.userId : "";
    const userId = contextUserId || lastKnownUserId;
    const userIdSource = contextUserId ? "context" : lastKnownUserId ? "event" : "none";
    spindle.log.info(`pipeline: start promptMessages=${messages.length} generationType=${String(context?.generationType ?? "(unknown)")} userIdSource=${userIdSource}`);
    let stage = "window";
    try {
      if (!userId) {
        spindle.log.warn(`pipeline: skipped \u2014 no userId available promptMessages unchanged=${messages.length}`);
        return messages;
      }
      if (!spindle.permissions.has("generation")) {
        spindle.log.warn(`pipeline: skipped \u2014 generation permission not granted promptMessages unchanged=${messages.length}`);
        return messages;
      }
      const window = buildWindow(messages);
      if (window.length === 0) {
        spindle.log.warn(`pipeline: skipped \u2014 empty chat window promptMessages unchanged=${messages.length}`);
        return messages;
      }
      const chatId = typeof context?.chatId === "string" && context.chatId ? context.chatId : "chat";
      spindle.log.info(`pipeline: window kept=${window.length} chatId=${chatId}`);
      stage = "hand";
      const hand = selectHand([...MINI_DECK]);
      spindle.log.info(`pipeline: hand cards=${hand.cards.length} omitted=${hand.omitted.length}`);
      stage = "connection";
      const resolved = await resolveConnectionId(userId);
      if (!resolved) {
        spindle.log.warn(`pipeline: skipped \u2014 no connection profile promptMessages unchanged=${messages.length}`);
        return messages;
      }
      stage = "profile";
      const profile = await spindle.connections.get(resolved.connectionId, userId);
      if (!profile) {
        spindle.log.warn(`pipeline: connection profile not found; skipped promptMessages unchanged=${messages.length}`);
        return messages;
      }
      stage = "raw";
      const controller = new AbortController;
      const timer = setTimeout(() => controller.abort(), RAW_BUDGET_MS);
      const onHostAbort = () => controller.abort();
      const hostSignal = context?.signal;
      if (hostSignal) {
        if (hostSignal.aborted)
          controller.abort();
        else
          hostSignal.addEventListener("abort", onHostAbort, { once: true });
      }
      let rawContent;
      try {
        const raw = spindle.generate.raw;
        const startedAt = Date.now();
        const result = await raw({
          type: "raw",
          provider: profile.provider,
          model: profile.model,
          connection_id: resolved.connectionId,
          userId,
          messages: buildModelMessages(window),
          signal: controller.signal
        });
        const candidate = result?.content;
        if (typeof candidate !== "string") {
          throw new Error("unexpected result shape \u2014 content is not a string");
        }
        rawContent = candidate;
        spindle.log.info(`pipeline: raw done ms=${Date.now() - startedAt} contentLength=${candidate.length}`);
      } finally {
        clearTimeout(timer);
        if (hostSignal)
          hostSignal.removeEventListener("abort", onHostAbort);
      }
      stage = "parse";
      const precomposedGuidance = parseGuidanceContent(rawContent);
      stage = "compose";
      const packet = await composePacket({
        hand,
        snapshot: buildSnapshot(chatId, window),
        settings: { promptFootprint: "normal" },
        precomposedGuidance
      });
      spindle.log.info(`pipeline: guidance status=${packet.diagnostics?.guidanceStatus ?? "(unknown)"} composerLane=${packet.diagnostics?.composerLane ?? "(unknown)"} selectedCards=${packet.diagnostics?.selectedCardCount ?? 0}`);
      const blocks = packetToPromptBlocks(packet);
      const combined = blocks.map((block) => String(block?.text ?? "")).filter((text) => text.trim()).join(`

`);
      if (!combined) {
        spindle.log.warn(`pipeline: skipped \u2014 combined block text empty promptMessages unchanged=${messages.length}`);
        return messages;
      }
      stage = "inject";
      const injected = [{ role: "system", content: combined }, ...messages];
      const injectedBlocks = blocks.filter((block) => String(block?.text ?? "").trim()).length;
      spindle.log.info(`pipeline: injected messageIndex=0 blocks=${injectedBlocks}/3 promptMessages=${injected.length}`);
      sendRunStatus("injected", { blocks: injectedBlocks, promptMessages: injected.length }, userId);
      return {
        messages: injected,
        breakdown: [{ messageIndex: 0, name: RECURSION_GUIDANCE_NAME }]
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorClass = error instanceof Error ? error.name : "non-Error";
      spindle.log.error(`pipeline: failed stage=${stage} errorClass=${errorClass} errorLength=${message.length} promptMessages unchanged=${messages.length}`);
      sendRunStatus("failed", { stage, promptMessages: messages.length }, userId);
      return messages;
    }
  });
  interceptorRegistered = true;
  spindle.log.info(`interceptor: registered priority=100 timeoutMs=${INTERCEPTOR_TIMEOUT_MS}`);
}
tryRegisterInterceptor();
spindle.permissions.onChanged(({ permission, granted }) => {
  if (permission === "interceptor" && granted)
    tryRegisterInterceptor();
});
async function resolveConnectionId(userId) {
  const settings = await spindle.storage.getJson(SETTINGS_PATH, {
    fallback: DEFAULT_SETTINGS
  });
  if (typeof settings.connectionId === "string" && settings.connectionId) {
    return { connectionId: settings.connectionId };
  }
  const connections = await spindle.connections.list(userId);
  if (connections.length === 0) {
    spindle.log.warn("pipeline: no connection profiles available");
    return null;
  }
  const chosen = connections.find((c) => c.is_default) ?? connections[0];
  spindle.log.info(`pipeline: connection selected id=${chosen.id} default=${chosen.is_default}`);
  return { connectionId: chosen.id };
}
function toConnectionOptions(connections) {
  const options = [];
  for (const connection of connections) {
    const id = typeof connection?.id === "string" ? connection.id : "";
    if (!id)
      continue;
    options.push({
      id,
      name: typeof connection.name === "string" ? connection.name : id,
      provider: typeof connection.provider === "string" ? connection.provider : "",
      model: typeof connection.model === "string" ? connection.model : "",
      is_default: connection.is_default === true
    });
  }
  return options;
}
function sendRunStatus(status, fields, userId) {
  if (!userId)
    return;
  try {
    spindle.sendToFrontend({ type: "run_status", status, ...fields }, userId);
  } catch {}
}
async function sendState(userId) {
  const settings = await spindle.storage.getJson(SETTINGS_PATH, {
    fallback: DEFAULT_SETTINGS
  });
  let connections = [];
  try {
    connections = toConnectionOptions(await spindle.connections.list(userId));
    spindle.log.info(`ui: connections listed count=${connections.length}`);
  } catch {
    spindle.log.warn("ui: connections list failed");
  }
  spindle.sendToFrontend({
    type: "state",
    enabled: settings.enabled !== false,
    connectionId: typeof settings.connectionId === "string" ? settings.connectionId : "",
    connections
  }, userId);
}
async function writeSettingsKey(key, value) {
  const settings = await spindle.storage.getJson(SETTINGS_PATH, {
    fallback: DEFAULT_SETTINGS
  });
  const merged = { ...DEFAULT_SETTINGS, ...settings, [key]: value };
  await spindle.storage.setJson(SETTINGS_PATH, merged, { indent: 2 });
}
async function handleFrontendMessage(type, payload, userId) {
  switch (type) {
    case "get_state":
      await sendState(userId);
      return;
    case "set_enabled": {
      const value = payload?.value;
      if (typeof value !== "boolean")
        throw new Error("invalid set_enabled value");
      await writeSettingsKey("enabled", value);
      spindle.log.info(`ui: set enabled=${value}`);
      await sendState(userId);
      return;
    }
    case "set_connection": {
      const value = payload?.value;
      if (typeof value !== "string")
        throw new Error("invalid set_connection value");
      if (value === "") {
        await writeSettingsKey("connectionId", "");
        spindle.log.info("ui: cleared connectionId (use default)");
      } else {
        const profile = await spindle.connections.get(value, userId);
        if (!profile) {
          spindle.log.error("ui: handler failed type=set_connection");
          spindle.sendToFrontend({ type: "error" }, userId);
          return;
        }
        await writeSettingsKey("connectionId", value);
        spindle.log.info(`ui: set connectionId=${value}`);
      }
      await sendState(userId);
      return;
    }
  }
}
var KNOWN_FRONTEND_MESSAGE_TYPES = ["get_state", "set_enabled", "set_connection"];
spindle.onFrontendMessage((payload, userId) => {
  if (typeof userId === "string" && userId)
    lastKnownUserId = userId;
  const rawType = payload?.type;
  const type = typeof rawType === "string" ? rawType : "";
  if (!KNOWN_FRONTEND_MESSAGE_TYPES.includes(type)) {
    spindle.log.info("ui: unknown message type ignored");
    return;
  }
  if (typeof userId !== "string" || !userId) {
    spindle.log.warn("ui: no userId on message, skipped");
    return;
  }
  handleFrontendMessage(type, payload, userId).catch(() => {
    spindle.log.error(`ui: handler failed type=${type}`);
    try {
      spindle.sendToFrontend({ type: "error" }, userId);
    } catch {}
  });
});
function hasChatPermissions() {
  return spindle.permissions.has("chats") && spindle.permissions.has("chat_mutation");
}
async function refreshChatWindow(userId) {
  if (!hasChatPermissions()) {
    windowedMessages = [];
    spindle.log.warn("chat-window: skipped \u2014 chats/chat_mutation permission not granted");
    return;
  }
  const active = await spindle.chats.getActive(userId);
  if (!active) {
    windowedMessages = [];
    spindle.log.warn("chat-window: no active chat");
    return;
  }
  const all = await spindle.chat.getMessages(active.id);
  windowedMessages = all.slice(-WINDOW_SIZE);
  spindle.log.info(`chat-window: kept ${windowedMessages.length} of ${all.length} messages for chat ${active.id}`);
}
spindle.on("CHAT_CHANGED", (_payload, userId) => {
  if (typeof userId !== "string" || !userId) {
    spindle.log.warn("chat-window: no userId in CHAT_CHANGED event, skipped");
    return;
  }
  lastKnownUserId = userId;
  refreshChatWindow(userId).catch((error) => {
    const errorClass = error instanceof Error ? error.name : "non-Error";
    spindle.log.error(`chat-window: refresh failed errorClass=${errorClass} errorLength=${String(error).length}`);
  });
});
