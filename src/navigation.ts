import { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParams = {
  Leagues: undefined;
  Settings: undefined;
  CreateLeague: { code?: string } | undefined;
  RecGame: undefined;
  LeagueDetail: { leagueId: string };
  GamesOnDate: { leagueId: string; dayKey: string; teamId?: string };
  ManageRoster: { leagueId: string };
  EditTeam: { leagueId: string; teamId: string };
  TeamProfile: { leagueId: string; teamId: string };
  NewGame: { leagueId: string };
  SelectLineup: { leagueId: string; gameId: string };
  LiveGame: { leagueId: string; gameId: string; spectator?: boolean };
  BoxScore: { leagueId: string; gameId: string };
  PlayerProfile: { leagueId: string; playerId: string };
};

export type ScreenProps<T extends keyof RootStackParams> = NativeStackScreenProps<RootStackParams, T>;
