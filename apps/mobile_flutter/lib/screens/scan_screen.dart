import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:provider/provider.dart';

import '../api/endpoints.dart';
import '../api/models.dart';
import '../core/period.dart';
import '../state/check_in_controller.dart';
import '../palette.dart';
import '../theme.dart';
import '../widgets/list.dart';

class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key, required this.onDone});

  final VoidCallback onDone;

  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> {
  late final CheckInController _controller;
  final _camera = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
  );

  @override
  void initState() {
    super.initState();
    _controller = CheckInController(context.read<CorpsolApi>());
  }

  @override
  void dispose() {
    _camera.dispose();
    _controller.dispose();
    super.dispose();
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    final value = capture.barcodes.firstOrNull?.rawValue;
    if (value == null) return;

    await _controller.submit(value);
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _controller,
      builder: (context, _) => Scaffold(
        backgroundColor: context.palette.background,
        appBar: AppBar(
          backgroundColor: context.palette.background,
          foregroundColor: context.palette.text,
          title: const Text('Отметка прихода'),
          leading: IconButton(
            icon: const Icon(Icons.close),
            onPressed: widget.onDone,
          ),
        ),
        body: SafeArea(child: _body()),
      ),
    );
  }

  Widget _body() => switch (_controller.phase) {
    CheckInPhase.scanning => _scanning(),
    CheckInPhase.submitting => _submitting(),
    CheckInPhase.success => _success(_controller.result!),
    CheckInPhase.failure => _failure(),
  };

  Widget _scanning() => Stack(
    fit: StackFit.expand,
    children: [
      MobileScanner(controller: _camera, onDetect: _onDetect),

      // Затемнение по краям: светлое окно посередине само ведёт
      // камеру к коду, объяснять не нужно.
      const DecoratedBox(
        decoration: BoxDecoration(
          gradient: RadialGradient(
            radius: 0.75,
            colors: [Colors.transparent, Color(0xB3000000)],
            stops: [0.45, 1],
          ),
        ),
      ),

      Center(
        child: SizedBox(
          width: 248,
          height: 248,
          child: CustomPaint(
            painter: _ViewfinderPainter(color: context.palette.accent),
          ),
        ),
      ),

      Positioned(
        left: 0,
        right: 0,
        bottom: gap(6),
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: gap(4)),
          child: Text(
            'Наведите камеру на QR-код терминала',
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w600,
              shadows: [Shadow(blurRadius: 12, color: Colors.black)],
            ),
          ),
        ),
      ),
    ],
  );

  Widget _submitting() => _Centered(
    children: [
      CircularProgressIndicator(color: context.palette.accent),
      SizedBox(height: gap(2.5)),
      Text(
        _controller.step,
        textAlign: TextAlign.center,
        style: TextStyle(color: context.palette.text, fontSize: 16),
      ),
    ],
  );

  Widget _success(CheckInResponse result) {
    final palette = context.palette;
    final late = result.status == AttendanceStatus.late;

    return _Centered(
      children: [
        Icon(
          late ? Icons.schedule_rounded : Icons.check_circle_rounded,
          color: late ? palette.warning : palette.success,
          size: 64,
        ),
        SizedBox(height: gap(2.5)),
        Text(
          late ? 'Опоздание ${result.lateMinutes} мин' : 'Приход отмечен',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        SizedBox(height: gap(3)),
        Panel(
          children: [
            PanelRow(
              title: 'Время',
              trailing: RowValue(formatTime(result.checkInAt)),
            ),
            PanelRow(title: 'Офис', trailing: RowValue(result.office.name)),
            PanelRow(
              title: 'До офиса',
              trailing: RowValue('${result.distanceMeters.round()} м'),
            ),
          ],
        ),
        SizedBox(height: gap(3)),
        _wideButton(context, 'Готово', widget.onDone),
      ],
    );
  }

  Widget _failure() {
    final palette = context.palette;

    return _Centered(
      children: [
        Icon(Icons.error_outline_rounded, color: palette.danger, size: 64),
        SizedBox(height: gap(2.5)),
        Text(
          _controller.message ?? 'Отметка не прошла',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        if (_controller.hint != null) ...[
          SizedBox(height: gap(1.5)),
          Text(
            _controller.hint!,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: palette.textMuted,
              fontSize: 15,
              height: 1.45,
            ),
          ),
        ],
        SizedBox(height: gap(3.5)),
        _wideButton(context, 'Попробовать ещё раз', _controller.retry),
        SizedBox(height: gap(1)),
        TextButton(
          onPressed: widget.onDone,
          child: Text('Закрыть', style: TextStyle(color: palette.textMuted)),
        ),
      ],
    );
  }

  /// Главное действие на всю ширину: на этом экране выбор один,
  /// и кнопку ищут большим пальцем, не глядя.
  Widget _wideButton(BuildContext context, String label, VoidCallback onTap) =>
      SizedBox(
        width: double.infinity,
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: appGradient,
            borderRadius: BorderRadius.circular(AppRadius.sm),
          ),
          child: FilledButton(
            onPressed: onTap,
            style: FilledButton.styleFrom(
              backgroundColor: Colors.transparent,
              foregroundColor: Colors.white,
              shadowColor: Colors.transparent,
              padding: EdgeInsets.symmetric(vertical: gap(2.25)),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(AppRadius.sm),
              ),
            ),
            child: Text(
              label,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
          ),
        ),
      );
}

class _Centered extends StatelessWidget {
  const _Centered({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: EdgeInsets.all(gap(4)),
      child: Column(mainAxisSize: MainAxisSize.min, children: children),
    ),
  );
}

/// Уголки видоискателя. Сплошная рамка спорит с кодом внутри,
/// уголки же показывают границу и оставляют поле чистым.
class _ViewfinderPainter extends CustomPainter {
  const _ViewfinderPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;

    const arm = 34.0;
    const radius = 18.0;

    void corner(Offset origin, double dx, double dy) {
      final path = Path()
        ..moveTo(origin.dx + dx * arm, origin.dy)
        ..lineTo(origin.dx + dx * radius, origin.dy)
        ..quadraticBezierTo(
          origin.dx,
          origin.dy,
          origin.dx,
          origin.dy + dy * radius,
        )
        ..lineTo(origin.dx, origin.dy + dy * arm);
      canvas.drawPath(path, paint);
    }

    corner(Offset.zero, 1, 1);
    corner(Offset(size.width, 0), -1, 1);
    corner(Offset(0, size.height), 1, -1);
    corner(Offset(size.width, size.height), -1, -1);
  }

  @override
  bool shouldRepaint(_ViewfinderPainter oldDelegate) =>
      oldDelegate.color != color;
}
