// Rewards flying into the satchel (docs/caverns-roadmap.md phase 4): what was just won lifted off
// where it shows and flown in an arc to the header's 🎒 storage pill (`data-bag`), which bumps as it
// lands. Nothing when the pill isn't there (a world without drawers) or motion is reduced.

export function flyToBag(emoji: string, from: Element | null, n = 1, delayMs = 0) {
  const bag = document.querySelector<HTMLElement>("[data-bag]");
  if (!bag || !from) return;
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  } catch {
    // (no media queries: fly anyway)
  }
  const a = from.getBoundingClientRect();
  const b = bag.getBoundingClientRect();
  const x = a.left + a.width / 2;
  const y = a.top + a.height / 2;
  const dx = b.left + b.width / 2 - x;
  const dy = b.top + b.height / 2 - y;
  for (let i = 0; i < Math.max(1, Math.min(n, 5)); i++) {
    const el = document.createElement("span");
    el.textContent = emoji;
    el.setAttribute("aria-hidden", "true");
    Object.assign(el.style, { position: "fixed", left: `${x}px`, top: `${y}px`, fontSize: "30px", lineHeight: "1", zIndex: "90", pointerEvents: "none", filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.5))" });
    document.body.appendChild(el);
    const lift = Math.min(90, 40 + Math.abs(dy) * 0.2);
    const anim = el.animate(
      [
        { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
        { transform: `translate(calc(-50% + ${dx * 0.35}px), calc(-50% + ${dy * 0.35 - lift}px)) scale(1.2)`, opacity: 1, offset: 0.4 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.4)`, opacity: 0.85 },
      ],
      { duration: 820, delay: delayMs + i * 110, easing: "cubic-bezier(0.45, 0, 0.55, 1)", fill: "both" }
    );
    anim.onfinish = () => {
      el.remove();
      bag.animate([{ transform: "scale(1)" }, { transform: "scale(1.16)" }, { transform: "scale(1)" }], { duration: 260, easing: "ease-out" });
    };
    anim.oncancel = () => el.remove();
  }
}
