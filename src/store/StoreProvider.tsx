import React, { createContext, useContext, useEffect, useReducer, useRef, useCallback } from 'react';
import { AppState, League, Team, Player, Game, GameEvent, EventType, LocalPrefs } from '../types';
import { uid } from '../lib/format';
import { teamColors, DEFAULT_FOUL_OUT } from '../theme';
import { loadState, saveState, loadPrefs, savePrefs } from './storage';
import { getSupabase, SYNC_ENABLED } from '../sync/supabase';
import { fetchAllState, pushAction, subscribeRealtime } from '../sync/sync';

export type Action =
  | { t: 'HYDRATE'; state: AppState }
  | { t: 'ADD_LEAGUE'; id: string; name: string; season: string; foulOutLimit?: number; kind?: 'league' | 'recreational'; trackMisses?: boolean; trackTurnovers?: boolean; isShared?: boolean; creationCode?: string }
  | { t: 'DELETE_LEAGUE'; leagueId: string }
  | { t: 'ADD_TEAM'; leagueId: string; name: string; teamOnly?: boolean }
  | { t: 'UPDATE_TEAM'; leagueId: string; teamId: string; name?: string; color?: string; logo?: string | null; coach?: string | null }
  | { t: 'DELETE_TEAM'; leagueId: string; teamId: string }
  | { t: 'ADD_PLAYER'; leagueId: string; teamId: string; name: string; number?: string }
  | { t: 'UPDATE_PLAYER'; leagueId: string; playerId: string; name?: string; number?: string | null }
  | { t: 'DELETE_PLAYER'; leagueId: string; teamId: string; playerId: string }
  | { t: 'CREATE_GAME'; id: string; leagueId: string; homeTeamId: string; awayTeamId: string; location?: string; homeOnCourt?: string[]; awayOnCourt?: string[] }
  | { t: 'SET_LINEUP'; leagueId: string; gameId: string; side: 'home' | 'away'; playerIds: string[] }
  | { t: 'SUBSTITUTE'; leagueId: string; gameId: string; side: 'home' | 'away'; outId: string; inId: string }
  | { t: 'ADD_EVENT'; leagueId: string; gameId: string; teamId: string; playerId: string | null; type: EventType; period: number; note?: string }
  | { t: 'UNDO_EVENT'; leagueId: string; gameId: string }
  | { t: 'DELETE_EVENT'; leagueId: string; eventId: string }
  | { t: 'DELETE_GAME'; leagueId: string; gameId: string }
  | { t: 'SET_GAME_STATUS'; leagueId: string; gameId: string; status: Game['status'] }
  | { t: 'SET_PERIOD'; leagueId: string; gameId: string; period: number }
  | { t: 'DUPLICATE_LEAGUE'; sourceLeagueId: string; newLeagueId: string; name: string; season: string }
  | { t: 'SET_LEAGUE_SETTINGS'; leagueId: string; trackMisses?: boolean; trackTurnovers?: boolean }
  | { t: 'SET_SETTINGS'; settings: Partial<AppState['settings']> }
  | { t: 'REC_SETUP_GAME'; leagueId: string; gameId: string; location?: string; teams: [{ name: string; players: { name: string; number?: string }[] }, { name: string; players: { name: string; number?: string }[] }] };

const defaultSettings = { trackMisses: true };
const initial: AppState = { leagues: [], settings: { ...defaultSettings } };

function mapLeague(state: AppState, id: string, fn: (l: League) => League): AppState {
  return { ...state, leagues: state.leagues.map(l => (l.id === id ? fn(l) : l)) };
}

