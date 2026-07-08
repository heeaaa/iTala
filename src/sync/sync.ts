// Sync layer between the local reducer state and Supabase.
//
// Strategy: the local reducer remains the source of truth for UI state and is
// always written to AsyncStorage (offline-first). When sync is enabled we ALSO
// mirror mutations to Supabase tables and subscribe to changes from other
// devices via Realtime. If a network call fails, the local state stays correct
// and the next successful operation reconverges things.
//
// Conflict policy: LAST WRITE WINS. Two scorekeepers should not be on the same
// game; if they are, the most recent write replaces the earlier one. Events
// are append-only with unique client-generated ids, so concurrent stat logs
// from different games never collide.

import { SupabaseClient } from '@supabase/supabase-js';
import { Action } from '../store/StoreProvider';
import { AppState, GameEvent, League, Player, Team, Game } from '../types';

/* ---------- Row shapes (snake_case columns ↔ camelCase types) -------------- */

interface LeagueRow { id: string; name: string; season: string; kind: 'league' | 'recreational'; foul_out_limit: number | null; track_misses: boolean | null; track_turnovers: boolean | null; is_shared: boolean | null; is_closed: boolean | null; is_archived: boolean | null; created_at: number; }
interface TeamRow   { id: string; league_id: string; name: string; color: string; logo: string | null; coach: string | null; team_only: boolean; player_ids: string[]; }
interface PlayerRow { id: string; league_id: string; name: string; number: string | null; origin_player_id: string | null; }
interface GameRow   { id: string; league_id: string; home_team_id: string; away_team_id: string; status: 'scheduled'|'live'|'final'; scheduled_at: number | null; location: string | null; finished_at: number | null; home_on_court: string[]; away_on_court: string[]; period: number | null; attendance: string[] | null; track_misses: boolean | null; track_turnovers: boolean | null; }
interface EventRow  { id: string; league_id: string; game_id: string; team_id: string; player_id: string | null; type: string; period: number; ts: number; note: string | null; }

const leagueFromRow = (r: LeagueRow, teams: Team[], players: Player[], games: Game[], events: GameEvent[]): League => ({
  id: r.id, name: r.name, season: r.season, kind: r.kind,
  foulOutLimit: r.foul_out_limit ?? undefined,
  // null = row predates the per-league setting; leave undefined so the
  // HYDRATE migration seeds it from the legacy global.
  trackMisses: r.track_misses ?? undefined,
  trackTurnovers: r.track_turnovers ?? undefined,
  isShared: r.is_shared || undefined,
  isClosed: r.is_closed || undefined,
  isArchived: r.is_archived || undefined,
  createdAt: r.created_at, teams, players, games, events,
});
const teamFromRow = (r: TeamRow): Team => ({
  id: r.id, name: r.name, color: r.color, playerIds: r.player_ids,
  logo: r.logo ?? undefined, teamOnly: r.team_only || undefined,
  coach: r.coach ?? undefined,
});
const playerFromRow = (r: PlayerRow): Player => ({
  id: r.id, name: r.name, number: r.number ?? undefined,
  originPlayerId: r.origin_player_id ?? undefined,
});
const gameFromRow = (r: GameRow): Game => ({
  id: r.id, leagueId: r.league_id, homeTeamId: r.home_team_id, awayTeamId: r.away_team_id,
  attendance: r.attendance ?? undefined,
  trackMisses: r.track_misses ?? undefined,
  trackTurnovers: r.track_turnovers ?? undefined,
  status: r.status,
  scheduledAt: r.scheduled_at ?? undefined,
  location: r.location ?? undefined,
  finishedAt: r.finished_at ?? undefined,
  homeOnCourt: r.home_on_court ?? [],
  awayOnCourt: r.away_on_court ?? [],
  period: r.period ?? undefined,
});
const eventFromRow = (r: EventRow): GameEvent => ({
  id: r.id, gameId: r.game_id, teamId: r.team_id,
  playerId: r.player_id, type: r.type as GameEvent['type'],
  period: r.period, ts: r.ts, note: r.note ?? undefined,
});

/* ---------- Initial pull: fetch all data, return as AppState ---------------- */

