import { Router } from "express";

export const tokenRouter = Router();

tokenRouter.post("/token", async (req, res) => {
  const { code } = req.body as { code: string };
  if (!code) {
    res.status(400).json({ error: "missing code" });
    return;
  }

  const clientId = process.env.DISCORD_CLIENT_ID ?? "";
  const clientSecret = process.env.DISCORD_CLIENT_SECRET ?? "";
  if (!clientId || !clientSecret) {
    console.error(
      "[token] DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET missing from process.env — check server/.env exists and dotenv loaded it."
    );
  }

  // Discord's token endpoint requires redirect_uri even for the Embedded App Activity flow
  // (no real browser redirect happens — the SDK's authorize() call handles that in-iframe via
  // postMessage). The canonical value here is the app's discordsays.com proxy origin, and it
  // must also be added under Developer Portal -> OAuth2 -> Redirects or Discord will reject
  // it with "invalid redirect_uri" instead.
  const redirectUri = `https://${clientId}.discordsays.com`;

  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  const data = (await response.json()) as { access_token?: string; error?: string };

  if (!response.ok) {
    // Discord's error body (e.g. {"error":"invalid_client"} for a wrong secret, or
    // {"error":"invalid_grant"} for an expired/already-used code) is the actual answer —
    // never swallow it behind a generic message.
    console.error("[token] Discord OAuth token exchange failed:", response.status, data);
    res.status(response.status).json({ error: data.error ?? "discord token exchange failed", discord: data });
    return;
  }

  res.json({ access_token: data.access_token });
});
