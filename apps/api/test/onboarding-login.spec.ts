import { loginFor, transliterate } from '../src/onboarding/login';

describe('логин из имени', () => {
  it('русские имена — как привычно пишут латиницей', () => {
    expect(transliterate('Наталья')).toBe('natalya');
    expect(transliterate('Карлыгаш')).toBe('karlygash');
    expect(transliterate('Эльза')).toBe('elza');
  });

  it('казахские буквы — по звучанию', () => {
    expect(transliterate('Әсел')).toBe('asel');
    expect(transliterate('Нұрбек')).toBe('nurbek');
    expect(transliterate('Ғалым')).toBe('galym');
  });

  it('имя с фамилией — через точку', () => {
    expect(transliterate('Диёра Каримова')).toBe('diyora.karimova');
  });

  it('домен дописывается, явный логин важнее имени', () => {
    expect(loginFor('Сайда')).toBe('sayda@corpsol.kz');
    expect(loginFor('Сайда', 'saida')).toBe('saida@corpsol.kz');
    expect(loginFor('Сайда', 'saida@corpsol.kz')).toBe('saida@corpsol.kz');
  });

  it('имя без единой буквы — понятная ошибка, а не пустой логин', () => {
    expect(() => loginFor('—')).toThrow('Укажите его явно');
  });
});
