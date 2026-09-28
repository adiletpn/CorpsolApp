import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { ApiError, request } from '../api/client';
import type { Offer } from '../api/types';
import { currentMonth, formatMoney } from '../lib/period';
import { theme } from '../theme';

const STATUS_LABELS: Record<Offer['status'], string> = {
  SENT: 'Ждёт решения',
  ACCEPTED: 'Принята',
  REJECTED: 'Отказ',
  EXPIRED: 'Истекла',
};

const STATUS_COLORS: Record<Offer['status'], string> = {
  SENT: theme.colors.warning,
  ACCEPTED: theme.colors.success,
  REJECTED: theme.colors.danger,
  EXPIRED: theme.colors.textMuted,
};

function CreateOfferModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);

    try {
      await request('/offers', {
        method: 'POST',
        body: {
          clientName: clientName.trim(),
          clientPhone: clientPhone.trim() || undefined,
          // Сумма вводится в тенге, хранится в тиынах.
          amountMinor: Math.round(Number(amount) * 100),
        },
      });

      setClientName('');
      setClientPhone('');
      setAmount('');
      onCreated();
      onClose();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось создать сделку');
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = clientName.trim().length > 1 && Number(amount) > 0 && !busy;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Новая сделка</Text>

          <TextInput
            style={styles.input}
            placeholder="Имя клиента"
            placeholderTextColor={theme.colors.textMuted}
            value={clientName}
            onChangeText={setClientName}
          />
          <TextInput
            style={styles.input}
            placeholder="Телефон клиента"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="phone-pad"
            value={clientPhone}
            onChangeText={setClientPhone}
          />
          <TextInput
            style={styles.input}
            placeholder="Сумма, ₸"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.modalHint}>
            Сделку подтверждает руководитель. До подтверждения она не закрывает
            план и не влияет на премию.
          </Text>

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryText}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, !canSubmit && styles.buttonDisabled]}
              disabled={!canSubmit}
              onPress={submit}
            >
              {busy ? (
                <ActivityIndicator color={theme.colors.background} />
              ) : (
                <Text style={styles.buttonText}>Создать</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function OffersScreen() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const period = currentMonth();
      setOffers(await request<Offer[]>(`/offers?from=${period.from}&to=${period.to}`));
    } catch {
      // Молча оставляем прошлые данные.
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const accepted = offers.filter((offer) => offer.status === 'ACCEPTED');
  const revenue = accepted.reduce((total, offer) => total + offer.amountMinor, 0);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={load}
            tintColor={theme.colors.accent}
          />
        }
      >
        <Text style={styles.title}>Мои сделки</Text>

        <View style={styles.statsRow}>
          <Stat label="Принято" value={String(accepted.length)} color={theme.colors.success} />
          <Stat label="Всего" value={String(offers.length)} color={theme.colors.accent} />
          <Stat label="Выручка" value={formatMoney(revenue)} color={theme.colors.text} />
        </View>

        {offers.length === 0 ? (
          <Text style={styles.empty}>Сделок за этот месяц пока нет</Text>
        ) : (
          offers.map((offer) => (
            <View key={offer.id} style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.client}>{offer.clientName}</Text>
                <Text style={styles.amount}>{formatMoney(offer.amountMinor)}</Text>
              </View>
              <View style={styles.cardRow}>
                <Text style={styles.date}>{offer.sentDate}</Text>
                <Text style={[styles.status, { color: STATUS_COLORS[offer.status] }]}>
                  {STATUS_LABELS[offer.status]}
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setCreating(true)}>
        <Text style={styles.fabText}>+ Сделка</Text>
      </TouchableOpacity>

      <CreateOfferModal
        visible={creating}
        onClose={() => setCreating(false)}
        onCreated={load}
      />
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing(2), gap: theme.spacing(1.5), paddingBottom: theme.spacing(10) },
  title: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '700',
    marginTop: theme.spacing(2),
  },
  statsRow: { flexDirection: 'row', gap: theme.spacing(1.5) },
  stat: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing(2),
  },
  statValue: { fontSize: 18, fontWeight: '700' },
  statLabel: { color: theme.colors.textMuted, fontSize: 12, marginTop: 2 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing(2),
    gap: 6,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  client: { color: theme.colors.text, fontSize: 16, flex: 1 },
  amount: { color: theme.colors.text, fontSize: 16, fontWeight: '700' },
  date: { color: theme.colors.textMuted, fontSize: 13 },
  status: { fontSize: 13, fontWeight: '600' },
  empty: { color: theme.colors.textMuted, fontSize: 14, marginTop: theme.spacing(2) },
  fab: {
    position: 'absolute',
    right: theme.spacing(2),
    bottom: theme.spacing(3),
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing(3),
    paddingVertical: theme.spacing(1.75),
  },
  fabText: { color: theme.colors.background, fontSize: 16, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing(3),
    gap: theme.spacing(1.5),
  },
  modalTitle: { color: theme.colors.text, fontSize: 20, fontWeight: '700' },
  modalHint: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18 },
  modalActions: { flexDirection: 'row', gap: theme.spacing(1.5), marginTop: theme.spacing(1) },
  input: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing(2),
    paddingVertical: theme.spacing(1.75),
    color: theme.colors.text,
    fontSize: 16,
  },
  button: {
    flex: 1,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing(1.75),
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: theme.colors.background, fontSize: 16, fontWeight: '700' },
  secondaryButton: {
    flex: 1,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing(1.75),
    alignItems: 'center',
  },
  secondaryText: { color: theme.colors.text, fontSize: 16, fontWeight: '600' },
  error: { color: theme.colors.danger, fontSize: 14 },
});
