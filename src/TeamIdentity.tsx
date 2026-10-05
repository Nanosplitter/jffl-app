import type { Team } from './types';
import { RankMark } from './RankMark';

export function TeamIdentity({ team, className = '', mark }: { team: Pick<Team, 'name' | 'logoUrl'>; className?: string; mark?: number | null }) {
  return <span className={`team-identity ${className}`.trim()}>
    {team.logoUrl && <img className="team-logo" src={team.logoUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />}
    <span><RankMark value={mark} />{team.name}</span>
  </span>;
}
