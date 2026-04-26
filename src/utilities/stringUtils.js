/**
 * Escapes special regex characters in a string so it can be used
 * safely inside a MongoDB $regex query without causing parse errors
 * from raw user input (e.g. unmatched parentheses, dots, asterisks).
 */
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { escapeRegex };
