import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

const plannedFieldAreas = ['Today', 'Jobs', 'Estimates', 'Inventory', 'More'];

export default function TechnicianHomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>BellField Technician Home Placeholder</Text>
        <Text style={styles.subtitle}>
          TypeScript-first mobile shell only. No sync, jobs workflow, permissions, or live behavior yet.
        </Text>
        <Text style={styles.sectionTitle}>Planned Field Areas</Text>
        {plannedFieldAreas.map((area) => (
          <Text key={area} style={styles.item}>
            • {area}
          </Text>
        ))}
        <Text style={styles.footer}>
          Future module folders: src/modules, src/components, src/lib
        </Text>
      </View>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f6f8',
    justifyContent: 'center',
    padding: 20
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    gap: 8
  },
  title: {
    fontSize: 24,
    fontWeight: '700'
  },
  subtitle: {
    fontSize: 15,
    color: '#334155'
  },
  sectionTitle: {
    marginTop: 8,
    fontSize: 17,
    fontWeight: '600'
  },
  item: {
    fontSize: 16
  },
  footer: {
    marginTop: 8,
    fontSize: 14,
    color: '#475569'
  }
});
