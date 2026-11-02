/**
 * Логин сотрудника из имени: «Карлыгаш» → karlygash. Логин — это
 * адрес для входа, а не почтовый ящик, поэтому домен общий, а латиница
 * нужна, чтобы его было легко набрать на любой клавиатуре.
 */

const LETTERS: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  // Казахские буквы — по звучанию, как их пишут в латинских именах.
  ә: 'a', ғ: 'g', қ: 'k', ң: 'n', ө: 'o', ұ: 'u', ү: 'u', һ: 'h', і: 'i',
};

export const LOGIN_DOMAIN = 'corpsol.kz';

export function transliterate(name: string): string {
  return [...name.trim().toLowerCase()]
    .map((char) => LETTERS[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

/** Логин на входе — как есть, иначе из имени; домен дописывается сам. */
export function loginFor(name: string, login?: string): string {
  const given = (login?.trim() || transliterate(name)).toLowerCase();
  const [local, domain = LOGIN_DOMAIN] = given.split('@');
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(local)) {
    throw new Error(`Логин для «${name}» не получился: «${given}». Укажите его явно.`);
  }
  return `${local}@${domain}`;
}
