// The Starlight Campfire's and the Whispering Woods' own sky: a 24-minute day, twelve minutes of day
// and twelve of night, on the wall clock (so every client, and the server rolling a catch, agree
// without a word between them). The campfire's light, fog and sounds ease between the two over the
// dawn and the dusk; the river and the rapids hold different fish by day and by night
// (shared/fishing.ts FishSpecies.time).

/** One whole day (ms), and its daylight share. */
export const DAY_CYCLE_MS = 24 * 60 * 1000;
export const DAYLIGHT_SHARE = 0.5;
/** How long dawn and dusk take to ease from one to the other (ms). */
export const TWILIGHT_MS = 60 * 1000;

/** Where in the day `now` falls: 0 at dawn, 0.5 at dusk, back to 1 (dawn again). */
export function dayPhase(now: number): number {
  return (((now % DAY_CYCLE_MS) + DAY_CYCLE_MS) % DAY_CYCLE_MS) / DAY_CYCLE_MS;
}

/** Whether it is day (for the fish that bite): the first half of the cycle. */
export function isCampDay(now: number): boolean {
  return dayPhase(now) < DAYLIGHT_SHARE;
}

/** How much daylight there is (0 night, 1 full day), easing through dawn and dusk. */
export function daylight(now: number): number {
  const t = dayPhase(now) * DAY_CYCLE_MS;
  const dusk = DAYLIGHT_SHARE * DAY_CYCLE_MS;
  const half = TWILIGHT_MS / 2;
  const smooth = (x: number) => {
    const c = Math.max(0, Math.min(1, x));
    return c * c * (3 - 2 * c);
  };
  // dawn eases in around 0 (and the day's end), dusk eases out around `dusk`
  if (t < half) return smooth(0.5 + t / TWILIGHT_MS);
  if (t > DAY_CYCLE_MS - half) return smooth((t - (DAY_CYCLE_MS - half)) / TWILIGHT_MS);
  if (Math.abs(t - dusk) < half) return smooth(0.5 - (t - dusk) / TWILIGHT_MS);
  return t < dusk ? 1 : 0;
}

/** Minutes until the light turns (for the HUD's little clock). */
export function minutesToTurn(now: number): number {
  const t = dayPhase(now) * DAY_CYCLE_MS;
  const next = t < DAYLIGHT_SHARE * DAY_CYCLE_MS ? DAYLIGHT_SHARE * DAY_CYCLE_MS : DAY_CYCLE_MS;
  return Math.max(0, Math.ceil((next - t) / 60000));
}
