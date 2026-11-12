// Ported from Recursion src/core.mjs (MIT License, Copyright (c) 2026 Josh Shapiro).
// Source lines: 1-29, 31-61, 67-111, 306-322, 324-330. Full license: LICENSE (repo root).
const SECRET_KEY_SUFFIXES = [
  'apikey',
  'authorization',
  'cookie',
  'token',
  'password',
  'secret',
  'sessionkey',
  'bearer',
  'privatekey',
  'credentials',
  'authheader'
];
const FORBIDDEN_DIAGNOSTIC_KEY_PARTS = [
  'rawprompt',
  'rawresponse',
  'providerprompt',
  'providerresponse',
  'hiddenreasoning',
  'privatestoryplan',
  'privateplan',
  'sessionid'
];
const FORBIDDEN_DIAGNOSTIC_KEY_SUFFIXES = new Set(['body', 'data', 'payload', 'text', 'value']);
const PROVIDER_REASONING_DIAGNOSTIC_KEYS = new Set([
  'reasoning',
  'reasoningcontent',
  'reasoningdetails'
]);

function normalizeKey(value) {
  return String(value ?? '').replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
}

function isSecretKey(value) {
  const key = normalizeKey(value);
  if (!key || key.endsWith('count')) return false;
  if (PROVIDER_REASONING_DIAGNOSTIC_KEYS.has(key)) return true;
  if (isForbiddenDiagnosticKey(key)) return true;
  return SECRET_KEY_SUFFIXES.some((suffix) => key.endsWith(suffix));
}

function isForbiddenDiagnosticKey(key) {
  for (const part of FORBIDDEN_DIAGNOSTIC_KEY_PARTS) {
    let index = key.indexOf(part);
    while (index >= 0) {
      const suffix = key.slice(index + part.length);
      if (!suffix || FORBIDDEN_DIAGNOSTIC_KEY_SUFFIXES.has(suffix)) return true;
      index = key.indexOf(part, index + part.length);
    }
  }
  return false;
}

function sanitizeId(value) {
  return String(value ?? '').trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

export function compact(value, limit = 10000) {
  return truncate(String(value ?? '').replace(/\s+/g, ' ').trim(), limit);
}

export function truncate(value, limit = 200) {
  const text = String(value ?? '');
  const numericLimit = Number(limit);
  const cap = numericLimit === Infinity ? text.length : Math.max(0, Math.floor(numericLimit) || 0);
  if (text.length <= cap) return text;
  if (cap <= 3) return '.'.repeat(cap);
  return `${text.slice(0, cap - 3)}...`;
}

export function safeId(value, fallback = 'item') {
  return sanitizeId(value) || sanitizeId(fallback) || 'item';
}

export function stableStringify(value) {
  const visiting = new WeakSet();
  function normalize(input) {
    if (!input || typeof input !== 'object') return input;
    if (visiting.has(input)) return '[Circular]';
    visiting.add(input);
    try {
      if (Array.isArray(input)) return input.map((entry) => normalize(entry));
      return Object.fromEntries(Object.keys(input).sort().map((key) => [key, normalize(input[key])]));
    } finally {
      visiting.delete(input);
    }
  }
  return JSON.stringify(normalize(value));
}

export function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (const char of String(value ?? '')) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function hashJson(value) {
  return fnv1a(stableStringify(value));
}

export function redact(value, { maxString = 500 } = {}) {
  const visiting = new WeakSet();
  function visit(input, key = '') {
    if (isSecretKey(key)) return '[redacted]';
    if (typeof input === 'string') return truncate(input, maxString);
    if (!input || typeof input !== 'object') return input;
    if (visiting.has(input)) return '[Circular]';
    visiting.add(input);
    try {
      if (Array.isArray(input)) return input.map((entry) => visit(entry));
      return Object.fromEntries(Object.entries(input).map(([childKey, child]) => [childKey, visit(child, childKey)]));
    } finally {
      visiting.delete(input);
    }
  }
  return visit(value);
}

export function nowIso() {
  return new Date().toISOString();
}

export function makeId(prefix = 'id') {
  return `${safeId(prefix)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
