import { NavLink } from 'react-router-dom';

export function ArchiveNav() {
  return <nav className="section-nav archive-nav" aria-label="Archive">
    <NavLink to="/archive" end>Overview</NavLink>
    <NavLink to="/archive/ask">Ask the archive</NavLink>
    <NavLink to="/archive/records">Record book</NavLink>
    <NavLink to="/archive/titles">Titles</NavLink>
    <NavLink to="/archive/rivals">Head-to-head</NavLink>
    <NavLink to="/archive/managers">Managers</NavLink>
    <NavLink to="/archive/draft">Draft</NavLink>
    <NavLink to="/archive/weeks">Week in history</NavLink>
  </nav>;
}
