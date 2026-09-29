import type { RosteredPlayer } from './types';

const hideImage = (event: { currentTarget: HTMLImageElement }) => { event.currentTarget.hidden = true; };

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
  const flagged = !!injury && !['ACTIVE', 'NORMAL', 'Active'].includes(injury);
  const team = player.proTeam && player.proTeam !== 'None' ? player.proTeam : '—';
  return <span className="player-identity">
    {portrait && <img className={headshot ? 'player-headshot' : 'nfl-portrait'} src={portrait} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={hideImage} />}
    <span className="player-identity-copy">
      <span className="player-name">{player.name}{flagged && <span className="injury">{injury}</span>}</span>
      <small className="muted player-meta">{headshot && logo && <img className="nfl-logo" src={logo} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={hideImage} />}{team} <span>·</span> {player.position}{detail ? <> <span>·</span> {detail}</> : null}</small>
    </span>
  </span>;
}
