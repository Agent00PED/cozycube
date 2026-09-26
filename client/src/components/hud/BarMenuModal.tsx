import { useEffect, useState } from "react";
import { CASINO_DRINKS, CASINO_DRINK_IDS, casinoDrinkOf, type CasinoDrinkId, type CasinoNotice, type CasinoPacket, type CasinoPropEvent } from "@shared/casino";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { Modal } from "./Modal";

// Pippin's bar menu, over the Velvet Lounge's counter: three house drinks, paid in chips. Each
// leaves a glow round whoever drinks it for a while (everyone sees it): the Velvet Fizz's rising
// bubbles, the Lucky Martini's gold glints (purely for show), the Espresso's steam and a 20%
// quicker step for a minute. The server takes the chips and pours ("casino" BAR_ORDER); Pippin
// names each drink as he serves it.

interface Props {
  chips: number;
  /** Your aura now (a drink already glowing round you). */
  aura: string;
  localSessionId: string;
  onOrder: (packet: CasinoPacket) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onClose: () => void;
}

export function BarMenuModal({ chips, aura, localSessionId, onOrder, subscribeMessages, onClose }: Props) {
  const [say, setSay] = useState<{ text: string; ok: boolean }>({ text: "What'll it be, friend? Everything's shaken, stirred or waddled to order. 🐧", ok: true });
  const [pending, setPending] = useState<CasinoDrinkId | null>(null);
  const current = casinoDrinkOf(aura);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type === "casinoProp") {
          const ev = payload as CasinoPropEvent;
          if (ev.kind !== "barmenu" || ev.sessionId !== localSessionId || !ev.drink) return;
          setPending(null);
          setSay({ text: `${CASINO_DRINKS[ev.drink].line} ${CASINO_DRINKS[ev.drink].emoji}`, ok: true });
        } else if (type === "casinoNotice") {
          setPending(null);
          setSay({ text: (payload as CasinoNotice).reason === "chips" ? "Ah, the chips are a little short, friend. Mr. Vance's cage is by the doors." : "Lean in a little closer to the bar, I can't reach you from there!", ok: false });
        }
      }),
    [subscribeMessages, localSessionId]
  );

  const order = (drink: CasinoDrinkId) => {
    setPending(drink);
    window.setTimeout(() => setPending((p) => (p === drink ? null : p)), 3000);
    onOrder({ type: "BAR_ORDER", drink });
  };

  return (
    <Modal title="Pippin's Bar" icon="🍸" onClose={onClose} width={440} tone="velvet">
      <div className="flex flex-col gap-3 pb-2">
        <div className="flex items-end gap-3 rounded-2xl border border-amber-300/40 bg-black/30 p-3">
          <span className="text-5xl leading-none drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]" aria-hidden>
            🐧
          </span>
          <div className={`clay-pop flex-1 rounded-2xl px-3 py-2 text-sm ${say.ok ? "bg-black/45" : "bg-rose-900/60"}`} key={say.text} role="status">
            <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.25em] text-amber-200/80">Pippin</div>
            {say.text}
          </div>
        </div>
        <ul className="flex flex-col gap-2">
          {CASINO_DRINK_IDS.map((id) => {
            const d = CASINO_DRINKS[id];
            const short = chips < d.price;
            return (
              <li key={id} className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${current === id ? "border-amber-300/70 bg-amber-300/15" : "border-amber-300/25 bg-black/25"}`}>
                <span className="text-3xl" aria-hidden>
                  {d.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold tracking-wide text-amber-100">
                    {d.name}
                    {current === id && <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-emerald-300">glowing now</span>}
                  </div>
                  <div className="text-xs opacity-75">{d.blurb}</div>
                </div>
                <button type="button" onClick={() => order(id)} disabled={short || pending !== null} className="clay-btn clay-btn-amber min-h-10 shrink-0 px-3 text-sm" title={short ? "Not enough Velvet Chips" : `Order a ${d.name}`}>
                  {pending === id ? "Pouring…" : `${d.price} 🟡`}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="text-center text-[11px] tracking-wide opacity-60">Your chips: {chips.toLocaleString("en-US")} 🟡 · a new drink replaces the last one's glow</div>
      </div>
    </Modal>
  );
}
