import { MANIA_MODS, type ModCategory } from '../../engine/ruleset/mods';
import { useGame } from '../../state/GameContext';
import { SkewButton } from '../argon/SkewButton';

const GROUPS: { title: string; category: ModCategory }[] = [
  { title: 'Reduction', category: 'reduction' },
  { title: 'Increase', category: 'increase' },
  { title: 'Automation', category: 'automation' },
  { title: 'Conversion', category: 'conversion' },
];

export function ModsOverlay({ onClose }: { onClose: () => void }) {
  const game = useGame();
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/60 p-6 backdrop-blur-sm">
      <div className="enter max-h-[80vh] w-[min(920px,100%)] overflow-y-auto rounded-2xl border border-white/12 bg-[#0D1017] p-6">
        <h2 className="mb-4 text-xl font-black uppercase tracking-[0.12em]">Mods</h2>
        {GROUPS.map((g) => (
          <section key={g.category} className="mb-5">
            <h3 className="mb-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">{g.title}</h3>
            <div className="flex flex-wrap gap-2">
              {MANIA_MODS.filter((m) => m.category === g.category).map((m) => {
                const on = game.mods.includes(m.acronym);
                return (
                  <button
                    key={m.acronym}
                    onClick={() => game.toggle(m.acronym)}
                    className={`rounded-lg border px-3 py-2 text-left text-xs ${
                      on ? 'border-[#00F0FF] bg-[#00F0FF]/15 text-[#00F0FF]' : 'border-white/12 text-slate-300'
                    }`}
                  >
                    <div className="font-black">{m.acronym}</div>
                    <div className="text-[10px] uppercase tracking-wider opacity-70">{m.name}</div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        <div className="flex justify-end">
          <SkewButton accent="emerald" onClick={onClose}>
            Close
          </SkewButton>
        </div>
      </div>
    </div>
  );
}
