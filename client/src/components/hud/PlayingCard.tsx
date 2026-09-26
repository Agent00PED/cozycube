import type { Card } from "@shared/casino";

// The casino's playing cards for the panels: a face (rank and suit in the corner, the suit big in
// the middle), the house's burgundy back, and a card that turns over from its back to its face
// (Three-Card Poker's reveal). `delay` staggers a hand turning over one card after another.

export function CardFace({ card }: { card: Card }) {
  const red = card.suit === "♥" || card.suit === "♦";
  return (
    <div className={`flex h-20 w-14 flex-col justify-between rounded-xl border border-stone-300 bg-stone-50 p-1.5 font-serif text-lg font-black shadow-lg ${red ? "text-red-600" : "text-stone-900"}`}>
      <span className="leading-none">
        {card.rank}
        <span className="text-sm">{card.suit}</span>
      </span>
      <span className="self-end text-2xl leading-none">{card.suit}</span>
    </div>
  );
}

export function CardBack() {
  return (
    <div className="flex h-20 w-14 items-center justify-center rounded-xl border border-amber-200/50 bg-[repeating-linear-gradient(45deg,#7a1f2e_0,#7a1f2e_6px,#5a1522_6px,#5a1522_12px)] shadow-lg">
      <span className="rounded-full border border-amber-200/60 bg-[#3d0c16] px-1.5 font-serif text-sm font-black text-amber-200">V</span>
    </div>
  );
}

/** A card dealt face down that turns over once `faceUp` (its face known by then). */
export function FlipCard({ card, faceUp, delay = 0 }: { card: Card | null; faceUp: boolean; delay?: number }) {
  return (
    <div className="card-flip card-deal" style={{ animationDelay: `${delay}ms` }}>
      <div className={`card-flip-inner ${faceUp && card ? "face-up" : ""}`} style={{ transitionDelay: `${delay}ms` }}>
        <div className="card-flip-face">
          <CardBack />
        </div>
        <div className="card-flip-face card-flip-front">{card ? <CardFace card={card} /> : <CardBack />}</div>
      </div>
    </div>
  );
}
