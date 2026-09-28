import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { theme } from '../theme';

export type TabKey = 'home' | 'offers' | 'payroll' | 'rating';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'home', label: 'Приход' },
  { key: 'offers', label: 'Сделки' },
  { key: 'payroll', label: 'Зарплата' },
  { key: 'rating', label: 'Рейтинг' },
];

/**
 * Нижняя навигация. Своя, а не из библиотеки: четыре вкладки без вложенных
 * переходов не стоят лишней зависимости и настройки нативных экранов.
 */
export function TabBar({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (key: TabKey) => void;
}) {
  return (
    <View style={styles.bar}>
      {TABS.map((tab) => (
        <TouchableOpacity key={tab.key} style={styles.tab} onPress={() => onChange(tab.key)}>
          <Text style={[styles.label, active === tab.key && styles.labelActive]}>
            {tab.label}
          </Text>
          {active === tab.key ? <View style={styles.indicator} /> : null}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingBottom: theme.spacing(1),
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: theme.spacing(1.5), gap: 4 },
  label: { color: theme.colors.textMuted, fontSize: 13 },
  labelActive: { color: theme.colors.text, fontWeight: '600' },
  indicator: {
    width: 20,
    height: 2,
    borderRadius: 2,
    backgroundColor: theme.colors.accent,
  },
});
