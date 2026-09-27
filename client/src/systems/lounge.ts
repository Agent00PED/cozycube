// Which of the guild's lounges this page is in (shared/types LOUNGE_COUNT), kept for the tab's
// session: a reload onto a new build (systems/lifecycle.ts) goes straight back into the same lounge,
// while opening the Activity afresh shows the lounge selector again. Settings' "Switch lounge"
// reloads to the selector.

const loungeKey = (guildKey: string) => `cozy-lounge:${guildKey}`;
const REJOIN_KEY = "cozy-rejoin";

function get(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function put(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // storage blocked: the selector simply shows again
  }
}

export function rememberLounge(guildKey: string, lounge: number) {
  put(loungeKey(guildKey), String(lounge));
}

/** Before a reload onto a new build: come back into the lounge we are in. */
export function markRejoin() {
  if (get(REJOIN_KEY) !== "lobby") put(REJOIN_KEY, "1");
}

/** Before a reload to the lounge selector (Settings' "Switch lounge"). */
export function markLobby() {
  put(REJOIN_KEY, "lobby");
}

/** The lounge to go straight back into (a reload onto a new build), once; null: show the selector. */
export function takeRejoinLounge(guildKey: string): number | null {
  const flag = get(REJOIN_KEY);
  put(REJOIN_KEY, null);
  if (flag !== "1") return null;
  const n = Number(get(loungeKey(guildKey)));
  return Number.isInteger(n) && n >= 1 ? n : null;
}
