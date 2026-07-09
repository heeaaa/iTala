import { getSupabase, SYNC_ENABLED } from '../sync/supabase';
import { Promo } from '../types';

// Data-access layer for sponsor promos. Kept separate from the league state
// tree because promos are GLOBAL (Super-Admin managed), not league-scoped.

interface PromoRow {
  id: string; sponsor_name: string | null; title: string; tagline: string | null;
  image: string | null; link: string | null; active: boolean; show_on_home: boolean; taps: number; created_at: number;
}

const fromRow = (r: PromoRow): Promo => ({
  id: r.id, sponsorName: r.sponsor_name ?? undefined, title: r.title,
  tagline: r.tagline ?? undefined, image: r.image ?? undefined, link: r.link ?? undefined,
  active: r.active, showOnHome: r.show_on_home, taps: r.taps, createdAt: r.created_at,
});

export async function fetchPromos(): Promise<Promo[]> {
  if (!SYNC_ENABLED) return [];
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from('promos').select('*').order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as PromoRow[]).map(fromRow);
}

export async function upsertPromo(p: Promo): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { error } = await sb.from('promos').upsert({
    id: p.id, sponsor_name: p.sponsorName ?? null, title: p.title,
    tagline: p.tagline ?? null, image: p.image ?? null, link: p.link ?? null,
    active: p.active, show_on_home: p.showOnHome ?? false, taps: p.taps, created_at: p.createdAt,
  });
  return !error;
}

export async function deletePromo(id: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { error } = await sb.from('promos').delete().eq('id', id);
  return !error;
}

// Fire-and-forget tap counter (uses the SECURITY DEFINER RPC so non-admins can
// increment without any other write access).
export function bumpPromoTap(id: string): void {
  const sb = getSupabase();
  if (!sb) return;
  void sb.rpc('bump_promo_tap', { p_id: id }).then(() => {}, () => {});
}
