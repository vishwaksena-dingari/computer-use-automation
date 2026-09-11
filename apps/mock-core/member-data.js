/**
 * @file Browser/Node helpers for mock-core member lookup (API client + shared constants).
 */

export const FOUND_ID = 'M-10042';
export const NOT_FOUND_ID = 'M-99999';
export const NOT_FOUND_CODE = 'member.NOT_FOUND';

/**
 * Call thin mock API. Always HTTP 200 for known routes; kind discriminates business result.
 * @param {string} memberId
 * @param {string} [baseUrl]
 */
export async function fetchMemberLookup(memberId, baseUrl = '') {
  const trimmed = String(memberId ?? '').trim();
  if (!trimmed) {
    return { kind: 'not_found', code: NOT_FOUND_CODE, memberId: '' };
  }
  const id = encodeURIComponent(trimmed);
  const res = await fetch(`${baseUrl}/api/members/${id}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`lookup HTTP ${res.status}`);
  return res.json();
}

/**
 * @param {string} [baseUrl]
 */
export async function fetchMemberIds(baseUrl = '') {
  const res = await fetch(`${baseUrl}/api/members`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`members list HTTP ${res.status}`);
  const body = await res.json();
  return body.memberIds ?? [];
}

/**
 * @param {number} ms
 */
export function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
