`kenpixel.ttf` — from three.js's bundled examples (`three/examples/fonts/ttf/kenpixel.ttf`),
originally from [Kenney Fonts](https://www.kenney.nl/assets/kenney-fonts), CC0 1.0 Universal
(public domain).

Repaired, not the upstream bytes: three's copy ends its format 4 `cmap` subtables with a 0xFFFF
segment whose idDelta (0x8B) maps U+FFFF to glyph 138 of 138 (one past the last). Chromium's
OpenType Sanitizer rejects the whole font for it ("Range glyph reference too high"), so the CSS
`@font-face` failed with a NetworkError and the nametags fell back to other faces. The `cmap` was
rebuilt with fontTools (the same 135 mappings, the terminator's idDelta 1, the head checksum
updated; every other table byte-for-byte as it was). Anything swapped in here should pass
`ots-sanitize` (`pip install opentype-sanitizer`).

Self-hosted here so `<Text>` (drei/troika-three-text) in `Character3D.tsx` never calls out to
`cdn.jsdelivr.net/gh/lojjic/unicode-font-resolver` — that CDN lookup only happens when `<Text>`
has no explicit `font` prop, and Discord's Activity iframe CSP blocks it, which silently broke
Text rendering (and looked like a black canvas) inside real Discord Activities.

Swap this file for a different self-hosted `.ttf`/`.woff`/`.woff2` any time — just keep the
`font` prop on `<Text>` pointing at a same-origin path, never remove it.
