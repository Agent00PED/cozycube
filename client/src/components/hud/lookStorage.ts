// The wardrobe outfit is remembered per browser, and put back on each time the room is joined.
const LOOK_STORAGE_KEY = "cozy-hangout.look.v1";

export function loadSavedLook(): string | null {
  try {
    return localStorage.getItem(LOOK_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveLook(encoded: string) {
  try {
    localStorage.setItem(LOOK_STORAGE_KEY, encoded);
  } catch {
    /* private window / blocked storage: the outfit still syncs for this session */
  }
}
