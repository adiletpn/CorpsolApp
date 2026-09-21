import * as Location from 'expo-location';

export interface LocationReading {
  lat: number;
  lng: number;
  accuracyMeters: number;
  isMocked: boolean;
  capturedAt: string;
}

export class LocationDenied extends Error {
  constructor() {
    super('Нет доступа к геолокации');
  }
}

export async function ensureLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

/**
 * Свежие координаты для отметки. Кешированную позицию не берём:
 * она может быть получена в другом месте час назад.
 */
export async function readLocation(): Promise<LocationReading> {
  const granted = await ensureLocationPermission();
  if (!granted) throw new LocationDenied();

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    // Если устройство не сообщило точность, отправляем заведомо плохое значение,
    // чтобы сервер отклонил отметку, а не принял её вслепую.
    accuracyMeters: position.coords.accuracy ?? 9999,
    // Android сообщает о включённом fake-GPS; на iOS поле всегда отсутствует.
    isMocked: Boolean((position as { mocked?: boolean }).mocked),
    capturedAt: new Date(position.timestamp).toISOString(),
  };
}
