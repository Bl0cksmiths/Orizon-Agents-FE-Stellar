/**
 * An instant as a buyer reads a deadline: in their own locale and time zone,
 * with the zone named — "2:05 PM" is a different moment for them and for
 * whoever they forward it to.
 *
 * Its own module so a page that only needs the time (the plan card's
 * reclaim notice) does not pull the dispute window's code in with it.
 */

const LOCAL_TIME: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
};

/** An instant in the viewer's own locale and time zone, zone named. */
export function formatLocalTime(ms: number): string {
  return new Intl.DateTimeFormat(undefined, LOCAL_TIME).format(ms);
}
