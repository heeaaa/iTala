// Core data model. Box scores & standings are DERIVED from events, never stored as truth.

export type EventType =
  | 'fg2_make' | 'fg2_miss'
  | 'fg3_make' | 'fg3_miss'
  | 'ft_make'  | 'ft_miss'
  | 'reb'                 // combined rebound (O/D split deferred to a later version)
  | 'oreb' | 'dreb'       // legacy split rebounds, still aggregated if present
  | 'ast' | 'stl' | 'blk'
  | 'tov'                 // legacy turnover, still aggregated if present
  | 'pf'
  | 'timeout';            // team timeout; note holds time remaining (e.g. "4:28")

export interface Player {
  id: string;
  name: string;
  number?: string; // jersey, optional
  // DORMANT BREADCRUMB — nothing reads this yet. Set only by Duplicate League
  // to remember which player this copy came from, so a future cross-league
  // career-profile feature can link seasons retroactively with zero guesswork.
  // Points at the ULTIMATE origin (chains stay flat across many seasons).
  originPlayerId?: string;
}

export interface Team {
  id: string;
  name: string;
  color: string;
  playerIds: string[];
  logo?: string;      // data URI (base64) for the team logo, optional
  coach?: string;     // coach / manager name, optional
  teamOnly?: boolean; // opponent-as-team shortcut: track score only, no individual players
}

export interface GameEvent {
  id: string;
  gameId: string;
  teamId: string;
  playerId: string | null; // null = team-level (opponent-as-team)
  type: EventType;
  period: number;
  ts: number;
  note?: string; // freeform detail, e.g. timeout "time remaining"
}

export type GameStatus = 'scheduled' | 'live' | 'final';

export interface Game {
  id: string;
  leagueId: string;
  homeTeamId: string;
  awayTeamId: string;
  status: GameStatus;
  scheduledAt?: number;
  location?: string;
  finishedAt?: number;
  homeOnCourt?: string[]; // player ids currently on the floor (max 5)
  awayOnCourt?: string[];
  period?: number;
  attendance?: string[]; // player ids present at this game (undefined = not recorded)        // current live period (persists across screen navigation)
}

export interface League {
  id: string;
  name: string;
  season: string;
  kind?: 'league' | 'recreational'; // 'recreational' = ad-hoc drop-in games container
  foulOutLimit?: number; // personal fouls before a player fouls out (default 6)
  trackMisses?: boolean; // per-league: show 2PT✗/3PT✗/FT✗ in the live tracker (default true)
  trackTurnovers?: boolean; // per-league: show the TOV button in the live tracker (default true)
  isShared?: boolean; // recreational only: the community drop-in space any signed-in user can write to
  isClosed?: boolean; // season officially complete — unlocks final awards (Mythical Five)
  isArchived?: boolean; // hidden everywhere; Super Admins can view/unarchive
  // Transient redo stash (per gameId) — lives only in memory, never synced or
  // saved. Populated by UNDO_EVENT, drained by REDO_EVENT, cleared by ADD_EVENT.
  _redo?: Record<string, GameEvent[]>;
  teams: Team[];
  players: Player[]; // league-scoped player pool
  games: Game[];
  events: GameEvent[];
  createdAt: number;
}

export interface AppSettings {
  // LEGACY: the app-wide toggle, kept only so old saved states load and so it
  // can seed each league's own trackMisses on first hydrate. The live tracker
  // now reads League.trackMisses.
  trackMisses: boolean;
}

// Device-local preferences. Never synced to Supabase — favorites are personal
// to this phone (syncing them would share one person's stars with everyone).
export interface LocalPrefs {
  favLeagueIds: string[];
  favTeamIds: string[];
}

export interface AppState {
  leagues: League[];
  settings: AppSettings;
}

// A computed per-player box score line.
export interface StatLine {
  playerId: string | null;
  pts: number;
  fgm: number; fga: number;
  tpm: number; tpa: number;
  ftm: number; fta: number;
  oreb: number; dreb: number; reb: number;
  ast: number; stl: number; blk: number; tov: number; pf: number;
}
