import { useCallback, useEffect, useState } from "react";
import { DiscordSDK, DiscordSDKMock, RPCCloseCodes } from "@discord/embedded-app-sdk";
import { cleanDisplayName } from "@shared/types";

export type DiscordSdkInstance = DiscordSDK | DiscordSDKMock;

export interface DiscordAuthInfo {
  userId: string;
  username: string;
  avatarUrl: string;
  channelId: string;
  /** The Discord server the Activity was launched in (null in a DM or a group DM): everyone in one
   *  guild shares one room (shared/types guildRoomKey). */
  guildId: string | null;
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

// The Discord session belongs to the page, not to a component: the SDK is made once, its handshake
// happens once, the login happens once, and all of it is kept in memory for the life of the page.
// Discord's parent window greets an Activity's frame a single time: a second DiscordSDK (or the
// same frame reloaded) posts a handshake nobody answers, and the page hangs on "Timed out waiting
// for Discord SDK handshake". So nothing in the game ever makes another SDK or reloads the frame:
// an update or a server restart remounts the game in memory (systems/lifecycle.ts), and the
// remounted tree's useDiscordAuth is handed the session it already has, at once.

let sdk: DiscordSdkInstance | null = null;
let embeddedFrame = false;
/** Discord's handshake has completed (sdk.ready() resolved): it is never waited on again. */
let isSdkReady = false;
let session: DiscordAuthInfo | null = null;
let login: Promise<DiscordAuthInfo> | null = null;

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
    return "Discord RPC error 4002 (Already authing) — a second authorize() slipped through while the first was still running.";
  }
  return message;
}

// Discord injects `frame_id` into the query string when the page runs as an Activity iframe.
// Its absence means we're on a normal browser tab (local dev / testing with friends via a plain tunnel link).
function isEmbeddedInDiscord(): boolean {
  return new URLSearchParams(window.location.search).has("frame_id");
}

/** The page's one SDK (its constructor posts the handshake, so it is made exactly once). */
function theSdk(): DiscordSdkInstance {
  if (sdk) return sdk;
  embeddedFrame = isEmbeddedInDiscord();
  const params = new URLSearchParams(window.location.search);
  const clientId = CLIENT_ID ?? "mock-client-id";
  console.log("[useDiscordAuth] embedded?", embeddedFrame, "clientId:", clientId, "search:", window.location.search);
  if (embeddedFrame) {
    sdk = new DiscordSDK(clientId);
    return sdk;
  }
  // Mock Mode: `?channelId=xxx&username=yyy` lets multiple plain browser tabs simulate different
  // players joining the same room without going through Discord at all (`?guildId=` puts mock tabs
  // from different "channels" in one guild's room, as Discord would).
  const mockChannelId = params.get("channelId") ?? "local-test-channel";
  const mockGuildId = params.get("guildId") ?? "local-test-guild";
  const mockUsername = cleanDisplayName(params.get("username"), `Tester${Math.floor(Math.random() * 1000)}`);
  const mock = new DiscordSDKMock(clientId, mockGuildId, mockChannelId, null);
  const mockUserId = `mock-${mockUsername}`;
  mock._updateCommandMocks({
    authorize: async () => ({ code: "mock_code" }),
    authenticate: async () => ({
      access_token: "mock_token",
      user: { id: mockUserId, username: mockUsername, discriminator: "0", public_flags: 0, avatar: null, global_name: mockUsername },
      scopes: [],
      expires: new Date(Date.now() + 3600_000).toISOString(),
      application: { id: "mock-app", description: "", name: "Hangout (mock)" },
    }),
  });
  sdk = mock;
  return sdk;
}

