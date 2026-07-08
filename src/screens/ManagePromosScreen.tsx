import React, { useState } from 'react';
import { View, ScrollView, Pressable, Alert, TextInput, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Screen, Txt, Card, Button, Toggle, Field } from '../components/ui';
import { useAdmin } from '../store/AdminProvider';
import { colors, space, radius, font } from '../theme';
import { ScreenProps } from '../navigation';
import { Promo } from '../types';
import { usePromos } from '../lib/usePromos';
import { upsertPromo, deletePromo } from '../lib/promos';

const uid = () => `promo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

// Super-Admin-only screen to create and manage sponsor promos.
export default function ManagePromosScreen({ navigation }: ScreenProps<'ManagePromos'>) {
  const { isAdmin } = useAdmin();
  const { promos, reload } = usePromos();
  const [editing, setEditing] = useState<Promo | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isAdmin) return <Screen><View style={{ padding: space(6) }}><Txt k="body" color={colors.muted}>Super Admins only.</Txt></View></Screen>;

  const blank = (): Promo => ({ id: uid(), title: '', active: true, taps: 0, createdAt: Date.now() });

  const pickImage = async () => {
    if (!editing) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo access to set a promo image.'); return; }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, aspect: [16, 9], quality: 0.35, base64: true,
      });
      if (!res.canceled && res.assets[0]) {
        const a = res.assets[0];
        const uri = a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri;
        setEditing({ ...editing, image: uri });
      }
    } catch {
      Alert.alert('Could not open photos', 'Image picking is unavailable on this device.');
    }
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.title.trim()) { Alert.alert('Title required', 'Give the promo a short title.'); return; }
    setBusy(true);
    const ok = await upsertPromo({ ...editing, title: editing.title.trim() });
    setBusy(false);
    if (ok) { setEditing(null); void reload(); }
    else Alert.alert('Save failed', 'Could not save the promo. Check your connection and try again.');
  };

  const remove = (p: Promo) => {
    Alert.alert('Delete promo?', `Remove "${p.title}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deletePromo(p.id); void reload(); } },
    ]);
  };

  // ---- Editor ----
  if (editing) {
    return (
      <Screen scroll>
        <View style={{ padding: space(4), gap: space(3) }}>
          <Txt k="h1">{promos.some(p => p.id === editing.id) ? 'Edit promo' : 'New promo'}</Txt>

          <Pressable onPress={pickImage}
            style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', overflow: 'hidden', backgroundColor: colors.surface, minHeight: 150, alignItems: 'center', justifyContent: 'center' }}>
            {editing.image
              ? <Image source={{ uri: editing.image }} style={{ width: '100%', height: 160 }} resizeMode="cover" />
              : <Txt k="body" color={colors.muted}>+ Tap to add image (16:9)</Txt>}
          </Pressable>
          {editing.image ? (
            <Pressable onPress={() => setEditing({ ...editing, image: undefined })}><Txt k="body" color={colors.red}>Remove image</Txt></Pressable>
          ) : null}

          <Field label="Sponsor name" value={editing.sponsorName ?? ''} onChangeText={(v) => setEditing({ ...editing, sponsorName: v })} placeholder="BPBL Clothing" />
          <Field label="Title" value={editing.title} onChangeText={(v) => setEditing({ ...editing, title: v })} placeholder="New: Pilipinas Caps" />
          <Field label="Tagline (optional)" value={editing.tagline ?? ''} onChangeText={(v) => setEditing({ ...editing, tagline: v })} placeholder="Available now — grab yours" />
          <Field label="Link (optional)" value={editing.link ?? ''} onChangeText={(v) => setEditing({ ...editing, link: v })} placeholder="facebook.com/bpblclothing" />

          <Toggle
            label="Active"
            description="Active promos appear on Home (rotating), the final-score screen, and the spectator view."
            value={editing.active}
            onChange={(v) => setEditing({ ...editing, active: v })}
          />

          <Button title={busy ? 'Saving…' : 'Save promo'} onPress={() => { void save(); }} />
          <Button title="Cancel" kind="ghost" onPress={() => setEditing(null)} />
        </View>
      </Screen>
    );
  }

  // ---- List ----
  return (
    <Screen scroll>
      <View style={{ padding: space(4), gap: space(3) }}>
        <Txt k="h1">Sponsor promos</Txt>
        <Txt k="body" color={colors.muted} style={{ fontSize: 13 }}>
          Promos appear across iTala with a "SPONSORED" label. Active ones rotate on Home and show on the final-score and spectator screens.
        </Txt>

        <Button title="+ New promo" onPress={() => setEditing(blank())} />

        {promos.length === 0 ? (
          <Txt k="body" color={colors.muted}>No promos yet.</Txt>
        ) : promos.map(p => (
          <Card key={p.id}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {p.image ? <Image source={{ uri: p.image }} style={{ width: 60, height: 60, borderRadius: 8 }} resizeMode="cover" /> : null}
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Txt k="h2" style={{ flex: 1 }}>{p.title}</Txt>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.active ? colors.green : colors.muted }} />
                  <Txt k="body" color={colors.muted} style={{ fontSize: 11 }}>{p.active ? 'Active' : 'Off'}</Txt>
                </View>
                {p.sponsorName ? <Txt k="body" color={colors.muted} style={{ fontSize: 12 }}>{p.sponsorName}</Txt> : null}
                <Txt k="body" color={colors.muted} style={{ fontSize: 12, marginTop: 2 }}>👆 {p.taps} tap{p.taps === 1 ? '' : 's'}</Txt>
                <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                  <Pressable onPress={() => setEditing(p)}><Txt k="body" color={colors.brandTeal}>Edit</Txt></Pressable>
                  <Pressable onPress={() => remove(p)}><Txt k="body" color={colors.red}>Delete</Txt></Pressable>
                </View>
              </View>
            </View>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
