import type { Request, Response } from "express";
import { LOUNGE_CAPACITY, LOUNGE_COUNT, loungeName, loungeRoomKey, type LoungeInfo } from "../../../shared/types";

// The live rooms by key (a guild's lounges among them), so the lounge selector can say how full
// each one is before anyone joins: HangoutRoom adds itself as it is created and goes as it is
// disposed. One process holds every room, so this is simply a map.

export interface LoungeRoom {
  /** Discord user ids of the players connected right now. */
  connectedUserIds(): string[];
}

const live = new Map<string, LoungeRoom>();

export function registerRoom(key: string, room: LoungeRoom) {
  live.set(key, room);
}
export function unregisterRoom(key: string, room: LoungeRoom) {
  if (live.get(key) === room) live.delete(key);
}

/** A guild key as the client makes it (shared/types guildRoomKey): nothing else is looked up. */
const GUILD_KEY = /^(guild|channel)_[\w-]{1,64}$/;

/** POST /api/lounges { guildKey, friends }: each lounge's players and how many of `friends` (Discord
 *  ids, the player's voice channel) are among them. No one's ids are ever sent back. */
export function loungesHandler(req: Request, res: Response) {
  const guildKey = String(req.body?.guildKey ?? "");
  if (!GUILD_KEY.test(guildKey)) {
    res.status(400).json({ error: "bad guildKey" });
    return;
  }
  const friends = new Set(Array.isArray(req.body?.friends) ? (req.body.friends as unknown[]).slice(0, 50).map(String) : []);
  const lounges: LoungeInfo[] = [];
  for (let lounge = 1; lounge <= LOUNGE_COUNT; lounge++) {
    const ids = live.get(loungeRoomKey(guildKey, lounge))?.connectedUserIds() ?? [];
    lounges.push({ lounge, name: loungeName(lounge), players: ids.length, capacity: LOUNGE_CAPACITY, friends: ids.filter((id) => friends.has(id)).length });
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ lounges });
}
