import "dotenv/config"; // loads server/.env into process.env — nothing after this reads env vars before it runs
import express from "express";
import cors from "cors";
import path from "path";
import { createServer } from "http";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { HangoutRoom } from "./rooms/HangoutRoom";
import { tokenRouter } from "./routes/token";
import { getPlayerStore, initPlayerStore } from "./db/players";
import { getBoardStore, initBoardStore } from "./db/boards";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", tokenRouter);
// The High Rollers table for anyone outside a room (and for the modal's refresh button).
app.get("/api/leaderboard", async (_req, res) => {
  try {
    res.json(await getPlayerStore().topCoins(10));
  } catch (err) {
    res.status(503).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

const httpServer = createServer(app);
// The transport is named explicitly: on 0.15 passing `server` straight to `new Server` still
// works but logs a deprecation warning at every start, and 0.16 drops it altogether.
// A last line of defence: whatever escapes the rooms' own guards (HangoutRoom.onUncaughtException)
// is logged, and the process keeps serving everyone else instead of dropping every connection.
process.on("uncaughtException", (err) => console.error("[process] uncaught exception:", err));
process.on("unhandledRejection", (reason) => console.error("[process] unhandled rejection:", reason));

const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });

// Client connects via ws(s)://<host>/colyseus in dev (see client/vite.config.ts proxy rewrite)
// or ws(s)://<host> directly in production (see useColyseusRoom.ts). filterBy partitions
// matchmaking by channelId, so joinOrCreate({ channelId }) from two different Discord voice
// channels always lands in two separate rooms.
gameServer.define("hangout_room", HangoutRoom).filterBy(["channelId"]);

if (process.env.NODE_ENV === "production") {
  // Single-service deploy (Railway, etc.): serve the already-built client bundle from this
  // same process/port instead of running a separate static host. `process.cwd()` rather than
  // `__dirname` deliberately — the compiled output lives at a nested path (dist/server/src/
  // index.js, since tsconfig's rootDir spans the whole workspace to also pull in shared/),
  // whereas the process is always started from the workspace root (`node server/dist/...`
  // run via `npm start` at the repo root), so process.cwd() is the one stable anchor.
  // Registered after /api so it never shadows that route; Colyseus's own matchmake/WS
  // handling is independent of Express's routing table, so ordering relative to it doesn't matter.
  const clientDist = path.resolve(process.cwd(), "client/dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

const PORT = Number(process.env.PORT) || 2567;
const HOST = "0.0.0.0"; // not just localhost — required for Railway (and most PaaS) to route traffic in
// The players and board tables (or their fallbacks) are ready before the first client can join:
// a room restores its board game from the store as it is created.
void Promise.all([initPlayerStore(), initBoardStore()]).then(([store, boards]) => {
  httpServer.listen(PORT, HOST, () => {
    console.log(`Colyseus + Express listening on ${HOST}:${PORT} (NODE_ENV=${process.env.NODE_ENV ?? "development"}, players: ${store.kind}, boards: ${boards.kind})`);
  });
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    // the rooms save their board games on the way down (HangoutRoom.onBeforeShutdown)
    void gameServer
      .gracefullyShutdown(false)
      .finally(() => Promise.allSettled([getPlayerStore().close(), getBoardStore().close()]).finally(() => process.exit(0)));
  });
}
