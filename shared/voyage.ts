// The captain's boat (docs/beach-design.md sections 4 and 5): the ticket from Sunset Beach's pier to the
// Open Sea, the trips between the pier, the sea and (once found) the Hidden Cove, and what is made at
// Dune's shack for it.
//
//   the ticket   TICKET_PRICE, one trip, as long as you like. It is spent as you step aboard, and the
//                trip lasts until you stand on the pier again (`seaTrip` in the camp profile): a
//                dropped connection or a restart leaves it in hand, and the captain takes you back out
//                for nothing. Asking him for the pier, or leaving by the world list, ends it.
//   who sails    anyone with a ticket rides along; casting from the rails takes an Expedition rod (T5)
//                or better (shared/sea_fishing.ts SEA_CAST_ROD), and there is no AFK line out there

export const TICKET_PRICE = 150;
export const SEA_CHANNEL = "beach:sea";
export type SeaPacket =
  /** At the pier's head: aboard, for the Open Sea. */
  | { op: "sail" }
  /** At the wheel: back to the pier (the trip ends). */
  | { op: "home" }
  /** At the wheel, the chart whole: on to the Hidden Cove, or back out to the Open Sea from it. */
  | { op: "cove" }
  | { op: "tosea" }
  /** At Dune's shack: a Tidewater tool made (shared/expedition.ts, place "dune"). */
  | { op: "make"; tool: string };
/** The captain's answer to a request he can't grant (shown as a toast). */
export interface SeaNotice {
  message: string;
}
/** The maps a voyage is on (a ticket's trip lasts while you are on one of them). */
export const isSeaMap = (map: string): boolean => map === "open_sea" || map === "hidden_cove";
