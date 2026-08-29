import { SkewButton } from '../argon/SkewButton';

export function PauseFailOverlay({
  failed,
  paused,
  onResume,
  onRetry,
  onQuit,
}: {
  failed: boolean;
  paused?: boolean;
  onResume?: () => void;
  onRetry: () => void;
  onQuit: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black/70 backdrop-blur-sm">
      <div className="enter rounded-2xl border border-white/12 bg-[#0D1017] px-12 py-10 text-center">
        <h2 className="mb-8 text-4xl font-black uppercase tracking-[0.16em] text-[#FF1E56]">
          {failed ? 'Failed' : paused ? 'Paused' : 'Paused'}
        </h2>
        <div className="flex justify-center gap-4">
          {!failed && onResume && (
            <SkewButton accent="cyan" onClick={onResume}>
              Continue
            </SkewButton>
          )}
          <SkewButton accent="yellow" onClick={onRetry}>
            Retry
          </SkewButton>
          <SkewButton accent="pink" onClick={onQuit}>
            Quit
          </SkewButton>
        </div>
      </div>
    </div>
  );
}
