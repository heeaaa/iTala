// iTala design tokens — derived from the new brand: a teal body with a lime
// accent (head-dot + speed lines) on a deep near-black ground.
//
// COLOR ROLES (strict — don't reach for the wrong one):
//   teal   = identity / structure  (wordmark, primary scores, headers, focus rings)
//   lime   = live / action ENERGY  (LIVE pip, armed-stat flash, primary CTA gradient)
//   green  = success (made shots)
//   red    = danger  (misses, delete, foul-out warning)
//   yellow = timeout marker in PBP (instantly recognizable)
//   muted  = de-emphasized text / inactive UI
//
// Lime is *rare* on purpose — every place it appears should signal "happening now"
// or "do this." Putting lime on a routine button would burn the eye.

export const colors = {
  // Deep ground — matches the black the new logo sits on
  bg: '#0A0F18',
  surface: '#172033',
  surfaceHi: '#1F2A40',
  line: '#243049',
  text: '#F4F8FF',
  muted: '#8B95B5',

  // Brand
  brandTeal: '#12D7D0',
  brandTealBright: '#0BEFF0',
  brandTealDeep: '#0E9C9A',
  brandLime: '#C7F000',
  brandLimeBright: '#E0FF3D',

  // Functional accents
  accent: '#12D7D0',       // teal — most accent UI
  accentDim: '#0E3F45',    // teal at low intensity (selected pill bg, dim borders)
  accent2: '#C7F000',      // lime — reserve for live/action signals
  accent2Dim: '#3A4400',   // lime at low intensity

  green: '#00D084',
  greenDim: '#0E3A23',
  red: '#FF4D4F',
  yellow: '#FFC24B',
  blue: '#3A78FF',

  // Live broadcast accent (used for the pulsing LIVE pip)
  live: '#C7F000',
};

// Primary action gradient: teal → lime, diagonal. Used on the most important
// CTAs (FINISH GAME, Start Game, segmented active tab, primary Button).
export const brandGradient = ['#12D7D0', '#7CE7A5', '#C7F000'] as const;

// Wordmark underline gradient (deeper, more teal-weighted — quieter than the CTA)
export const wordmarkGradient = ['#0E9C9A', '#12D7D0', '#C7F000'] as const;

// Team palette — teals and lime are reserved for brand UI, so we use a wider
// hue spread for team identity. These won't compete with the brand colors.
// 24 entries so a full 24-team league auto-assigns without repeats. The
// original 8 stay first so previously assigned team colors are unchanged.
export const teamColors = [
  '#3A78FF', // azure
  '#FF6B6B', // coral
  '#9B59FF', // purple
  '#FFC24B', // amber
  '#FF8A3D', // orange
  '#22C7D6', // cyan (teal-adjacent, distinct enough)
  '#FF4D9D', // pink
  '#33C076', // green
  '#E23E57', // crimson
  '#B23A67', // berry
  '#FF9EAF', // rose
  '#FFB4A2', // peach
  '#C0552B', // rust
  '#8B5E34', // brown
  '#F4D35E', // butter
  '#9BB537', // olive
  '#0E8A5F', // emerald
  '#6EE7B7', // mint
  '#4CC9F0', // sky
  '#5B7DB1', // steel
  '#2743A6', // navy
  '#C4B5FD', // lavender
  '#E879F9', // orchid
  '#A21CAF', // plum
];

// Stat pad buttons — semantic, tuned for dark UI
export const statColors = {
  make: '#00D084',     // green for made shots
  makeHi: '#1DDE96',
  miss: '#FF4D4F',     // red for misses
  missHi: '#FF6669',
  reb: '#12D7D0',      // brand teal
  ast: '#FFC24B',      // amber
  stl: '#22C7D6',      // cyan
  blk: '#9B59FF',      // purple
  foul: '#8B95B5',     // muted
  tov: '#FF8A3D',      // orange — a lost possession
  onText: '#0A0F18',   // deep ground for text on a filled colored button
};

// Game rules / limits
export const MAX_PERIOD = 9;
export const LINEUP_SIZE = 5;
export const DEFAULT_FOUL_OUT = 5; // FIBA: foul out on the 5th personal foul

export const font = {
  display: 'Oswald_700Bold',
  displaySemi: 'Oswald_600SemiBold',
  body: 'DMSans_400Regular',
  bodyMed: 'DMSans_500Medium',
  bodyBold: 'DMSans_700Bold',
};

export const radius = { sm: 8, md: 12, lg: 18, pill: 999 };
export const space = (n: number) => n * 4;
