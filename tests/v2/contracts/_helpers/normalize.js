/**
 * Strips volatile fields (ids, timestamps, tokens) from a response body
 * before snapshot assertions, so snapshots stay stable across runs.
 */

const VOLATILE_KEYS = new Set([
  "_id", "id", "userId", "user_id",
  "createdAt", "updatedAt", "__v",
  "accessToken", "refreshToken", "token",
  "iat", "exp",
]);

function normalize(value) {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (VOLATILE_KEYS.has(k)) {
        out[k] = "<redacted>";
      } else {
        out[k] = normalize(v);
      }
    }
    return out;
  }
  return value;
}

module.exports = { normalize };
