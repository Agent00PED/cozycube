// The Beach Bar on the server: A Shift at the Bar (shared/barshift.ts), in the room's sub-system
// pattern (as rooms/caverns.ts and rooms/boxing.ts: a host of the room's own means, no Colyseus here).
//
//   a shift    a player behind the counter at one of its three stations takes tickets: an order a
//              player on a stool placed, else one of the bar's regulars'. The drink is made in the
//              panel; the log is judged here, on this clock (a shift is never quicker than its
//              stages take), and the drink is served
//   an order   a player at the counter pays Mango's price for a drink: a bartender on shift makes
//              it (and gets most of the price), else Mango does, at once
//   the tips   a regular tips by the drink's stars, at most TIPS_PER_HOUR tipped drinks an hour by
//              account
//   the book   every drink made is noted in the bartender's Bar Book (the camp profile's `bar`)
import {
  BARTENDER_SHARE,
  BAR_TITLES,
  DRINKS,
  DRINK_AURA_MS,
  DRINK_PRICE,
  GRADE_STARS,
  MANGO_GRADE,
  MASTER_TITLE,
  ORDER_WAIT_MS,
  REFRESHED_MS,
  REGULARS,
  SHIFT_TIMEOUT_MS,
  TIPS_PER_HOUR,
  barTitles,
  isDrinkId,
  judgeDrink,
  menuOf,
  minShiftMs,
  noteDrink,
  tipFor,
  type BarPacket,
  type BarResult,
  type BarTicket,
  type Drink,
  type DrinkGrade,
  type DrinkId,
  type DrinkLog,
  type DrinkServed,
} from "../../../shared/barshift";
import type { FishingProfile } from "../../../shared/fishing";
import { BAR, MANGO_FRONT, MANGO_REACH, SHIFT_REACH } from "../../../shared/worlds/beach";

export interface BarPlayer {
  map: string;
  x: number;
  z: number;
  sitting: boolean;
  username: string;
  userId: string;
  coins: number;
  action: string;
  actionProgress: number;
  corner?: string;
}

export interface BarHost {
  player(sessionId: string): BarPlayer | undefined;
  profile(sessionId: string): FishingProfile | undefined;
  saveProfile(sessionId: string): void;
  sendTo(sessionId: string, type: string, payload: unknown): void;
  /** To everyone on the beach. */
  toBeach(type: string, payload: unknown): void;
  addCoins(sessionId: string, amount: number): void;
  /** The chair a session sits on ("" none). */
  seatOf(sessionId: string): string;
  /** A drink in hand: its aura for `ms`. */
  hand(sessionId: string, aura: string, ms: number): void;
  grantTitle(sessionId: string, title: string): void;
  emote(sessionId: string, emoji: string): void;
}

interface Order {
  by: string;
  name: string;
  drink: DrinkId;
  at: number;
  /** The bartender making it ("" none yet). */
  taken: string;
}
interface Shift {
  station: string;
  ticket: { drink: DrinkId; order: Order | null; forName: string; at: number } | null;
}

const STOOLS = new Set(BAR.stools.map((s) => s.propId));
const TITLE_ID: Record<string, string> = { [BAR_TITLES[1]]: "beach_bartender", [BAR_TITLES[2]]: "cocktail_artist", [BAR_TITLES[3]]: "tidewater_mixer", [MASTER_TITLE]: "master_mixologist" };

export class BeachBar {
  private shifts = new Map<string, Shift>();
  private orders: Order[] = [];
  /** When each account's tipped drinks were made (this hour's). */
  private tipped = new Map<string, number[]>();

  constructor(private host: BarHost) {}

  handle(sessionId: string, msg: BarPacket) {
    if (!msg || typeof msg !== "object") return;
    if (msg.op === "shift") this.shift(sessionId, String(msg.station ?? ""));
    else if (msg.op === "finish") this.finish(sessionId, msg.log);
    else if (msg.op === "leave") this.endShift(sessionId, false);
    else if (msg.op === "order") this.order(sessionId, msg.drink, msg.coconut === true);
  }

  /** Whether they have found the Hidden Cove (the secret drink is theirs to order and to make). */
  private cove(sessionId: string): boolean {
    return (this.host.profile(sessionId) as (FishingProfile & { coveAccess?: boolean }) | undefined)?.coveAccess === true;
  }

  private tipsLeft(userId: string, now: number): number {
    const recent = (this.tipped.get(userId) ?? []).filter((at) => now - at < 3_600_000);
    this.tipped.set(userId, recent);
    return Math.max(0, TIPS_PER_HOUR - recent.length);
  }