function reducer(state: AppState, a: Action): AppState {
  switch (a.t) {
    case 'HYDRATE': {
      // older saved states may not have settings — backfill with defaults
      const settings = { ...defaultSettings, ...(a.state.settings ?? {}) };
      // MIGRATION: trackMisses moved from app-wide to per-league. Leagues
      // saved before the move have no own value — seed them from the legacy
      // global so nobody's live tracker changes shape after updating.
      const leagues = a.state.leagues.map(l =>
        l.trackMisses === undefined ? { ...l, trackMisses: settings.trackMisses } : l
      );
      return { leagues, settings };
    }

    case 'ADD_LEAGUE': {
      const league: League = {
        id: a.id, name: a.name.trim() || 'New League', season: a.season.trim() || 'Season 1',
        kind: a.kind ?? 'league',
        foulOutLimit: a.foulOutLimit ?? DEFAULT_FOUL_OUT,
        trackMisses: a.trackMisses ?? true,
        trackTurnovers: a.trackTurnovers ?? true,
        isShared: a.isShared || undefined,
        teams: [], players: [], games: [], events: [], createdAt: Date.now(),
      };
      return { ...state, leagues: [league, ...state.leagues] };
    }

    case 'DELETE_LEAGUE':
      return { ...state, leagues: state.leagues.filter(l => l.id !== a.leagueId) };

    case 'ADD_TEAM':
      return mapLeague(state, a.leagueId, l => {
        const team: Team = {
          id: uid(), name: a.name.trim() || `Team ${l.teams.length + 1}`,
          color: teamColors[l.teams.length % teamColors.length],
          playerIds: [], teamOnly: a.teamOnly,
        };
        return { ...l, teams: [...l.teams, team] };
      });

    case 'UPDATE_TEAM':
      return mapLeague(state, a.leagueId, l => ({
        ...l,
        teams: l.teams.map(t => {
          if (t.id !== a.teamId) return t;
          const next: Team = { ...t };
          if (a.name !== undefined) next.name = a.name.trim() || t.name;
          if (a.color !== undefined) next.color = a.color;
          if (a.coach !== undefined) next.coach = a.coach?.trim() || undefined;
          if (a.logo !== undefined) next.logo = a.logo === null ? undefined : a.logo;
          return next;
        }),
      }));

    case 'DELETE_TEAM':
      return mapLeague(state, a.leagueId, l => ({
        ...l,
        teams: l.teams.filter(t => t.id !== a.teamId),
        // remove games involving this team and their events
        games: l.games.filter(g => g.homeTeamId !== a.teamId && g.awayTeamId !== a.teamId),
        events: l.events.filter(e => e.teamId !== a.teamId),
      }));

    case 'ADD_PLAYER':
      return mapLeague(state, a.leagueId, l => {
        const player: Player = { id: uid(), name: a.name.trim() || 'Player', number: a.number };
        return {
          ...l,
          players: [...l.players, player],
          teams: l.teams.map(t =>
            t.id === a.teamId ? { ...t, playerIds: [...t.playerIds, player.id] } : t
          ),
        };
      });

    case 'UPDATE_PLAYER':
      return mapLeague(state, a.leagueId, l => ({
        ...l,
        players: l.players.map(p => {
          if (p.id !== a.playerId) return p;
          const next: Player = { ...p };
          if (a.name !== undefined) next.name = a.name.trim() || p.name;
          if (a.number !== undefined) next.number = a.number === null ? undefined : a.number;
          return next;
        }),
      }));

    case 'DELETE_PLAYER':
      return mapLeague(state, a.leagueId, l => ({
        ...l,
        players: l.players.filter(p => p.id !== a.playerId),
        teams: l.teams.map(t =>
          t.id === a.teamId ? { ...t, playerIds: t.playerIds.filter(id => id !== a.playerId) } : t
        ),
        // pull them out of any live lineups too
        games: l.games.map(g => ({
          ...g,
          homeOnCourt: g.homeOnCourt?.filter(id => id !== a.playerId),
          awayOnCourt: g.awayOnCourt?.filter(id => id !== a.playerId),
        })),
      }));

    case 'CREATE_GAME':
      return mapLeague(state, a.leagueId, l => {
        const game: Game = {
          id: a.id, leagueId: a.leagueId,
          homeTeamId: a.homeTeamId, awayTeamId: a.awayTeamId,
          status: 'live', scheduledAt: Date.now(), location: a.location,
          homeOnCourt: a.homeOnCourt ?? [], awayOnCourt: a.awayOnCourt ?? [],
        };
        return { ...l, games: [game, ...l.games] };
      });

    case 'SET_LINEUP':
      return mapLeague(state, a.leagueId, l => ({
        ...l,
        games: l.games.map(g =>
          g.id === a.gameId
            ? { ...g, [a.side === 'home' ? 'homeOnCourt' : 'awayOnCourt']: a.playerIds }
            : g
        ),
      }));

    case 'SUBSTITUTE':
      return mapLeague(state, a.leagueId, l => ({
        ...l,
        games: l.games.map(g => {
          if (g.id !== a.gameId) return g;
          const key = a.side === 'home' ? 'homeOnCourt' : 'awayOnCourt';
          const current = (g[key] ?? []).slice();
          const idx = current.indexOf(a.outId);
          if (idx === -1) {
            if (current.length < 5 && !current.includes(a.inId)) current.push(a.inId);
          } else {
            current[idx] = a.inId;
          }
          return { ...g, [key]: current };
        }),
      }));

    case 'ADD_EVENT':
      return mapLeague(state, a.leagueId, l => {
        const ev: GameEvent = {
          id: uid(), gameId: a.gameId, teamId: a.teamId,
          playerId: a.playerId, type: a.type, period: a.period, ts: Date.now(),
          note: a.note,
        };
        const events = [...l.events, ev];

        // Foul-out: if this foul reaches the limit, pull the player off the court automatically.
        let games = l.games;
        if (a.type === 'pf' && a.playerId) {
          const stored = l.foulOutLimit;
          const limit = (!stored || stored > DEFAULT_FOUL_OUT) ? DEFAULT_FOUL_OUT : stored;
          const fouls = events.filter(
            e => e.gameId === a.gameId && e.playerId === a.playerId && e.type === 'pf'
          ).length;
          if (fouls >= limit) {
            games = l.games.map(g => {
              if (g.id !== a.gameId) return g;
              return {
                ...g,
                homeOnCourt: g.homeOnCourt?.filter(id => id !== a.playerId),
                awayOnCourt: g.awayOnCourt?.filter(id => id !== a.playerId),
              };
            });
          }
        }
        return { ...l, events, games };
      });

    case 'UNDO_EVENT':
      return mapLeague(state, a.leagueId, l => {
        const ofGame = l.events.filter(e => e.gameId === a.gameId);
        if (ofGame.length === 0) return l;
        const lastId = ofGame[ofGame.length - 1].id;
        return { ...l, events: l.events.filter(e => e.id !== lastId) };
      });

    case 'DELETE_EVENT':
      return mapLeague(state, a.leagueId, l => ({
        ...l, events: l.events.filter(e => e.id !== a.eventId),
      }));

    case 'DELETE_GAME':
      return mapLeague(state, a.leagueId, l => ({
        ...l,
        games: l.games.filter(g => g.id !== a.gameId),
        events: l.events.filter(e => e.gameId !== a.gameId), // drop all stats logged for that game
      }));

    case 'SET_GAME_STATUS':
      return mapLeague(state, a.leagueId, l => ({
        ...l,
        games: l.games.map(g =>
          g.id === a.gameId
            ? { ...g, status: a.status, finishedAt: a.status === 'final' ? Date.now() : g.finishedAt }
            : g
        ),
      }));

    case 'SET_PERIOD':
      return mapLeague(state, a.leagueId, l => ({
        ...l,
        games: l.games.map(g =>
          g.id === a.gameId ? { ...g, period: Math.max(1, a.period) } : g
        ),
      }));

    case 'DUPLICATE_LEAGUE': {
      // New season from an old one: teams (names/colors/logos/coaches), players,
      // and settings carry over with FRESH ids; games/events/stats start empty.
      const src = state.leagues.find(l => l.id === a.sourceLeagueId);
      if (!src || state.leagues.some(l => l.id === a.newLeagueId)) return state;
      const playerIdMap = new Map<string, string>();
      const players = src.players.map(pl => {
        const nid = uid();
        playerIdMap.set(pl.id, nid);
        // Breadcrumb: remember who this copy is. If the source is itself a
        // copy, point at the ultimate origin so chains stay one hop deep.
        return { ...pl, id: nid, originPlayerId: pl.originPlayerId ?? pl.id };
      });
      const teams = src.teams.map(t => ({
        ...t,
        id: uid(),
        playerIds: t.playerIds.map(pid => playerIdMap.get(pid)!).filter(Boolean),
      }));
      const copy: League = {
        id: a.newLeagueId,
        name: a.name.trim() || src.name,
        season: a.season.trim() || src.season,
        kind: src.kind ?? 'league',
        foulOutLimit: src.foulOutLimit,
        trackMisses: src.trackMisses,
        trackTurnovers: src.trackTurnovers,
        createdAt: Date.now(),
        teams, players, games: [], events: [],
      };
      return { ...state, leagues: [copy, ...state.leagues] };
    }

    case 'SET_LEAGUE_SETTINGS':
      return mapLeague(state, a.leagueId, l => ({
        ...l,
        ...(a.trackMisses !== undefined ? { trackMisses: a.trackMisses } : {}),
        ...(a.trackTurnovers !== undefined ? { trackTurnovers: a.trackTurnovers } : {}),
      }));

    case 'SET_SETTINGS':
      return { ...state, settings: { ...state.settings, ...a.settings } };

    case 'REC_SETUP_GAME':
      return mapLeague(state, a.leagueId, l => {
        const newTeams: Team[] = [];
        const newPlayers: Player[] = [];
        a.teams.forEach((td, i) => {
          const playerIds: string[] = [];
          td.players.forEach(pd => {
            const p: Player = { id: uid(), name: pd.name.trim() || 'Player', number: pd.number };
            newPlayers.push(p);
            playerIds.push(p.id);
          });
          newTeams.push({
            id: uid(),
            name: td.name.trim() || `Team ${i + 1}`,
            color: teamColors[(l.teams.length + i) % teamColors.length],
            playerIds,
          });
        });
        const game: Game = {
          id: a.gameId, leagueId: a.leagueId,
          homeTeamId: newTeams[0].id, awayTeamId: newTeams[1].id,
          status: 'live', scheduledAt: Date.now(), location: a.location,
          homeOnCourt: [], awayOnCourt: [], period: 1,
        };
        return {
          ...l,
          teams: [...l.teams, ...newTeams],
          players: [...l.players, ...newPlayers],
          games: [game, ...l.games],
        };
      });

    default:
      return state;
  }
}

