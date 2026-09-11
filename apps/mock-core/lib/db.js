/**
 * @file JSON-table “DB” for mock-core — members ⨝ accounts ⨝ contacts by memberId.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const FOUND_ID = 'M-10042';
export const NOT_FOUND_ID = 'M-99999';
export const NOT_FOUND_CODE = 'member.NOT_FOUND';

/**
 * @param {string} dataDir absolute path to apps/mock-core/data
 */
export async function loadTables(dataDir) {
  const [members, accounts, contacts] = await Promise.all([
    readJson(join(dataDir, 'members.json')),
    readJson(join(dataDir, 'accounts.json')),
    readJson(join(dataDir, 'contacts.json')),
  ]);
  return { members, accounts, contacts };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

/**
 * Join tables for one member. Missing member → business not-found (not thrown).
 * @param {{ members: any[], accounts: any[], contacts: any[] }} tables
 * @param {string} memberId
 */
export function lookupMember(tables, memberId) {
  const id = String(memberId ?? '').trim();
  const member = tables.members.find((m) => m.memberId === id);
  if (!member) {
    return { kind: 'not_found', code: NOT_FOUND_CODE, memberId: id };
  }
  const accounts = tables.accounts.filter((a) => a.memberId === id);
  const contact = tables.contacts.find((c) => c.memberId === id) ?? null;
  const savings = accounts.find((a) => a.product === 'Savings' && a.status !== 'CLOSED');
  return {
    kind: 'found',
    member,
    contact,
    accounts,
    /** Convenience field for locked demo checkpoint (Savings balance). */
    savingsBalance: savings?.balance ?? '$0.00',
    name: member.name,
    memberId: member.memberId,
  };
}

/**
 * @param {{ members: any[] }} tables
 */
export function listMemberIds(tables) {
  return tables.members.map((m) => m.memberId);
}
