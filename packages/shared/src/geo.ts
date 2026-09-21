export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Geofence extends Coordinates {
  /** Радиус зоны в метрах. */
  radiusMeters: number;
}

export interface LocationSample extends Coordinates {
  /** Погрешность определения координат в метрах, как её сообщает устройство. */
  accuracyMeters: number;
  /** Android умеет сказать, что координаты подставлены fake-GPS приложением. */
  isMocked?: boolean;
}

const EARTH_RADIUS_METERS = 6_371_008.8;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Расстояние по большому кругу между двумя точками, в метрах. */
export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export interface GeofenceVerdict {
  inside: boolean;
  distanceMeters: number;
  /** Расстояние с поправкой на заявленную устройством погрешность. */
  worstCaseDistanceMeters: number;
  reason?: 'outside_fence' | 'accuracy_too_low' | 'mocked_location';
}

export interface GeofenceOptions {
  /**
   * Координаты с погрешностью хуже этой считаем недостоверными.
   * В помещении GPS обычно даёт 20–50 м, поэтому порог берём с запасом.
   */
  maxAccuracyMeters?: number;
  /** Разрешать ли отметку, если устройство сообщило о подмене координат. */
  allowMockedLocation?: boolean;
}

/**
 * Проверка попадания в геозону. Погрешность трактуем не в пользу сотрудника:
 * засчитываем только если сотрудник внутри зоны даже в худшем случае.
 */
export function checkGeofence(
  sample: LocationSample,
  fence: Geofence,
  options: GeofenceOptions = {},
): GeofenceVerdict {
  const { maxAccuracyMeters = 100, allowMockedLocation = false } = options;

  const distance = distanceMeters(sample, fence);
  const worstCase = distance + Math.max(0, sample.accuracyMeters);
  const base = { distanceMeters: distance, worstCaseDistanceMeters: worstCase };

  if (sample.isMocked && !allowMockedLocation) {
    return { ...base, inside: false, reason: 'mocked_location' };
  }
  if (sample.accuracyMeters > maxAccuracyMeters) {
    return { ...base, inside: false, reason: 'accuracy_too_low' };
  }
  if (worstCase > fence.radiusMeters) {
    return { ...base, inside: false, reason: 'outside_fence' };
  }
  return { ...base, inside: true };
}
