import type { RosteredPlayer } from './types';

const hideImage = (event: { currentTarget: HTMLImageElement }) => { event.currentTarget.hidden = true; };

const HEALTHY = new Set(['ACTIVE', 'NORMAL', 'Active']);
const INJURY_LABELS: Record<string, string> = {
  OUT: 'OUT',
  QUESTIONABLE: 'Q',
  DOUBTFUL: 'D',
  INJURY_RESERVE: 'IR',
  SUSPENSION: 'SUS',
};
const INJURY_NAMES: Record<string, string> = {
  OUT: 'Out',
  QUESTIONABLE: 'Questionable',
  DOUBTFUL: 'Doubtful',
  INJURY_RESERVE: 'Injury reserve',
  SUSPENSION: 'Suspension',
};

export function injuryLabel(status: string | null | undefined) {
  if (!status || HEALTHY.has(status)) return null;
  return INJURY_LABELS[status] ?? status.replaceAll('_', ' ');
}

export function injuryName(status: string | null | undefined) {
  if (!status || HEALTHY.has(status)) return undefined;
  return INJURY_NAMES[status] ?? status.replaceAll('_', ' ');
}

export function nflLogoUrl(proTeam: string) {
  const abbr = proTeam.trim().toLowerCase();
  return /^[a-z]{2,3}$/.test(abbr) ? `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr}.png` : null;
}

export function playerHeadshotUrl(player: Pick<RosteredPlayer, 'id' | 'position'>) {
  if (player.position === 'D/ST' || player.id.startsWith('-') || !/^\d+$/.test(player.id)) return null;
  return `https://a.espncdn.com/i/headshots/nfl/players/full/${player.id}.png`;
}

export function PlayerIdentity({ player, injury, detail }: { player: Pick<RosteredPlayer, 'id' | 'name' | 'proTeam' | 'position'>; injury?: string | null; detail?: string }) {
  const headshot = playerHeadshotUrl(player);
  const logo = nflLogoUrl(player.proTeam);
  const portrait = headshot ?? logo;
  const label = injuryLabel(injury);
  const team = player.proTeam && player.proTeam !== 'None' ? player.proTeam : '—';
  return <span className="player-identity">
    {portrait && <img className={headshot ? 'player-headshot' : 'nfl-portrait'} src={portrait} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={hideImage} />}
    <span className="player-identity-copy">
      <span className="player-name">{player.name}{label && <span className="injury" title={injuryName(injury)}>{label}</span>}</span>
      <small className="muted player-meta">{headshot && logo && <img className="nfl-logo" src={logo} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={hideImage} />}{team} <span>·</span> {player.position}{detail ? <> <span>·</span> {detail}</> : null}</small>
    </span>
  </span>;
}
