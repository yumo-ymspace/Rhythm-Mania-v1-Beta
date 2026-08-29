import { GameProvider, useGame } from './state/GameContext';
import { Toolbar } from './ui/shell/Toolbar';
import { MenuScreen } from './ui/screens/MenuScreen';
import { SongSelect } from './ui/screens/SongSelect';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { PlayScreen } from './ui/play/PlayScreen';
import { ResultsScreen } from './ui/screens/ResultsScreen';
import { PauseFailOverlay } from './ui/screens/PauseFail';

function Shell() {
  const game = useGame();
  const playing = game.screen === 'playing';

  return (
    <div className="flex h-screen flex-col">
      {!playing && <Toolbar />}
      <main className="relative min-h-0 flex-1">
        {game.screen === 'menu' && <MenuScreen />}
        {game.screen === 'songSelect' && <SongSelect />}
        {game.screen === 'settings' && <SettingsScreen />}
        {game.screen === 'playing' && <PlayScreen />}
        {game.screen === 'results' && <ResultsScreen />}
        {game.screen === 'fail' && (
          <>
            <ResultsScreen />
            <PauseFailOverlay failed onRetry={() => game.go('playing')} onQuit={() => game.go('songSelect')} />
          </>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <GameProvider>
      <Shell />
    </GameProvider>
  );
}
