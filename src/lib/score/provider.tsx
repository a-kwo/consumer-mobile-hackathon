/**
 * `ScoreProvider` creates the engine, connects it to Convex and keeps it alive
 * for as long as the provider is mounted. It must sit inside `ConvexProvider`.
 */
import { useAction, useConvex, useMutation } from 'convex/react';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';

import { api } from '../../../convex/_generated/api';
import { ScoreEngine } from './engine';
import type { Backend } from './types';

const EngineContext = createContext<ScoreEngine | null>(null);

export function ScoreProvider({ children }: { children: ReactNode }) {
  const [engine] = useState(() => new ScoreEngine());

  const convex = useConvex();
  const pick = useAction(api.next.pick);
  const preview = useAction(api.tracks.preview);
  const weather = useAction(api.weather.current);
  const logPlay = useMutation(api.plays.log);
  const markSkipped = useMutation(api.plays.markSkipped);
  const ensureProfile = useMutation(api.profiles.ensure);
  const updateProfile = useMutation(api.profiles.update);

  const backend = useMemo<Backend>(
    () => ({
      pick: (args) => pick(args),
      preview: (args) => preview(args),
      weather: (args) => weather(args),
      logPlay: (args) => logPlay(args),
      markSkipped: (args) => markSkipped(args),
      ensureProfile: (args) => ensureProfile(args),
      updateProfile: (args) => updateProfile(args),
      watchProfile: (deviceId, onChange) => {
        const watch = convex.watchQuery(api.profiles.get, { deviceId });
        const read = () => {
          try {
            const profile = watch.localQueryResult();
            if (profile !== undefined) onChange(profile);
          } catch {
            // The query failed on the server; keep the profile we have.
          }
        };
        const unsubscribe = watch.onUpdate(read);
        read();
        return unsubscribe;
      },
    }),
    [convex, pick, preview, weather, logPlay, markSkipped, ensureProfile, updateProfile],
  );

  useEffect(() => {
    engine.setBackend(backend);
  }, [engine, backend]);

  useEffect(() => {
    engine.mount();
    return () => engine.unmount();
  }, [engine]);

  return <EngineContext.Provider value={engine}>{children}</EngineContext.Provider>;
}

/** The engine behind the hooks. Screens should use the hooks in `./hooks` instead. */
export function useScoreEngine(): ScoreEngine {
  const engine = useContext(EngineContext);
  if (!engine) throw new Error('Score hooks must be used inside <ScoreProvider>.');
  return engine;
}