  /** Step behind the counter at a station (or, already there with no ticket in hand, the next one). */
  private shift(sessionId: string, stationId: string) {
    const player = this.host.player(sessionId);
    if (!player || player.map !== "sunset_beach" || player.sitting || player.corner) return;
    const mine = this.shifts.get(sessionId);
    const station = BAR.stations.find((s) => s.propId === (mine?.station ?? stationId)) ?? BAR.stations.reduce((a, b) => (Math.hypot(b.x - player.x, b.z - player.z) < Math.hypot(a.x - player.x, a.z - player.z) ? b : a));
    if (Math.hypot(player.x - station.x, player.z - station.z) > SHIFT_REACH + 0.6) return;
    if (!mine) {
      if (player.action !== "") return;
      for (const [other, s] of this.shifts) {
        if (other !== sessionId && s.station === station.propId) {
          this.host.sendTo(sessionId, "campfireNotice", { message: "Someone's working that end of the bar: try the next one along", emoji: "🍹" });
          return;
        }
      }
      this.shifts.set(sessionId, { station: station.propId, ticket: null });
      player.action = "barshift";
      player.actionProgress = 0;
    } else if (mine.ticket) {
      return;
    }
    this.deal(sessionId);
  }

  /** The next ticket for a bartender: the oldest order a player placed, else a regular's. */
  private deal(sessionId: string) {
    const shift = this.shifts.get(sessionId);
    const player = this.host.player(sessionId);
    if (!shift || !player || shift.ticket) return;
    const now = Date.now();
    const order = this.orders.find((o) => !o.taken && o.by !== sessionId) ?? null;
    let drink: DrinkId;
    let forName: string;
    if (order) {
      order.taken = sessionId;
      drink = order.drink;
      forName = order.name;
    } else {
      const menu = menuOf(this.cove(sessionId));
      drink = menu[Math.floor(Math.random() * menu.length)];
      forName = REGULARS[Math.floor(Math.random() * REGULARS.length)];
    }
    shift.ticket = { drink, order, forName, at: now };
    const ticket: BarTicket = { drink, forName, player: !!order, tipsLeft: this.tipsLeft(player.userId, now) };
    this.host.sendTo(sessionId, "barTicket", ticket);
  }

  private finish(sessionId: string, log: DrinkLog) {
    const shift = this.shifts.get(sessionId);
    const player = this.host.player(sessionId);
    const profile = this.host.profile(sessionId);
    if (!shift || !shift.ticket || !player || !profile) return;
    const now = Date.now();
    const { drink, order, forName, at } = shift.ticket;
    // (made quicker than its stages take: not believed, and it comes out a mess)
    const honest = now - at >= minShiftMs(drink) - 300;
    const verdict = judgeDrink(drink, honest && log && typeof log === "object" ? log : { picks: [], pourMs: 0, taps: [] });
    shift.ticket = null;
    let coins = 0;
    if (order) {
      this.orders = this.orders.filter((o) => o !== order);
      coins = BARTENDER_SHARE;
      this.serve(order.by, order.name, drink, verdict.grade, sessionId);
    } else if (this.tipsLeft(player.userId, now) > 0) {
      coins = tipFor(drink, verdict.grade);
      this.tipped.get(player.userId)!.push(now);
      this.host.toBeach("drinkServed", { by: sessionId, to: "", toName: forName, drink, grade: verdict.grade } satisfies DrinkServed);
    } else {
      this.host.toBeach("drinkServed", { by: sessionId, to: "", toName: forName, drink, grade: verdict.grade } satisfies DrinkServed);
    }
    if (coins > 0) this.host.addCoins(sessionId, coins);
    // the Bar Book, and its titles
    const cove = this.cove(sessionId);
    const before = new Set(barTitles(profile.bar, cove));
    noteDrink(profile.bar, drink, verdict.grade);
    const earned = barTitles(profile.bar, cove).find((t) => !before.has(t));
    if (earned) this.host.grantTitle(sessionId, TITLE_ID[earned]);
    this.host.saveProfile(sessionId);
    this.host.emote(sessionId, (DRINKS[drink] as Drink).emoji);
    this.host.sendTo(sessionId, "barResult", { drink, verdict, coins, forName, streak: profile.bar.streak, ...(earned ? { title: earned } : {}) } satisfies BarResult);
  }

  /** Off shift: the ticket in hand (a player's order) goes back for the next bartender, or Mango. */
  endShift(sessionId: string, tell = true) {
    const shift = this.shifts.get(sessionId);
    if (!shift) return;
    if (shift.ticket?.order) shift.ticket.order.taken = "";
    this.shifts.delete(sessionId);
    const player = this.host.player(sessionId);
    if (player && player.action === "barshift") {
      player.action = "";
      player.actionProgress = 0;
    }
    if (tell) this.host.sendTo(sessionId, "barShiftOver", {});
  }

