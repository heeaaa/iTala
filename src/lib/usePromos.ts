import { useEffect, useState, useCallback } from 'react';
import { Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Promo } from '../types';
import { fetchPromos, bumpPromoTap } from './promos';

// Loads promos once (and exposes a manual reload). Consumers filter to active.
export function usePromos() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const list = await fetchPromos();
    setPromos(list);
    setLoaded(true);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  // Screens stay mounted while you navigate deeper (e.g. Home → Manage Promos
  // → back), so a mount-only fetch goes stale the moment promos are edited.
  // Re-pull on every focus so toggling "Show on Home" reflects immediately.
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  return { promos, activePromos: promos.filter(p => p.active), loaded, reload };
}

// A tap: always count it (ROI), and open the link if there is one.
export function onPromoTap(promo: Promo): void {
  bumpPromoTap(promo.id);
  if (promo.link) {
    const url = /^https?:\/\//i.test(promo.link) ? promo.link : `https://${promo.link}`;
    void Linking.openURL(url).catch(() => {});
  }
}
