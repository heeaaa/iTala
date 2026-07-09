// ============================================================================
// Bulk roster parser. Deterministic, conservative: it never guesses
// destructively — anything suspicious is FLAGGED for the review screen, and
// unparseable content is kept verbatim as a name so the user can fix it.
//
// Supported player formats (all seen in real pastes):
//   "Juan Dela Cruz-17"                name-dash-number
//   "Juan Dela Cruz 22"                name-space-number
//   "1:Juan Dela Cruz #24"             index-colon-name-hash-number
//   "Juan Dela Cruz#14"                hash with no space
//   "Juan Dela Cruz # 2"               hash with space
//   "Juan Dela Cruz (Juan) #16"        nickname (dropped)
//   "11. Juan Dela Cruz#3 - Juan"      trailing nickname after number (dropped)
// Rules: leading index (1. / 2: / 3) / "10 ") stripped when a real number
// exists elsewhere; jersey numbers kept as written incl. leading zeros;
// missing number is fine (NOT flagged); unusual numbers are fine (NOT
// flagged); slash in name is flagged; a no-digit line between players is
// flagged as a possible stray.
// ============================================================================

export interface ParsedPlayer {
  name: string;
  number: string;        // as written, '' when absent
  flag?: string;         // one-line reason shown on the review screen
  raw: string;           // original line, for reference
}
export interface ParsedTeam { name: string; players: ParsedPlayer[] }

const hasDigit = (s: string) => /\d/.test(s);

// Parse one player line into { name, number }.
function parsePlayerLine(line: string): { name: string; number: string } {
  let s = line.trim();

  // 1) Extract the jersey number.
  let number = '';
  let nameSpan = s;

  const hash = s.match(/#\s*(\d+)/);            // "#24", "# 2", "Juan#14"
  if (hash && hash.index !== undefined) {
    number = hash[1];
    nameSpan = s.slice(0, hash.index);          // drop everything from # on
  } else {
    const dash = s.match(/[-–]\s*(\d+)\s*$/);   // "Juan-17", "Juan- 19"
    if (dash && dash.index !== undefined) {
      number = dash[1];
      nameSpan = s.slice(0, dash.index);
    } else {
      const tail = s.match(/\s(\d+)\s*$/);      // "Juan 22"
      if (tail && tail.index !== undefined) {
        number = tail[1];
        nameSpan = s.slice(0, tail.index);
      }
    }
  }

  // 2) Strip a leading index from the name span — "1.", "2:", "3)", "10 ".
  //    Only when it looks like an index (short digits + separator), so a
  //    number-less line that's just a name is untouched.
  nameSpan = nameSpan.replace(/^\s*\d{1,3}\s*[.:)\]]\s*/, '');
  // bare "10 Juan ..." (digits + space, no separator) — only strip when a
  // real jersey number was found elsewhere, otherwise it could BE the number.
  if (number) nameSpan = nameSpan.replace(/^\s*\d{1,3}\s+/, '');

  // 3) Drop nicknames/parenthesised segments and dangling separators.
  nameSpan = nameSpan.replace(/\(.*?\)/g, ' ');
  nameSpan = nameSpan.replace(/[-–#]\s*$/, ' ');
  const name = nameSpan.replace(/\s+/g, ' ').trim();

  return { name, number };
}

export function parseRoster(text: string): ParsedTeam[] {
  const rawLines = text.split(/\r?\n/);
  const teams: ParsedTeam[] = [];
  let current: ParsedTeam | null = null;
  let prevBlank = true; // start-of-text behaves like after a blank line

  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line) { prevBlank = true; continue; }

    if (!hasDigit(line)) {
      if (prevBlank || !current || current.players.length === 0) {
        // Preceded by a blank line (or nothing yet) → a team header.
        current = { name: line.replace(/\s+/g, ' '), players: [] };
        teams.push(current);
      } else {
        // Sandwiched between player lines → possible stray (the "Jun" case).
        current.players.push({
          name: line, number: '', raw: line,
          flag: 'Possible stray line — is this a player?',
        });
      }
      prevBlank = false;
      continue;
    }

    // Player line. If no team has started yet, create an implicit one so
    // nothing is lost; the user can rename it on the review screen.
    if (!current) {
      current = { name: `Team ${teams.length + 1}`, players: [] };
      teams.push(current);
    }
    const { name, number } = parsePlayerLine(line);
    const player: ParsedPlayer = { name: name || line, number, raw: line };
    if (player.name.includes('/')) {
      player.flag = 'Slash in name — one player or two?';
    }
    current.players.push(player);
    prevBlank = false;
  }

  // Drop teams that ended up completely empty (e.g. trailing header).
  return teams.filter(t => t.players.length > 0 || t.name);
}
