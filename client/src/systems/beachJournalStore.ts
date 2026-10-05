import { isJournalId } from "@shared/beach_journal";

// The Beach Journal on the client, kept out of React state: what the player's journal already holds
// (from their camp profile), the beachcombing finds they have picked up this stretch, and the one way a
// scene reports a creature seen (`sighted`: once a kind a session, never one already in the journal).
// App.tsx gives it the sender and keeps `known` in step with the profile.

export const beachJournal = {
  known: new Set<string>(),
  /** `<bucket>:<spot>` picked up. */
  picked: new Set<string>(),
  send: null as ((packet: { op: "sight"; id: string } | { op: "comb"; spot: number }) => void) | null,
};
const told = new Set<string>();
let tellings = 0;
/** How many sightings have been sent (a watcher paces itself by it). */
export const toldCount = () => tellings;

export function sighted(id: string) {
  if (told.has(id) || beachJournal.known.has(id) || !beachJournal.send || !isJournalId(id)) return;
  told.add(id);
  tellings++;
  beachJournal.send({ op: "sight", id });
  // (a sighting the server did not believe may be tried again in a while)
  setTimeout(() => told.delete(id), 20_000);
}
