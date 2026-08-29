import { useState } from 'react';
import { codeLabel } from '../../engine/input/bindings';
import { defaultBindsFor } from '../../engine/input/bindings';
import { useGame } from '../../state/GameContext';
import { SkewButton } from '../argon/SkewButton';

export function SettingsScreen() {
  const game = useGame();
  const s = game.settings;
  const [rebind, setRebind] = useState<{ keys: number; col: number } | null>(null);

  const update = (partial: Partial<typeof s>) => game.dispatch({ type: 'settings', settings: { ...s, ...partial } });

  return (
    <div
      className="enter mx-auto h-full max-w-3xl overflow-y-auto p-8"
      onKeyDown={(e) => {
        if (!rebind) return;
        e.preventDefault();
        const next = { ...s.binds, [rebind.keys]: [...(s.binds[rebind.keys] ?? defaultBindsFor(rebind.keys))] };
        next[rebind.keys][rebind.col] = e.code;
        update({ binds: next });
        setRebind(null);
      }}
      tabIndex={0}
    >
      <h1 className="mb-6 text-2xl font-black uppercase tracking-[0.12em]">Settings</h1>

      <Section title="Audio">
        <Slider label="Master" value={s.masterVolume} onChange={(v) => update({ masterVolume: v })} />
        <Slider label="Music" value={s.musicVolume} onChange={(v) => update({ musicVolume: v })} />
        <Slider label="Hitsounds" value={s.hitsoundVolume} onChange={(v) => update({ hitsoundVolume: v })} />
        <label className="mt-3 block text-sm text-slate-400">
          Universal offset (ms)
          <input
            type="number"
            value={s.userOffsetMs}
            onChange={(e) => update({ userOffsetMs: Number(e.target.value) })}
            className="ml-3 w-24 rounded border border-white/12 bg-white/5 px-2 py-1 text-white"
          />
        </label>
      </Section>

      <Section title="Gameplay">
        <Slider
          label="Scroll duration (visual, ms)"
          value={s.scrollDurationMs / 1000}
          min={0.2}
          max={1.2}
          onChange={(v) => update({ scrollDurationMs: v * 1000 })}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.upscroll} onChange={(e) => update({ upscroll: e.target.checked })} />
          Upscroll
        </label>
        <Slider label="Background dim" value={s.backgroundDim} onChange={(v) => update({ backgroundDim: v })} />
      </Section>

      <Section title="Keybinds 2K–9K">
        {([2, 3, 4, 5, 6, 7, 8, 9] as const).map((k) => (
          <div key={k} className="mb-3">
            <div className="mb-1 text-[11px] uppercase tracking-wider text-slate-500">{k}K</div>
            <div className="flex flex-wrap gap-2">
              {(s.binds[k] ?? defaultBindsFor(k)).map((code, i) => (
                <button
                  key={`${k}-${i}`}
                  className={`rounded border px-2 py-1 text-xs ${
                    rebind?.keys === k && rebind.col === i ? 'border-[#00F0FF] text-[#00F0FF]' : 'border-white/15'
                  }`}
                  onClick={() => setRebind({ keys: k, col: i })}
                >
                  {codeLabel(code)}
                </button>
              ))}
            </div>
          </div>
        ))}
        {rebind && <p className="text-xs text-[#00F0FF]">Press a key for column {rebind.col + 1}…</p>}
      </Section>

      <SkewButton onClick={() => game.go('menu')}>Done</SkewButton>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8 rounded-2xl border border-white/10 bg-[#121622]/60 p-5">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-[#00F0FF]">{title}</h2>
      {children}
    </section>
  );
}

function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="mb-2 flex items-center gap-3 text-sm text-slate-300">
      <span className="w-48">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1"
      />
      <span className="tabular-numbers w-12 text-right text-xs">{value.toFixed(2)}</span>
    </label>
  );
}
