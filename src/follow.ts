import { MANAGERS } from './reference.ts';

/** The manager a signed-in visitor asked the site to highlight. A preference, not proof of who they are. */
export interface FollowedManager {
  key: string;
  name: string;
}

const KEY = /^(premier|championship|league-one):\d+$/;

/** Accepts only a current manager. A mismatched name and team is ignored. */
export function parseFollowed(key: unknown, name: unknown): FollowedManager | null {
  if (typeof key !== 'string' || typeof name !== 'string' || !KEY.test(key)) return null;
  const known = MANAGERS.find(item => item.key === key && item.manager === name);
  return known ? { key: known.key, name: known.manager } : null;
}

export function isFollowedName(followed: FollowedManager | null, name: string | null | undefined): boolean {
  if (!followed || !name) return false;
  return name.trim().toLowerCase() === followed.name.toLowerCase();
}

export function isFollowedTeam(followed: FollowedManager | null, slug: string | null | undefined, teamId: string | null | undefined): boolean {
  if (!followed || !slug || teamId == null || teamId === '') return false;
  return followed.key === `${slug}:${teamId}`;
}
