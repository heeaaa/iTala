import React, { createContext, useContext, useEffect, useReducer, useRef, useCallback } from 'react';
import { AppState, League, Team, Player, Game, GameEvent, EventType, LocalPrefs } from '../types';
import { setHapticsEnabled } from '../lib/haptics';
import { ensureNotifPermission } from '../lib/notify';
import { uid } from '../lib/format';
import { teamColors, DEFAULT_FOUL_OUT } from '../theme';
import { loadState, saveState, loadPrefs, savePrefs } from './storage';
import { getSupabase, SYNC_ENABLED } from '../sync/supabase';
import { fetchAllState, pushAction, subscribeRealtime } from '../sync/sync';

// gameId -> expiry timestamp. Lineups written locally are protected from being
// overwritten by a lagging realtime echo until the expiry passes.
const lineupGuard = new Map<string, number>();
const LINEUP_GUARD_MS = 2500;
function guardLineup(gameId: string) { lineupGuard.set(gameId, Date.now() + LINEUP_GUARD_MS); }
function isLineupGuarded(gameId: string) {
  const exp = lineupGuard.get(gameId);
  if (exp === undefined) return false;
  if (Date.now() > exp) { lineupGuard.delete(gameId); return false; }
  return true;
}

interface RecTeamInput { id: string; name: string; color?: string; players: { id: string; name: string; number?: string }[] }

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
  | { t: 'SET_LINEUPS'; leagueId: string; gameId: string; home: string[]; away: string[] }
  | { t: 'SUBSTITUTE'; leagueId: string; gameId: string; side: 'home' | 'away'; outId: string; inId: string }
  | { t: 'ADD_EVENT'; leagueId: string; gameId: string; teamId: string; playerId: string | null; type: EventType; period: number; note?: string }
  | { t: 'UNDO_EVENT'; leagueId: string; gameId: string }
  | { t: 'REDO_EVENT'; leagueId: string; gameId: string }
  | { t: 'DELETE_EVENT'; leagueId: string; eventId: string }
  | { t: 'DELETE_GAME'; leagueId: string; gameId: string }
  | { t: 'CLEANUP_REC_GAMES'; leagueId: string; gameIds: string[] }
  | { t: 'SET_GAME_STATUS'; leagueId: string; gameId: string; status: Game['status'] }
  | { t: 'SET_ATTENDANCE'; leagueId: string; gameId: string; playerIds: string[] }
  | { t: 'SET_PERIOD'; leagueId: string; gameId: string; period: number }
  | { t: 'DUPLICATE_LEAGUE'; sourceLeagueId: string; newLeagueId: string; name: string; season: string }
  | { t: 'SET_LEAGUE_SETTINGS'; leagueId: string; trackMisses?: boolean; trackTurnovers?: boolean; isClosed?: boolean; isArchived?: boolean }
  | { t: 'SET_SETTINGS'; settings: Partial<AppState['settings']> }
  | { t: 'REC_SETUP_GAME'; leagueId: string; gameId: string; location?: string; trackMisses?: boolean; trackTurnovers?: boolean; ensureLeague?: { name: string; isShared?: boolean }; teams: [RecTeamInput, RecTeamInput] }

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
      // Build a quick lookup of the CURRENT (pre-hydrate) games so we can
      // preserve just-written lineups that the incoming snapshot may not have
      // yet (see lineupGuard). Everything else takes the server value.
      const currentGames = new Map<string, Game>();
      for (const l of state.leagues) for (const g of l.games) currentGames.set(g.id, g);

      const leagues = a.state.leagues.map(l => {
        const migrated = l.trackMisses === undefined ? { ...l, trackMisses: settings.trackMisses } : l;
        const games = migrated.games.map(g => {
          if (isLineupGuarded(g.id)) {
            const local = currentGames.get(g.id);
            if (local) return { ...g, homeOnCourt: local.homeOnCourt, awayOnCourt: local.awayOnCourt };
          }
          return g;
        });
        return { ...migrated, games };
      });
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

    case 'SET_LINEUPS':
      // Both starting fives in ONE update — avoids a realtime re-pull landing
      // between two separate SET_LINEUP writes and wiping the second side.
      return mapLeague(state, a.leagueId, l => ({
        ...l,
        games: l.games.map(g =>
          g.id === a.gameId ? { ...g, homeOnCourt: a.home, awayOnCourt: a.away } : g
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
        const clearedRedo = l._redo ? { ...l._redo, [a.gameId]: [] } : undefined;

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
        return { ...l, events, games, _redo: clearedRedo };
      });

    case 'UNDO_EVENT':
      return mapLeague(state, a.leagueId, l => {
        const ofGame = l.events.filter(e => e.gameId === a.gameId);
        if (ofGame.length === 0) return l;
        const last = ofGame[ofGame.length - 1];
        const redo = { ...(l._redo ?? {}) };
        redo[a.gameId] = [...(redo[a.gameId] ?? []), last]; // push onto the redo stack
        return { ...l, events: l.events.filter(e => e.id !== last.id), _redo: redo };
      });

    case 'REDO_EVENT':
      return mapLeague(state, a.leagueId, l => {
        const stack = l._redo?.[a.gameId] ?? [];
        if (stack.length === 0) return l;
        const ev = stack[stack.length - 1];
        const redo = { ...(l._redo ?? {}) };
        redo[a.gameId] = stack.slice(0, -1);
        return { ...l, events: [...l.events, ev], _redo: redo };
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

    case 'CLEANUP_REC_GAMES':
      return mapLeague(state, a.leagueId, l => {
        const kill = new Set(a.gameIds);
        const survivingGames = l.games.filter(g => !kill.has(g.id));
        // Teams still referenced by a surviving game must be kept.
        const keepTeam = new Set<string>();
        for (const g of survivingGames) { keepTeam.add(g.homeTeamId); keepTeam.add(g.awayTeamId); }
        const teams = l.teams.filter(t => keepTeam.has(t.id));
        // Players belong to teams; keep only players on surviving teams.
        const keepPlayer = new Set<string>();
        for (const t of teams) for (const pid of t.playerIds) keepPlayer.add(pid);
        const players = l.players.filter(p => keepPlayer.has(p.id));
        return {
          ...l,
          games: survivingGames,
          events: l.events.filter(e => !kill.has(e.gameId)),
          teams,
          players,
        };
      });

    case 'SET_ATTENDANCE':
      return mapLeague(state, a.leagueId, l => ({
        ...l,
        games: l.games.map(g => g.id === a.gameId ? { ...g, attendance: a.playerIds } : g),
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
        ...(a.isClosed !== undefined ? { isClosed: a.isClosed } : {}),
        ...(a.isArchived !== undefined ? { isArchived: a.isArchived } : {}),
      }));

    case 'SET_SETTINGS':
      return { ...state, settings: { ...state.settings, ...a.settings } };

    case 'REC_SETUP_GAME': {
      // Ensure the rec league exists locally first (create if needed).
      let leagues = state.leagues;
      if (!leagues.some(l => l.id === a.leagueId) && a.ensureLeague) {
        const newLeague: League = {
          id: a.leagueId, name: a.ensureLeague.name, season: 'Drop-In',
          kind: 'recreational', isShared: a.ensureLeague.isShared || undefined,
          createdAt: Date.now(), teams: [], players: [], games: [], events: [],
        };
        leagues = [newLeague, ...leagues];
      }
      return {
        ...state,
        leagues: leagues.map(l => {
          if (l.id !== a.leagueId) return l;
          const newTeams: Team[] = [];
          const newPlayers: Player[] = [];
          a.teams.forEach((td, i) => {
            const playerIds: string[] = [];
            td.players.forEach(pd => {
              const p: Player = { id: pd.id, name: pd.name.trim() || 'Player', number: pd.number };
              newPlayers.push(p);
              playerIds.push(p.id);
            });
            newTeams.push({
              id: td.id,
              name: td.name.trim() || `Team ${i + 1}`,
              color: td.color ?? teamColors[(l.teams.length + i) % teamColors.length],
              playerIds,
            });
          });
          const game: Game = {
            id: a.gameId, leagueId: a.leagueId,
            homeTeamId: newTeams[0].id, awayTeamId: newTeams[1].id,
            status: 'live', scheduledAt: Date.now(), location: a.location,
            trackMisses: a.trackMisses, trackTurnovers: a.trackTurnovers,
            homeOnCourt: [], awayOnCourt: [], period: 1,
          };
          return {
            ...l,
            teams: [...l.teams, ...newTeams],
            players: [...l.players, ...newPlayers],
            games: [game, ...l.games],
          };
        }),
      };
    }

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
  syncState: 'idle' | 'saving' | 'saved' | 'error';
  refresh: () => Promise<void>;
  /** Device-local favorites (leagues/teams pinned to the top of lists). */
  prefs: LocalPrefs;
  setHaptics: (on: boolean) => void;
  setNotifs: (on: boolean) => void;
  dismissOnboarding: () => void;
  toggleFavLeague: (leagueId: string) => void;
  toggleFavTeam: (teamId: string) => void;
}
const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, baseDispatch] = useReducer(reducer, initial);
  const [ready, setReady] = React.useState(false);
  const [prefs, setPrefs] = React.useState<LocalPrefs>({ favLeagueIds: [], favTeamIds: [], hapticsEnabled: true });
  const [syncState, setSyncState] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const savedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);
  const stateRef = useRef(state);
  const prefsRef = useRef(prefs);
  const authSubRef = useRef<{ unsubscribe: () => void } | null>(null);
  stateRef.current = state;
  prefsRef.current = prefs;

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
        const hz = savedPrefs.hapticsEnabled ?? true;
        setPrefs({ favLeagueIds: savedPrefs.favLeagueIds ?? [], favTeamIds: savedPrefs.favTeamIds ?? [], hapticsEnabled: hz, seenOnboarding: savedPrefs.seenOnboarding, notifsEnabled: savedPrefs.notifsEnabled });
        setHapticsEnabled(hz);
      }

      if (SYNC_ENABLED) {
        const sb = getSupabase();
        if (sb) {
          // Wait for a session (anonymous sign-in is kicked off by
          // AdminProvider). Longer window than before — a cold first launch on
          // a tablet or a weak connection can take several seconds to mint the
          // anonymous token, and RLS reads return empty without one.
          let session = (await sb.auth.getSession()).data.session;
          let waited = 0;
          while (!session && waited < 8000) {
            await new Promise(r => setTimeout(r, 200));
            session = (await sb.auth.getSession()).data.session;
            waited += 200;
          }

          // Pull the authoritative server state. CRUCIAL: if this first attempt
          // yields nothing (no session yet, or a slow/failed network call), we
          // DON'T give up — we retry quietly in the background with backoff, so
          // a slow-starting guest session recovers on its own without needing
          // the user to sign in or relaunch. This is the iPad "empty on first
          // open, appeared after sign-in" fix: the sign-in wasn't required,
          // the retry would have filled it in regardless.
          const tryPull = async (): Promise<boolean> => {
            try {
              const remote = await fetchAllState(sb);
              if (!cancelled && remote && remote.leagues && remote.leagues.length > 0) {
                baseDispatch({ t: 'HYDRATE', state: {
                  leagues: remote.leagues,
                  settings: remote.settings ?? stateRef.current.settings,
                } });
                return true;
              }
            } catch (e) {
              console.warn('Supabase pull attempt failed:', (e as Error).message);
            }
            return false;
          };

          const gotData = await tryPull();
          if (!gotData && !cancelled) {
            // Background retry: 1s, 2s, 4s, 8s, then every 15s up to ~1 min.
            // Stops as soon as a pull succeeds or the screen unmounts.
            (async () => {
              const delays = [1000, 2000, 4000, 8000, 15000, 15000, 15000];
              for (const d of delays) {
                if (cancelled) return;
                await new Promise(r => setTimeout(r, d));
                if (cancelled) return;
                if (await tryPull()) return;
              }
            })();
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

  // Manual refresh for pull-to-refresh: re-pull the full server state now.
  const refresh = useCallback(async () => {
    if (!SYNC_ENABLED) return;
    const sb = getSupabase();
    if (!sb) return;
    const remote = await fetchAllState(sb);
    if (remote && remote.leagues) {
      baseDispatch({ t: 'HYDRATE', state: {
        leagues: remote.leagues,
        settings: remote.settings ?? stateRef.current.settings,
      } });
    }
  }, []);

  // Wrapped dispatch: apply the action locally, then push the resulting state
  // to Supabase. We compute the post-dispatch state inline via the reducer so
  // pushAction sees the exact rows we want to mirror — no React render gap.
  const dispatch = useCallback<React.Dispatch<Action>>((action) => {
    // HYDRATE is server→local; don't echo it back.
    if (action.t === 'HYDRATE') { baseDispatch(action); return; }

    const next = reducer(stateRef.current, action);
    stateRef.current = next;
    baseDispatch(action);

    // Protect freshly-written lineups from a lagging realtime echo.
    if (action.t === 'SET_LINEUPS' || action.t === 'SET_LINEUP' || action.t === 'REC_SETUP_GAME') {
      guardLineup(action.gameId);
    }

    // Final-score nudge for favorited teams (local notification, opt-in).
    if (action.t === 'SET_GAME_STATUS' && action.status === 'final' && prefsRef.current.notifsEnabled) {
      const lg = next.leagues.find(l => l.id === action.leagueId);
      const g = lg?.games.find(x => x.id === action.gameId);
      if (lg && g) {
        const favT = new Set(prefsRef.current.favTeamIds);
        if (favT.has(g.homeTeamId) || favT.has(g.awayTeamId)) {
          const home = lg.teams.find(t => t.id === g.homeTeamId);
          const away = lg.teams.find(t => t.id === g.awayTeamId);
          import('../lib/stats').then(({ gameScore }) => {
            const sc = gameScore(lg, g);
            import('../lib/notify').then(({ notifyNow }) => {
              void notifyNow('Final score', `${home?.name} ${sc.home} — ${sc.away} ${away?.name}`);
            });
          }).catch(() => {});
        }
      }
    }

    if (SYNC_ENABLED) {
      const sb = getSupabase();
      if (sb) {
        // Surface a lightweight save indicator: saving → saved (2s) → idle.
        // Errors are swallowed inside pushAction, so we mark 'saved' on resolve
        // and only flip to 'error' if it throws (it currently never does, but
        // this future-proofs the indicator).
        setSyncState('saving');
        void pushAction(sb, action, next)
          .then(() => {
            setSyncState('saved');
            if (savedTimer.current) clearTimeout(savedTimer.current);
            savedTimer.current = setTimeout(() => setSyncState('idle'), 2000);
          })
          .catch(() => setSyncState('error'));
      }
    }
  }, []);

  // Favorites: pure device-local preference. Toggle + persist; never synced.
  const toggleFav = useCallback((key: 'favLeagueIds' | 'favTeamIds', id: string) => {
    setPrefs(prev => {
      const cur = prev[key] ?? [];
      const list = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
      const next = { ...prev, [key]: list };
      void savePrefs(next);
      return next;
    });
  }, []);
  const dismissOnboarding = useCallback(() => {
    setPrefs(prev => { const next = { ...prev, seenOnboarding: true }; void savePrefs(next); return next; });
  }, []);
  const setNotifs = useCallback((on: boolean) => {
    setPrefs(prev => { const next = { ...prev, notifsEnabled: on }; void savePrefs(next); return next; });
    if (on) void ensureNotifPermission();
  }, []);
  const setHaptics = useCallback((on: boolean) => {
    setHapticsEnabled(on);
    setPrefs(prev => { const next = { ...prev, hapticsEnabled: on }; void savePrefs(next); return next; });
  }, []);
  const toggleFavLeague = useCallback((leagueId: string) => toggleFav('favLeagueIds', leagueId), [toggleFav]);
  const toggleFavTeam = useCallback((teamId: string) => toggleFav('favTeamIds', teamId), [toggleFav]);

  // Autosave on every change — persist every mutation so a live game never dies.
  useEffect(() => {
    if (!ready) return;
    if (first.current) { first.current = false; }
    saveState(state);
  }, [state, ready]);

  return <StoreCtx.Provider value={{ state, dispatch, ready, synced: SYNC_ENABLED, refresh, prefs, toggleFavLeague, toggleFavTeam, setHaptics, setNotifs, syncState, dismissOnboarding }}>{children}</StoreCtx.Provider>;
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
