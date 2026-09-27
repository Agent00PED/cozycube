// The worlds' soundscapes, handed over as you travel: the Cozy Lounge's folk-jazz trio
// (audio/loungeFolk.ts), the Starlight Campfire's nature ambience (audio/ambience.ts) and the Velvet
// Casino's jazz combo and crowd (audio/casinoJazz.ts, audio/casinoCrowd.ts). Each is its own engine
// on its own master gain; a trip fades the one you leave out and the one you arrive at in over the
// same half second, the length of the travel curtain's sweep (components/WorldTransitionScreen.tsx),
// so the music changes behind the drapes.

/** How long a world's soundscape takes to fade in or out as you travel. */
export const WORLD_CROSSFADE_S = 0.5;

/** Fades a soundscape's master gain to `level` over the crossfade, from wherever it is now. */
export function crossfade(ctx: AudioContext, gain: AudioParam, level: number) {
  const now = ctx.currentTime;
  gain.cancelScheduledValues(now);
  gain.setValueAtTime(gain.value, now);
  gain.linearRampToValueAtTime(level, now + WORLD_CROSSFADE_S);
}
