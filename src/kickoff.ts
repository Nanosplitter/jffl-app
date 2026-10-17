const kickoffFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** Eastern kickoff, such as 4:25pm SUN. A missing or unreadable time stays absent. */
export function kickoffLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(kickoffFormat.formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  const hour = parts.hour;
  const minute = parts.minute;
  const dayPeriod = parts.dayPeriod?.toLowerCase();
  const weekday = parts.weekday?.toUpperCase();
  if (!hour || !minute || (dayPeriod !== 'am' && dayPeriod !== 'pm') || !weekday) return null;
  return `${hour}:${minute}${dayPeriod} ${weekday}`;
}
