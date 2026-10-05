import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { request } from '../api/client';
import type { Achievement } from '../api/types';
import { theme } from '../theme';

export function AchievementsScreen() {
  const [items, setItems] = useState<Achievement[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      setItems(await request<Achievement[]>('/gamification/achievements'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить достижения');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const earned = items.filter((item) => item.unlockedAt !== null);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} />}
    >
      <Text style={styles.title}>Достижения</Text>
      <Text style={styles.subtitle}>
        Получено {earned.length} из {items.length}
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {items.map((item) => {
        const unlocked = item.unlockedAt !== null;

        return (
          <View key={item.code} style={[styles.card, unlocked ? styles.unlocked : styles.locked]}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardText}>{item.description}</Text>
            <Text style={unlocked ? styles.pointsEarned : styles.points}>
              +{item.points} очков
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing(2), paddingBottom: theme.spacing(6) },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: '700' },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 14,
    marginTop: 4,
    marginBottom: theme.spacing(2),
  },
  error: { color: theme.colors.danger, fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing(2),
    marginBottom: theme.spacing(1.5),
    borderLeftWidth: 3,
  },
  unlocked: { borderLeftColor: theme.colors.success },
  // Непройденные приглушены, но видны: иначе непонятно, к чему стремиться.
  locked: { borderLeftColor: theme.colors.border, opacity: 0.6 },
  cardTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '600' },
  cardText: { color: theme.colors.textMuted, fontSize: 13, marginTop: 4, lineHeight: 18 },
  points: { color: theme.colors.textMuted, fontSize: 13, fontWeight: '600', marginTop: 10 },
  pointsEarned: { color: theme.colors.success, fontSize: 13, fontWeight: '600', marginTop: 10 },
});
