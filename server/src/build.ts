import { readFileSync } from "fs";
import path from "path";

// The client build this server serves (client/dist/build.json, stamped by client/vite.config.ts with
// the same version every model URL carries). A client is told it on joining ("welcome"); one still
// running an older build is asked to start the Activity afresh (client/src/systems/lifecycle.ts:
// never a reload of Discord's frame). Outside production there is no stamped build: "dev".
function readBuild(): string {
  if (process.env.NODE_ENV !== "production") return "dev";
  try {
    const stamp = JSON.parse(readFileSync(path.resolve(process.cwd(), "client/dist/build.json"), "utf8")) as { build?: unknown };
    return typeof stamp.build === "string" && stamp.build ? stamp.build : "dev";
  } catch {
    return "dev";
  }
}

export const BUILD_ID = readBuild();
