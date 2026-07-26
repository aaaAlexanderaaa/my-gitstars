const MAX_TAG_LENGTH = 50;
const MAX_TAGS_PER_REPO = 100;
const TAG_PATTERN = /^[\w.-]+$/;

/**
 * Validates and normalises a tag payload.
 *
 * Tags are typed by hand, filtered on, and rendered as-is, so this runs on the server
 * for every tag endpoint rather than trusting the client's own check (which allowed a
 * different character set and only ever validated one tag at a time).
 *
 * @param {string|string[]} input a tag, a whitespace/comma separated list, or an array
 * @returns {{tags: string[]}|{error: string}}
 */
function normalizeTags(input) {
  const raw = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(/[\s,]+/)
      : null;

  if (raw === null) {
    return { error: 'Tags must be a string or an array of strings' };
  }

  const tags = [];
  for (const candidate of raw) {
    if (typeof candidate !== 'string') {
      return { error: 'Tags must be a string or an array of strings' };
    }
    const tag = candidate.trim();
    if (!tag) continue;
    if (tag.length > MAX_TAG_LENGTH) {
      return { error: `Tag "${tag.slice(0, 20)}..." exceeds ${MAX_TAG_LENGTH} characters` };
    }
    if (!TAG_PATTERN.test(tag)) {
      return { error: `Tag "${tag}" may only contain letters, numbers, dots, hyphens and underscores` };
    }
    if (!tags.includes(tag)) tags.push(tag);
  }

  if (tags.length === 0) {
    return { error: 'No valid tags provided' };
  }

  return { tags };
}

module.exports = { normalizeTags, MAX_TAG_LENGTH, MAX_TAGS_PER_REPO };
