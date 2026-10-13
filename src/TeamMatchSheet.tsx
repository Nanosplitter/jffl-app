import { Link } from 'react-router-dom';
import { FollowedNote, useFollowed } from './account';
import { isFollowedName } from './follow';
import { RankMark } from './RankMark';
import { leagueInk } from './reference';

export interface SheetSide { key: string; logoUrl?: string | null; name: string; mark?: number | null; league?: string | null; teamHref?: string; detail: string; score: string; note: string; winner?: boolean }
export interface SheetBar { left: number; right: number; label: string }

export function pointShare(left: number | null, right: number | null) {
  if (left == null || right == null || left + right <= 0) return null;
  const share = Math.round((left / (left + right)) * 100);
  return { left: share, right: 100 - share };
}

export function TeamMatchSheet({ label, status, to, sides, bar, note }: {
  label: string;
  status?: string;
  to?: string;
  sides: SheetSide[];
  bar: SheetBar | null;
  note?: string;
}) {
  const followed = useFollowed();
  const face = <>
    <header><span>{label}</span>{status ? <span>{status}</span> : null}</header>
    <div className="team-sheet-face">
      {sides.map((side, index) => {
        const on = isFollowedName(followed, side.name);
        return <div className={`team-sheet-side ${index === 1 ? 'home' : 'away'} ${side.winner ? 'winner' : ''} ${on ? 'followed' : ''}`} key={side.key}>
        {side.logoUrl ? <img className="team-sheet-logo" src={side.logoUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} /> : <span className="team-sheet-logo" aria-hidden="true" />}
        <div className="team-sheet-copy">
          {side.teamHref ? <Link className={`team-sheet-name ${leagueInk(side.league)} ${on ? 'followed-name' : ''}`} to={side.teamHref} title={side.name}><RankMark value={side.mark} />{side.name}<FollowedNote on={on} /></Link> : <span className={`team-sheet-name ${leagueInk(side.league)} ${on ? 'followed-name' : ''}`} title={side.name}><RankMark value={side.mark} />{side.name}{side.winner && <span className="sr-only">, advances</span>}<FollowedNote on={on} /></span>}
          <span className="team-sheet-detail" title={side.detail}>{side.detail}</span>
          <strong className="score">{side.score}</strong>
          <span className="team-sheet-note">{side.note}</span>
        </div>
      </div>;
      })}
    </div>
    <div className={`win-bar${bar ? '' : ' is-empty'}`} role={bar ? 'img' : undefined} aria-label={bar?.label} aria-hidden={bar ? undefined : true}>
      {bar && <><span className={bar.left > bar.right ? 'favored' : ''} style={{ width: `${bar.left}%` }} /><span className={bar.right > bar.left ? 'favored' : ''} style={{ width: `${bar.right}%` }} /></>}
    </div>
    {note && <p className="team-sheet-odds">{note}</p>}
  </>;
  return to ? <Link className="team-sheet" to={to}>{face}</Link> : <article className="team-sheet">{face}</article>;
}
