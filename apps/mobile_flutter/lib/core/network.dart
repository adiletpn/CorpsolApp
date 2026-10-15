import 'package:network_info_plus/network_info_plus.dart';

/// Чтение офисной сети Wi-Fi — четвёртый фактор отметки прихода.
///
/// Геозона говорит, что телефон рядом со зданием, но «рядом» — это и
/// парковка, и кофейня через дорогу. Точка доступа внутри офиса
/// сужает круг до самого помещения.
///
/// BSSID — это MAC-адрес точки доступа, а не её имя: имя подделывается
/// за минуту поднятием своей сети с тем же названием.
class WifiReading {
  const WifiReading({required this.bssid, required this.denied});

  /// Адрес точки доступа, либо null — телефон не в сети Wi-Fi
  /// или платформа отказалась его отдать.
  final String? bssid;

  /// Платформа не дала доступ к сведениям о сети. Отличать важно:
  /// «не подключён к Wi-Fi» и «не разрешили посмотреть» — разные
  /// причины, и чинятся они по-разному.
  final bool denied;

  bool get hasBssid => bssid != null && bssid!.isNotEmpty;
}

/// Чтение вынесено в тип: в тестах настоящей сети нет.
typedef WifiReader = Future<WifiReading> Function();

/// Значения, которыми платформы обозначают «адреса нет».
///
/// iOS и Android вместо пустой строки иногда возвращают заглушку,
/// и без этой проверки она ушла бы на сервер как настоящий адрес.
const _placeholders = {
  '',
  '00:00:00:00:00:00',
  '02:00:00:00:00:00',
  '<unknown ssid>',
};

/// BSSID текущей сети. Ошибку наружу не пускаем: Wi-Fi — вспомогательный
/// фактор, и отметка не должна падать из-за того, что его не прочитали.
/// Решение, обязателен ли он, принимает сервер по настройкам офиса.
Future<WifiReading> readWifi() async {
  try {
    final bssid = await NetworkInfo().getWifiBSSID();

    if (bssid == null || _placeholders.contains(bssid.trim().toLowerCase())) {
      return const WifiReading(bssid: null, denied: false);
    }

    return WifiReading(bssid: bssid.trim(), denied: false);
  } catch (_) {
    // Чаще всего сюда приводит отозванный доступ к геолокации:
    // без него обе платформы скрывают сведения о сети.
    return const WifiReading(bssid: null, denied: true);
  }
}
