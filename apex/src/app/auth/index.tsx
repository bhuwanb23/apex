import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AqxOrb } from '@/components/aqx-logo';
import { AppIcon } from '@/components/ui/icon';
import { PillButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DEMO_CREDENTIALS, useAuth } from '@/context/auth';

export default function AuthScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    const result = await login(email, password);
    setBusy(false);
    if (!result.ok) setError(result.error ?? 'Sign in failed');
    // On success the root layout swaps to onboarding/tabs automatically.
  };

  const fillDemo = () => {
    setEmail(DEMO_CREDENTIALS.email);
    setPassword(DEMO_CREDENTIALS.password);
    setError(null);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.hero}>
        <View style={styles.orbGlow} />
        <AqxOrb size={88} />
        <Text style={styles.title}>AQX Sports Intelligence</Text>
        <Text style={styles.subtitle}>Sign in to your dashboard</Text>
      </View>

      <View style={styles.form}>
        <View style={styles.field}>
          <AppIcon name="person.crop.circle.fill" size={17} color="#9AA0B5" />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#9AA0B5"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            editable={!busy}
          />
        </View>
        <View style={styles.field}>
          <AppIcon name="shield.checkered" size={17} color="#9AA0B5" />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#9AA0B5"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            editable={!busy}
            onSubmitEditing={submit}
          />
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <AppIcon name="exclamationmark.triangle.fill" size={14} color="#E5484D" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <PillButton
          label={busy ? 'Signing in…' : 'Sign in'}
          size="lg"
          disabled={busy || !email.trim() || !password}
          onPress={submit}
          icon={busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <AppIcon name="arrow.right" size={18} color="#FFFFFF" />}
        />
      </View>

      <Card style={styles.demoCard}>
        <View style={styles.demoHeader}>
          <AppIcon name="sparkles" size={15} color="#5856D6" />
          <Text style={styles.demoTitle}>Demo account</Text>
        </View>
        <Text style={styles.demoRow}>
          <Text style={styles.demoLabel}>Email </Text>
          {DEMO_CREDENTIALS.email}
        </Text>
        <Text style={styles.demoRow}>
          <Text style={styles.demoLabel}>Password </Text>
          {DEMO_CREDENTIALS.password}
        </Text>
        <Pressable style={styles.demoFill} onPress={fillDemo} disabled={busy}>
          <Text style={styles.demoFillText}>Use demo account</Text>
        </Pressable>
      </Card>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F1F5',
    paddingHorizontal: 28,
    paddingTop: 72,
    paddingBottom: 40,
    justifyContent: 'center',
    gap: 28,
  },
  hero: {
    alignItems: 'center',
    gap: 10,
  },
  orbGlow: {
    position: 'absolute',
    top: -24,
    width: 148,
    height: 148,
    borderRadius: 74,
    backgroundColor: 'rgba(88, 86, 214, 0.16)',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#14121F',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#6E7280',
    textAlign: 'center',
  },
  form: {
    gap: 12,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#14121F',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FDEBEC',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 12.5,
    color: '#7A2B2E',
    lineHeight: 17,
  },
  demoCard: {
    gap: 6,
  },
  demoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  demoTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#14121F',
  },
  demoRow: {
    fontSize: 13,
    color: '#6E7280',
  },
  demoLabel: {
    fontWeight: '700',
    color: '#14121F',
  },
  demoFill: {
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#EFEEFB',
    borderRadius: 999,
    paddingHorizontal: 14,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoFillText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#5856D6',
  },
});
