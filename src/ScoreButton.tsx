import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { scorePopupRows, type ScoringRule } from './scoreLines.ts';
import type { ScoreLine } from './types';

const listeners = new Set<(id: string | null) => void>();
let openId: string | null = null;

function setOpen(id: string | null) {
  openId = id;
  for (const listener of listeners) listener(id);
}

function useExclusiveOpen(id: string) {
  const [open, setLocal] = useState(false);
  useEffect(() => {
    const listener = (next: string | null) => setLocal(next === id);
    listeners.add(listener);
    setLocal(openId === id);
    return () => {
      listeners.delete(listener);
      if (openId === id) setOpen(null);
    };
  }, [id]);
  return {
    open,
    toggle: () => setOpen(openId === id ? null : id),
    close: () => { if (openId === id) setOpen(null); },
  };
}

export function ScoreButton({ player, value, explain, flash = false, align = 'right', scoring }: {
  player: { name: string; weekStats?: Record<string, number> | null; scoreLines?: ScoreLine[] | null };
  value: string;
  explain: boolean;
  flash?: boolean;
  align?: 'left' | 'right';
  scoring?: ScoringRule[] | null;
}) {
  const id = useId();
  const panelId = `${id}-panel`;
  const { open, toggle, close } = useExclusiveOpen(id);
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  const [place, setPlace] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const rows = scorePopupRows(player, scoring);

  useEffect(() => {
    if (!open) return;
    const position = () => {
      const rect = button.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(240, window.innerWidth - 16);
      const rawLeft = align === 'left' ? rect.left : rect.right - width;
      const left = Math.max(8, Math.min(rawLeft, window.innerWidth - width - 8));
      const below = rect.bottom + 6;
      if (below + 160 > window.innerHeight && rect.top > 80) setPlace({ left, bottom: window.innerHeight - rect.top + 6 });
      else setPlace({ left, top: below });
    };
    position();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeRef.current(); };
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (anchor.current?.contains(target) || panel.current?.contains(target)) return;
      closeRef.current();
    };
    window.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('scroll', position, true);
      window.removeEventListener('resize', position);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [align, open]);

  if (!explain) return <strong className={flash ? 'score-flash' : undefined}>{value}</strong>;
  return <span className="score-popover-anchor" ref={anchor}>
    <button type="button" className={`score-figure${flash ? ' score-flash' : ''}`} ref={button} aria-expanded={open} aria-controls={panelId} aria-label={`Scoring for ${player.name}`} onClick={event => { event.stopPropagation(); toggle(); }}>{value}</button>
    {open && place && createPortal(
      <div id={panelId} className="score-popover" role="dialog" aria-label={`Why ${player.name} scored ${value}`} ref={panel} style={place}>
        <ul>{rows.map(row => <li key={row.text}><span>{row.text}</span>{row.points != null && <strong>{row.points}</strong>}</li>)}</ul>
      </div>,
      document.body,
    )}
  </span>;
}
