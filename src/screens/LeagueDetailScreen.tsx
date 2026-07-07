import React, { useState, useEffect } from 'react';
import { View, ScrollView, Pressable, TextInput, Alert, Share } from 'react-native';
import { Screen, Txt, Card, Button, Pill, Segmented, Empty, sep, TeamBadge, LivePip, Toggle } from '../components/ui';
import { useStore, useLeague } from '../store/StoreProvider';
import { useAdmin } from '../store/AdminProvider';
import { colors, space, font, radius } from '../theme';
import { ScreenProps } from '../navigation';
import { standings, leaderboards, leagueAwards, winPctOf, gameScore, gamesPlayedMap } from '../lib/stats';
import { dayKey, dayLabel, uid } from '../lib/format';

export default function LeagueDetailScreen({ route, navigation }: ScreenProps<'LeagueDetail'>) {
  const { leagueId } = route.params;
  const league = useLeague(leagueId);
  const { dispatch, prefs, toggleFavTeam } = useStore();
  const { canScore, isOwner, isAdmin, getLeagueCodes, regenerateLeagueCode, listMembers, removeMember, user } = useAdmin();
  const [tab, setTab] = useState(0);
  const [rosterQuery, setRosterQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupSeason, setDupSeason] = useState('');
  if (!league) return <Screen><Txt k="body">League not found.</Txt></Screen>;

  const scorer = canScore(league);  // owner, co-owner, scorekeeper, super, or shared rec
  const owner = isOwner(league);    // owner / co-owner / super

  // Favorite teams float to the top of the roster and the games filter chips;
  // within each group the order is alphabetical so it never shifts under the
  // user as syncs land.
  const favTeams = new Set(prefs.favTeamIds);
  const teamsFavFirst = [...league.teams].sort(
    (a, b) =>
      Number(favTeams.has(b.id)) - Number(favTeams.has(a.id)) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );

  return (
    <Screen>
      <View style={{ paddingHorizontal: space(4), paddingTop: space(2) }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Txt k="h1">{league.name}</Txt>
            <Txt k="body" color={colors.muted}>{league.season}</Txt>
          </View>
          {owner && (
            <Pressable onPress={() => setShowSettings(v => !v)} hitSlop={10}
              style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: showSettings ? colors.accentDim : colors.surface, borderWidth: 1, borderColor: showSettings ? colors.brandTeal : colors.line }}>
              <Txt k="h2" color={showSettings ? colors.brandTeal : colors.muted}>⚙️</Txt>
            </Pressable>
          )}
        </View>
        {owner && showSettings && (
          <Card style={{ marginTop: space(3) }}>
            <Txt k="label" style={{ marginBottom: space(2) }}>League settings</Txt>
            <Toggle
              label="Track missed shots"
              description="Show the 2PT ✗, 3PT ✗, and FT ✗ buttons in this league's live tracker. Applies to this league only; makes and all other stats are always tracked."
              value={league.trackMisses ?? true}
              onChange={(v) => dispatch({ t: 'SET_LEAGUE_SETTINGS', leagueId, trackMisses: v })}
            />
            <View style={{ height: space(3) }} />
            <Toggle
              label="Track turnovers"
              description="Show the TOV button in this league's live tracker and the TO column in box scores. Applies to this league only."
              value={league.trackTurnovers ?? true}
              onChange={(v) => dispatch({ t: 'SET_LEAGUE_SETTINGS', leagueId, trackTurnovers: v })}
            />
            <View style={{ height: space(3) }} />
            <Toggle
              label="Season complete"
              description="Marks this league as officially ended: awards become final and the Mythical Five is revealed. You can reopen it if games remain."
              value={league.isClosed ?? false}
              onChange={(v) => dispatch({ t: 'SET_LEAGUE_SETTINGS', leagueId, isClosed: v })}
            />

            {/* Archive — Super Admins only. Hides the league everywhere; reversible. */}
            {isAdmin && !league.isShared && (
              <View style={{ marginTop: space(3) }}>
                <Button
                  title={league.isArchived ? '📤 Unarchive league' : '🗄 Archive league'}
                  kind="ghost"
                  onPress={() => {
                    if (league.isArchived) {
                      dispatch({ t: 'SET_LEAGUE_SETTINGS', leagueId, isArchived: false });
                      return;
                    }
                    Alert.alert(
                      'Archive this league?',
                      `"${league.name}" will disappear from everyone's home screen. Nothing is deleted — Super Admins can view and unarchive it anytime from the Archived section on the home page.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Archive', style: 'destructive', onPress: () => dispatch({ t: 'SET_LEAGUE_SETTINGS', leagueId, isArchived: true }) },
                      ],
                    );
                  }}
                />
              </View>
            )}

            {/* Duplicate league — new season, same teams/players/settings, zero games */}
            {!league.isShared && (
              <View style={{ marginTop: space(4), borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space(3) }}>
                <Txt k="label" style={{ marginBottom: 4 }}>New season</Txt>
                {dupOpen ? (
                  <View>
                    <Txt k="body" color={colors.muted} style={{ fontSize: 12, marginBottom: 8 }}>
                      Copies teams, players, coaches, and settings into a fresh league. Games, stats, and standings start at zero.
                    </Txt>
                    <TextInput value={dupSeason} onChangeText={setDupSeason}
                      placeholder="New season name, e.g. Season 2026" placeholderTextColor={colors.muted}
                      style={{ backgroundColor: colors.bg, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, color: colors.text, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 }} />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button title="Cancel" kind="ghost" style={{ flex: 1 }} onPress={() => setDupOpen(false)} />
                      <Button title="Create copy" style={{ flex: 1 }} disabled={!dupSeason.trim()} onPress={() => {
                        const newId = uid();
                        dispatch({ t: 'DUPLICATE_LEAGUE', sourceLeagueId: leagueId, newLeagueId: newId, name: league.name, season: dupSeason.trim() });
                        setDupOpen(false); setDupSeason('');
                        navigation.replace('LeagueDetail', { leagueId: newId });
                      }} />
                    </View>
                  </View>
                ) : (
                  <Button title="⧉ Duplicate league for a new season" kind="ghost" onPress={() => setDupOpen(true)} />
                )}
              </View>
            )}
            {!league.isShared && (
              <MembersSection
                leagueId={leagueId}
                leagueName={league.name}
                myUserId={user?.id}
                getCodes={getLeagueCodes}
                regenerate={regenerateLeagueCode}
                list={listMembers}
                remove={removeMember}
              />
            )}
          </Card>
        )}
        {/* LIVE NOW — front and center, above the tabs */}
        {league.games.filter(g => g.status === 'live').map(g => {
          const h = league.teams.find(t => t.id === g.homeTeamId);
          const a = league.teams.find(t => t.id === g.awayTeamId);
          const sc = gameScore(league, g);
          return (
            <Pressable key={g.id}
              onPress={() => navigation.navigate('LiveGame', { leagueId, gameId: g.id, spectator: !scorer })}
              style={{ marginTop: space(3), backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandTeal, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <LivePip size={8} />
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TeamBadge logo={h?.logo} color={h?.color ?? colors.muted} size={14} />
                <Txt k="body" numberOfLines={1} style={{ flexShrink: 1 }}>{h?.name}</Txt>
                <Txt k="stat" color={colors.accent}>{sc.home}–{sc.away}</Txt>
                <Txt k="body" numberOfLines={1} style={{ flexShrink: 1 }}>{a?.name}</Txt>
                <TeamBadge logo={a?.logo} color={a?.color ?? colors.muted} size={14} />
              </View>
              <Txt k="label" color={colors.brandLime}>WATCH</Txt>
            </Pressable>
          );
        })}
        <View style={{ marginTop: space(3) }}>
          <Segmented options={['Standings', 'Leaders', 'Games', 'Roster']} value={tab} onChange={setTab} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: space(4), paddingBottom: space(28) }}>
        {tab === 2 && (
          league.games.length === 0
            ? <Empty title="No games yet" subtitle="Tap Start Game to keep stats live." />
            : (() => {
                const filtered = teamFilter
                  ? league.games.filter(g => g.homeTeamId === teamFilter || g.awayTeamId === teamFilter)
                  : league.games;
                // group games by local day; sort dates newest-first
                const groups = new Map<string, { ts: number; total: number; live: number; final: number }>();
                for (const g of filtered) {
                  const ts = g.finishedAt ?? g.scheduledAt ?? Date.now();
                  const key = dayKey(ts);
                  const cur = groups.get(key) ?? { ts, total: 0, live: 0, final: 0 };
                  cur.total++;
                  if (g.status === 'live') cur.live++;
                  if (g.status === 'final') cur.final++;
                  cur.ts = Math.max(cur.ts, ts);
                  groups.set(key, cur);
                }
                const ordered = [...groups.entries()].sort((a, b) => b[1].ts - a[1].ts);
                return (
                  <>
                    {league.teams.length >= 3 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}
                        style={{ marginBottom: space(3), flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingRight: space(2) }}>
                        <TeamChip label="All teams" selected={teamFilter === null} onPress={() => setTeamFilter(null)} />
                        {teamsFavFirst.map(t => (
                          <TeamChip key={t.id} label={t.name} logo={t.logo} color={t.color}
                            fav={favTeams.has(t.id)}
                            selected={teamFilter === t.id}
                            onPress={() => setTeamFilter(teamFilter === t.id ? null : t.id)} />
                        ))}
                      </ScrollView>
                    )}
                    {ordered.length === 0 && (
                      <Empty title="No games for this team" subtitle="Try a different team or clear the filter." />
                    )}
                    {ordered.map(([key, info]) => (
                  <Card key={key} style={{ marginBottom: space(3) }}
                    onPress={() => navigation.navigate('GamesOnDate', { leagueId, dayKey: key, teamId: teamFilter ?? undefined })}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Txt k="h2">{dayLabel(info.ts)}</Txt>
                        <Txt k="body" color={colors.muted}>
                          {info.total} game{info.total === 1 ? '' : 's'}
                          {info.live ? ` · ${info.live} live` : ''}
                        </Txt>
                      </View>
                      {info.live ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <LivePip size={7} />
                          <Txt k="label" color={colors.brandLime}>LIVE</Txt>
                        </View>
                      ) : (
                        <Pill label={`${info.final} played`} color={colors.surfaceHi} textColor={colors.muted} />
                      )}
                      <Txt k="h2" color={colors.muted} style={{ marginLeft: 10 }}>›</Txt>
                    </View>
                  </Card>
                    ))}
                  </>
                );
              })()
        )}

        {tab === 0 && (
          <Card style={{ padding: space(2) }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={{ flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 6 }}>
                  <Txt k="label" style={{ width: 150 }}>Team</Txt>
                  <Txt k="label" style={{ width: 48, textAlign: 'center' }}>W-L</Txt>
                  <Txt k="label" style={{ width: 48, textAlign: 'center' }}>PCT</Txt>
                  <Txt k="label" style={{ width: 44, textAlign: 'center' }}>PF</Txt>
                  <Txt k="label" style={{ width: 44, textAlign: 'center' }}>PA</Txt>
                  <Txt k="label" style={{ width: 48, textAlign: 'center' }}>Diff</Txt>
                  <Txt k="label" style={{ width: 44, textAlign: 'center' }}>Strk</Txt>
                </View>
                {standings(league).map((r, i) => (
                  <Pressable key={r.team.id} onPress={() => navigation.navigate('TeamProfile', { leagueId, teamId: r.team.id })}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 6, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line }}>
                    <View style={{ width: 150, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Txt k="stat" color={colors.muted} style={{ width: 16, fontSize: 12 }}>{i + 1}</Txt>
                      <TeamBadge logo={r.team.logo} color={r.team.color} size={14} />
                      <Txt k="body" numberOfLines={1} style={{ flex: 1 }}>{r.team.name}</Txt>
                    </View>
                    <Txt k="stat" style={{ width: 48, textAlign: 'center' }}>{r.wins}-{r.losses}</Txt>
                    <Txt k="stat" color={colors.muted} style={{ width: 48, textAlign: 'center' }}>{winPctOf(r.wins, r.losses).toFixed(3).replace(/^0/, '')}</Txt>
                    <Txt k="stat" color={colors.muted} style={{ width: 44, textAlign: 'center' }}>{r.pf}</Txt>
                    <Txt k="stat" color={colors.muted} style={{ width: 44, textAlign: 'center' }}>{r.pa}</Txt>
                    <Txt k="stat" color={r.diff > 0 ? colors.green : r.diff < 0 ? colors.red : colors.muted} style={{ width: 48, textAlign: 'center' }}>{r.diff > 0 ? `+${r.diff}` : r.diff}</Txt>
                    <Txt k="stat" color={colors.muted} style={{ width: 44, textAlign: 'center' }}>{r.streak}</Txt>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            <Txt k="body" color={colors.muted} style={{ fontSize: 11, marginTop: 6, paddingHorizontal: 6 }}>
              Swipe the table sideways for more · tap a team for its profile
            </Txt>
          </Card>
        )}

        {tab === 1 && (
          (() => {
            const rows = leaderboards(league);
            if (rows.length === 0) return <Empty title="No stats yet" subtitle="Play a game to populate the leaderboard." />;
            const CATS: [string, (r: typeof rows[number]) => number, (r: typeof rows[number]) => string][] = [
              ['Points', r => r.ppg, r => `${r.ppg.toFixed(1)} PPG`],
              ['Rebounds', r => r.rpg, r => `${r.rpg.toFixed(1)} RPG`],
              ['Assists', r => r.apg, r => `${r.apg.toFixed(1)} APG`],
              ['Steals', r => r.spg, r => `${r.spg.toFixed(1)} SPG`],
              ['Blocks', r => r.bpg, r => `${r.bpg.toFixed(1)} BPG`],
              ['3-Pointers Made', r => r.tpm, r => `${r.tpm} 3PM`],
            ];
            // Awards rules: (a) appear only after the league's 6th completed
            // game, (b) winners must come from the top 5 teams in the
            // standings, (c) Mythical Five only when the season is closed.
            const finalsCount = league.games.filter(g => g.status === 'final').length;
            const top5Teams = new Set(standings(league).slice(0, 5).map(r => r.team.id));
            const aw = leagueAwards(league, { restrictTeamIds: top5Teams });
            const AwardRow = ({ icon, title, w }: { icon: string; title: string; w: { name: string; teamName: string; value: string; playerId: string } | null }) => w ? (
              <Pressable onPress={() => navigation.navigate('PlayerProfile', { leagueId, playerId: w.playerId })}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 }}>
                <Txt k="h2">{icon}</Txt>
                <View style={{ flex: 1 }}>
                  <Txt k="label" color={colors.muted} style={{ fontSize: 10 }}>{title}</Txt>
                  <Txt k="body">{w.name} <Txt k="body" color={colors.muted} style={{ fontSize: 12 }}>· {w.teamName}</Txt></Txt>
                </View>
                <Txt k="stat" color={colors.accent} style={{ fontSize: 13 }}>{w.value}</Txt>
              </Pressable>
            ) : null;
            return (
              <>
                {CATS.map(([title, valOf, fmt]) => {
                  const top = [...rows].sort((a, b) => valOf(b) - valOf(a)).filter(r => valOf(r) > 0).slice(0, 5);
                  if (top.length === 0) return null;
                  return (
                    <Card key={title} style={{ marginBottom: space(3) }}>
                      <Txt k="label" style={{ marginBottom: 6 }}>{title}</Txt>
                      {top.map((r, i) => (
                        <Pressable key={r.playerId} onPress={() => navigation.navigate('PlayerProfile', { leagueId, playerId: r.playerId })}
                          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line }}>
                          <Txt k="stat" color={i === 0 ? colors.accent : colors.muted} style={{ width: 20, fontSize: 13 }}>{i + 1}</Txt>
                          <View style={{ flex: 1 }}>
                            <Txt k="body" style={{ fontSize: 14 }}>{r.name}</Txt>
                            <Txt k="body" color={colors.muted} style={{ fontSize: 11 }}>{r.teamName} · {r.gp} GP</Txt>
                          </View>
                          <Txt k="stat" color={i === 0 ? colors.accent : colors.text} style={{ fontSize: 14 }}>{fmt(r)}</Txt>
                        </Pressable>
                      ))}
                    </Card>
                  );
                })}

                {/* 🏆 AWARDS — computed live; appear after 6 games; official at season close */}
                {finalsCount >= 6 && (
                <Card style={{ marginBottom: space(3), borderColor: colors.brandTeal }}>
                  <Txt k="label" color={colors.brandTeal}>🏆 League awards</Txt>
                  <Txt k="body" color={colors.muted} style={{ fontSize: 11, marginBottom: 4 }}>
                    {league.isClosed
                      ? 'Final — season complete. Winners from the top 5 teams in the standings.'
                      : 'Unofficial — rankings AS OF NOW and can still change as games are played. Winners come from the top 5 teams in the standings.'}
                  </Txt>
                  <AwardRow icon="👑" title="SEASON MVP" w={aw.seasonMVP} />
                  <AwardRow icon="🔥" title="PLAYER OF THE WEEK" w={aw.playerOfWeek} />
                  <AwardRow icon="⭐" title="PLAYER OF THE MONTH" w={aw.playerOfMonth} />
                  <AwardRow icon="🎯" title="SCORING CHAMPION" w={aw.scoringChampion} />
                  <AwardRow icon="🤝" title="ASSIST LEADER" w={aw.assistLeader} />
                  <AwardRow icon="🛡" title="BEST DEFENDER" w={aw.bestDefender} />
                  <AwardRow icon="📈" title="MOST IMPROVED" w={aw.mostImproved} />
                  {!league.isClosed && (
                    <Txt k="body" color={colors.muted} style={{ fontSize: 11, marginTop: 6 }}>
                      🏅 The Mythical Five is revealed when the season is marked complete.
                    </Txt>
                  )}
                  {league.isClosed && aw.mythicalFive.length >= 5 && (
                    <View style={{ marginTop: 6, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 }}>
                      <Txt k="label" color={colors.muted} style={{ fontSize: 10, marginBottom: 4 }}>MYTHICAL FIVE</Txt>
                      {aw.mythicalFive.map(w => (
                        <Pressable key={w.playerId} onPress={() => navigation.navigate('PlayerProfile', { leagueId, playerId: w.playerId })} style={{ paddingVertical: 4 }}>
                          <Txt k="body" style={{ fontSize: 14 }}>{w.name} <Txt k="body" color={colors.muted} style={{ fontSize: 12 }}>· {w.teamName} · {w.value}</Txt></Txt>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </Card>
                )}
              </>
            );
          })()
        )}

        {tab === 3 && (
          <>
            <TextInput
              value={rosterQuery} onChangeText={setRosterQuery}
              placeholder="Search team or player name" placeholderTextColor={colors.muted}
              style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, color: colors.text, paddingHorizontal: 14, paddingVertical: 11, fontFamily: font.body, fontSize: 15, marginBottom: space(3) }}
            />
            {(() => {
              const q = rosterQuery.trim().toLowerCase();
              const gpMap = gamesPlayedMap(league); // attendance-aware games played
              const teams = teamsFavFirst.map(t => {
                const teamMatch = t.name.toLowerCase().includes(q);
                const playersOfTeam = t.playerIds
                  .map(pid => league.players.find(x => x.id === pid))
                  .filter(Boolean) as typeof league.players;
                // if the team name matches (or no query), show all its players;
                // otherwise show only players whose name matches.
                const visiblePlayers = (!q || teamMatch)
                  ? playersOfTeam
                  : playersOfTeam.filter(p => p.name.toLowerCase().includes(q));
                return { t, teamMatch, visiblePlayers };
              }).filter(({ teamMatch, visiblePlayers }) => !q || teamMatch || visiblePlayers.length > 0);

              if (q && teams.length === 0) {
                return <Empty title="No matches" subtitle={`Nothing matches "${rosterQuery}".`} />;
              }
              return teams.map(({ t, visiblePlayers }) => (
                <Card key={t.id} style={{ marginBottom: space(3) }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <Pressable onPress={() => navigation.navigate('TeamProfile', { leagueId, teamId: t.id })}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <TeamBadge logo={t.logo} color={t.color} size={18} />
                      <Txt k="h2" style={{ flex: 1 }}>{t.name}</Txt>
                    </Pressable>
                    {/* Favorite star: pins this team to the top of rosters and filters */}
                    <Pressable onPress={() => toggleFavTeam(t.id)} hitSlop={10} style={{ padding: 2 }}>
                      <Txt k="h2" color={favTeams.has(t.id) ? colors.yellow : colors.muted}>{favTeams.has(t.id) ? '★' : '☆'}</Txt>
                    </Pressable>
                    {/* close the profile-link pressable's sibling group */}
                    {t.teamOnly ? <Pill label="opponent" color={colors.surfaceHi} textColor={colors.muted} /> : null}
                    {scorer && (
                      <Pressable onPress={() => navigation.navigate('EditTeam', { leagueId, teamId: t.id })} hitSlop={8}
                        style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line }}>
                        <Txt k="body" style={{ fontSize: 13 }}>✎ Edit</Txt>
                      </Pressable>
                    )}
                  </View>
                  {visiblePlayers.map(p => (
                    <Pressable key={p.id} onPress={() => navigation.navigate('PlayerProfile', { leagueId, playerId: p.id })}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 10 }}>
                      <Txt k="stat" color={colors.muted} style={{ width: 34 }}>{p.number ? `#${p.number}` : '—'}</Txt>
                      <Txt k="body" style={{ flex: 1 }}>{p.name}</Txt>
                      <Txt k="body" color={colors.muted} style={{ fontSize: 11 }}>{gpMap.get(p.id) ?? 0} GP</Txt>
                      <Txt k="body" color={colors.muted}>›</Txt>
                    </Pressable>
                  ))}
                  {visiblePlayers.length === 0 && <Txt k="body" color={colors.muted}>No players.</Txt>}
                </Card>
              ));
            })()}
            {scorer && (
              <Button title="+ Add / edit teams & players" kind="ghost" onPress={() => navigation.navigate('ManageRoster', { leagueId })} />
            )}
          </>
        )}
      </ScrollView>

      {scorer && (
        <View style={{ position: 'absolute', left: space(4), right: space(4), bottom: space(6) }}>
          <Button title="▶  Start Game" onPress={() => navigation.navigate('NewGame', { leagueId })}
            disabled={league.teams.length < 2} />
        </View>
      )}
    </Screen>
  );
}