  /** A drink asked for at the counter: from a stool, or standing at the bar's front. Paid in coins, or
   *  with a coconut off the palms (`coconut`: Mango makes that one himself, at once: no bartender's
   *  share is paid out of a coconut). */
  private order(sessionId: string, drinkId: string, coconut = false) {
    const player = this.host.player(sessionId);
    if (!player || player.map !== "sunset_beach" || !isDrinkId(drinkId) || player.corner) return;
    if (!menuOf(this.cove(sessionId)).includes(drinkId)) return;
    const atBar = STOOLS.has(this.host.seatOf(sessionId)) || (!player.sitting && Math.hypot(player.x - MANGO_FRONT.x, player.z - MANGO_FRONT.z) <= MANGO_REACH + 0.6) || Math.hypot(player.x - BAR.x, player.z - BAR.z) <= BAR.counter + 1.6;
    if (!atBar) return;
    if (this.shifts.has(sessionId)) return;
    if (this.orders.some((o) => o.by === sessionId)) {
      this.host.sendTo(sessionId, "campfireNotice", { message: "Your drink's on its way", emoji: "🍹" });
      return;
    }
    if (coconut) {
      const profile = this.host.profile(sessionId);
      if (!profile || (profile.byproducts.coconut ?? 0) < 1) {
        this.host.sendTo(sessionId, "campfireNotice", { message: "No coconut to pay with: the palms up the beach drop them", emoji: "🥥" });
        return;
      }
      profile.byproducts.coconut = (profile.byproducts.coconut ?? 0) - 1;
      if (profile.byproducts.coconut <= 0) delete profile.byproducts.coconut;
      this.host.saveProfile(sessionId);
      this.serve(sessionId, player.username, drinkId, MANGO_GRADE, "");
      return;
    }
    if (player.coins < DRINK_PRICE) {
      this.host.sendTo(sessionId, "campfireNotice", { message: `A drink is ${DRINK_PRICE} coins`, emoji: "🪙" });
      return;
    }
    this.host.addCoins(sessionId, -DRINK_PRICE);
    const now = Date.now();
    const order: Order = { by: sessionId, name: player.username, drink: drinkId, at: now, taken: "" };
    // a bartender on shift (someone else) makes it; with nobody behind the bar, Mango does, at once
    const bartenders = [...this.shifts.keys()].filter((id) => id !== sessionId);
    if (!bartenders.length) {
      this.serve(sessionId, player.username, drinkId, MANGO_GRADE, "");
      return;
    }
    this.orders.push(order);
    this.host.sendTo(sessionId, "campfireNotice", { message: `One ${(DRINKS[drinkId] as Drink).name}, coming up: the bartender's on it`, emoji: (DRINKS[drinkId] as Drink).emoji });
    const idle = bartenders.find((id) => !this.shifts.get(id)!.ticket);
    if (idle) this.host.sendTo(idle, "barOrderIn", { name: player.username, drink: drinkId });
  }

  /** The drink set down in front of whoever ordered it: in hand, its aura on, and Refreshed if it
   *  was made well. (Gone from the beach meanwhile: nothing to serve, the price already paid.) */
  private serve(to: string, toName: string, drink: DrinkId, grade: DrinkGrade, by: string) {
    const player = this.host.player(to);
    if (player && player.map === "sunset_beach") {
      this.host.hand(to, (DRINKS[drink] as Drink).aura, DRINK_AURA_MS);
      const profile = this.host.profile(to);
      if (profile && GRADE_STARS[grade] >= 2) {
        profile.buffs.refreshed = Date.now() + REFRESHED_MS;
        this.host.saveProfile(to);
      }
      this.host.emote(to, (DRINKS[drink] as Drink).emoji);
    }
    this.host.toBeach("drinkServed", { by, to, toName, drink, grade } satisfies DrinkServed);
  }

  tick(now: number) {
    // a bartender who walked off, sat down or left the beach is off shift; a ticket held too long
    // is dropped
    for (const [sessionId, shift] of [...this.shifts]) {
      const player = this.host.player(sessionId);
      const station = BAR.stations.find((s) => s.propId === shift.station)!;
      if (!player || player.map !== "sunset_beach" || player.sitting || player.action !== "barshift" || Math.hypot(player.x - station.x, player.z - station.z) > SHIFT_REACH + 1.2 || (shift.ticket && now - shift.ticket.at > SHIFT_TIMEOUT_MS)) this.endShift(sessionId);
    }
    // an order nobody has made in time: Mango makes it
    for (const order of [...this.orders]) {
      if (order.taken || now - order.at < ORDER_WAIT_MS) continue;
      this.orders = this.orders.filter((o) => o !== order);
      this.serve(order.by, order.name, order.drink, MANGO_GRADE, "");
    }
  }

  /** Gone from the beach (a trip, a drop): off shift; an order not yet made is paid back. */
  leave(sessionId: string) {
    this.endShift(sessionId);
    const mine = this.orders.find((o) => o.by === sessionId && !o.taken);
    if (mine) {
      this.orders = this.orders.filter((o) => o !== mine);
      this.host.addCoins(sessionId, DRINK_PRICE);
    }
  }

  /** A reconnecting player's new session takes over the old one's order. */
  transfer(oldId: string, newId: string) {
    this.endShift(oldId);
    for (const o of this.orders) if (o.by === oldId) o.by = newId;
  }
}
