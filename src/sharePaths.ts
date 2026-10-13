export const RECORD_BOOKS = ['weekly', 'jffl', 'league', 'bowl'] as const;

/** Record-book tab. An unknown book opens the weekly list. */
export function recordBookId(param: string | undefined) {
  return (RECORD_BOOKS as readonly string[]).includes(param ?? '') ? param as typeof RECORD_BOOKS[number] : 'weekly';
}

/** Cup round names become path segments: "First round" is first-round. */
export function roundSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function rivalPath(left: string, right: string) {
  return `/archive/rivals/${encodeURIComponent(left)}/${encodeURIComponent(right)}`;
}
