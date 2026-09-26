import { useMemo } from "react";
import { DERBY_HORSES, type CasinoWin } from "@shared/casino";
import type { LeaderboardEntry } from "@shared/types";
import { Modal } from "./Modal";

// The Velvet Gazette, folded on the Chesterfield's coffee table: the house's evening paper. Its
// front page is tonight's real news (the room's big wins as they happened, the High Rollers'
// table), and the rest is the house's gossip, a different edition every day.

/** The big wins seen tonight, newest first (App collects them from "casinoWin"). */
const news: CasinoWin[] = [];
export function recordCasinoNews(win: CasinoWin) {
  news.unshift(win);
  news.length = Math.min(news.length, 8);
}

const GOSSIP = [
  ["Boris Denies Card-Counting Rumours", "“I count only blessings,” says the pit's beloved dealer, shuffling a deck with suspicious ease."],
  ["Pippin Unveils the Midnight Waddle", "The mixologist's newest creation is said to taste of moonlight and a little of cherries."],
  ["Owl Predicts Seven, Is Correct Again", "Madame Zara's brass familiar has now foretold four sevens in a row. Mr. Vance is not amused."],
  ["Jasper Celebrates 1,000th Spin", "The tuxedo cat was asked when he last left his stool. “Define ‘left’,” he replied."],
  ["VIP Room: Still Locked", "Bruno confirms the doors remain shut. Asked who is inside, he adjusted his sunglasses."],
  ["Madame Vivienne's Wheel Waxed", "The croupier insists the gleam is purely cosmetic. Faites vos jeux."],
  ["Chandelier Count Holds at Four", "After an exhaustive audit, the house confirms: still four chandeliers, all sparkling."],
  ["The Turf Club Goes to the Races", `Tipsters favour ${DERBY_HORSES[0]}, though ${DERBY_HORSES[4]} is said to be in fine form.`],
];

function dayIndex(): number {
  return Math.floor(Date.now() / 86_400_000);
}

export function GazetteModal({ leaderboard, onClose }: { leaderboard: LeaderboardEntry[]; onClose: () => void }) {
  const edition = useMemo(() => {
    const d = dayIndex();
    const picks = [0, 1, 2].map((k) => GOSSIP[(d * 3 + k * 5) % GOSSIP.length]);
    return { number: 1000 + (d % 9000), picks };
  }, []);
  const date = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const top = leaderboard.slice(0, 3);
  return (
    <Modal title="The Velvet Gazette" icon="📰" onClose={onClose} width={520}>
      <div className="mb-2 rounded-2xl bg-[#f2e8d5] p-4 font-serif text-[#2a2023] shadow-inner">
        <div className="border-b-4 border-double border-[#2a2023] pb-1 text-center">
          <div className="text-[10px] font-bold uppercase tracking-[0.4em]">No. {edition.number} · Evening Edition · {date}</div>
          <div className="text-3xl font-black tracking-tight">The Velvet Gazette</div>
          <div className="text-[10px] uppercase tracking-[0.3em]">All the news fit to gamble on · one chip</div>
        </div>

        <h3 className="mt-3 mb-1 text-lg font-black uppercase leading-tight">{news.length ? "Fortune Smiles on the Floor Tonight" : "A Quiet Night at the Tables"}</h3>
        {news.length ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
            {news.slice(0, 5).map((w, i) => (
              <li key={i} className="border-b border-[#2a2023]/20 pb-1">
                <b>{w.username}</b> {w.game === "slots" ? "lined up" : w.game === "roulette" ? "hit" : "drew"} <b>{w.detail}</b> for <b>{w.amount} chips</b>
                {w.celebrate ? " — the chandeliers shook!" : "."}
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm">No big wins yet this evening. Our correspondent at the roulette table reports the wheel “warming up nicely”.</p>
        )}

        {top.length > 0 && (
          <>
            <h3 className="mt-3 mb-1 text-base font-black uppercase">The High Rollers' Table</h3>
            <ol className="m-0 pl-5 text-sm">
              {top.map((e) => (
                <li key={e.username}>
                  <b>{e.username}</b> — worth {e.worth.toLocaleString("en-US")} ({e.coins.toLocaleString("en-US")} 🪙 · {e.chips.toLocaleString("en-US")} 🟡)
                </li>
              ))}
            </ol>
          </>
        )}

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {edition.picks.map(([head, body]) => (
            <div key={head} className="border-t-2 border-[#2a2023] pt-1">
              <div className="text-sm font-black leading-tight">{head}</div>
              <p className="m-0 mt-1 text-xs leading-snug">{body}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-[#2a2023]/30 pt-1 text-center text-[10px] italic">Chips are for fun only: nothing here is bought or sold for real money.</div>
      </div>
    </Modal>
  );
}
