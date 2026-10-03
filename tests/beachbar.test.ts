// The beach bar on the server (server/src/rooms/beachBar.ts), run against a stub of the room's host:
// a shift, a player's order made by another player, Mango serving when nobody is on shift, the hour's
// tips, a drink made quicker than its stages take. `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BeachBar, type BarHost, type BarPlayer } from "../server/src/rooms/beachBar";
import { BARTENDER_SHARE, DRINKS, DRINK_PRICE, POUR_FULL_S, POUR_LINE, TIPS_PER_HOUR, minShiftMs, shakeBeats, tipFor, type BarResult, type BarTicket, type Drink, type DrinkId } from "../shared/barshift";
import { sanitizeFishingProfile, type FishingProfile } from "../shared/fishing";
import { BAR, MANGO_FRONT } from "../shared/worlds/beach";

function world() {
  const players = new Map<string, BarPlayer>();
  const profiles = new Map<string, FishingProfile>();
  const sent: [string, string, any][] = [];
  const beach: [string, any][] = [];
  const hands = new Map<string, string>();
  const seats = new Map<string, string>();
  const titles: string[] = [];
  const host: BarHost = {
    player: (id) => players.get(id),
    profile: (id) => profiles.get(id),
    saveProfile: () => {},
    sendTo: (id, type, payload) => sent.push([id, type, payload]),
    toBeach: (type, payload) => beach.push([type, payload]),
    addCoins: (id, n) => {
      const p = players.get(id);
      if (p) p.coins += n;
    },
    seatOf: (id) => seats.get(id) ?? "",
    hand: (id, aura) => hands.set(id, aura),
    grantTitle: (_id, title) => titles.push(title),
    emote: () => {},
  };
  const join = (id: string, at: { x: number; z: number }, coins = 50) => {
    players.set(id, { map: "sunset_beach", x: at.x, z: at.z, sitting: false, username: id, userId: "u-" + id, coins, action: "", actionProgress: 0 });
    profiles.set(id, sanitizeFishingProfile({}));
  };
  const last = <T,>(id: string, type: string) => [...sent].reverse().find((m) => m[0] === id && m[1] === type)?.[2] as T | undefined;
  return { bar: new BeachBar(host), players, profiles, sent, beach, hands, seats, titles, join, last };
}
const perfect = (id: DrinkId) => ({ picks: [...(DRINKS[id] as Drink).recipe], pourMs: POUR_FULL_S * 1000 * POUR_LINE, taps: shakeBeats((DRINKS[id] as Drink).band) });
/** Runs `fn` with the clock moved on by `ms`. */
function later<T>(ms: number, fn: () => T): T {
  const real = Date.now;
  const at = real() + ms;
  Date.now = () => at;
  try {
    return fn();
  } finally {
    Date.now = real;
  }
}

test("a shift: a regular's ticket, made right after its stages' time, is Perfect and tipped", () => {
  const w = world();
  w.join("amy", BAR.stations[0]);
  w.bar.handle("amy", { op: "shift", station: BAR.stations[0].propId });
  const ticket = w.last<BarTicket>("amy", "barTicket")!;
  assert.ok(ticket && !ticket.player && ticket.tipsLeft === TIPS_PER_HOUR);
  assert.equal(w.players.get("amy")!.action, "barshift");
  later(minShiftMs(ticket.drink) + 500, () => w.bar.handle("amy", { op: "finish", log: perfect(ticket.drink) }));
  const r = w.last<BarResult>("amy", "barResult")!;
  assert.equal(r.verdict.grade, "perfect");
  assert.equal(r.coins, tipFor(ticket.drink, "perfect"));
  assert.equal(w.players.get("amy")!.coins, 50 + r.coins);
  assert.equal(w.profiles.get("amy")!.bar.made[ticket.drink]?.best, 3);
  // the next ticket on the same shift
  w.bar.handle("amy", { op: "shift", station: BAR.stations[0].propId });
  assert.equal(w.sent.filter((m) => m[1] === "barTicket").length, 2);
});

test("a drink made quicker than its stages take is not believed", () => {
  const w = world();
  w.join("amy", BAR.stations[0]);
  w.bar.handle("amy", { op: "shift", station: BAR.stations[0].propId });
  const ticket = w.last<BarTicket>("amy", "barTicket")!;
  w.bar.handle("amy", { op: "finish", log: perfect(ticket.drink) });
  assert.equal(w.last<BarResult>("amy", "barResult")!.verdict.grade, "sloppy");
});

