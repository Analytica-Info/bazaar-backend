/**
 * Shared stub factory used by all contract tests.
 * Returns an object mapping each method name to a no-op handler.
 */
const stubAll = (names) =>
  Object.fromEntries(
    names.map((n) => [n, (req, res) => res.json({ success: true, data: null })])
  );

module.exports = { stubAll };
