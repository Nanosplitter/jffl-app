const TRUSTED_HOST = /(^|\.)(espncdn\.com|espn\.com|espn\.net)$/;
const IMAGE_PATH = /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i;

/** Same public images the site already shows: ESPN hosts, or an https image ESPN displays as a logo. */
export function logoUrlAllowed(url: string | null): boolean {
  if (!url || url.length > 2048) return false;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return false;
  const host = parsed.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local') || isPrivateAddress(host)) return false;
  return TRUSTED_HOST.test(host) || IMAGE_PATH.test(parsed.pathname);
}

export async function fetchLogo(url: string | null): Promise<Uint8Array | null> {
  if (!logoUrlAllowed(url)) return null;
  const parsed = new URL(url!);
  try {
    const response = await fetch(parsed, { redirect: 'error', signal: AbortSignal.timeout(2500) });
    if (!response.ok) return null;
    const type = response.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 32 || bytes.byteLength > 1_500_000) return null;
    return bytes;
  } catch {
    return null;
  }
}

function isPrivateAddress(host: string) {
  return /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host) || host === '::1';
}
