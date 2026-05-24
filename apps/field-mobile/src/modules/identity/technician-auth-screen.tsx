import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from 'react-native';
import { getInitialFieldApiBaseUrl } from '@/lib/api-base-url';
import { loginToFieldApi, type EmployeeSummary } from '@/lib/identity-api';
import { TechnicianWorkspaceScreen } from '@/modules/operations/technician-workspace-screen';

const demoAccounts = [
  { label: 'Technician', email: 'tech@bellfield.local', password: 'bellfield-tech' },
  { label: 'Dispatcher', email: 'dispatcher@bellfield.local', password: 'bellfield-dispatch' },
  { label: 'Owner', email: 'owner@bellfield.local', password: 'bellfield-owner' }
];

export function TechnicianAuthScreen() {
  const [apiBaseUrl, setApiBaseUrl] = useState(getInitialFieldApiBaseUrl());
  const [email, setEmail] = useState(demoAccounts[0].email);
  const [password, setPassword] = useState(demoAccounts[0].password);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [employee, setEmployee] = useState<EmployeeSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleLogin() {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await loginToFieldApi({
        email,
        password,
        deviceLabel: 'Expo Device',
        apiBaseUrl
      });

      setSessionToken(response.sessionToken);
      setEmployee(response.employee);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (sessionToken && employee) {
    return (
      <TechnicianWorkspaceScreen
        apiBaseUrl={apiBaseUrl}
        employee={employee}
        sessionToken={sessionToken}
        onSignOut={() => {
          setSessionToken(null);
          setEmployee(null);
          setErrorMessage(null);
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.kicker}>Milestone foundation</Text>
          <Text style={styles.title}>BellField Field Sign In</Text>
          <Text style={styles.subtitle}>
            This field shell signs in, loads assigned work, and then lets the technician save
            updates locally before syncing them back to the server.
          </Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Server URL</Text>
            <TextInput
              value={apiBaseUrl}
              onChangeText={setApiBaseUrl}
              autoCapitalize="none"
              placeholder="https://office-pc:3001"
              style={styles.input}
            />
            <Text style={styles.helperText}>
              Local development may use `http://localhost:3001`. Production devices should point at
              the office server.
            </Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              style={styles.input}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              secureTextEntry={!showPassword}
              style={styles.input}
            />
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Show password</Text>
              <Switch value={showPassword} onValueChange={setShowPassword} />
            </View>
          </View>

          <Pressable onPress={handleLogin} style={styles.primaryButton}>
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>Sign in</Text>
            )}
          </Pressable>

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <View style={styles.demoCard}>
            <Text style={styles.sectionTitle}>Demo accounts</Text>
            {demoAccounts.map((account) => (
              <Pressable
                key={account.email}
                onPress={() => {
                  setEmail(account.email);
                  setPassword(account.password);
                }}
                style={styles.demoButton}
              >
                <Text style={styles.demoButtonText}>
                  {account.label}: {account.email}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2efe6' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: {
    backgroundColor: '#fffdf8',
    borderColor: '#e4d6bc',
    borderRadius: 24,
    borderWidth: 1,
    gap: 16,
    padding: 20
  },
  kicker: {
    color: '#936327',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase'
  },
  title: { color: '#1f2933', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#52606d', fontSize: 15, lineHeight: 22 },
  formGroup: { gap: 8 },
  label: { color: '#1f2933', fontSize: 14, fontWeight: '600' },
  helperText: { color: '#52606d', fontSize: 13, lineHeight: 18 },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#d9c8ad',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  switchRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  switchLabel: { color: '#52606d', fontSize: 14 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1c6b57',
    borderRadius: 999,
    paddingVertical: 14
  },
  primaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  errorText: { color: '#b42318', fontSize: 14 },
  demoCard: { borderTopColor: '#efe4d1', borderTopWidth: 1, gap: 10, paddingTop: 16 },
  sectionTitle: { color: '#1f2933', fontSize: 17, fontWeight: '600' },
  demoButton: {
    backgroundColor: '#faf4e7',
    borderColor: '#e6d6ba',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  demoButtonText: { color: '#1f2933', fontSize: 14 }
});
