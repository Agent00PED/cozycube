`kenpixel.ttf` — from three.js's bundled examples (`three/examples/fonts/ttf/kenpixel.ttf`),
originally from [Kenney Fonts](https://www.kenney.nl/assets/kenney-fonts), CC0 1.0 Universal
(public domain).

Self-hosted here so `<Text>` (drei/troika-three-text) in `Character3D.tsx` never calls out to
`cdn.jsdelivr.net/gh/lojjic/unicode-font-resolver` — that CDN lookup only happens when `<Text>`
has no explicit `font` prop, and Discord's Activity iframe CSP blocks it, which silently broke
Text rendering (and looked like a black canvas) inside real Discord Activities.

Swap this file for a different self-hosted `.ttf`/`.woff`/`.woff2` any time — just keep the
`font` prop on `<Text>` pointing at a same-origin path, never remove it.
