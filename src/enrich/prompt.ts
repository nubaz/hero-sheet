/**
 * Instruction for the default describer (`claude -p --model haiku`). The
 * request JSON arrives on stdin; the answer must be one JSON array.
 */
export const PROMPT = `You write short display text for the cards of a Claude Code setup viewer.

The JSON on stdin is { "branches": [...], "items": [{ "id", "kind", "name", "description", "sampleTools" }] }.
"description" is the raw text from the item's own file and may be missing. "sampleTools" (connectors only) lists tool names the connector exposes.

For every item, answer with one object:
{ "id": <the same id>, "branch": <one of "branches">, "title": { "en": ..., "ru": ... }, "summary": { "en": ..., "ru": ... } }

Rules:
- branch: the domain the item belongs to. Use "other" when none fits.
- title: at most four words per language. A short name, not a sentence.
- summary: at most 30 words per language. Say what the item does and when it is used.
- Write for a person who has never opened the skill file. Plain words. No marketing words, no "powerful", "seamless", "robust", no exclamation marks.
- Use only what the name, description and tool names say. Do not invent features. If there is almost nothing to go on, say so plainly in the summary.
- ru is a natural Russian version, not a word-for-word copy of en.
- Keep every id exactly as given. Output one entry per item and nothing else.

Reply with a single JSON array and no other text.`;
