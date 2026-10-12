import 'dart:ui';

import 'package:flutter/material.dart';

import '../palette.dart';

/// Мягкие цветные пятна под содержимым. Нужны ради стекла: размывать
/// однотонный фон бессмысленно — матовость видна только поверх цвета.
class AmbientBackground extends StatelessWidget {
  const AmbientBackground({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    return Stack(
      children: [
        Positioned.fill(child: ColoredBox(color: palette.background)),

        // Пятна выходят за край экрана: так не видно, где они кончаются.
        // Свечение держится у шапки: ниже начинаются панели,
        // и фон там должен быть ровным.
        Positioned(
          top: -180,
          left: -120,
          child: _Blob(color: palette.ambientA, size: 380),
        ),
        Positioned(
          top: -80,
          right: -160,
          child: _Blob(color: palette.ambientB, size: 300),
        ),
        child,
      ],
    );
  }
}

class _Blob extends StatelessWidget {
  const _Blob({required this.color, required this.size});

  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    final strength = Theme.of(context).brightness == Brightness.dark
        ? 0.22
        : 0.16;

    return IgnorePointer(
      child: ImageFiltered(
        imageFilter: ImageFilter.blur(sigmaX: 90, sigmaY: 90),
        child: Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: color.withValues(alpha: strength),
          ),
        ),
      ),
    );
  }
}
