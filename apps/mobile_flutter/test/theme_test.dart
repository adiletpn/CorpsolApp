import 'package:corpsol_mobile/palette.dart';
import 'package:corpsol_mobile/state/theme_controller.dart';
import 'package:corpsol_mobile/theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('палитра', () {
    test('светлая и тёмная различаются фоном и текстом', () {
      expect(AppPalette.light.background, isNot(AppPalette.dark.background));
      expect(AppPalette.light.text, isNot(AppPalette.dark.text));
    });

    test('акцент на тёмном фоне поднят, иначе выглядит тусклым', () {
      expect(
        AppPalette.dark.accent.computeLuminance(),
        greaterThan(AppPalette.light.accent.computeLuminance()),
      );
      expect(
        AppPalette.dark.violet.computeLuminance(),
        greaterThan(AppPalette.light.violet.computeLuminance()),
      );
    });

    test('тёмная тема не доводит контраст до предела', () {
      // Чистый белый на чистом чёрном даёт свечение вокруг букв на OLED.
      expect(AppPalette.dark.text.computeLuminance(), lessThan(0.88));
      expect(AppPalette.dark.background.computeLuminance(), greaterThan(0.0));
    });

    test('у стекла есть заливка и светлая грань', () {
      for (final palette in [AppPalette.light, AppPalette.dark]) {
        expect(palette.glassFill.a, greaterThan(0));
        expect(palette.glassBorder.a, greaterThan(palette.glassFill.a));
      }
    });

    test('в светлой теме текст тёмный, в тёмной светлый', () {
      expect(AppPalette.light.text.computeLuminance(), lessThan(0.2));
      expect(AppPalette.dark.text.computeLuminance(), greaterThan(0.8));
    });

    test('переход между темами не теряет цвета', () {
      final mid = AppPalette.light.lerp(AppPalette.dark, 0.5);

      expect(mid.background, isNot(AppPalette.light.background));
      expect(mid.glassFill, isNot(AppPalette.light.glassFill));
    });
  });

  group('тема приложения', () {
    test('обе темы несут палитру расширением', () {
      expect(buildLightTheme().extension<AppPalette>(), AppPalette.light);
      expect(buildDarkTheme().extension<AppPalette>(), AppPalette.dark);
    });

    test('фон страницы совпадает с палитрой', () {
      expect(
        buildLightTheme().scaffoldBackgroundColor,
        AppPalette.light.background,
      );
      expect(
        buildDarkTheme().scaffoldBackgroundColor,
        AppPalette.dark.background,
      );
    });
  });

  group('выбор темы', () {
    test('по умолчанию берётся системная', () {
      expect(ThemeController(null).mode, ThemeMode.system);
    });

    test('перебор идёт по кругу', () async {
      final controller = ThemeController(null);

      await controller.cycle();
      expect(controller.mode, ThemeMode.light);

      await controller.cycle();
      expect(controller.mode, ThemeMode.dark);

      await controller.cycle();
      expect(controller.mode, ThemeMode.system);
    });

    test('смена темы оповещает подписчиков', () async {
      final controller = ThemeController(null);
      var notified = 0;
      controller.addListener(() => notified += 1);

      await controller.set(ThemeMode.light);
      expect(notified, 1);

      // Та же тема повторно ничего не меняет и не дёргает перерисовку.
      await controller.set(ThemeMode.light);
      expect(notified, 1);
    });
  });
}
