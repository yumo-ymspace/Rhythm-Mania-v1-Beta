import { useMemo, useRef, useState } from 'react';
import { useGame } from '../../state/GameContext';
import { SkewButton } from '../argon/SkewButton';
import { ModsOverlay } from './ModsOverlay';

export function SongSelect() {
  const game = useGame();
  const [modsOpen, setModsOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const filteredSets = useMemo(() => {
    const q = game.search.trim().toLowerCase();
    if (!q) return game.sets;
    return game.sets.filter((s) => `${s.title} ${s.artist} ${s.creator}`.toLowerCase().includes(q));
  }, [game.sets, game.search]);

  const maps = game.beatmaps.filter((b) => b.setId === game.selectedSetId);
  const selected = game.beatmaps.find((b) => b.id === game.selectedBeatmapId) ?? maps[0];
  const set = game.sets.find((s) => s.id === game.selectedSetId);

  return (
    <div
      className="enter relative flex h-full gap-6 p-6"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) void game.importFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={fileRef}
        type="file"
        accept=".osz,application/zip"
        className="hidden"
        multiple
        onChange={(e) => {
          if (e.target.files) void game.importFiles(e.target.files);
        }}
      />

      <div className="w-[48%] overflow-x-hidden overflow-y-auto pr-2">
        {filteredSets.map((s) => (
          <button
            key={s.id}
            onClick={() => game.dispatch({ type: 'selectSet', id: s.id })}
            className={`skew-card mb-3 w-full rounded-xl border px-0 text-left backdrop-blur-md ${
              s.id === game.selectedSetId ? 'border-[#00F0FF] bg-[#00F0FF]/10' : 'border-white/12 bg-[#121622]/75'
            }`}
          >
            <div className="skew-card-inner flex items-center gap-4 p-4">
              <Cover blob={s.coverImageBlob} />
              <div className="min-w-0">
                <div className="truncate text-lg font-bold">{s.title}</div>
                <div className="truncate text-sm text-slate-400">{s.artist}</div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500">mapped by {s.creator}</div>
              </div>
            </div>
          </button>
        ))}
        {filteredSets.length === 0 && (
          <p className="text-slate-400">No maps yet. Import a .osz or use the bundled sample.</p>
        )}
      </div>

      <div className="flex w-[52%] flex-col rounded-2xl border border-white/12 bg-[#0D1017]/80 p-6 backdrop-blur-md">
        {selected && set ? (
          <>
            <h2 className="text-3xl font-black uppercase tracking-wide">{set.title}</h2>
            <p className="text-slate-400">
              {set.artist} — [{selected.version}]
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3 text-sm text-slate-300">
              <Stat label="Keys" value={`${selected.keyCount}K`} />
              <Stat label="OD" value={selected.overallDifficulty.toFixed(1)} />
              <Stat label="HP" value={selected.hpDrainRate.toFixed(1)} />
              <Stat label="Length" value={formatTime(selected.lengthMs)} />
              <Stat label="Objects" value={String(selected.objectCount)} />
              <Stat label="Stars" value={`★ ${selected.starRating.toFixed(2)}`} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {maps.map((m) => (
                <button
                  key={m.id}
                  onClick={() => game.dispatch({ type: 'selectMap', id: m.id })}
                  className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wider ${
                    m.id === selected.id ? 'border-[#00FF66] text-[#00FF66]' : 'border-white/15 text-slate-400'
                  }`}
                >
                  {m.version}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="text-slate-400">Select a beatmap set.</p>
        )}

        {game.error && <p className="mt-4 text-sm text-[#FF1E56]">{game.error}</p>}

        <div className="mt-auto flex flex-wrap items-center gap-3 pt-8">
          <SkewButton onClick={() => game.go('menu')}>Back</SkewButton>
          <SkewButton accent="yellow" onClick={() => setModsOpen(true)}>
            Mods {game.mods.length ? `(${game.mods.join(' ')})` : ''}
          </SkewButton>
          <SkewButton
            onClick={() => {
              const list = filteredSets;
              if (!list.length) return;
              const pick = list[Math.floor(Math.random() * list.length)];
              game.dispatch({ type: 'selectSet', id: pick.id });
            }}
          >
            Random
          </SkewButton>
          <SkewButton onClick={() => fileRef.current?.click()}>Import .osz</SkewButton>
          <DownloadButton />
          <div className="ml-auto">
            <SkewButton accent="emerald" disabled={!selected} onClick={() => selected && game.go('playing')}>
              Play
            </SkewButton>
          </div>
        </div>
      </div>

      {modsOpen && <ModsOverlay onClose={() => setModsOpen(false)} />}
    </div>
  );
}

function DownloadButton() {
  const game = useGame();
  const [id, setId] = useState('');
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(id);
        if (Number.isFinite(n) && n > 0) void game.downloadSet(n);
      }}
    >
      <input
        value={id}
        onChange={(e) => setId(e.target.value)}
        placeholder="beatmapset id"
        className="w-32 rounded-lg border border-white/12 bg-white/5 px-2 py-2 text-xs outline-none focus:border-[#00F0FF]"
      />
      <SkewButton type="submit">Catboy</SkewButton>
    </form>
  );
}

function Cover({ blob }: { blob?: Blob }) {
  const url = blob ? URL.createObjectURL(blob) : '';
  return (
    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-[#00F0FF]/10">
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="tabular-numbers text-lg font-bold">{value}</div>
    </div>
  );
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
