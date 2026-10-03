import { useState } from "react";
import { BAR_CHANNEL, BAR_TITLES, DRINKS, DRINK_IDS, DRINK_PRICE, INGREDIENT_INFO, MASTER_TITLE, TIPS_PER_HOUR, barTitles, menuOf, type BarBook, type Drink, type DrinkId } from "@shared/barshift";
import type { FishingProfile } from "@shared/fishing";
import { Modal } from "./Modal";

// Mango's bar on Sunset Beach: the menu (a drink for a few coins: a bartender on shift makes it, or
// Mango does at once), and the Bar Book (what you have made behind the counter: each drink's count
// and best stars, your run of Perfects, the titles).

export function BeachBarModal({ profile, coins, send, onClose }: { profile: FishingProfile; coins: number; send: (channel: string, packet?: unknown) => void; onClose: () => void }) {
  const [tab, setTab] = useState<"menu" | "book">("menu");
  const cove = (profile as FishingProfile & { coveAccess?: boolean }).coveAccess === true;
  const menu = menuOf(cove);
  const book: BarBook = profile.bar;
  const titles = barTitles(book, cove);
  // (a coconut off the palms pays for a drink: Mango makes that one himself)
  const coconuts = profile.byproducts.coconut ?? 0;
  const [nut, setNut] = useState(false);
  const paying = nut && coconuts > 0;
  const order = (id: DrinkId) => {
    send(BAR_CHANNEL, paying ? { op: "order", drink: id, coconut: true } : { op: "order", drink: id });
    onClose();
  };
  return (
    <Modal title="Mango's Beach Bar" icon="🍹" onClose={onClose} width={440}>
      <div className="flex gap-1.5">
        {(
          [
            ["menu", "🍹 Menu"],
            ["book", "📖 Bar Book"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`min-h-10 flex-1 rounded-full px-3 text-sm font-bold ${tab === id ? "bg-[#F5A623] text-[#2B201B]" : "bg-white/10"}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "menu" ? (
        <>
          <p className="m-0 text-xs opacity-80">"What'll it be?" A drink is {DRINK_PRICE} 🪙: you hold it, wear its glow, and a well-made one leaves you Refreshed (+10% walking pace for 10 minutes).</p>
          {coconuts > 0 && (
            <button type="button" onClick={() => setNut((v) => !v)} className={`min-h-10 rounded-2xl px-3 text-xs font-bold ${paying ? "bg-[#F5A623] text-[#2B201B]" : "bg-white/10"}`}>
              🥥 {paying ? "Paying with a coconut" : "Pay with a coconut"} <span className="font-normal opacity-80">(you carry {coconuts})</span>
            </button>
          )}
          <div className="flex flex-col gap-1.5">
            {menu.map((id) => {
              const d = DRINKS[id] as Drink;
              return (
                <div key={id} className="flex items-center gap-2.5 rounded-2xl bg-black/20 px-3 py-2">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-2xl" style={{ background: `${d.aura}33`, boxShadow: `0 0 12px ${d.aura}66` }}>
                    {d.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-[#F7EBE1]">
                      {d.name} <span className="text-[10px] font-normal text-[#ffd27a]">{"★".repeat(d.band)}</span>
                    </div>
                    <div className="truncate text-[11px] opacity-75">
                      {d.recipe.map((r) => INGREDIENT_INFO[r].emoji).join(" ")} · {d.blurb}
                    </div>
                  </div>
                  <button type="button" disabled={!paying && coins < DRINK_PRICE} onClick={() => order(id)} className="min-h-10 w-[88px] shrink-0 rounded-xl bg-[#F5A623] text-sm font-bold text-[#2B201B] transition active:scale-95 disabled:opacity-40">
                    {paying ? "1 🥥" : `${DRINK_PRICE} 🪙`}
                  </button>
                </div>
              );
            })}
          </div>
<p className="m-0 text-center text-[11px] opacity-70">🧉 Walk round behind the counter to take a shift and mix the orders yourself</p>
        </>
      ) : (
        <>
          <p className="m-0 text-xs opacity-80">
            Step behind the counter and make the orders yourself: build, pour, shake. A regular tips by the stars (up to {TIPS_PER_HOUR} tipped drinks an hour); a player's order pays you most of its price.
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {DRINK_IDS.filter((id) => cove || !(DRINKS[id] as Drink).secret).map((id) => {
              const d = DRINKS[id] as Drink;
              const m = book.made[id];
              return (
                <div key={id} className="rounded-2xl bg-black/20 px-3 py-2">
                  <div className="text-sm font-bold text-[#F7EBE1]">
                    {d.emoji} {d.name}
                  </div>
                  <div className="text-[11px] opacity-80">{m ? `Made ${m.n} · best ${"★".repeat(m.best)}${"☆".repeat(3 - m.best)}` : "Not made yet"}</div>
                </div>
              );
            })}
          </div>
          <div className="rounded-2xl bg-black/20 px-3 py-2 text-xs">
            <div>
              Perfects in a row: <b className="text-[#F7EBE1]">{book.streak}</b> · longest run: <b className="text-[#F7EBE1]">{book.bestStreak}</b>
            </div>
            <div className="mt-1 opacity-80">
              Titles: every drink of a band made Perfect earns one ({BAR_TITLES[1]}, {BAR_TITLES[2]}, {BAR_TITLES[3]}); all of them, {MASTER_TITLE}.
            </div>
            {titles.length > 0 && <div className="mt-1 font-bold text-[#ffd27a]">🏅 {titles.join(" · ")}</div>}
          </div>
        </>
      )}
    </Modal>
  );
}
