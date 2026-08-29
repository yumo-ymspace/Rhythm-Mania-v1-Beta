import { HitResult } from '../../engine/ruleset/hitWindows';
import { useGame } from '../../state/GameContext';
import { SkewButton } from '../argon/SkewButton';

const ORDER: { key: HitResult; label: string; color: string }[] = [
  { key: HitResult.Perfect, label: 'Perfect', color: '#00F0FF' },
  { key: HitResult.Great, label: 'Great', color: '#FFCC00' },
  { key: HitResult.Good, label: 'Good', color: '#00FF66' },
  { key: HitResult.Ok, label: 'Ok', color: '#0088FF' },
  { key: HitResult.Meh, label: 'Meh', color: '#A0AEC0' },
  { key: HitResult.Miss, label: 'Miss', color: '#FF1E56' },
];

export function ResultsScreen() {
  const game = useGame();
  const r = game.playResult;
  if (!r) {
    return (
      <div className="grid h-full place-items-center">
        <SkewButton onClick={() => game.go('songSelect')}>Back</SkewButton>
      </div>
    );
  }

  const rankLabel = r.rank === 'X' || r.rank === 'XH' ? 'SS' : r.rank === 'SH' ? 'S' : r.rank;
  const rankColor =
    r.rank === 'XH' || r.rank === 'SH'
      ? '#C0C8D8'
      : r.rank.startsWith('X') || r.rank === 'S'
        ? '#FFCC00'
        : r.rank === 'A'
          ? '#00FF66'
          : '#00F0FF';

  return (
    <div className="enter mx-auto flex h-full max-w-5xl items-center gap-12 p-10">
      <div
        className="grid h-64 w-64 place-items-center rounded-3xl border-4 text-8xl font-black"
        style={{ borderColor: rankColor, color: rankColor, textShadow: `0 0 40px ${rankColor}` }}
      >
        {rankLabel}
      </div>
      <div className="flex-1">
        <p className="text-slate-400">
          {r.title} [{r.version}] {r.mods.length ? `+${r.mods.join('')}` : ''}
        </p>
        <div className="tabular-numbers mt-2 text-5xl font-black">{r.score.toLocaleString()}</div>
        <div className="mt-2 flex gap-8 text-xl">
          <span className="tabular-numbers text-[#00F0FF]">{(r.accuracy * 100).toFixed(2)}%</span>
          <span className="tabular-numbers">{r.maxCombo}x</span>
          <span className="tabular-numbers text-slate-400">UR {r.unstableRate.toFixed(2)}</span>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3">
          {ORDER.map((row) => (
            <div key={row.label} className="rounded-lg border border-white/10 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider" style={{ color: row.color }}>
                {row.label}
              </div>
              <div className="tabular-numbers text-2xl font-bold">{r.counts[row.key]}</div>
            </div>
          ))}
        </div>
        <div className="mt-8 flex gap-3">
          <SkewButton accent="yellow" onClick={() => game.go('playing')}>
            Retry
          </SkewButton>
          <SkewButton accent="emerald" onClick={() => game.go('songSelect')}>
            Continue
          </SkewButton>
        </div>
      </div>
    </div>
  );
}
