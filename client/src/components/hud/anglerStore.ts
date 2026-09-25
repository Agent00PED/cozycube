// The angler's profile (creel, rods, baits, records) as the HUD reads it. The server keeps the real
// one in the player's record and syncs it on the player (PlayerState.fishing); this mirrors the
// last one seen, with the wallet, into localStorage per user, so the creel shows at once on a
// reload, a reconnect or a room switch, before the room has synced (and never replaces it).

import { useEffect, useMemo } from "react";
import { emptyFishingProfile, sanitizeFishingProfile, type FishingProfile } from "@shared/fishing";

const KEY = "cozycube.angler.";

interface Mirror {
  fishing: FishingProfile;
  coins: number;
  at: number;
}

function readMirror(userId: string): Mirror | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(KEY + userId);
    if (!raw) return null;
    const m = JSON.parse(raw) as Partial<Mirror>;
    return { fishing: sanitizeFishingProfile(m.fishing), coins: Number(m.coins) || 0, at: Number(m.at) || 0 };
  } catch {
    return null;
  }
}

function writeMirror(userId: string, fishing: FishingProfile, coins: number) {
  if (!userId) return;
  try {
    localStorage.setItem(KEY + userId, JSON.stringify({ fishing, coins, at: Date.now() } satisfies Mirror));
  } catch {
    // storage full or blocked: the room still has it
  }
}

/** The profile the room synced, else the last one mirrored for this user, else an empty one. */
export function useAnglerProfile(userId: string, raw: string, coins: number): { profile: FishingProfile; live: boolean } {
  const live = useMemo(() => {
    if (!raw) return null;
    try {
      return sanitizeFishingProfile(JSON.parse(raw));
    } catch {
      return null;
    }
  }, [raw]);
  useEffect(() => {
    if (live) writeMirror(userId, live, coins);
  }, [userId, live, coins]);
  return useMemo(() => {
    if (live) return { profile: live, live: true };
    return { profile: readMirror(userId)?.fishing ?? emptyFishingProfile(), live: false };
  }, [live, userId]);
}
