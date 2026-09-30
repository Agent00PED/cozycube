// First-time tips (docs/caverns-roadmap.md phase 4): a one-line hint shown the first few times a
// game is played, until it has been played well once. Kept in localStorage (per browser: a tip seen
// on one device shows again on another), and never an error when storage is off.

const KEY = "cc_tips";

function read(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}
function write(v: Record<string, number>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // (storage off: the tip just shows again)
  }
}

/** Whether the tip `key` still shows (seen fewer than `times` times and not yet mastered). */
export function tipDue(key: string, times = 3): boolean {
  const n = read()[key] ?? 0;
  return n >= 0 && n < times;
}
/** The tip shown once more. */
export function tipSeen(key: string) {
  const v = read();
  if ((v[key] ?? 0) < 0) return;
  v[key] = (v[key] ?? 0) + 1;
  write(v);
}
/** The game played well: the tip never shows again. */
export function tipMastered(key: string) {
  const v = read();
  v[key] = -1;
  write(v);
}

/** A game played through once by hand (its quick mode opens: "a quick mode once you know the game"). */
export function markPlayed(key: string) {
  const v = read();
  v[`played:${key}`] = 1;
  write(v);
}
export function hasPlayed(key: string): boolean {
  return (read()[`played:${key}`] ?? 0) > 0;
}
