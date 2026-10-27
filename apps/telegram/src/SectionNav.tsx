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

  // Активный чип не должен уезжать за край строки.
  useEffect(() => {
    const chip = chipsRef.current?.querySelector<HTMLElement>('.is-active');
    chip?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [active]);

  function jump(id: string) {
    const node = document.getElementById(id);
    if (!node) return;

    tap();
    setActive(id);

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    node.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });

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
