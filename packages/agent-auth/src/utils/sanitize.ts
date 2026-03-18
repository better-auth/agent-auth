/**
 * Display text sanitization (§8.10).
 *
 * Strips HTML tags, limits length, and removes control characters
 * from attacker-controlled display fields.
 */

const HTML_TAG_RE = /<[^>]*>/g;
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export function sanitizeDisplayText(
	text: string,
	maxLength: number,
): string {
	return text
		.replace(HTML_TAG_RE, "")
		.replace(CONTROL_CHAR_RE, "")
		.trim()
		.slice(0, maxLength);
}

export const DISPLAY_LIMITS = {
	name: 200,
	reason: 500,
	hostName: 200,
	bindingMessage: 500,
} as const;
