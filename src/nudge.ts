import { useEffect } from 'react';
import { firebaseConfigured } from './firebaseApp';
import { NUDGE_INTERVAL_MS, tabIsActive } from './nudgeActivity';

export { NUDGE_INTERVAL_MS, tabIsActive } from './nudgeActivity';

/** Ask the updater for a live tick. The server decides whether a fetch is due. */
export function requestRefresh() {
  void fetch('/__refresh', { method: 'POST', keepalive: true, credentials: 'omit' }).catch(() => {});
}

/** Ask the updater to refresh while this tab is visible and recently used. */
export function useRefreshNudge() {
  useEffect(() => {
    if (!import.meta.env.PROD || !firebaseConfigured) return;
    let lastInputAt = Date.now();
    const mark = () => { lastInputAt = Date.now(); };
    const pulse = () => {
      if (tabIsActive(document.visibilityState === 'visible', lastInputAt, Date.now())) requestRefresh();
    };
    const onVisible = () => { if (document.visibilityState === 'visible') pulse(); };
    window.addEventListener('pointerdown', mark);
    window.addEventListener('keydown', mark);
    window.addEventListener('scroll', mark, true);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(pulse, NUDGE_INTERVAL_MS);
    pulse();
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pointerdown', mark);
      window.removeEventListener('keydown', mark);
      window.removeEventListener('scroll', mark, true);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
