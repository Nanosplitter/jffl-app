import { Link } from 'react-router-dom';
import { LeagueStandingsCard } from './CompetitionPages';
import type { SummaryMap } from './competitions';
import { cupMatchView, matchupView, teamUrl, type CardItem, type CardSpec } from './history/askCards.ts';
import { projectedWinChance } from './projections';
import { managerFor } from './reference';
import { pointShare, TeamMatchSheet, type SheetSide } from './TeamMatchSheet';
import { LEAGUES, type LeagueSlug } from './types';
import { points, record } from './ui';

const leagueMeta = (slug: LeagueSlug) => LEAGUES.find(meta => meta.slug === slug)!;
const shortLeague = (slug: LeagueSlug) => leagueMeta(slug).name.replace(/ League$/, '');

function MatchupCardView({ spec, summaries }: { spec: Extract<CardSpec, { kind: 'matchup' }>; summaries: SummaryMap }) {
  const view = matchupView(summaries, spec);
  if (!view) return <Gone />;
  const { summary, matchup, status } = view;
  const decided = status === 'final';
  const chance = decided || spec.week !== summary.week ? null : projectedWinChance(matchup.homeProjected, matchup.awayProjected);
  const share = pointShare(matchup.awayScore, matchup.homeScore);
  const bar = chance ? { left: chance.away, right: chance.home, label: `From ESPN projected totals. Away ${chance.away} percent. Home ${chance.home} percent.` }
    : share ? { ...share, label: `Away ${share.left} percent of the scored points. Home ${share.right} percent.` } : null;
  const side = (teamId: string | null, score: number | null, projected: number | null, opponent: number | null): SheetSide => {
    const team = teamId ? summary.teams.find(item => item.id === teamId) : undefined;
    const result = decided && score != null && opponent != null ? score > opponent ? 'Won' : score < opponent ? 'Lost' : 'Tie' : null;
    const note = !team ? '' : !decided && chance && projected != null ? `${record(team)} · Proj ${points(projected)}` : result ? `${record(team)} · ${result}` : record(team);
    return { key: teamId ?? 'bye', logoUrl: team?.logoUrl, name: team ? managerFor(spec.league, team.id)?.manager ?? team.name : 'Bye', detail: team?.name ?? 'Bye', score: team ? points(score) : '—', note, winner: result === 'Won' };
  };
  return <TeamMatchSheet label={`${shortLeague(spec.league)} · Week ${spec.week}`} status={decided ? 'Final' : status === 'live' ? 'Live' : 'Not started'} to={view.url} bar={bar} sides={[
    side(matchup.awayTeamId, matchup.awayScore, matchup.awayProjected, matchup.homeScore),
    side(matchup.homeTeamId, matchup.homeScore, matchup.homeProjected, matchup.awayScore),
  ]} />;
}

function CupMatchCardView({ spec, summaries }: { spec: Extract<CardSpec, { kind: 'cup_match' }>; summaries: SummaryMap }) {
  const view = cupMatchView(summaries, spec);
  if (!view) return <Gone />;
  const { match } = view;
  const status = match.status === 'tied' ? 'Old fashioned duel' : match.status === 'live' && match.replay ? 'Replay week'
    : { bye: 'Bye', waiting: 'Not started', live: 'Live', final: 'Final', unavailable: 'Scores pending' }[match.status];
  const share = match.status === 'bye' ? null : pointShare(match.a.total, match.b.total);
  const side = (entry: typeof match.a): SheetSide => {
    const person = entry.participant;
    const team = person ? summaries[person.slug]?.teams.find(item => item.id === person.teamId) : undefined;
    const legs = match.weeks.length > 1 && match.status !== 'bye' ? match.weeks.map((week, index) => `W${week} ${points(entry.legs[index])}`).join(' · ') : '';
    return {
      key: person?.key ?? entry.label, logoUrl: team?.logoUrl,
      name: person?.manager ?? (match.status === 'bye' ? 'Bye' : 'TBD'),
      detail: person ? `${spec.cup === 'jffl' ? `${shortLeague(person.slug)} · ` : ''}${team?.name ?? 'Team'}` : entry.label || 'TBD',
      score: match.status === 'bye' ? '—' : points(entry.total), note: legs, winner: !!person && person.key === match.winner?.key,
    };
  };
  return <TeamMatchSheet label={`${view.cup.name} · ${view.roundName}`} status={status} to={view.url}
    bar={share ? { ...share, label: `${match.a.participant?.manager ?? 'Away'} ${share.left} percent of the scored points. ${match.b.participant?.manager ?? 'Home'} ${share.right} percent.` } : null}
    sides={[side(match.a), side(match.b)]} />;
}

function TeamCardView({ spec, summaries }: { spec: Extract<CardSpec, { kind: 'team' }>; summaries: SummaryMap }) {
  const team = summaries[spec.league]?.teams.find(item => item.id === spec.teamId);
  if (!team) return <Gone />;
  const manager = managerFor(spec.league, team.id)?.manager ?? team.name;
  return <Link className="team-sheet ask-team-card" to={teamUrl(spec.league, team.id)}>
    <header><span>{shortLeague(spec.league)} · Team</span><span>#{team.rank ?? '—'}</span></header>
    <div className="team-sheet-side">
      {team.logoUrl ? <img className="team-sheet-logo" src={team.logoUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} /> : <span className="team-sheet-logo" aria-hidden="true" />}
      <div className="team-sheet-copy"><span className="team-sheet-name">{manager}</span><span className="team-sheet-detail">{team.name}</span></div>
    </div>
    <dl className="ask-team-stats">
      <div><dt>Record</dt><dd>{record(team)}</dd></div>
      <div><dt>Points for</dt><dd>{points(team.pointsFor)}</dd></div>
      <div><dt>Against</dt><dd>{points(team.pointsAgainst)}</dd></div>
    </dl>
  </Link>;
}

function StandingsCardView({ spec, summaries }: { spec: Extract<CardSpec, { kind: 'standings' }>; summaries: SummaryMap }) {
  const summary = summaries[spec.league];
  if (!summary) return <Gone />;
  const teams = [...summary.teams].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  return <LeagueStandingsCard meta={leagueMeta(spec.league)} teams={teams} updated={summary} />;
}

function Gone() {
  return <p className="source-note">This card is not in the current league data.</p>;
}

function CardView({ spec, summaries }: { spec: CardSpec; summaries: SummaryMap }) {
  switch (spec.kind) {
    case 'matchup': return <MatchupCardView spec={spec} summaries={summaries} />;
    case 'cup_match': return <CupMatchCardView spec={spec} summaries={summaries} />;
    case 'team': return <TeamCardView spec={spec} summaries={summaries} />;
    case 'standings': return <StandingsCardView spec={spec} summaries={summaries} />;
  }
}

/** Cards from an answer, drawn from the latest snapshot so scores stay current. */
export function AskCardList({ cards, summaries }: { cards: CardItem[]; summaries: SummaryMap }) {
  if (!cards.length) return null;
  const wide = cards.filter(card => card.spec.kind === 'standings');
  const small = cards.filter(card => card.spec.kind !== 'standings');
  return <div className="ask-live-cards">
    {small.length > 0 && <div className="team-match-list">{small.map(card => <CardView key={card.id} spec={card.spec} summaries={summaries} />)}</div>}
    {wide.map(card => <CardView key={card.id} spec={card.spec} summaries={summaries} />)}
  </div>;
}