// Horizontal filter chip for the Games tab. Favorites carry a small star so
// the pinned-first ordering is legible.
function TeamChip({ label, logo, color, fav, selected, onPress }:
  { label: string; logo?: string; color?: string; fav?: boolean; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 7,
        paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999,
        backgroundColor: selected ? colors.accentDim : colors.surface,
        borderWidth: 1, borderColor: selected ? colors.brandTeal : colors.line,
      }}>
      {color ? <TeamBadge logo={logo} color={color} size={12} /> : null}
      <Txt k="body" color={selected ? colors.brandTeal : colors.text} style={{ fontSize: 13 }}>
        {fav ? '★ ' : ''}{label}
      </Txt>
    </Pressable>
  );
}

// Owner-only: invite codes + member management inside League Settings.
// Codes are per-role; sharing drops them straight into the team group chat.
function MembersSection({ leagueId, leagueName, myUserId, getCodes, regenerate, list, remove }: {
  leagueId: string;
  leagueName: string;
  myUserId?: string;
  getCodes: (id: string) => Promise<{ owner: string; scorekeeper: string } | null>;
  regenerate: (id: string, role: 'owner' | 'scorekeeper') => Promise<string | null>;
  list: (id: string) => Promise<{ user_id: string; role: string; name: string; email: string | null }[] | null>;
  remove: (id: string, userId: string) => Promise<boolean>;
}) {
  const [codes, setCodes] = useState<{ owner: string; scorekeeper: string } | null>(null);
  const [members, setMembers] = useState<{ user_id: string; role: string; name: string; email: string | null }[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = async () => {
    const [c, m] = await Promise.all([getCodes(leagueId), list(leagueId)]);
    setCodes(c);
    if (m) setMembers(m);
    setLoaded(true);
  };
  useEffect(() => { void refresh(); /* eslint-disable-line */ }, [leagueId]);

  const shareCode = (role: 'owner' | 'scorekeeper', code: string) => {
    const roleLabel = role === 'owner' ? 'co-owner' : 'scorekeeper';
    void Share.share({ message: `Join "${leagueName}" on iTala as a ${roleLabel}! Sign in with Google or Apple, open the profile menu → Enter invite code, and use: ${code}` });
  };

  const confirmRegen = (role: 'owner' | 'scorekeeper') => {
    Alert.alert('Regenerate code?', `The current ${role === 'owner' ? 'co-owner' : 'scorekeeper'} code stops working immediately. People who already joined keep their access.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Regenerate', style: 'destructive', onPress: () => { void (async () => {
        const c = await regenerate(leagueId, role);
        if (c) setCodes(prev => prev ? { ...prev, [role]: c } : prev);
      })(); } },
    ]);
  };

  const confirmRemove = (m: { user_id: string; role: string; name: string }) => {
    Alert.alert('Remove member?', `${m.name} will lose ${m.role === 'owner' ? 'ownership of' : 'scorekeeper access to'} this league.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { void (async () => {
        const ok = await remove(leagueId, m.user_id);
        if (ok) setMembers(prev => prev.filter(x => x.user_id !== m.user_id));
        else Alert.alert('Could not remove', 'A league must keep at least one owner.');
      })(); } },
    ]);
  };

  const CodeRow = ({ role, code }: { role: 'owner' | 'scorekeeper'; code: string }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Txt k="body" style={{ fontSize: 13 }}>{role === 'owner' ? 'Co-owner code' : 'Scorekeeper code'}</Txt>
        <Txt k="stat" color={colors.accent} style={{ fontSize: 18, letterSpacing: 3 }}>{code}</Txt>
      </View>
      <Pressable onPress={() => shareCode(role, code)} hitSlop={8}
        style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line }}>
        <Txt k="body" style={{ fontSize: 13 }}>Share</Txt>
      </Pressable>
      <Pressable onPress={() => confirmRegen(role)} hitSlop={8}
        style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line }}>
        <Txt k="body" style={{ fontSize: 13 }}>↻</Txt>
      </Pressable>
    </View>
  );

  return (
    <View style={{ marginTop: space(4), borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space(3) }}>
      <Txt k="label" style={{ marginBottom: 4 }}>Invite codes</Txt>
      <Txt k="body" color={colors.muted} style={{ fontSize: 12, marginBottom: 4 }}>
        Share a code in your group chat — anyone who redeems it joins this league in that role.
      </Txt>
      {codes ? (
        <>
          <CodeRow role="owner" code={codes.owner} />
          <CodeRow role="scorekeeper" code={codes.scorekeeper} />
        </>
      ) : (
        <Txt k="body" color={colors.muted} style={{ fontSize: 13, paddingVertical: 8 }}>{loaded ? 'Could not load codes — check your connection.' : 'Loading…'}</Txt>
      )}

      <Txt k="label" style={{ marginTop: space(3), marginBottom: 4 }}>Members</Txt>
      {members.length === 0 ? (
        <Txt k="body" color={colors.muted} style={{ fontSize: 13, paddingVertical: 6 }}>{loaded ? 'Just you so far — share a code above.' : 'Loading…'}</Txt>
      ) : members.map(m => (
        <View key={m.user_id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Txt k="body" style={{ fontSize: 14 }} numberOfLines={1}>{m.name}{m.user_id === myUserId ? ' (you)' : ''}</Txt>
            {m.email ? <Txt k="body" color={colors.muted} style={{ fontSize: 11 }} numberOfLines={1}>{m.email}</Txt> : null}
          </View>
          <Pill label={m.role === 'owner' ? 'OWNER' : 'SCOREKEEPER'} color={m.role === 'owner' ? colors.accentDim : colors.surfaceHi} textColor={m.role === 'owner' ? colors.brandTeal : colors.muted} />
          {m.user_id !== myUserId && (
            <Pressable onPress={() => confirmRemove(m)} hitSlop={8}
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.red }}>
              <Txt k="body" color={colors.red} style={{ fontSize: 13 }}>✕</Txt>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}
