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
import { loginToFieldApi, type EmployeeSummary } from '@/lib/identity-api';

const plannedFieldAreas = ['Today', 'Jobs', 'Estimates', 'Inventory', 'More'];

const demoAccounts = [
  { label: 'Technician', email: 'tech@bellfield.local', password: 'bellfield-tech' },
  { label: 'Dispatcher', email: 'dispatcher@bellfield.local', password: 'bellfield-dispatch' },
  { label: 'Owner', email: 'owner@bellfield.local', password: 'bellfield-owner' }
];

export function TechnicianAuthScreen() {
  const [apiBaseUrl, setApiBaseUrl] = useState(process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3001');
  const [email, setEmail] = useState(demoAccounts[0].email);
  const [password, setPassword] = useState(demoAccounts[0].password);
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

      setEmployee(response.employee);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!employee) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.card}>
            <Text style={styles.kicker}>Milestone 1 foundation</Text>
            <Text style={styles.title}>BellField Field Sign In</Text>
            <Text style={styles.subtitle}>
              This mobile shell now signs into the API-backed employee foundation. For real devices, point the
              server URL at the customer-owned BellField server.
            </Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Server URL</Text>
              <TextInput value={apiBaseUrl} onChangeText={setApiBaseUrl} autoCapitalize="none" style={styles.input} />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" style={styles.input} />
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
              {isSubmitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Sign in</Text>}
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.kicker}>BellField Field</Text>
          <Text style={styles.title}>Welcome, {employee.displayName}</Text>
          <Text style={styles.subtitle}>
            Signed in as {employee.roleName}. This is the first mobile slice that knows the technician identity,
            role template, and permission shape before offline sync and assigned-job workflows land.
          </Text>

          <View style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>Session foundation</Text>
            <Text style={styles.summaryText}>{employee.email}</Text>
            <Text style={styles.summaryText}>Permissions loaded: {employee.effectivePermissions.length}</Text>
            <Text style={styles.summaryText}>Persistence: sign-in state is session-only for now</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>Planned field areas</Text>
            {plannedFieldAreas.map((area) => (
              <Text key={area} style={styles.summaryText}>
                - {area}
              </Text>
            ))}
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>Next mobile foundations</Text>
            <Text style={styles.summaryText}>- stay signed in behavior</Text>
            <Text style={styles.summaryText}>- device identity and revocation</Text>
            <Text style={styles.summaryText}>- assigned jobs and sync-safe local save</Text>
          </View>

          <Pressable
            onPress={() => {
              setEmployee(null);
              setErrorMessage(null);
            }}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2efe6'
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20
  },
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
  title: {
    color: '#1f2933',
    fontSize: 28,
    fontWeight: '700'
  },
  subtitle: {
    color: '#52606d',
    fontSize: 15,
    lineHeight: 22
  },
  formGroup: {
    gap: 8
  },
  label: {
    color: '#1f2933',
    fontSize: 14,
    fontWeight: '600'
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#d9c8ad',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  switchLabel: {
    color: '#52606d',
    fontSize: 14
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1c6b57',
    borderRadius: 999,
    paddingVertical: 14
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700'
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#cdbfa6',
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 14
  },
  secondaryButtonText: {
    color: '#1f2933',
    fontSize: 15,
    fontWeight: '600'
  },
  errorText: {
    color: '#b42318',
    fontSize: 14
  },
  demoCard: {
    borderTopColor: '#efe4d1',
    borderTopWidth: 1,
    gap: 10,
    paddingTop: 16
  },
  sectionTitle: {
    color: '#1f2933',
    fontSize: 17,
    fontWeight: '600'
  },
  demoButton: {
    backgroundColor: '#faf4e7',
    borderColor: '#e6d6ba',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  demoButtonText: {
    color: '#1f2933',
    fontSize: 14
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    borderColor: '#ebdec6',
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
    padding: 16
  },
  summaryText: {
    color: '#52606d',
    fontSize: 14,
    lineHeight: 20
  }
});
