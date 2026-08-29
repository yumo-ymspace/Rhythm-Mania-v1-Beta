import { ChevronLeft } from 'lucide-react';
import { useGame } from '../../state/GameContext';

export function Toolbar() {
  const game = useGame();
  const showBack = game.screen !== 'menu' && game.screen !== 'playing';

  return (
    <header className="pointer-events-auto flex h-14 items-center justify-between gap-4 border-b border-white/10 bg-[#08090D]/70 px-4 backdrop-blur-md">
      <div className="flex items-center gap-3">
        {showBack ? (
          <button
            className="skew-card rounded-lg border border-white/12 bg-[#121622]/80 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.08em] text-white hover:border-[#00F0FF]"
            onClick={() => game.go(game.screen === 'settings' || game.screen === 'songSelect' ? 'menu' : 'songSelect')}
          >
            <span className="skew-card-inner flex items-center gap-1">
              <ChevronLeft size={14} /> Back
            </span>
          </button>
        ) : (
          <div className="w-[88px]" />
        )}
        <div className="rounded-full border border-[#00F0FF]/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#00F0FF]">
          osu!mania
        </div>
      </div>

      {game.screen === 'songSelect' ? (
        <input
          value={game.search}
          onChange={(e) => game.dispatch({ type: 'search', search: e.target.value })}
          placeholder="Search (Ctrl+F)"
          className="w-[min(420px,40vw)] rounded-full border border-white/12 bg-white/5 px-4 py-1.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-[#00F0FF]"
        />
      ) : (
        <div />
      )}

      <ProfileChip />
    </header>
  );
}

function ProfileChip() {
  const game = useGame();
  const user = game.user;
  if (!user) {
    return (
      <button
        onClick={game.login}
        className="flex items-center gap-2 rounded-full border border-white/12 bg-[#121622]/80 px-3 py-1 text-xs uppercase tracking-wider text-slate-300 hover:border-[#00F0FF]"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-white/10">?</span>
        Guest · Sign in
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/12 bg-[#121622]/80 px-3 py-1">
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full" />
      ) : (
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[#00F0FF]/20 text-[10px]">{user.username[0]}</span>
      )}
      <div className="text-left text-xs">
        <div className="font-semibold text-white">{user.username}</div>
        <div className="text-slate-400">
          #{user.globalRank ?? '—'} · {user.pp != null ? Math.round(user.pp) : '—'} pp
        </div>
      </div>
    </div>
  );
}
