import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:provider/provider.dart';

import '../api/endpoints.dart';
import '../api/models.dart';
import '../core/period.dart';
import '../state/check_in_controller.dart';
import '../palette.dart';
import '../theme.dart';

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
      Center(
        child: Container(
          width: 240,
          height: 240,
          decoration: BoxDecoration(
            border: Border.all(color: context.palette.accent, width: 3),
            borderRadius: BorderRadius.circular(AppRadius.lg),
          ),
        ),
      ),
      Positioned(
        left: 0,
        right: 0,
        bottom: gap(4),
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: gap(3)),
          child: Text(
            'Наведите камеру на QR-код терминала в офисе',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: context.palette.text,
              fontSize: 16,
              shadows: const [Shadow(blurRadius: 8, color: Colors.black)],
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
    final late = result.status == AttendanceStatus.late;

    return _Centered(
      children: [
        Icon(
          late ? Icons.schedule : Icons.check_circle,
          color: late ? context.palette.warning : context.palette.success,
          size: 72,
        ),
        SizedBox(height: gap(2.5)),
        Text(
          late ? 'Опоздание ${result.lateMinutes} мин' : 'Приход отмечен',
          style: TextStyle(
            color: context.palette.text,
            fontSize: 24,
            fontWeight: FontWeight.w700,
          ),
        ),
        SizedBox(height: gap(1)),
        Text(
          '${result.office.name} · ${formatTime(result.checkInAt)}',
          style: TextStyle(color: context.palette.textMuted, fontSize: 15),
        ),
        SizedBox(height: gap(0.5)),
        Text(
          '${result.distanceMeters.round()} м до офиса',
          style: TextStyle(color: context.palette.textMuted, fontSize: 14),
        ),
        SizedBox(height: gap(4)),
        FilledButton(
          onPressed: widget.onDone,
          style: FilledButton.styleFrom(
            backgroundColor: context.palette.accent,
            foregroundColor: context.palette.background,
            padding: EdgeInsets.symmetric(
              horizontal: gap(5),
              vertical: gap(1.75),
            ),
          ),
          child: const Text('Готово'),
        ),
      ],
    );
  }

  Widget _failure() => _Centered(
    children: [
      Icon(Icons.error_outline, color: context.palette.danger, size: 72),
      SizedBox(height: gap(2.5)),
      Text(
        _controller.message ?? 'Отметка не прошла',
        textAlign: TextAlign.center,
        style: TextStyle(color: context.palette.text, fontSize: 18),
      ),
      if (_controller.hint != null) ...[
        SizedBox(height: gap(1.5)),
        Text(
          _controller.hint!,
          textAlign: TextAlign.center,
          style: TextStyle(color: context.palette.textMuted, fontSize: 15),
        ),
      ],
      SizedBox(height: gap(4)),
      Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          OutlinedButton(
            onPressed: widget.onDone,
            child: const Text('Закрыть'),
          ),
          SizedBox(width: gap(1.5)),
          FilledButton(
            onPressed: _controller.retry,
            style: FilledButton.styleFrom(
              backgroundColor: context.palette.accent,
              foregroundColor: context.palette.background,
            ),
            child: const Text('Попробовать ещё раз'),
          ),
        ],
      ),
    ],
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
