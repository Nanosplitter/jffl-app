import { useEffect, useRef, useState } from 'react';
import { flashOnChange } from './changePulse';

const remembered = new Map<string, string>();

/**
 * How many times `key` has changed. The first value counts as zero.
 * Pass `memoryKey` so a row that moves to another list still notices the change.
 */
export function useChangeFlash(key: string, memoryKey?: string): number {
  const previous = useRef<string | null>(memoryKey ? remembered.get(memoryKey) ?? null : null);
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    const prior = previous.current;
    previous.current = key;
    if (memoryKey) remembered.set(memoryKey, key);
    if (flashOnChange(prior, key)) setPulse(count => count + 1);
  }, [key, memoryKey]);
  return pulse;
}
