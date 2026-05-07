'use strict';

const { validate, REQUIRED_KEYS, TUNABLE_GROUPS } = require('../../scripts/validateEnv');

// ── helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal env that satisfies all required keys. */
function minimalEnv(overrides = {}) {
  const base = {
    MONGO_URI: 'mongodb://localhost:27017/test',
    JWT_SECRET: 'supersecretjwt',
    JWT_REFRESH_SECRET: 'supersecretrefresh',
    STRIPE_SK: 'sk_test_abc123',
  };
  return { ...base, ...overrides };
}

// ── required-key tests ────────────────────────────────────────────────────────

describe('validate() — required keys', () => {
  test('returns ok=true when all required keys are present', () => {
    const { ok } = validate(minimalEnv());
    expect(ok).toBe(true);
  });

  test('returns ok=false when MONGO_URI is missing', () => {
    const env = minimalEnv({ MONGO_URI: undefined });
    const { ok } = validate(env);
    expect(ok).toBe(false);
  });

  test('returns ok=false when JWT_SECRET is missing', () => {
    const env = minimalEnv({ JWT_SECRET: '' });
    const { ok } = validate(env);
    expect(ok).toBe(false);
  });

  test('returns ok=false when STRIPE_SK is missing', () => {
    const env = minimalEnv({ STRIPE_SK: undefined });
    const { ok } = validate(env);
    expect(ok).toBe(false);
  });

  test('returns ok=false when JWT_REFRESH_SECRET is missing', () => {
    const env = minimalEnv({ JWT_REFRESH_SECRET: undefined });
    const { ok } = validate(env);
    expect(ok).toBe(false);
  });

  test('returns ok=false when ALL required keys are missing', () => {
    const { ok } = validate({});
    expect(ok).toBe(false);
  });

  test('missing key line contains "x" marker and key name', () => {
    const env = minimalEnv({ MONGO_URI: undefined });
    const { lines } = validate(env);
    const missingLine = lines.find(l => l.includes('MONGO_URI'));
    expect(missingLine).toBeDefined();
    expect(missingLine).toMatch(/x\s+MONGO_URI/);
  });

  test('present key line contains "+" marker and redacted value', () => {
    const env = minimalEnv();
    const { lines } = validate(env);
    const line = lines.find(l => l.includes('JWT_SECRET') && !l.includes('REFRESH'));
    expect(line).toBeDefined();
    expect(line).toMatch(/\+\s+JWT_SECRET/);
    // Should NOT contain the full secret
    expect(line).not.toContain('supersecretjwt');
    expect(line).toContain('***');
  });
});

// ── tunable-key tests ─────────────────────────────────────────────────────────

describe('validate() — tunable keys', () => {
  test('unset tunable shows "." marker and "default"', () => {
    const env = minimalEnv(); // no tunables set
    const { lines } = validate(env);
    const line = lines.find(l => l.includes('CACHE_TTL_SMART_CATEGORY'));
    expect(line).toBeDefined();
    expect(line).toMatch(/\.\s+CACHE_TTL_SMART_CATEGORY = default/);
  });

  test('set tunable shows "+" marker and its value', () => {
    const env = minimalEnv({ CACHE_TTL_SMART_CATEGORY: '600' });
    const { lines } = validate(env);
    const line = lines.find(l => l.includes('CACHE_TTL_SMART_CATEGORY'));
    expect(line).toBeDefined();
    expect(line).toMatch(/\+\s+CACHE_TTL_SMART_CATEGORY = 600/);
  });

  test('ok remains true even when tunables are unset', () => {
    const { ok } = validate(minimalEnv());
    expect(ok).toBe(true);
  });
});

// ── section header tests ──────────────────────────────────────────────────────

describe('validate() — output structure', () => {
  test('output includes "# Required" section', () => {
    const { lines } = validate(minimalEnv());
    expect(lines).toContain('# Required');
  });

  test('output includes a section header for each tunable group', () => {
    const { lines } = validate(minimalEnv());
    for (const group of Object.keys(TUNABLE_GROUPS)) {
      expect(lines).toContain(`# Tunables — ${group}`);
    }
  });

  test('every required key appears in output', () => {
    const { lines } = validate(minimalEnv());
    for (const key of REQUIRED_KEYS) {
      expect(lines.some(l => l.includes(key))).toBe(true);
    }
  });

  test('every tunable key appears in output', () => {
    const { lines } = validate(minimalEnv());
    for (const keys of Object.values(TUNABLE_GROUPS)) {
      for (const key of keys) {
        expect(lines.some(l => l.includes(key))).toBe(true);
      }
    }
  });
});

// ── snapshot test ─────────────────────────────────────────────────────────────

describe('validate() — representative output snapshot', () => {
  test('matches snapshot for a typical dev env (all required set, no tunables)', () => {
    const env = minimalEnv();
    const { lines } = validate(env);
    // Snapshot normalises redacted secrets to avoid churn if test secret changes
    const normalised = lines.map(l =>
      l.replace(/\+\s+(MONGO_URI|JWT_SECRET|JWT_REFRESH_SECRET|STRIPE_SK) = .+/, '  + $1 = <redacted>')
    );
    expect(normalised).toMatchSnapshot();
  });
});
