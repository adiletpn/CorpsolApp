import 'package:flutter/material.dart';

import '../palette.dart';
import '../theme.dart';

/// Ярлык раздела. Мелкий и разреженный: он отбивает группы,
/// но не спорит за внимание с содержимым.
class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key, this.trailing});

  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.only(left: gap(0.25), bottom: gap(1.25)),
    child: Row(
      children: [
        Expanded(
          child: Text(
            text.toUpperCase(),
            style: Theme.of(context).textTheme.labelSmall,
          ),
        ),
        if (trailing != null) trailing!,
      ],
    ),
  );
}

/// Панель со строками внутри. Одна рамка на группу вместо рамки
/// на каждой строке: иначе список читается как стопка карточек,
/// и выделить в нём что-то уже нечем.
class Panel extends StatelessWidget {
  const Panel({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    return Container(
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: palette.border),
      ),
      child: Column(
        children: [
          for (var i = 0; i < children.length; i += 1) ...[
            if (i > 0)
              // Линия не доходит до левого края: так строки читаются
              // как один список, а не как отдельные блоки.
              Padding(
                padding: EdgeInsets.only(left: gap(2)),
                child: Divider(height: 1, thickness: 1, color: palette.border),
              ),
            children[i],
          ],
        ],
      ),
    );
  }
}

/// Строка списка. Высота держится содержимым, украшений нет —
/// отличается только то, что действительно требует внимания.
class PanelRow extends StatelessWidget {
  const PanelRow({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
    this.accent,
    this.onTap,
  });

  final String title;
  final String? subtitle;
  final Widget? trailing;

  /// Цветная засечка слева. Ставится только на отклонениях:
  /// норму подсвечивать незачем, иначе исключение в ней теряется.
  final Color? accent;

  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    final body = Padding(
      padding: EdgeInsets.symmetric(horizontal: gap(2), vertical: gap(1.75)),
      child: Row(
        children: [
          if (accent != null) ...[
            Container(
              width: 3,
              height: 30,
              decoration: BoxDecoration(
                color: accent,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
            SizedBox(width: gap(1.5)),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: palette.text,
                    fontSize: 15.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (subtitle != null) ...[
                  SizedBox(height: gap(0.25)),
                  Text(
                    subtitle!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: palette.textMuted, fontSize: 13.5),
                  ),
                ],
              ],
            ),
          ),
          if (trailing != null) ...[SizedBox(width: gap(1.5)), trailing!],
        ],
      ),
    );

    if (onTap == null) return body;

    return InkWell(onTap: onTap, child: body);
  }
}

/// Значение в правой части строки. Цифры моноширинные,
/// чтобы столбец не прыгал.
class RowValue extends StatelessWidget {
  const RowValue(this.text, {super.key, this.color, this.muted = false});

  final String text;
  final Color? color;
  final bool muted;

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: TextStyle(
      color:
          color ?? (muted ? context.palette.textMuted : context.palette.text),
      fontSize: 15,
      fontWeight: muted ? FontWeight.w500 : FontWeight.w700,
      fontFeatures: const [FontFeature.tabularFigures()],
    ),
  );
}