test("with nobody on shift, Mango serves at once: the price paid, the drink in hand, Refreshed", () => {
  const w = world();
  w.join("bo", MANGO_FRONT);
  w.bar.handle("bo", { op: "order", drink: "sunset_punch" });
  assert.equal(w.players.get("bo")!.coins, 50 - DRINK_PRICE);
  assert.equal(w.hands.get("bo"), (DRINKS.sunset_punch as Drink).aura);
  assert.ok((w.profiles.get("bo")!.buffs.refreshed ?? 0) > Date.now());
  // too poor, too far, or the secret drink without the cove: nothing
  w.join("cy", MANGO_FRONT, 3);
  w.bar.handle("cy", { op: "order", drink: "sunset_punch" });
  assert.equal(w.players.get("cy")!.coins, 3);
  w.join("di", { x: 12, z: -10 });
  w.bar.handle("di", { op: "order", drink: "sunset_punch" });
  assert.equal(w.players.get("di")!.coins, 50);
  w.bar.handle("bo", { op: "order", drink: "midnight_pearl" });
  assert.equal(w.players.get("bo")!.coins, 50 - DRINK_PRICE);
});

test("a player's order goes to the bartender on shift, who gets most of its price", () => {
  const w = world();
  w.join("amy", BAR.stations[1]);
  w.join("bo", BAR.stools[2]);
  w.players.get("bo")!.sitting = true;
  w.seats.set("bo", BAR.stools[2].propId);
  w.bar.handle("amy", { op: "shift", station: BAR.stations[1].propId });
  const first = w.last<BarTicket>("amy", "barTicket")!;
  later(minShiftMs(first.drink) + 500, () => w.bar.handle("amy", { op: "finish", log: perfect(first.drink) }));
  const coinsBefore = w.players.get("amy")!.coins;
  // Bo orders from his stool: it waits for Amy, who is told
  w.bar.handle("bo", { op: "order", drink: "blue_lagoon" });
  assert.equal(w.players.get("bo")!.coins, 50 - DRINK_PRICE);
  assert.equal(w.hands.get("bo"), undefined, "not served yet");
  assert.ok(w.last("amy", "barOrderIn"));
  w.bar.handle("amy", { op: "shift", station: BAR.stations[1].propId });
  const ticket = w.last<BarTicket>("amy", "barTicket")!;
  assert.ok(ticket.player && ticket.drink === "blue_lagoon" && ticket.forName === "bo");
  later(minShiftMs("blue_lagoon") + 500, () => w.bar.handle("amy", { op: "finish", log: perfect("blue_lagoon") }));
  assert.equal(w.players.get("amy")!.coins, coinsBefore + BARTENDER_SHARE);
  assert.equal(w.hands.get("bo"), (DRINKS.blue_lagoon as Drink).aura);
  const served = w.beach.filter((m) => m[0] === "drinkServed").pop()![1];
  assert.deepEqual([served.by, served.to, served.grade], ["amy", "bo", "perfect"]);
});

test("an order whose bartender walks off goes back, and Mango makes it in the end; a leaver is paid back", () => {
  const w = world();
  w.join("amy", BAR.stations[1]);
  w.join("bo", MANGO_FRONT);
  w.bar.handle("amy", { op: "shift", station: BAR.stations[1].propId });
  const first = w.last<BarTicket>("amy", "barTicket")!;
  later(minShiftMs(first.drink) + 500, () => w.bar.handle("amy", { op: "finish", log: perfect(first.drink) }));
  w.bar.handle("bo", { op: "order", drink: "berry_fizz" });
  w.bar.handle("amy", { op: "shift", station: BAR.stations[1].propId });
  // Amy walks away mid-ticket: off shift on the next tick
  w.players.get("amy")!.x += 6;
  w.bar.tick(Date.now());
  assert.equal(w.players.get("amy")!.action, "");
  assert.equal(w.hands.get("bo"), undefined);
  // a minute on, nobody having made it, Mango does
  w.bar.tick(Date.now() + 61_000);
  assert.equal(w.hands.get("bo"), (DRINKS.berry_fizz as Drink).aura);
  // a customer who leaves before a bartender starts on their drink is paid back
  w.join("cy", MANGO_FRONT);
  w.join("di", BAR.stations[0]);
  w.bar.handle("di", { op: "shift", station: BAR.stations[0].propId });
  w.bar.handle("cy", { op: "order", drink: "sunset_punch" });
  w.bar.leave("cy");
  assert.equal(w.players.get("cy")!.coins, 50);
});

test("the hour's tips run out: the thirty-first drink of the hour pays nothing", () => {
  const w = world();
  w.join("amy", BAR.stations[0]);
  let paid = 0;
  for (let k = 0; k < TIPS_PER_HOUR + 1; k++) {
    w.bar.handle("amy", { op: "shift", station: BAR.stations[0].propId });
    const t = w.last<BarTicket>("amy", "barTicket")!;
    later(minShiftMs(t.drink) + 500, () => w.bar.handle("amy", { op: "finish", log: perfect(t.drink) }));
    if (w.last<BarResult>("amy", "barResult")!.coins > 0) paid++;
  }
  assert.equal(paid, TIPS_PER_HOUR);
});
