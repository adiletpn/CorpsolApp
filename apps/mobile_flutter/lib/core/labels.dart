import 'package:flutter/material.dart';

import '../api/models.dart';
import '../theme.dart';

String attendanceStatusLabel(AttendanceStatus status) => switch (status) {
  AttendanceStatus.onTime => 'Вовремя',
  AttendanceStatus.late => 'Опоздание',
  AttendanceStatus.absent => 'Отсутствие',
  AttendanceStatus.dayOff => 'Выходной',
  AttendanceStatus.excused => 'Уважительная',
};

Color attendanceStatusColor(AttendanceStatus status) => switch (status) {
  AttendanceStatus.onTime => AppColors.success,
  AttendanceStatus.late => AppColors.warning,
  AttendanceStatus.absent => AppColors.danger,
  AttendanceStatus.dayOff => AppColors.textMuted,
  AttendanceStatus.excused => AppColors.accent,
};

/// Приписка к статусу для дней, которые сотрудник не отмечал сам.
String attendanceMethodNote(AttendanceMethod method) => switch (method) {
  AttendanceMethod.manualAdjustment => ' · вручную',
  AttendanceMethod.autoAbsence => ' · не отмечался',
  AttendanceMethod.qr => '',
};

String offerStatusLabel(OfferStatus status) => switch (status) {
  OfferStatus.sent => 'Отправлен',
  OfferStatus.accepted => 'Принят',
  OfferStatus.rejected => 'Отказ',
  OfferStatus.expired => 'Истёк',
};

Color offerStatusColor(OfferStatus status) => switch (status) {
  OfferStatus.accepted => AppColors.success,
  OfferStatus.rejected => AppColors.danger,
  OfferStatus.expired => AppColors.textMuted,
  OfferStatus.sent => AppColors.accent,
};

String planMetricLabel(PlanMetric metric) => switch (metric) {
  PlanMetric.calls => 'Звонки',
  PlanMetric.talkMinutes => 'Минуты разговора',
  PlanMetric.offers => 'Сделки',
  PlanMetric.revenue => 'Выручка',
};

String payrollStatusLabel(PayrollStatus status) => switch (status) {
  PayrollStatus.draft => 'Черновик',
  PayrollStatus.approved => 'Утверждён',
  PayrollStatus.paid => 'Выплачен',
};
