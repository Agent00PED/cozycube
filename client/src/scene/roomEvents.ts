import { createContext, useContext, useEffect, useRef } from "react";
import type { RoomMessageListener } from "../hooks/useColyseusRoom";

// One-shot room messages (slot spins, NPC lines, roulette results) reach 3D props through
// context rather than being threaded through every component in between.
export interface RoomEvents {
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  localSessionId: string | null;
}

export const RoomEventsContext = createContext<RoomEvents>({
  subscribeMessages: () => () => {},
  localSessionId: null,
});

/** Calls `handler(payload)` for every message of `type`; the handler may change freely. */
export function useRoomMessage<T>(type: string, handler: (payload: T) => void) {
  const { subscribeMessages } = useContext(RoomEventsContext);
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(
    () =>
      subscribeMessages((t, payload) => {
        if (t === type) ref.current(payload as T);
      }),
    [subscribeMessages, type]
  );
}
