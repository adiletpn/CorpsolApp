import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/client.dart';
import '../core/firebase_session.dart';
import '../state/auth_controller.dart';
import '../palette.dart';
import '../theme.dart';
import '../widgets/ambient.dart';

/// Коды отказа при входе. Сотруднику показываем, что делать дальше,
/// а не техническую причину.
const _rejectionMessages = <String, String>{
  'employee_inactive': 'Учётная запись неактивна. Обратитесь к ЧР.',
  'device_required': 'Вход возможен только из мобильного приложения.',
  'device_mismatch':
      'Аккаунт привязан к другому телефону. Заявка на перепривязку отправлена ЧР.',
  'device_taken': 'Этот телефон уже закреплён за другим сотрудником.',
};

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();

  bool _busy = false;
  String? _error;
  String? _notice;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  /// Письмо со ссылкой на смену пароля. Ответ один на любой адрес —
  /// подтверждать существование учётки нельзя.
  Future<void> _resetPassword() async {
    final email = _email.text.trim();

    if (email.isEmpty) {
      setState(() {
        _error = 'Введите рабочую почту, и мы пришлём ссылку';
        _notice = null;
      });
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });

    try {
      await context.read<AuthController>().sendPasswordReset(email);
      if (!mounted) return;
      setState(
        () => _notice = 'Если такая почта заведена, письмо уже отправлено',
      );
    } on AuthFailure catch (failure) {
      setState(() => _error = failure.message);
    } catch (_) {
      setState(() => _error = 'Не удалось отправить письмо. Попробуйте позже');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submit() async {
    if (_busy) return;

    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });

    try {
      await context.read<AuthController>().signIn(_email.text, _password.text);
    } on ApiError catch (error) {
      setState(() => _error = _rejectionMessages[error.code] ?? error.message);
    } on AuthFailure catch (failure) {
      setState(() => _error = failure.message);
    } catch (error) {
      // Причина неизвестна — показываем её, а не выдаём за неверный пароль.
      setState(() => _error = 'Не удалось войти. $error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: AmbientBackground(
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: EdgeInsets.all(gap(3)),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'CorpSol',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  SizedBox(height: gap(0.5)),
                  Text(
                    'Вход для менеджера',
                    style: TextStyle(
                      color: context.palette.textMuted,
                      fontSize: 15,
                    ),
                  ),
                  SizedBox(height: gap(4)),
                  TextField(
                    controller: _email,
                    enabled: !_busy,
                    keyboardType: TextInputType.emailAddress,
                    autocorrect: false,
                    textInputAction: TextInputAction.next,
                    style: TextStyle(color: context.palette.text),
                    decoration: _fieldDecoration('Рабочая почта'),
                  ),
                  SizedBox(height: gap(1.5)),
                  TextField(
                    controller: _password,
                    enabled: !_busy,
                    obscureText: true,
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => _submit(),
                    style: TextStyle(color: context.palette.text),
                    decoration: _fieldDecoration('Пароль'),
                  ),
                  if (_error != null) ...[
                    SizedBox(height: gap(2)),
                    Text(
                      _error!,
                      style: TextStyle(
                        color: context.palette.danger,
                        fontSize: 14,
                      ),
                    ),
                  ],
                  if (_notice != null) ...[
                    SizedBox(height: gap(2)),
                    Text(
                      _notice!,
                      style: TextStyle(
                        color: context.palette.success,
                        fontSize: 14,
                      ),
                    ),
                  ],
                  SizedBox(height: gap(3)),
                  // Кнопка на градиенте — главное действие экрана.
                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: _busy ? null : appGradient,
                      color: _busy ? context.palette.surfaceRaised : null,
                      borderRadius: BorderRadius.circular(AppRadius.sm),
                    ),
                    child: FilledButton(
                      onPressed: _busy ? null : _submit,
                      style: FilledButton.styleFrom(
                        padding: EdgeInsets.symmetric(vertical: gap(2.25)),
                        backgroundColor: Colors.transparent,
                        disabledBackgroundColor: Colors.transparent,
                        foregroundColor: Colors.white,
                        shadowColor: Colors.transparent,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(AppRadius.sm),
                        ),
                      ),
                      child: _busy
                          ? SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: context.palette.accent,
                              ),
                            )
                          : const Text(
                              'Войти',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                    ),
                  ),
                  SizedBox(height: gap(1)),
                  TextButton(
                    onPressed: _busy ? null : _resetPassword,
                    child: Text(
                      'Забыли пароль?',
                      style: TextStyle(color: context.palette.textMuted),
                    ),
                  ),
                  SizedBox(height: gap(2)),
                  Text(
                    'Войти можно только с закреплённого телефона.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: context.palette.textMuted,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  InputDecoration _fieldDecoration(String label) => InputDecoration(
    labelText: label,
    labelStyle: TextStyle(color: context.palette.textMuted),
    filled: true,
    fillColor: context.palette.surface,
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppRadius.md),
      borderSide: BorderSide(color: context.palette.border),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppRadius.md),
      borderSide: BorderSide(color: context.palette.border),
    ),
  );
}
