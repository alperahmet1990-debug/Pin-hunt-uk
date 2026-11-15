/**
 * Admin → Events (#613): add, edit, publish/unpublish and delete the pin
 * events Home's "What's Happening" and the /events page show. Drafts are
 * only visible here. The database (migration 081, RLS) lets admins alone
 * write; this screen sits behind the admin layout guard.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type KeyboardTypeOptions,
} from 'react-native';
import { Stack } from 'expo-router';
import { EVENT_LIMITS, isEventsUnavailable, type PinEvent, type PinEventInput } from '@workspace/pin-repository';
import { useColors } from '@/hooks/useColors';
import { getEventService } from '@/lib/eventService';
import { formatEventDateParts } from '@/utils/events';

type Form = Required<{ [K in keyof PinEventInput]: NonNullable<PinEventInput[K]> }>;

const EMPTY: Form = {
  title: '', description: '', eventDate: '', endDate: '', time: '', location: '', country: 'UK',
  eventType: '', badgeLabel: '', sourceName: '', sourceUrl: '',
  featured: false, rumour: false, whenText: '', published: false,
};

function formFromEvent(e: PinEvent): Form {
  return {
    title: e.title, description: e.description, eventDate: e.eventDate, endDate: e.endDate ?? '',
    time: e.time ?? '', location: e.location ?? '', country: e.country ?? '', eventType: e.eventType,
    badgeLabel: e.badgeLabel, sourceName: e.sourceName ?? '', sourceUrl: e.sourceUrl ?? '',
    featured: e.featured, rumour: e.rumour, whenText: e.whenText ?? '', published: e.published,
  };
}

function whenLine(e: PinEvent): string {
  if (e.rumour) return e.whenText ? `Rumoured · ${e.whenText}` : 'Rumoured';
  const { day, month } = formatEventDateParts({ eventDate: e.eventDate, endDate: e.endDate ?? undefined });
  return `${day} ${month} ${e.eventDate.slice(0, 4)}${e.time ? ` · ${e.time}` : ''}`;
}

export default function AdminEventsScreen() {
  const colors = useColors();
  const service = getEventService();
  const [events, setEvents] = useState<PinEvent[]>([]);
  const [loading, setLoading] = useState(Boolean(service));
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(!service);
  // null: list only; 'new': adding; an id: editing that event.
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!service) return;
    try {
      setError(null);
      setEvents(await service.getAdminEvents());
    } catch (e) {
      if (isEventsUnavailable(e)) setUnavailable(true);
      else setError(e instanceof Error ? e.message : 'Could not load events.');
    } finally {
      setLoading(false);
    }
  }, [service]);

  useEffect(() => { void load(); }, [load]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm(f => ({ ...f, [key]: value }));

  const startNew = () => { setForm(EMPTY); setEditing('new'); setError(null); };
  const startEdit = (e: PinEvent) => { setForm(formFromEvent(e)); setEditing(e.id); setError(null); };

  const save = async () => {
    if (!service || !editing) return;
    try {
      setSaving(true);
      setError(null);
      await service.saveEvent(form, editing === 'new' ? undefined : editing);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the event.');
    } finally {
      setSaving(false);
    }
  };

  const togglePublished = async (e: PinEvent) => {
    if (!service) return;
    try {
      setError(null);
      const updated = await service.setEventPublished(e.id, !e.published);
      setEvents(list => list.map(x => (x.id === e.id ? updated : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the event.');
    }
  };

  const remove = async (id: string) => {
    if (!service) return;
    try {
      setError(null);
      await service.deleteEvent(id);
      setConfirmDelete(null);
      setEvents(list => list.filter(x => x.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the event.');
    }
  };

  const field = (
    key: Exclude<keyof Form, 'featured' | 'rumour' | 'published'>,
    label: string,
    opts: { placeholder?: string; multiline?: boolean; max?: number; keyboardType?: KeyboardTypeOptions; hint?: string } = {},
  ) => (
    <View style={styles.field} key={key}>
      <Text style={[styles.label, { color: colors.homeInk }]}>{label}</Text>
      <TextInput
        value={form[key]}
        onChangeText={v => set(key, v)}
        placeholder={opts.placeholder}
        placeholderTextColor={colors.homeMuted}
        accessibilityLabel={label}
        multiline={opts.multiline}
        maxLength={opts.max}
        keyboardType={opts.keyboardType}
        autoCapitalize={key === 'sourceUrl' ? 'none' : key === 'badgeLabel' ? 'characters' : 'sentences'}
        autoCorrect={key !== 'sourceUrl'}
        style={[
          styles.input,
          opts.multiline && styles.inputMultiline,
          { color: colors.homeInk, borderColor: colors.homeLine, backgroundColor: colors.homeSurface },
        ]}
      />
      {opts.hint ? <Text style={[styles.hint, { color: colors.homeMuted }]}>{opts.hint}</Text> : null}
    </View>
  );

  const toggle = (key: 'featured' | 'rumour' | 'published', label: string, hint: string) => (
    <View style={styles.toggleRow} key={key}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, { color: colors.homeInk }]}>{label}</Text>
        <Text style={[styles.hint, { color: colors.homeMuted }]}>{hint}</Text>
      </View>
      <Switch
        value={form[key]}
        onValueChange={v => set(key, v)}
        accessibilityLabel={label}
        trackColor={{ true: colors.homeCoral, false: colors.homeLine }}
      />
    </View>
  );

  const renderForm = () => (
    <View style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeCoral }]}>
      <Text style={[styles.title, { color: colors.homeInk }]}>{editing === 'new' ? 'New event' : 'Edit event'}</Text>
      {field('title', 'Title', { placeholder: 'Disney Store Pin Trading Event', max: EVENT_LIMITS.title })}
      {field('description', 'Description', { multiline: true, max: EVENT_LIMITS.description })}
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>{field('eventDate', 'Start date', { placeholder: 'YYYY-MM-DD', max: 10, keyboardType: 'numbers-and-punctuation' })}</View>
        <View style={{ flex: 1 }}>{field('endDate', 'End date', { placeholder: 'Optional', max: 10, keyboardType: 'numbers-and-punctuation' })}</View>
      </View>
      {field('time', 'Time', { placeholder: 'e.g. 7am–9:45am', max: EVENT_LIMITS.time })}
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>{field('location', 'Location', { placeholder: 'Oxford Street, London', max: EVENT_LIMITS.location })}</View>
        <View style={{ flex: 1 }}>{field('country', 'Country', { placeholder: 'UK', max: EVENT_LIMITS.country })}</View>
      </View>
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>{field('eventType', 'Event type', { placeholder: 'Pin Event', max: EVENT_LIMITS.eventType })}</View>
        <View style={{ flex: 1 }}>{field('badgeLabel', 'Badge', { placeholder: 'EVENT', max: EVENT_LIMITS.badgeLabel })}</View>
      </View>
      {field('sourceName', 'Source', { placeholder: 'Who announced it', max: EVENT_LIMITS.sourceName })}
      {field('sourceUrl', 'Link', { placeholder: 'https://…', max: EVENT_LIMITS.sourceUrl, keyboardType: 'url', hint: '“View event” opens this. https only.' })}
      {toggle('rumour', 'Rumoured', 'Not dated yet: shown last, with a rough date. The dates decide when it stops showing.')}
      {form.rumour ? field('whenText', 'Rough date', { placeholder: 'December · date TBC', max: EVENT_LIMITS.whenText }) : null}
      {toggle('featured', 'Featured', 'Pinned to the front of the list.')}
      {toggle('published', 'Published', 'Off: a draft only admins see.')}
      <View style={styles.row}>
        <TouchableOpacity
          disabled={saving}
          onPress={() => { setEditing(null); setError(null); }}
          accessibilityRole="button"
          style={[styles.button, { borderColor: colors.homeLine }]}
        >
          <Text style={[styles.buttonText, { color: colors.homeMuted }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={saving}
          onPress={() => void save()}
          accessibilityRole="button"
          style={[styles.button, { backgroundColor: colors.homeCoral, borderColor: colors.homeCoral }]}
        >
          {saving
            ? <ActivityIndicator size="small" color={colors.homeSurface} />
            : <Text style={[styles.buttonText, { color: colors.homeSurface }]}>{editing === 'new' ? 'Add event' : 'Save'}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderEvent = (e: PinEvent) => {
    if (editing === e.id) return <View key={e.id}>{renderForm()}</View>;
    const today = new Date().toISOString().slice(0, 10);
    const over = (e.endDate ?? e.eventDate) < today;
    return (
      <View key={e.id} style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
        <View style={styles.badges}>
          <Text style={[styles.badge, e.published
            ? { color: colors.homeCoralDeep, backgroundColor: colors.homeAqua }
            : { color: colors.homeSandInk, backgroundColor: colors.homeWarmSurface }]}
          >
            {e.published ? 'Published' : 'Draft'}
          </Text>
          {over ? <Text style={[styles.badge, { color: colors.homeMuted, backgroundColor: colors.homeLine }]}>Over</Text> : null}
          {e.featured ? <Text style={[styles.badge, { color: colors.homeCoralDeep, backgroundColor: colors.homeAqua }]}>Featured</Text> : null}
        </View>
        <Text style={[styles.title, { color: colors.homeInk }]}>{e.title}</Text>
        <Text style={[styles.meta, { color: colors.homeMuted }]}>{whenLine(e)}</Text>
        {e.location ? <Text style={[styles.meta, { color: colors.homeMuted }]}>{[e.location, e.country].filter(Boolean).join(', ')}</Text> : null}
        {confirmDelete === e.id ? (
          <>
            <Text style={[styles.meta, { color: colors.homeInk }]}>Delete “{e.title}”? This can’t be undone.</Text>
            <View style={styles.row}>
              <TouchableOpacity onPress={() => setConfirmDelete(null)} accessibilityRole="button" style={[styles.button, { borderColor: colors.homeLine }]}>
                <Text style={[styles.buttonText, { color: colors.homeMuted }]}>Keep it</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void remove(e.id)}
                accessibilityRole="button"
                style={[styles.button, { backgroundColor: colors.destructive, borderColor: colors.destructive }]}
              >
                <Text style={[styles.buttonText, { color: colors.homeSurface }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.row}>
            <TouchableOpacity onPress={() => startEdit(e)} accessibilityRole="button" accessibilityLabel={`Edit ${e.title}`} style={[styles.button, { borderColor: colors.homeLine }]}>
              <Text style={[styles.buttonText, { color: colors.homeInk }]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void togglePublished(e)}
              accessibilityRole="button"
              accessibilityLabel={`${e.published ? 'Unpublish' : 'Publish'} ${e.title}`}
              style={[styles.button, { borderColor: colors.homeLine }]}
            >
              <Text style={[styles.buttonText, { color: colors.homeInk }]}>{e.published ? 'Unpublish' : 'Publish'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setConfirmDelete(e.id)} accessibilityRole="button" accessibilityLabel={`Delete ${e.title}`} style={[styles.button, { borderColor: colors.homeLine }]}>
              <Text style={[styles.buttonText, { color: colors.destructive }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.homeBackground }]}>
      <Stack.Screen options={{ title: 'Events' }} />
      {unavailable ? (
        <Text style={[styles.empty, { color: colors.homeMuted }]}>
          Events aren’t set up on this server yet (migration 081).
        </Text>
      ) : loading ? (
        <ActivityIndicator style={styles.loading} color={colors.homeCoral} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} />}
        >
          <Text style={[styles.intro, { color: colors.homeMuted }]}>
            Published events that haven’t ended show on Home and in What’s Happening. Drafts only show here.
          </Text>
          {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
          {editing === 'new' ? renderForm() : (
            <TouchableOpacity
              onPress={startNew}
              disabled={editing !== null}
              accessibilityRole="button"
              style={[styles.addButton, { backgroundColor: colors.homeCoral, opacity: editing !== null ? 0.5 : 1 }]}
            >
              <Text style={[styles.buttonText, { color: colors.homeSurface }]}>Add an event</Text>
            </TouchableOpacity>
          )}
          {events.length === 0 && editing !== 'new'
            ? <Text style={[styles.empty, { color: colors.homeMuted }]}>No events yet.</Text>
            : events.map(renderEvent)}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loading: { marginTop: 40 },
  list: { padding: 16, gap: 12, paddingBottom: 48 },
  intro: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  card: { padding: 14, borderWidth: 1, borderRadius: 12, gap: 6 },
  badges: { flexDirection: 'row', gap: 6 },
  badge: { fontSize: 11, fontFamily: 'Inter_600SemiBold', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  title: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  meta: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  field: { gap: 4, marginTop: 4 },
  pair: { flexDirection: 'row', gap: 8 },
  label: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  hint: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  input: { minHeight: 44, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderRadius: 8, fontSize: 14, fontFamily: 'Inter_400Regular' },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  button: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8 },
  addButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  buttonText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  error: { fontSize: 13, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  empty: { padding: 40, fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});