async function logIn(): Promise<DiscordAuthInfo> {
  const discord = theSdk();
  const clientId = CLIENT_ID ?? "mock-client-id";
  if (!isSdkReady) {
    console.log("[useDiscordAuth] calling sdk.ready()...");
    await discord.ready();
    isSdkReady = true;
    console.log("[useDiscordAuth] sdk.ready() resolved");
  }

  const authorize = (scope: readonly (typeof VOICE_SCOPES)[number][]) =>
    discord.commands.authorize({ client_id: clientId, response_type: "code", state: "", prompt: "none", scope: [...scope] });
  // Ask for voice-read so we can show who's talking. If Discord refuses that scope for this app (not
  // enabled for it, or the user declines), fall back to identify-only instead of failing: a missing
  // speaking indicator must never cost anyone the ability to log in.
  let code: string;
  try {
    ({ code } = await authorize(VOICE_SCOPES));
  } catch (voiceErr) {
    console.warn("[useDiscordAuth] authorize with rpc.voice.read failed, retrying identify-only:", voiceErr);
    ({ code } = await authorize(BASE_SCOPES));
  }

  let accessToken: string;
  if (embeddedFrame) {
    // client_secret exchange must happen server-side — see server/src/routes/token.ts
    const res = await fetch("/api/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    const data = await res.json();
    if (!res.ok) throw new Error(`token exchange failed (${res.status}): ${data.error ?? JSON.stringify(data)}`);
    accessToken = data.access_token;
  } else {
    accessToken = "mock_token";
  }

  const authResult = await discord.commands.authenticate({ access_token: accessToken });
  const avatarUrl = authResult.user.avatar
    ? `https://cdn.discordapp.com/avatars/${authResult.user.id}/${authResult.user.avatar}.png`
    : `https://cdn.discordapp.com/embed/avatars/${Number(authResult.user.discriminator ?? "0") % 5}.png`;
  const grantedScopes = (authResult.scopes ?? []) as string[];
  const params = new URLSearchParams(window.location.search);
  session = {
    userId: authResult.user.id,
    username: cleanDisplayName(authResult.user.global_name ?? authResult.user.username),
    avatarUrl,
    channelId: discord.channelId ?? params.get("channelId") ?? "local-test-channel",
    guildId: discord.guildId ?? (embeddedFrame ? null : (params.get("guildId") ?? "local-test-guild")),
    sdk: discord,
    embedded: embeddedFrame,
    voiceScopeGranted: embeddedFrame && grantedScopes.includes("rpc.voice.read"),
  };
  return session;
}

/** The page's Discord session: the one in memory, or the login in flight (started once; a failed
 *  login may be tried again, on the same SDK, without a second handshake). */
export function connectDiscord(): Promise<DiscordAuthInfo> {
  if (session) return Promise.resolve(session);
  if (!login) {
    login = logIn().catch((err) => {
      login = null;
      throw err;
    });
  }
  return login;
}

/** The session once logged in (null before): for code outside React (the update screens). */
export function discordSession(): DiscordAuthInfo | null {
  return session;
}

/** Whether the page runs inside Discord's Activity frame (not a plain browser tab). */
export function inDiscordFrame(): boolean {
  return sdk ? embeddedFrame : isEmbeddedInDiscord();
}

/** Asks Discord to close the Activity (it can then be started again from the voice channel, onto
 *  the build being served). Needs no handshake: the SDK posts it straight to Discord's window. */
export function closeActivity(message: string) {
  try {
    theSdk().close(RPCCloseCodes.CLOSE_NORMAL, message);
  } catch (err) {
    console.warn("[useDiscordAuth] close failed:", err);
  }
}

/** The Discord session for a component: at once if the page already has it (a remounted game never
 *  waits on the handshake again), else the login, given HANDSHAKE_TIMEOUT_MS before the screen says
 *  so (a login that still lands after that is taken). `retry`: try the login again, in memory. */
export function useDiscordAuth(): AuthState & { retry: () => void } {
  const [state, setState] = useState<AuthState>(() => (session ? { auth: session, loading: false, error: null } : { auth: null, loading: true, error: null }));
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (session) {
      const s = session;
      setState((prev) => (prev.auth === s ? prev : { auth: s, loading: false, error: null }));
      return;
    }
    let live = true;
    setState((prev) => (prev.loading ? prev : { auth: null, loading: true, error: null }));
    // sdk.ready()/authorize() can hang indefinitely if the postMessage handshake with the Discord
    // client never completes (CSP blocking it, a misconfigured Root Mapping): the screen says so
    // instead of sitting on "Connecting to Discord..." forever. Once the handshake is done, there
    // is nothing left to time out.
    const timeoutId = isSdkReady
      ? undefined
      : window.setTimeout(() => {
          if (live) setState({ auth: null, loading: false, error: "Timed out waiting for Discord SDK handshake — check DevTools Console/Network for CSP or WSS errors." });
        }, HANDSHAKE_TIMEOUT_MS);
    // (StrictMode's double effect, a remount, a retry: all share the one login in flight)
    connectDiscord().then(
      (auth) => {
        window.clearTimeout(timeoutId);
        if (live) setState({ auth, loading: false, error: null });
      },
      (err) => {
        console.error("[useDiscordAuth] login failed:", err);
        window.clearTimeout(timeoutId);
        if (live) setState({ auth: null, loading: false, error: describeAuthError(err) });
      }
    );
    return () => {
      live = false;
      window.clearTimeout(timeoutId);
    };
  }, [attempt]);

  return { ...state, retry };
}
