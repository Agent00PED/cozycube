// The build's asset version, stamped into every model URL. Vite fingerprints the JS and CSS it
// bundles, but the Blender models under /public keep their names from build to build, and
// Discord's Activity webview holds on to whatever it fetched last: a new query string per build
// makes each deploy's models a fresh fetch. (Defined in vite.config.ts: the client's package
// version and the build's time.)
declare const __ASSET_VERSION__: string;

export const ASSET_VERSION: string = typeof __ASSET_VERSION__ === "string" ? __ASSET_VERSION__ : "dev";

/** A model under /public/models, versioned for this build. */
export function modelUrl(file: string): string {
  return `/models/${file}?v=${ASSET_VERSION}`;
}
