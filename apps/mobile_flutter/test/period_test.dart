import 'package:corpsol_mobile/core/period.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('календарный период', () {
    test('месяц заканчивается последним числом, а не первым следующего', () {
      final period = currentMonth(DateTime(2026, 10, 8));

      expect(period.from, '2026-10-01');
      expect(period.to, '2026-10-31');
    });

    test('короткий месяц считается правильно', () {
      expect(currentMonth(DateTime(2026, 2, 15)).to, '2026-02-28');
    });

    test('високосный февраль не теряет день', () {
      expect(currentMonth(DateTime(2028, 2, 15)).to, '2028-02-29');
    });

    test('декабрь не уезжает в следующий год', () {
      final period = currentMonth(DateTime(2026, 12, 3));

      expect(period.from, '2026-12-01');
      expect(period.to, '2026-12-31');
    });

    test('дата приводится к виду, который понимает бэкенд', () {
      expect(dateKey(DateTime(2026, 1, 5)), '2026-01-05');
    });
  });

  group('суммы', () {
    test('тиыны показываются тенге', () {
      expect(formatMoney(30000000), '300 000 ₸');
    });

    test('удержание показывается со знаком минус', () {
      expect(formatMoney(-50000), '-500 ₸');
    });

    test('ноль не превращается в пустую строку', () {
      expect(formatMoney(0), '0 ₸');
    });

    test('копейки округляются, а не отбрасывают рубли', () {
      expect(formatMoney(199), '2 ₸');
    });
  });
}
