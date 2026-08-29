import { useEffect, useState } from 'react';
import { useGame } from '../../state/GameContext';
import { SkewButton } from '../argon/SkewButton';

export function MenuScreen() {
  const game = useGame();
  const [pulse, setPulse] = useState(1);
  const beatMs = 60000 / game.bpm;

  useEffect(() => {
    let last = performance.now();
    let phase = 0;
    let raf = 0;
    const loop = (now: number) => {
      phase += now - last;
      last = now;
      if (phase >= beatMs) {
        phase %= beatMs;
        setPulse(1.08);
        requestAnimationFrame(() => setPulse(1));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [beatMs]);

  return (
    <div className="enter flex h-full flex-col items-center justify-center gap-16">
      <button
        className="relative grid h-60 w-60 place-items-center rounded-full"
        style={{ transform: `scale(${pulse})`, transition: 'transform 150ms ease-out' }}
        onClick={() => game.go('songSelect')}
        aria-label="osu! logo"
      >
        <div className="absolute inset-0 rounded-full border-4 border-[#00F0FF] shadow-[0_0_40px_#00F0FF88]" />
        <div className="absolute inset-3 rounded-full border-4 border-[#FF007F] shadow-[0_0_30px_#FF007F66]" />
        <div className="absolute inset-8 rounded-full bg-[#0D1017]" />
        <span className="relative text-5xl font-black tracking-tight text-white">osu!</span>
      </button>

      <nav className="flex flex-wrap items-center justify-center gap-4">
        <SkewButton accent="cyan" onClick={() => game.go('songSelect')}>
          Solo
        </SkewButton>
        <SkewButton accent="yellow" onClick={() => game.go('settings')}>
          Settings
        </SkewButton>
        <SkewButton
          accent="pink"
          onClick={() => {
            window.close();
          }}
        >
          Exit
        </SkewButton>
      </nav>
    </div>
  );
}
