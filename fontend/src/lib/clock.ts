/**
 * Kolkata clock helpers.
 *
 * The bundled timetable is in Kolkata time, so "now" has to be too — a phone set to
 * another timezone must not shift every ETA. `Intl` is used rather than a fixed +5:30
 * offset, which keeps this correct without a timezone database.
 */

const parts = (now: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

/** Minutes after midnight in Kolkata, on the same timeline as the published times. */
export function kolkataNowMinutes(now: Date = new Date()): number {
  const formatted = parts(now);
  const hour = Number(formatted.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(formatted.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/** "14:05" in Kolkata time. */
export function kolkataClock(now: Date = new Date()): string {
  const formatted = parts(now);
  const hour = formatted.find((part) => part.type === "hour")?.value ?? "00";
  const minute = formatted.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

/** "Sunday, 18 October" in Kolkata time. */
export function kolkataDateLabel(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
}
