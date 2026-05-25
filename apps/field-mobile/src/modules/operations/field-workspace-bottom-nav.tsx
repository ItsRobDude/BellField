import { Pressable, StyleSheet, Text, View } from 'react-native';

export type FieldWorkspaceTab = 'jobs' | 'messages' | 'sync' | 'settings';

const fieldWorkspaceTabs: { id: FieldWorkspaceTab; label: string }[] = [
  { id: 'jobs', label: 'Jobs' },
  { id: 'messages', label: 'Messages' },
  { id: 'sync', label: 'Sync' },
  { id: 'settings', label: 'Settings' }
];

type FieldWorkspaceBottomNavProps = {
  activeTab: FieldWorkspaceTab;
  safeAreaBottom: number;
  onChangeTab: (tab: FieldWorkspaceTab) => void;
};

export function FieldWorkspaceBottomNav({
  activeTab,
  safeAreaBottom,
  onChangeTab
}: FieldWorkspaceBottomNavProps) {
  return (
    <View style={[styles.bottomNav, { paddingBottom: Math.max(12, safeAreaBottom + 8) }]}>
      {fieldWorkspaceTabs.map((tab) => {
        const isActive = activeTab === tab.id;

        return (
          <Pressable
            key={tab.id}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            onPress={() => onChangeTab(tab.id)}
            style={[styles.bottomNavButton, isActive ? styles.bottomNavButtonActive : null]}
          >
            <Text style={[styles.bottomNavText, isActive ? styles.bottomNavTextActive : null]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d7deea',
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    left: 0,
    paddingBottom: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
    position: 'absolute',
    right: 0
  },
  bottomNavButton: {
    alignItems: 'center',
    borderRadius: 18,
    minWidth: 68,
    paddingHorizontal: 10,
    paddingVertical: 10
  },
  bottomNavButtonActive: { backgroundColor: '#d6e7ff' },
  bottomNavText: { color: '#1f2933', fontSize: 12, fontWeight: '700' },
  bottomNavTextActive: { color: '#0b1f44' }
});
