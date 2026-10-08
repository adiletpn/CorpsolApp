import 'package:geolocator/geolocator.dart';

class LocationReading {
  const LocationReading({
    required this.lat,
    required this.lng,
    required this.accuracyMeters,
    required this.isMocked,
    required this.capturedAt,
  });

  final double lat;
  final double lng;
  final double accuracyMeters;
  final bool isMocked;
  final DateTime capturedAt;
}

class LocationDenied implements Exception {
  const LocationDenied();

  @override
  String toString() => 'Нет доступа к геолокации';
}

class LocationServiceOff implements Exception {
  const LocationServiceOff();

  @override
  String toString() => 'Геолокация выключена в настройках телефона';
}

Future<bool> ensureLocationPermission() async {
  var permission = await Geolocator.checkPermission();

  if (permission == LocationPermission.denied) {
    permission = await Geolocator.requestPermission();
  }

  return permission == LocationPermission.always ||
      permission == LocationPermission.whileInUse;
}

/// Свежие координаты для отметки. Кешированную позицию не берём:
/// она может быть получена в другом месте час назад.
Future<LocationReading> readLocation() async {
  if (!await Geolocator.isLocationServiceEnabled()) {
    throw const LocationServiceOff();
  }
  if (!await ensureLocationPermission()) {
    throw const LocationDenied();
  }

  final position = await Geolocator.getCurrentPosition(
    locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
  );

  return LocationReading(
    lat: position.latitude,
    lng: position.longitude,
    // Если устройство не сообщило точность, отправляем заведомо плохое значение,
    // чтобы сервер отклонил отметку, а не принял её вслепую.
    accuracyMeters: position.accuracy <= 0 ? 9999 : position.accuracy,
    // Android сообщает о включённом fake-GPS; на iOS поле всегда false.
    isMocked: position.isMocked,
    capturedAt: position.timestamp,
  );
}
