/**
 * Settings screen — connect to cadre, apply seed, create strand.
 */

import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useCadre } from '../src/use-cadre';

/** Generate a simple random UUID (good enough for demo). */
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function SettingsScreen() {
  const cadre = useCadre();

  const [partyId, setPartyId] = useState('');
  const [bootstrapAddr, setBootstrapAddr] = useState('');
  const [seedInput, setSeedInput] = useState('');

  // ── Connect / Disconnect ───────────────────────────────────────────────

  const handleConnect = async () => {
    const pid = partyId.trim() || uuid();
    setPartyId(pid);
    const addrs = bootstrapAddr.trim() ? [bootstrapAddr.trim()] : [];
    try {
      await cadre.start({ partyId: pid, bootstrapAddrs: addrs });
    } catch (err) {
      Alert.alert('Connection failed', String(err));
    }
  };

  const handleDisconnect = async () => {
    await cadre.stop();
  };

  // ── Seed ───────────────────────────────────────────────────────────────

  const handleApplySeed = async () => {
    const seed = seedInput.trim();
    if (!seed) return;
    try {
      await cadre.applySeed(seed);
      setSeedInput('');
      Alert.alert('Seed applied', 'Peer cache updated');
    } catch (err) {
      Alert.alert('Seed failed', String(err));
    }
  };

  // ── Strand ─────────────────────────────────────────────────────────────

  const handleCreateStrand = async () => {
    try {
      const id = uuid();
      await cadre.createStrand(id);
      Alert.alert('Strand created', `ID: ${id.slice(0, 8)}…`);
    } catch (err) {
      Alert.alert('Strand creation failed', String(err));
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  const connected = cadre.status === 'connected';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Node info */}
      <Section title="Node">
        {connected ? (
          <>
            <InfoRow label="Status" value="Connected" color="#4caf50" />
            <InfoRow label="Peer ID" value={cadre.peerId ?? '—'} />
            <InfoRow label="Strands" value={String(cadre.strands.size)} />
            <Btn label="Disconnect" onPress={handleDisconnect} color="#f44336" />
          </>
        ) : (
          <>
            <InfoRow label="Status" value={cadre.status} color="#ff9800" />
            <LabelledInput label="Party ID" value={partyId} onChangeText={setPartyId} placeholder="auto-generated if empty" />
            <LabelledInput label="Bootstrap addr" value={bootstrapAddr} onChangeText={setBootstrapAddr} placeholder="/ip4/…/tcp/…/ws/p2p/…" />
            <Btn label="Connect" onPress={handleConnect} disabled={cadre.status === 'connecting'} />
          </>
        )}
      </Section>

      {/* Seed */}
      {connected && (
        <Section title="Seed Bootstrap">
          <LabelledInput label="Paste seed" value={seedInput} onChangeText={setSeedInput} placeholder="base64url seed string" multiline />
          <Btn label="Apply Seed" onPress={handleApplySeed} disabled={!seedInput.trim()} />
        </Section>
      )}

      {/* Strand */}
      {connected && (
        <Section title="Strands">
          {[...cadre.strands.entries()].map(([id, s]) => (
            <InfoRow key={id} label={id.slice(0, 8)} value={s.status} />
          ))}
          <Btn label="Create Chat Strand" onPress={handleCreateStrand} />
        </Section>
      )}

      {cadre.error && <Text style={styles.error}>{cadre.error}</Text>}
    </ScrollView>
  );
}

// ── Reusable sub-components ──────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function InfoRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, color ? { color } : null]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function LabelledInput(props: { label: string; value: string; onChangeText: (t: string) => void; placeholder?: string; multiline?: boolean }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput style={styles.input} value={props.value} onChangeText={props.onChangeText} placeholder={props.placeholder} placeholderTextColor="#666" multiline={props.multiline} />
    </View>
  );
}

function Btn({ label, onPress, disabled, color }: { label: string; onPress: () => void; disabled?: boolean; color?: string }) {
  return (
    <Pressable style={[styles.btn, { backgroundColor: color ?? '#6c63ff' }, disabled && styles.btnDisabled]} onPress={onPress} disabled={disabled}>
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  content: { padding: 16 },
  section: { marginBottom: 24 },
  sectionTitle: { color: '#6c63ff', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { color: '#aaa', fontSize: 13, marginBottom: 4 },
  value: { color: '#fff', fontSize: 13, flexShrink: 1, textAlign: 'right' },
  input: { backgroundColor: '#2a2a3e', color: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 },
  btn: { borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 8 },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  error: { color: '#f44336', textAlign: 'center', marginTop: 12 },
});

