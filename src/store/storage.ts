import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, LocalPrefs } from '../types';

const KEY = 'hoops.state.v1';

export async function loadState(): Promise<AppState | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AppState) : null;
  } catch {
    return null;
  }
}

export async function saveState(state: AppState): Promise<void> {
  try {
    // Strip the transient per-game redo stash — it must never persist or sync.
    const clean = { ...state, leagues: state.leagues.map(({ _redo, ...l }) => l) };
    await AsyncStorage.setItem(KEY, JSON.stringify(clean));
  } catch {
    // best-effort; a failed write should never crash a live game
  }
}

const PREFS_KEY = 'hoops.prefs.v1';

export async function loadPrefs(): Promise<LocalPrefs | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    return raw ? (JSON.parse(raw) as LocalPrefs) : null;
  } catch {
    return null;
  }
}

export async function savePrefs(prefs: LocalPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // best-effort
  }
}
