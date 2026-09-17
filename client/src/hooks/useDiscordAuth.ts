import { useEffect, useRef, useState } from "react";
import { DiscordSDK, DiscordSDKMock } from "@discord/embedded-app-sdk";

export type DiscordSdkInstance = DiscordSDK | DiscordSDKMock;

export interface DiscordAuthInfo {
  userId: string;
  username: string;
  avatarUrl: string;
  channelId: string;
  /** The live SDK, so feature hooks (voice activity) can subscribe to events after login. */
  sdk: DiscordSdkInstance;
  /** True only inside a real Discord Activity iframe. */
  embedded: boolean;
  /** Whether Discord actually granted rpc.voice.read, which SPEAKING_START/STOP require. */
  voiceScopeGranted: boolean;
}

const BASE_SCOPES = ["identify"] as const;
const VOICE_SCOPES = ["identify", "rpc.voice.read"] as const;

interface AuthState {
  auth: DiscordAuthInfo | null;
  loading: boolean;
  error: string | null;
}

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID as string | undefined;
const HANDSHAKE_TIMEOUT_MS = 30_000; // bumped from 15s to give slow tunnels (ngrok free tier, cold start) more headroom

// The SDK's postMessage handshake rejects with this when the page's actual origin doesn't
// match what Discord's client expects for the Activity it launched — almost always either
// (a) the page was opened directly by its tunnel/localhost URL instead of via the rocket-icon
// launcher, so it's not embedded inside Discord's real Activity iframe at all, or
// (b) the Developer Portal's Root Mapping points at a different/stale tunnel URL than the one
// actually running right now (ngrok's free-tier URL changes on every restart).
// This is a Discord Portal/tunnel configuration problem, not something fixable in this code.
function describeAuthError(err: unknown): string {
  // `String(someObject)` produces the useless "[object Object]" — RPCError instances and
  // fetch/JSON error payloads are often plain objects, not Error instances, so stringify them.
  const message = err instanceof Error ? err.message : JSON.stringify(err);
  if (/invalid origin/i.test(message)) {
    return (
      "Discord rejected the connection (Invalid Origin). This page's URL doesn't match what Discord expects for this Activity.\n\n" +
      "Fix: 1) Open this via the rocket icon inside a Discord Voice Channel — never open the tunnel/localhost URL directly in a browser tab. " +
      "2) In the Developer Portal → Activities → URL Mapping, make sure Root Mapping's target exactly matches your CURRENT tunnel URL " +
      "(ngrok's free URL changes every time you restart it — update the Portal after every restart)."
    );
  }
  if (/already authing/i.test(message)) {
    return "Discord RPC error 4002 (Already authing) — a duplicate authorize() call slipped through. This is a bug in useDiscordAuth.ts's re-invocation guard, not a Portal/tunnel issue.";
  }
  return message;
}

// Discord injects `frame_id` into the query string when the page runs as an Activity iframe.
// Its absence means we're on a normal browser tab (local dev / testing with friends via a plain tunnel link).
function isEmbeddedInDiscord(): boolean {
  return new URLSearchParams(window.location.search).has("frame_id");
}

