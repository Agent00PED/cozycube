import { useEffect, useMemo, useState } from "react";
import { CAPSULE_COST, CAPSULE_DUP_REFUND, CAPSULE_PRIZES, capsuleUnlock, type CapsuleRarity, type CapsuleResult, type CasinoNotice, type CasinoPacket } from "@shared/casino";
import type { RoomMessageListener } from "../../hooks/useColyseusRoom";
import { playSfx } from "../../audio/sfx";
import { Modal } from "./Modal";

// The capsule machine in the Grand Foyer: a pull costs Velvet Chips and drops a capsule with a
// title to wear over your name or an emote to send (a duplicate hands some chips back). Below it,
// your collection: wear a title (or none), and see which emotes are yours (the social drawer sends
// them). The server rolls and grants ("casino" CAPSULE_PULL / EQUIP_TITLE); nothing here is bought
// with anything but chips, and nothing in a capsule is worth anything but a smile.

interface Props {
  chips: number;
  /** Your unlocks (PlayerState.owned) and the title you wear. */
  owned: string;
  title: string;
  onSend: (packet: CasinoPacket) => void;
  subscribeMessages: (listener: RoomMessageListener) => () => void;
  onClose: () => void;
}

const RARITY: Record<CapsuleRarity, { label: string; tone: string }> = {
  common: { label: "Common", tone: "text-stone-200 border-white/20" },
  rare: { label: "Rare", tone: "text-sky-200 border-sky-300/50" },
  legendary: { label: "Legendary", tone: "text-amber-200 border-amber-300/70" },
};
/** The capsule rattles round the globe this long before it drops. */
const SHAKE_MS = 1100;

export function CapsuleModal({ chips, owned, title, onSend, subscribeMessages, onClose }: Props) {
  const [result, setResult] = useState<CapsuleResult | null>(null);
  const [shaking, setShaking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const mine = useMemo(() => new Set(owned.split(",")), [owned]);
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type === "capsuleResult") {
          const r = payload as CapsuleResult;
          window.setTimeout(() => {
            setShaking(false);
            setResult(r);
            playSfx(r.prize.rarity === "legendary" ? "jackpot" : "sparkle");
          }, SHAKE_MS);
        } else if (type === "casinoNotice") {
          setShaking(false);
          setNotice((payload as CasinoNotice).reason === "chips" ? `A pull is ${CAPSULE_COST} chips: Mr. Vance's cage is by the doors.` : "Step up to the machine to turn its crank.");
        }
      }),
    [subscribeMessages]
  );

  const pull = () => {
    if (shaking) return;
    setResult(null);
    setNotice(null);
    setShaking(true);
    playSfx("capsule");
    onSend({ type: "CAPSULE_PULL" });
    window.setTimeout(() => setShaking(false), 4000);
  };

  const titles = CAPSULE_PRIZES.filter((p) => p.kind === "title");
  const emotes = CAPSULE_PRIZES.filter((p) => p.kind === "emote");
  return (
    <Modal title="The Capsule Machine" icon="🔮" onClose={onClose} width={460} tone="velvet">
      <div className="flex flex-col gap-3 pb-2">
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-amber-300/40 bg-black/30 p-4">
          <div className={`flex h-24 w-24 items-center justify-center rounded-full border-4 border-amber-300/70 bg-gradient-to-b from-rose-400/40 to-violet-500/40 text-5xl shadow-[0_0_30px_rgba(255,200,90,0.25)] ${shaking ? "animate-bounce" : ""}`} aria-hidden>
            {shaking ? "🎁" : result ? result.prize.emoji : "🔮"}
          </div>
          {result && !shaking ? (
            <div className="clay-pop text-center" role="status">
              <div className={`mx-auto mb-1 inline-block rounded-full border px-2 text-[10px] font-bold uppercase tracking-widest ${RARITY[result.prize.rarity].tone}`}>{RARITY[result.prize.rarity].label}</div>
              <div className="text-lg font-extrabold text-amber-100">
                {result.prize.kind === "title" ? `Title: “${result.prize.name}”` : `Emote: ${result.prize.emoji} ${result.prize.name}`}
              </div>
              <div className="text-xs opacity-75">{result.duplicate ? `Already yours: ${result.refund} chips back.` : result.prize.kind === "title" ? "Wear it below: it shows over your name." : "Send it from the social drawer (💬)."}</div>
            </div>
          ) : (
            <div className="text-center text-sm opacity-80">{notice ?? (shaking ? "The globe spins… a capsule rattles down…" : "Turn the crank for a title or an emote. Rare ones glitter.")}</div>
          )}
          <button type="button" onClick={pull} disabled={shaking || chips < CAPSULE_COST} className="clay-btn clay-btn-amber min-h-11 px-6 text-base">
            {shaking ? "Turning…" : `Turn the crank · ${CAPSULE_COST} 🟡`}
          </button>
          <div className="text-[11px] opacity-60">
            Your chips: {chips.toLocaleString("en-US")} 🟡 · a duplicate returns {CAPSULE_DUP_REFUND}
          </div>
        </div>

        <section className="rounded-2xl border border-amber-300/25 bg-black/25 p-3">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-amber-200/80">Titles · wear one</h3>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => onSend({ type: "EQUIP_TITLE", id: "" })} className={`min-h-9 rounded-full px-3 text-xs font-bold ${title === "" ? "bg-amber-300 text-amber-950" : "bg-white/10 hover:bg-white/15"}`}>
              None
            </button>
            {titles.map((p) => {
              const have = mine.has(capsuleUnlock(p));
              return (
                <button key={p.id} type="button" disabled={!have} onClick={() => onSend({ type: "EQUIP_TITLE", id: p.id })} className={`min-h-9 rounded-full border px-3 text-xs font-bold ${title === p.id ? "border-amber-300 bg-amber-300 text-amber-950" : have ? `bg-white/10 hover:bg-white/15 ${RARITY[p.rarity].tone}` : "border-white/10 opacity-35"}`} title={have ? `Wear “${p.name}”` : "Not found yet"}>
                  {p.emoji} {have ? p.name : "???"}
                </button>
              );
            })}
          </div>
        </section>
        <section className="rounded-2xl border border-amber-300/25 bg-black/25 p-3">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-amber-200/80">Emotes · yours to send</h3>
          <div className="grid grid-cols-6 gap-1.5">
            {emotes.map((p) => {
              const have = mine.has(capsuleUnlock(p));
              return (
                <div key={p.id} className={`flex flex-col items-center rounded-xl border py-1.5 ${have ? RARITY[p.rarity].tone : "border-white/10 opacity-35"}`} title={have ? p.name : "Not found yet"}>
                  <span className="text-2xl">{have ? p.emoji : "❔"}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </Modal>
  );
}
