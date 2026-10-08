import 'package:intl/intl.dart';

/// API работает с календарными датами «ГГГГ-ММ-ДД», а не с моментами времени.
String dateKey(DateTime date) => DateFormat('yyyy-MM-dd').format(date);

class Period {
  const Period({required this.from, required this.to});

  final String from;
  final String to;
}

/// Текущий месяц целиком — период по умолчанию для всех экранов.
Period currentMonth([DateTime? now]) {
  final moment = now ?? DateTime.now();

  return Period(
    from: dateKey(DateTime(moment.year, moment.month, 1)),
    // Нулевой день следующего месяца — последний день текущего.
    to: dateKey(DateTime(moment.year, moment.month + 1, 0)),
  );
}

final _money = NumberFormat.decimalPattern('ru');

/// Суммы хранятся в тиынах, показываются в тенге.
String formatMoney(int amountMinor) {
  final tenge = (amountMinor / 100).round();
  // Неразрывный пробел вместо обычного: сумма не переносится по строкам.
  return '${_money.format(tenge).replaceAll(' ', ' ')} ₸';
}

String formatDate(String isoDate) {
  final parsed = DateTime.tryParse(isoDate);
  return parsed == null ? isoDate : DateFormat('d MMMM', 'ru').format(parsed);
}

String formatTime(DateTime moment) => DateFormat('HH:mm').format(moment);
