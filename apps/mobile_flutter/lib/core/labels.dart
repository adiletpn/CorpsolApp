import 'package:flutter/material.dart';

import '../api/models.dart';
import '../palette.dart';

String attendanceStatusLabel(AttendanceStatus status) => switch (status) {
  AttendanceStatus.onTime => 'Вовремя',
  AttendanceStatus.late => 'Опоздание',
  AttendanceStatus.absent => 'Отсутствие',
  AttendanceStatus.dayOff => 'Выходной',
  AttendanceStatus.excused => 'Уважительная',
};

Color attendanceStatusColor(AttendanceStatus status, AppPalette palette) =>
    switch (status) {
      AttendanceStatus.onTime => palette.success,
      AttendanceStatus.late => palette.warning,
      AttendanceStatus.absent => palette.danger,
      AttendanceStatus.dayOff => palette.textMuted,
      AttendanceStatus.excused => palette.accent,
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

Color offerStatusColor(OfferStatus status, AppPalette palette) =>
    switch (status) {
      OfferStatus.accepted => palette.success,
      OfferStatus.rejected => palette.danger,
      OfferStatus.expired => palette.textMuted,
      OfferStatus.sent => palette.accent,
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

String callStatusLabel(CallStatus status) => switch (status) {
  CallStatus.answered => 'Ответили',
  CallStatus.noAnswer => 'Не ответили',
  CallStatus.busy => 'Занято',
  CallStatus.failed => 'Сбой',
};
