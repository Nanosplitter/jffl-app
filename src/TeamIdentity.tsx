import type { Team } from './types';

export function TeamIdentity({ team, className = '' }: { team: Pick<Team, 'name' | 'logoUrl'>; className?: string }) {
  return <span className={`team-identity ${className}`.trim()}>
    {team.logoUrl && <img className="team-logo" src={team.logoUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />}
    <span>{team.name}</span>
  </span>;
}
