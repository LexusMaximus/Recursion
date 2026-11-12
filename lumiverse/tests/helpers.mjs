// Ours (not ported): tiny assert helpers for the lumiverse assert tests (no test framework,
// mirrors the Recursion tools/ assert-script pattern).
let checks = 0;

export function assert(condition, message = 'condition') {
  if (!condition) throw new Error(message);
  checks += 1;
}

export function assertEqual(actual, expected, message = 'value') {
  assert(
    actual === expected,
    `${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

export function assertDeepEqual(actual, expected, message = 'deep value') {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

export function report(label) {
  const suffix = process.exitCode ? ' (WITH FAILURES)' : '';
  console.log(`${label}: ${checks} assertion${checks === 1 ? '' : 's'} passed${suffix}`);
}