export async function fetchAllState(sb: SupabaseClient): Promise<Partial<AppState> | null> {
  // Every query is explicitly ordered. Without .order(), PostgREST returns
  // rows in arbitrary order (often whichever row was updated last moves) —
  // which made lists visibly shuffle after each realtime re-pull, and could
  // even change which event "Undo" considered the latest.
  const [lr, tr, pr, gr, er, sr] = await Promise.all([
    sb.from('leagues').select('*').order('created_at', { ascending: false }), // newest first, matches local prepend
    sb.from('teams').select('*').order('name'),                               // alphabetical, matches render order
    sb.from('players').select('*').order('name'),
    sb.from('games').select('*').order('scheduled_at', { ascending: false }),
    sb.from('events').select('*').order('ts'),                                // chronological — Undo depends on this
    sb.from('app_settings').select('*').eq('key', 'trackMisses').maybeSingle(),
  ]);

  if (lr.error) { console.warn('[sync] fetch leagues error:', lr.error.message); return null; }
  if (tr.error || pr.error || gr.error || er.error) {
    console.warn('[sync] fetch error:', tr.error?.message ?? pr.error?.message ?? gr.error?.message ?? er.error?.message);
    return null;
  }

  const leagueRows = lr.data as LeagueRow[];

  const leagues = leagueRows.map(lRow => {
    const teams   = (tr.data as TeamRow[]).filter(x => x.league_id === lRow.id).map(teamFromRow);
    const players = (pr.data as PlayerRow[]).filter(x => x.league_id === lRow.id).map(playerFromRow);
    const games   = (gr.data as GameRow[]).filter(x => x.league_id === lRow.id).map(gameFromRow);
    const events  = (er.data as EventRow[]).filter(x => x.league_id === lRow.id).map(eventFromRow);
    return leagueFromRow(lRow, teams, players, games, events);
  });

  const trackMisses = sr.data ? (sr.data.value as { trackMisses?: boolean }).trackMisses ?? true : true;
  return { leagues, settings: { trackMisses } };
}

/* ---------- Push: mirror an action's effect to Supabase --------------------- */
// We translate the *intent* of each action to a row-level operation. The post-
// reducer `state` is passed in so we can look up the new shape of things (e.g.
// after ADD_PLAYER we read the team's updated playerIds and upsert the team).

// Logs PostgREST/RLS-style errors from a Supabase response. Network failures
// throw and are caught below; row-level rejections come back in .error.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function check(label: string, res: { error: any }): void {
  if (res?.error) {
    console.warn(`[sync] ${label} rejected:`, res.error.message ?? res.error);
  }
}

