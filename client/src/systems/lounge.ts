// Which of the guild's lounges this page is in (shared/types LOUNGE_COUNT), kept in memory: a soft
// restart (systems/lifecycle.ts: a server restart, remounting the game) goes straight back into the
// same lounge, while opening the Activity afresh shows the lounge selector. Settings' "Switch lounge"
// simply goes back to the selector (App).

let current: { guildKey: string; lounge: number } | null = null;
let rejoin = false;

export function rememberLounge(guildKey: string, lounge: number) {
  current = { guildKey, lounge };
  rejoin = false;
}

/** Back to the selector: nothing to come back into. */
export function forgetLounge() {
  current = null;
  rejoin = false;
}

/** Before the game remounts in a soft restart: come back into the lounge we are in. */
export function markRejoin() {
  rejoin = current !== null;
}

/** The lounge to go straight back into after a soft restart; null: show the selector. A pure read
 *  (React may call a state initializer twice): the mark lasts until a lounge is picked or left. */
export function rejoinLounge(guildKey: string): number | null {
  return rejoin && current?.guildKey === guildKey ? current.lounge : null;
}
