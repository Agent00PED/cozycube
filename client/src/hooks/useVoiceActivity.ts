import { useEffect, useRef, useState } from "react";
import type { DiscordAuthInfo } from "./useDiscordAuth";

export type VoiceMode = "discord" | "simulated";

interface VoiceActivity {
  mode: VoiceMode;
  /** Discord user ids currently speaking, as reported directly by the SDK (discord mode only). */
  speakingUserIds: ReadonlySet<string>;
  /** Push-to-talk preview state for testing outside Discord. */
  simulatedActive: boolean;
  setSimulatedActive: (active: boolean) => void;
}

const PUSH_TO_TALK_KEY = "v";

// Speaking indicators with a graceful fallback.
//
//  - discord:   inside a real Activity AND Discord granted rpc.voice.read. We subscribe to
//               SPEAKING_START/STOP for the voice channel, which reports every user.
//  - simulated: anywhere else (a plain Chrome tab on localhost, or Discord declined the scope,
//               or the subscribe call itself rejects). Hold V or tap the mic button to preview.
//
// Either way the LOCAL player's state is relayed to the room, so every client — including ones
// that could not subscribe — sees who is talking. Nothing here is allowed to throw: voice is a
// nice-to-have and must never take the scene down with it.
export function useVoiceActivity(
  auth: DiscordAuthInfo | null,
  relayLocalSpeaking: (speaking: boolean) => void
): VoiceActivity {
  const [mode, setMode] = useState<VoiceMode>("simulated");
  const [speakingUserIds, setSpeakingUserIds] = useState<ReadonlySet<string>>(() => new Set());
  const [simulatedActive, setSimulatedActive] = useState(false);

  const relayRef = useRef(relayLocalSpeaking);
  relayRef.current = relayLocalSpeaking;
  const lastRelayedRef = useRef(false);

  const relay = (speaking: boolean) => {
    if (lastRelayedRef.current === speaking) return; // only on change
    lastRelayedRef.current = speaking;
    relayRef.current(speaking);
  };

  // --- real Discord voice events ---
  useEffect(() => {
    if (!auth || !auth.embedded || !auth.voiceScopeGranted) {
      setMode("simulated");
      return;
    }

    const { sdk, channelId, userId } = auth;
    let cancelled = false;

    const onStart = (data: { user_id: string }) => {
      setSpeakingUserIds((prev) => new Set(prev).add(data.user_id));
      if (data.user_id === userId) relay(true);
    };
    const onStop = (data: { user_id: string }) => {
      setSpeakingUserIds((prev) => {
        const next = new Set(prev);
        next.delete(data.user_id);
        return next;
      });
      if (data.user_id === userId) relay(false);
    };

    (async () => {
      try {
        await sdk.subscribe("SPEAKING_START", onStart, { channel_id: channelId });
        await sdk.subscribe("SPEAKING_STOP", onStop, { channel_id: channelId });
        if (!cancelled) setMode("discord");
      } catch (err) {
        console.warn("[useVoiceActivity] voice subscribe failed; falling back to simulated mode:", err);
        if (!cancelled) setMode("simulated");
      }
    })();

    return () => {
      cancelled = true;
      // Unsubscribe failures are irrelevant during teardown — swallow them.
      sdk.unsubscribe("SPEAKING_START", onStart, { channel_id: channelId }).catch(() => {});
      sdk.unsubscribe("SPEAKING_STOP", onStop, { channel_id: channelId }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.embedded, auth?.voiceScopeGranted, auth?.channelId, auth?.userId]);

  // --- simulated push-to-talk ---
  useEffect(() => {
    if (mode !== "simulated") return;

    const isTyping = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === PUSH_TO_TALK_KEY && !e.repeat && !isTyping(e)) setSimulatedActive(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === PUSH_TO_TALK_KEY) setSimulatedActive(false);
    };
    // Releasing the key while the tab is unfocused never fires keyup — don't leave a stuck mic.
    const blur = () => setSimulatedActive(false);

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [mode]);

  useEffect(() => {
    if (mode === "simulated") relay(simulatedActive);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, simulatedActive]);

  return { mode, speakingUserIds, simulatedActive, setSimulatedActive };
}