interface Ctx {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  ready: boolean;
  /** True when the app is connected to Supabase and syncing across devices. */
  synced: boolean;
  /** Device-local favorites (leagues/teams pinned to the top of lists). */
  prefs: LocalPrefs;
  toggleFavLeague: (leagueId: string) => void;
  toggleFavTeam: (teamId: string) => void;
}
const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, baseDispatch] = useReducer(reducer, initial);
  const [ready, setReady] = React.useState(false);
  const [prefs, setPrefs] = React.useState<LocalPrefs>({ favLeagueIds: [], favTeamIds: [] });
  const first = useRef(true);
  const stateRef = useRef(state);
  const authSubRef = useRef<{ unsubscribe: () => void } | null>(null);
  stateRef.current = state;

  // Hydrate from local storage first (fast, offline-friendly), then if synced,
  // wait until Supabase auth is ready (anonymous sign-in finishes), then pull
  // the authoritative server state. Without waiting, the initial pull would
  // hit row-level security as an anonymous-unauthenticated caller and silently
  // return an empty array — making the device look like it has no data.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadState();
      if (!cancelled && saved) baseDispatch({ t: 'HYDRATE', state: saved });
      const savedPrefs = await loadPrefs();
      if (!cancelled && savedPrefs) {
        setPrefs({ favLeagueIds: savedPrefs.favLeagueIds ?? [], favTeamIds: savedPrefs.favTeamIds ?? [] });
      }

      if (SYNC_ENABLED) {
        const sb = getSupabase();
        if (sb) {
          // Block until we have a session. Anonymous sign-in is kicked off by
          // AdminProvider; here we just wait for the result. Up to ~5s.
          let session = (await sb.auth.getSession()).data.session;
          let waited = 0;
          while (!session && waited < 5000) {
            await new Promise(r => setTimeout(r, 200));
            session = (await sb.auth.getSession()).data.session;
            waited += 200;
          }
          if (!session) {
            console.warn('Supabase: no auth session after 5s — initial pull will be skipped. Check Anonymous sign-in is enabled in your project.');
          } else {
            try {
              const remote = await fetchAllState(sb);
              if (!cancelled && remote && remote.leagues) {
                const merged: AppState = {
                  leagues: remote.leagues,
                  settings: remote.settings ?? (saved?.settings ?? { trackMisses: true }),
                };
                baseDispatch({ t: 'HYDRATE', state: merged });
              }
            } catch (e) {
              console.warn('initial Supabase pull failed:', (e as Error).message);
            }
          }

          // If auth state changes later (e.g. the very first sign-in completes
          // after the initial wait), re-pull so the device picks up data.
          const { data: sub } = sb.auth.onAuthStateChange(async (_event, s) => {
            if (!s || cancelled) return;
            try {
              const remote = await fetchAllState(sb);
              if (!cancelled && remote && remote.leagues) {
                baseDispatch({ t: 'HYDRATE', state: {
                  leagues: remote.leagues,
                  settings: remote.settings ?? stateRef.current.settings,
                } });
              }
            } catch {}
          });
          // Stash so cleanup works
          authSubRef.current = sub.subscription;
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
      authSubRef.current?.unsubscribe();
    };
  }, []);

  // Realtime subscription: when ANY row changes (from another device), re-pull
  // the full state. Cheap on a free tier with our data volume; the realtime
  // channel just signals "something changed", and we treat the server as truth.
  useEffect(() => {
    if (!SYNC_ENABLED || !ready) return;
    const sb = getSupabase();
    if (!sb) return;
    let refetching = false;
    const refetch = async () => {
      if (refetching) return; // coalesce bursts
      refetching = true;
      try {
        const remote = await fetchAllState(sb);
        if (remote && remote.leagues) {
          baseDispatch({ t: 'HYDRATE', state: {
            leagues: remote.leagues,
            settings: remote.settings ?? stateRef.current.settings,
          } });
        }
      } finally {
        refetching = false;
      }
    };
    const unsubscribe = subscribeRealtime(sb, refetch);
    return unsubscribe;
  }, [ready]);

  // Wrapped dispatch: apply the action locally, then push the resulting state
  // to Supabase. We compute the post-dispatch state inline via the reducer so
  // pushAction sees the exact rows we want to mirror — no React render gap.
  const dispatch = useCallback<React.Dispatch<Action>>((action) => {
    // HYDRATE is server→local; don't echo it back.
    if (action.t === 'HYDRATE') { baseDispatch(action); return; }

    const next = reducer(stateRef.current, action);
    stateRef.current = next;
    baseDispatch(action);

    if (SYNC_ENABLED) {
      const sb = getSupabase();
      if (sb) void pushAction(sb, action, next);
    }
  }, []);

  // Favorites: pure device-local preference. Toggle + persist; never synced.
  const toggleFav = useCallback((key: keyof LocalPrefs, id: string) => {
    setPrefs(prev => {
      const list = prev[key].includes(id) ? prev[key].filter(x => x !== id) : [...prev[key], id];
      const next = { ...prev, [key]: list };
      void savePrefs(next);
      return next;
    });
  }, []);
  const toggleFavLeague = useCallback((leagueId: string) => toggleFav('favLeagueIds', leagueId), [toggleFav]);
  const toggleFavTeam = useCallback((teamId: string) => toggleFav('favTeamIds', teamId), [toggleFav]);

  // Autosave on every change — persist every mutation so a live game never dies.
  useEffect(() => {
    if (!ready) return;
    if (first.current) { first.current = false; }
    saveState(state);
  }, [state, ready]);

  return <StoreCtx.Provider value={{ state, dispatch, ready, synced: SYNC_ENABLED, prefs, toggleFavLeague, toggleFavTeam }}>{children}</StoreCtx.Provider>;
}

export function useStore(): Ctx {
  const c = useContext(StoreCtx);
  if (!c) throw new Error('useStore must be used within StoreProvider');
  return c;
}

// convenience selectors
export function useLeague(leagueId?: string): League | undefined {
  const { state } = useStore();
  return state.leagues.find(l => l.id === leagueId);
}
