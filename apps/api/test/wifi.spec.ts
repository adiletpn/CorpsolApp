import { isValidBssid, matchesKnownBssid, normalizeBssid } from '@corpsol/shared';

describe('нормализация BSSID', () => {
  it('приводит к одному виду записи из разных источников', () => {
    const expected = 'aa:bb:cc:dd:ee:ff';

    // Как копируют из роутера, как отдаёт Android, как бывает без разделителей.
    expect(normalizeBssid('AA-BB-CC-DD-EE-FF')).toBe(expected);
    expect(normalizeBssid('aa:bb:cc:dd:ee:ff')).toBe(expected);
    expect(normalizeBssid('AABBCCDDEEFF')).toBe(expected);
    expect(normalizeBssid('aa bb cc dd ee ff')).toBe(expected);
  });

  it('отвергает значения неверной длины', () => {
    expect(normalizeBssid('aa:bb:cc')).toBeNull();
    expect(normalizeBssid('aa:bb:cc:dd:ee:ff:00')).toBeNull();
    expect(normalizeBssid('')).toBeNull();
    expect(isValidBssid('не-адрес')).toBe(false);
  });
});

describe('сравнение с разрешёнными точками доступа', () => {
  // Админ завёл адрес в одном формате, телефон сообщает в другом.
  const officeNetworks = ['AA-BB-CC-DD-EE-FF', '11:22:33:44:55:66'];

  it('узнаёт сеть, записанную в другом формате', () => {
    expect(matchesKnownBssid('aa:bb:cc:dd:ee:ff', officeNetworks)).toBe(true);
    expect(matchesKnownBssid('112233445566', officeNetworks)).toBe(true);
  });

  it('не пропускает чужую сеть', () => {
    expect(matchesKnownBssid('00:00:00:00:00:01', officeNetworks)).toBe(false);
  });

  it('не пропускает отсутствующее или нераспознанное значение', () => {
    expect(matchesKnownBssid(undefined, officeNetworks)).toBe(false);
    // Пропускать мусор означало бы открыть проверку любому значению.
    expect(matchesKnownBssid('мусор', officeNetworks)).toBe(false);
  });
});
