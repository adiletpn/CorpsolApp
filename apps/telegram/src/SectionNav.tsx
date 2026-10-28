import React, { useEffect, useRef, useState } from 'react';

import { tap } from './telegram';

export interface NavSection {
  id: string;
  label: string;
}

/** Сколько места сверху занимает сама строка — к разделу прокручиваем ниже неё. */
const NAV_OFFSET = 64;

/**
 * Строка разделов вверху длинного экрана: касание прокручивает к разделу,
 * а при обычной прокрутке подсвечивается тот, что сейчас на экране.
 * Длинную «Работу» иначе приходилось листать до рейтинга вслепую.
 */
export function SectionNav({ sections }: { sections: NavSection[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? '');
  const chipsRef = useRef<HTMLDivElement>(null);
  // Пока идёт прокрутка по касанию, подсветку не перехватываем:
  // иначе чип мигал бы по всем разделам, мимо которых едет экран.
  const jumping = useRef<number | null>(null);

  const ids = sections.map((section) => section.id).join(',');

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      if (jumping.current !== null) return;

      // Активный — последний раздел, чей заголовок уже ушёл под строку.
      let current = sections[0]?.id ?? '';
      for (const section of sections) {
        const node = document.getElementById(section.id);
        if (node && node.getBoundingClientRect().top <= NAV_OFFSET + 8) current = section.id;
      }
      // Долистали до конца — подсвечиваем последний, даже если он короткий.
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom && sections.length > 0) current = sections[sections.length - 1].id;

      setActive(current);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
    // Разделы сравниваем по составу, а не по ссылке на массив.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  // Активный чип не должен уезжать за край строки. Двигаем только саму
  // строку и только по горизонтали: scrollIntoView на чипе в Safari
  // обрывает плавную прокрутку экрана, начатую касанием, — экран стоял.
  useEffect(() => {
    const row = chipsRef.current;
    const chip = row?.querySelector<HTMLElement>('.is-active');
    if (!row || !chip) return;
    const left = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2;
    row.scrollTo?.({ left: Math.max(0, left), behavior: 'smooth' });
  }, [active]);

  function jump(id: string) {
    const node = document.getElementById(id);
    if (!node) return;

    setActive(id);

    // Прокручиваем окно до точки под строкой разделов сами, без
    // scrollIntoView: так не зависим от того, как WebView понимает
    // scroll-margin и чей скролл главный.
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const top = node.getBoundingClientRect().top + window.scrollY - NAV_OFFSET;
    window.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' });
    tap();

    if (jumping.current !== null) window.clearTimeout(jumping.current);
    jumping.current = window.setTimeout(() => {
      jumping.current = null;
    }, 700);
  }

  if (sections.length < 2) return null;

  return (
    <nav className="section-nav" aria-label="Разделы экрана">
      <div className="section-nav-chips" ref={chipsRef}>
        {sections.map((section) => (
          <button
            key={section.id}
            className={`section-nav-chip ${active === section.id ? 'is-active' : ''}`}
            aria-current={active === section.id ? 'location' : undefined}
            onClick={() => jump(section.id)}
          >
            {section.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

/** Точка прокрутки без заголовка — например, начало экрана. */
export function Anchor({ id }: { id: string }) {
  return <div id={id} className="anchor" />;
}
