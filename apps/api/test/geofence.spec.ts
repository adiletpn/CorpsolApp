import { checkGeofence, distanceMeters } from '@corpsol/shared';

// Офис в центре Алматы — используем как опорную точку.
const OFFICE = { lat: 43.238949, lng: 76.889709, radiusMeters: 120 };

describe('checkGeofence', () => {
  it('засчитывает отметку внутри зоны при хорошей точности', () => {
    const verdict = checkGeofence(
      { lat: 43.23895, lng: 76.8897, accuracyMeters: 15 },
      OFFICE,
    );
    expect(verdict.inside).toBe(true);
  });

  it('отклоняет отметку за пределами радиуса', () => {
    // ~500 м к северу от офиса.
    const verdict = checkGeofence(
      { lat: 43.24345, lng: 76.889709, accuracyMeters: 10 },
      OFFICE,
    );
    expect(verdict.inside).toBe(false);
    expect(verdict.reason).toBe('outside_fence');
  });

  it('трактует погрешность не в пользу сотрудника', () => {
    // Точка в 100 м от центра формально внутри радиуса 120 м,
    // но с погрешностью 60 м сотрудник может быть и снаружи.
    const verdict = checkGeofence(
      { lat: 43.2398, lng: 76.889709, accuracyMeters: 60 },
      OFFICE,
    );
    expect(verdict.distanceMeters).toBeLessThan(OFFICE.radiusMeters);
    expect(verdict.worstCaseDistanceMeters).toBeGreaterThan(OFFICE.radiusMeters);
    expect(verdict.inside).toBe(false);
  });

  it('блокирует подменённую геолокацию даже в центре офиса', () => {
    const verdict = checkGeofence(
      { lat: OFFICE.lat, lng: OFFICE.lng, accuracyMeters: 5, isMocked: true },
      OFFICE,
    );
    expect(verdict.inside).toBe(false);
    expect(verdict.reason).toBe('mocked_location');
  });

  it('отклоняет координаты с недостоверной точностью', () => {
    const verdict = checkGeofence(
      { lat: OFFICE.lat, lng: OFFICE.lng, accuracyMeters: 500 },
      OFFICE,
      { maxAccuracyMeters: 100 },
    );
    expect(verdict.inside).toBe(false);
    expect(verdict.reason).toBe('accuracy_too_low');
  });
});

describe('distanceMeters', () => {
  it('считает расстояние по большому кругу', () => {
    // Алматы — Астана, эталон ~970 км.
    const km = distanceMeters({ lat: 43.238949, lng: 76.889709 }, { lat: 51.169392, lng: 71.449074 }) / 1000;
    expect(km).toBeGreaterThan(960);
    expect(km).toBeLessThan(980);
  });
});