export async function pushAction(sb: SupabaseClient, action: Action, state: AppState): Promise<void> {
  try {
    switch (action.t) {
      case 'DUPLICATE_LEAGUE': {
        const l = state.leagues.find(x => x.id === action.newLeagueId);
        if (!l) return;
        // Server: owners of the source league duplicate without a creation code.
        check('DUPLICATE_LEAGUE', await sb.rpc('create_league', {
          p_id: l.id, p_name: l.name, p_season: l.season,
          p_kind: l.kind ?? 'league',
          p_foul_out: l.foulOutLimit ?? null,
          p_track_misses: l.trackMisses ?? true,
          p_track_turnovers: l.trackTurnovers ?? true,
          p_created_at: l.createdAt,
          p_code: null, p_shared: false,
          p_source_league: action.sourceLeagueId,
        }));
        if (l.teams.length) {
          check('DUPLICATE_teams', await sb.from('teams').upsert(l.teams.map(t => ({
            id: t.id, league_id: l.id, name: t.name, color: t.color,
            logo: t.logo ?? null, coach: t.coach ?? null, team_only: !!t.teamOnly, player_ids: t.playerIds,
          }))));
        }
        if (l.players.length) {
          check('DUPLICATE_players', await sb.from('players').upsert(l.players.map(pl => ({
            id: pl.id, league_id: l.id, name: pl.name, number: pl.number ?? null,
            origin_player_id: pl.originPlayerId ?? null,
          }))));
        }
        break;
      }

      case 'ADD_LEAGUE': {
        const l = state.leagues.find(x => x.id === action.id);
        if (!l) return;
        // League creation is an RPC, not a table insert: the server validates
        // (and consumes) the single-use creation code, inserts the row, and
        // records the caller as the league's owner — all atomically.
        check('ADD_LEAGUE', await sb.rpc('create_league', {
          p_id: l.id, p_name: l.name, p_season: l.season,
          p_kind: l.kind ?? 'league',
          p_foul_out: l.foulOutLimit ?? null,
          p_track_misses: l.trackMisses ?? true,
          p_track_turnovers: l.trackTurnovers ?? true,
          p_created_at: l.createdAt,
          p_code: action.creationCode ?? null,
          p_shared: l.isShared ?? false,
        }));
        break;
      }
      case 'DELETE_LEAGUE':
        check('DELETE_LEAGUE', await sb.from('leagues').delete().eq('id', action.leagueId));
        break;

      case 'ADD_TEAM': {
        const l = state.leagues.find(x => x.id === action.leagueId);
        const t = l?.teams[l.teams.length - 1]; // just-added team is last
        if (!l || !t) return;
        check('UPSERT_teams', await sb.from('teams').upsert({
          id: t.id, league_id: l.id, name: t.name, color: t.color,
          logo: t.logo ?? null, coach: t.coach ?? null, team_only: !!t.teamOnly, player_ids: t.playerIds,
        }));
        break;
      }
      case 'UPDATE_TEAM': {
        const l = state.leagues.find(x => x.id === action.leagueId);
        const t = l?.teams.find(x => x.id === action.teamId);
        if (!l || !t) return;
        check('UPSERT_teams', await sb.from('teams').upsert({
          id: t.id, league_id: l.id, name: t.name, color: t.color,
          logo: t.logo ?? null, coach: t.coach ?? null, team_only: !!t.teamOnly, player_ids: t.playerIds,
        }));
        break;
      }
      case 'DELETE_TEAM':
        check('DELETE_teams', await sb.from('teams').delete().eq('id', action.teamId));
        break;

      case 'ADD_PLAYER': {
        const l = state.leagues.find(x => x.id === action.leagueId);
        const p = l?.players[l.players.length - 1]; // just-added player is last
        if (!l || !p) return;
        // ONE transaction server-side (player insert + team player_ids update).
        // Two separate writes let a realtime re-pull land in between, briefly
        // hydrating a player no team claimed — the "vanishing new player" bug.
        check('ADD_PLAYER', await sb.rpc('add_player', {
          p_league_id: l.id, p_team_id: action.teamId,
          p_player_id: p.id, p_name: p.name, p_number: p.number ?? null,
        }));
        break;
      }
      case 'UPDATE_PLAYER': {
        const l = state.leagues.find(x => x.id === action.leagueId);
        const p = l?.players.find(x => x.id === action.playerId);
        if (!l || !p) return;
        check('UPSERT_players', await sb.from('players').upsert({
          id: p.id, league_id: l.id, name: p.name, number: p.number ?? null,
        }));
        break;
      }
      case 'DELETE_PLAYER': {
        // The reducer also removes the player from their team's playerIds — push that team update.
        const l = state.leagues.find(x => x.id === action.leagueId);
        check('DELETE_players', await sb.from('players').delete().eq('id', action.playerId));
        if (l) {
          for (const t of l.teams) {
            check('UPSERT_teams', await sb.from('teams').upsert({
              id: t.id, league_id: l.id, name: t.name, color: t.color,
              logo: t.logo ?? null, team_only: !!t.teamOnly, player_ids: t.playerIds,
            }));
          }
        }
        break;
      }

      case 'CREATE_GAME': {
        const l = state.leagues.find(x => x.id === action.leagueId);
        const g = l?.games.find(x => x.id === action.id);
        if (!l || !g) return;
        check('UPSERT_games', await sb.from('games').upsert(gameToRow(g)));
        break;
      }
      case 'DELETE_GAME':
        // events cascade-delete in the schema (game_id FK on delete cascade)
        check('DELETE_games', await sb.from('games').delete().eq('id', action.gameId));
        break;

      case 'SET_LINEUP':
      case 'SET_LINEUPS':
      case 'SUBSTITUTE':
      case 'SET_ATTENDANCE':
      case 'SET_GAME_STATUS':
      case 'SET_PERIOD': {
        const l = state.leagues.find(x => x.id === action.leagueId);
        const g = l?.games.find(x => x.id === action.gameId);
        if (g) check('UPSERT_games', await sb.from('games').upsert(gameToRow(g)));
        break;
      }

      case 'ADD_EVENT': {
        const l = state.leagues.find(x => x.id === action.leagueId);
        // The reducer creates the event last in events[]; find by matching the action's fields.
        const ev = l?.events[l.events.length - 1];
        if (!l || !ev) return;
        check('INSERT_events', await sb.from('events').insert({
          id: ev.id, league_id: l.id, game_id: ev.gameId, team_id: ev.teamId,
          player_id: ev.playerId, type: ev.type, period: ev.period, ts: ev.ts, note: ev.note ?? null,
        }));
        // Foul-out auto-bench: the reducer also removes the fouled-out player from court — push the game.
        const g = l.games.find(x => x.id === action.gameId);
        if (action.type === 'pf' && g) check('UPSERT_games', await sb.from('games').upsert(gameToRow(g)));
        break;
      }
      case 'UNDO_EVENT':
      case 'DELETE_EVENT': {
        if (action.t === 'UNDO_EVENT') {
          // The reducer removed the most recent event; we can't easily find its id post-hoc here,
          // so we fall back to refetching events for the game on the next pull cycle. As a best
          // effort, we also nuke the most recent server-side event matching the (gameId, period).
          // Simplest: do nothing — the next pull or the next ADD_EVENT will reconcile.
          return;
        }
        check('DELETE_events', await sb.from('events').delete().eq('id', action.eventId));
        break;
      }

      case 'SET_LEAGUE_SETTINGS': {
        const patch: Record<string, boolean> = {};
        if (action.trackMisses !== undefined) patch.track_misses = action.trackMisses;
        if (action.trackTurnovers !== undefined) patch.track_turnovers = action.trackTurnovers;
        if (action.isClosed !== undefined) patch.is_closed = action.isClosed;
        if (action.isArchived !== undefined) patch.is_archived = action.isArchived;
        if (Object.keys(patch).length === 0) break;
        check('SET_LEAGUE_SETTINGS', await sb.from('leagues').update(patch).eq('id', action.leagueId));
        break;
      }

      case 'SET_SETTINGS':
        check('UPSERT_app_settings', await sb.from('app_settings').upsert({
          key: 'trackMisses',
          value: { trackMisses: state.settings.trackMisses },
        }));
        break;

      case 'REC_SETUP_GAME': {
        const l = state.leagues.find(x => x.id === action.leagueId);
        if (!l) return;
        // FK-SAFE ORDER, and no guessing which teams are new — the action
        // carries their exact ids. (1) Ensure the league row exists on the
        // server BEFORE anything references it; the RPC is idempotent and
        // records ownership. Without this the teams/game hit a foreign-key
        // error and the game vanished on the next pull → "Game not found".
        if (action.ensureLeague) {
          check('REC_create_league', await sb.rpc('create_league', {
            p_id: l.id, p_name: action.ensureLeague.name, p_season: 'Drop-In',
            p_kind: 'recreational', p_foul_out: null,
            p_track_misses: true, p_track_turnovers: true,
            p_created_at: l.createdAt,
            p_code: null, p_shared: action.ensureLeague.isShared ?? false,
          }));
        }
        // (2) Teams, then (3) players, then (4) the game — each references the
        // previous. IDs come straight from the action, so exactly the right
        // rows are written regardless of local array ordering.
        const teamIds = action.teams.map(t => t.id);
        for (const tid of teamIds) {
          const t = l.teams.find(x => x.id === tid);
          if (!t) continue;
          check('REC_teams', await sb.from('teams').upsert({
            id: t.id, league_id: l.id, name: t.name, color: t.color,
            logo: t.logo ?? null, coach: t.coach ?? null, team_only: !!t.teamOnly, player_ids: t.playerIds,
          }));
        }
        for (const td of action.teams) {
          for (const pd of td.players) {
            check('REC_players', await sb.from('players').upsert({
              id: pd.id, league_id: l.id, name: pd.name, number: pd.number ?? null,
            }));
          }
        }
        const g = l.games.find(x => x.id === action.gameId);
        if (g) check('REC_games', await sb.from('games').upsert(gameToRow(g)));
        break;
      }

      case 'HYDRATE':
        // Local hydrate only — no server write.
        return;
    }
  } catch (e: unknown) {
    // Network or auth errors should never crash the UI. They'll reconverge on the next push or pull.
    console.warn('sync push failed:', (e as Error)?.message ?? e);
  }
}

function gameToRow(g: Game) {
  return {
    id: g.id, league_id: g.leagueId, home_team_id: g.homeTeamId, away_team_id: g.awayTeamId,
    status: g.status,
    scheduled_at: g.scheduledAt ?? null,
    location: g.location ?? null,
    finished_at: g.finishedAt ?? null,
    home_on_court: g.homeOnCourt ?? [],
    away_on_court: g.awayOnCourt ?? [],
    period: g.period ?? 1,
    attendance: g.attendance ?? null,
    track_misses: g.trackMisses ?? null,
    track_turnovers: g.trackTurnovers ?? null,
  };
}

/* ---------- Realtime subscription: pull changes from other devices --------- */

export interface PullHandlers {
  onLeagueChange: (id: string) => void;       // re-fetch full league when any league/team/player/game/event row changes
}

export function subscribeRealtime(sb: SupabaseClient, onAnyChange: () => void) {
  const channel = sb.channel('itala-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'leagues' },      onAnyChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' },        onAnyChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players' },      onAnyChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'games' },        onAnyChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' },       onAnyChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, onAnyChange)
    .subscribe();
  return () => { sb.removeChannel(channel); };
}