export function useDiscordAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ auth: null, loading: true, error: null });

  // React 18 StrictMode double-invokes this effect in dev (mount -> cleanup -> mount again)
  // to surface missing-cleanup bugs. sdk.commands.authorize() is a one-shot RPC call on
  // Discord's side — calling it twice in quick succession gets the second call rejected with
  // RPC error 4002 "Already authing". This ref persists across that synthetic double-invoke
  // (it's the same component instance, not a real remount), so the second invocation's `run()`
  // never starts at all.
  const isAuthingRef = useRef(false);

  useEffect(() => {
    if (isAuthingRef.current) return;
    isAuthingRef.current = true;

    // sdk.ready()/authorize() can hang indefinitely if the postMessage handshake with the
    // Discord client never completes (CSP blocking it, a stale iframe, a misconfigured
    // Root Mapping) — without this, the UI sits on "Connecting to Discord..." forever with
    // no signal that anything is wrong.
    const timeoutId = window.setTimeout(() => {
      setState({
        auth: null,
        loading: false,
        error: "Timed out waiting for Discord SDK handshake — check DevTools Console/Network for CSP or WSS errors.",
      });
    }, HANDSHAKE_TIMEOUT_MS);

    async function run() {
      try {
        const embedded = isEmbeddedInDiscord();
        const params = new URLSearchParams(window.location.search);
        const clientId = CLIENT_ID ?? "mock-client-id";

        // Mock Mode: `?channelId=xxx&username=yyy` lets multiple plain browser tabs
        // simulate different players joining the same room without going through Discord at all.
        const mockChannelId = params.get("channelId") ?? "local-test-channel";
        const mockUsername = params.get("username") ?? `Tester${Math.floor(Math.random() * 1000)}`;

        console.log("[useDiscordAuth] embedded?", embedded, "clientId:", clientId, "search:", window.location.search);

        const sdk = embedded
          ? new DiscordSDK(clientId)
          : new DiscordSDKMock(clientId, null, mockChannelId, null);

        if (!embedded) {
          const mockUserId = `mock-${mockUsername}`;
          (sdk as DiscordSDKMock)._updateCommandMocks({
            authorize: async () => ({ code: "mock_code" }),
            authenticate: async () => ({
              access_token: "mock_token",
              user: {
                id: mockUserId,
                username: mockUsername,
                discriminator: "0",
                public_flags: 0,
                avatar: null,
                global_name: mockUsername,
              },
              scopes: [],
              expires: new Date(Date.now() + 3600_000).toISOString(),
              application: { id: "mock-app", description: "", name: "Hangout (mock)" },
            }),
          });
        }

        console.log("[useDiscordAuth] calling sdk.ready()...");
        await sdk.ready();
        console.log("[useDiscordAuth] sdk.ready() resolved");

        console.log("[useDiscordAuth] calling sdk.commands.authorize()...");
        const authorize = (scope: readonly (typeof VOICE_SCOPES)[number][]) =>
          sdk.commands.authorize({
            client_id: clientId,
            response_type: "code",
            state: "",
            prompt: "none",
            scope: [...scope],
          });

        // Ask for voice-read so we can show who's talking. If Discord refuses that scope for this
        // app (not enabled for it, or the user declines), fall back to identify-only instead of
        // failing: a missing speaking indicator must never cost anyone the ability to log in.
        let code: string;
        try {
          ({ code } = await authorize(VOICE_SCOPES));
        } catch (voiceErr) {
          console.warn("[useDiscordAuth] authorize with rpc.voice.read failed, retrying identify-only:", voiceErr);
          ({ code } = await authorize(BASE_SCOPES));
        }

        console.log("[useDiscordAuth] authorize() resolved, got code");

        let accessToken: string;
        if (embedded) {
          // client_secret exchange must happen server-side — see server/src/routes/token.ts
          console.log("[useDiscordAuth] calling POST /api/token...");
          const res = await fetch("/api/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code }),
          });
          const data = await res.json();
          console.log("[useDiscordAuth] /api/token responded", res.status, data);
          if (!res.ok) {
            throw new Error(`token exchange failed (${res.status}): ${data.error ?? JSON.stringify(data)}`);
          }
          accessToken = data.access_token;
        } else {
          accessToken = "mock_token";
        }

        const authResult = await sdk.commands.authenticate({ access_token: accessToken });
        window.clearTimeout(timeoutId);

        const avatarUrl = authResult.user.avatar
          ? `https://cdn.discordapp.com/avatars/${authResult.user.id}/${authResult.user.avatar}.png`
          : `https://cdn.discordapp.com/embed/avatars/${Number(authResult.user.discriminator ?? "0") % 5}.png`;

        const grantedScopes = (authResult.scopes ?? []) as string[];

        setState({
          auth: {
            userId: authResult.user.id,
            username: authResult.user.global_name ?? authResult.user.username,
            avatarUrl,
            channelId: sdk.channelId ?? mockChannelId,
            sdk,
            embedded,
            voiceScopeGranted: embedded && grantedScopes.includes("rpc.voice.read"),
          },
          loading: false,
          error: null,
        });
      } catch (err) {
        console.error("[useDiscordAuth] run() threw:", err);
        window.clearTimeout(timeoutId);
        setState({ auth: null, loading: false, error: describeAuthError(err) });
      }
    }

    run();
    // No cleanup function: `run()` already clears `timeoutId` itself on both success and
    // failure. Returning one here would fire between StrictMode's two dev-mode invocations
    // and disarm the hang-detection timeout for the one real run that's actually in flight.
  }, []);

  return state;
}
