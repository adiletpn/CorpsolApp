import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/client.dart';
import '../core/firebase_session.dart';
import '../state/auth_controller.dart';
import '../palette.dart';
import '../theme.dart';
import '../widgets/ambient.dart';
import '../widgets/list.dart';

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
  final _passwordFocus = FocusNode();

  bool _busy = false;
  bool _showPassword = false;
  String? _error;
  String? _notice;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _passwordFocus.dispose();
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
    final palette = context.palette;

    return Scaffold(
      body: AmbientBackground(
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: EdgeInsets.symmetric(
                horizontal: gap(2.5),
                vertical: gap(4),
              ),
              child: ConstrainedBox(
                // На планшете поле во всю ширину читается как ошибка вёрстки.
                constraints: const BoxConstraints(maxWidth: 420),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const _Mark(),
                    SizedBox(height: gap(2.5)),
                    Text(
                      'CorpSol',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    SizedBox(height: gap(0.5)),
                    Text(
                      'Вход для менеджера',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: palette.textMuted, fontSize: 15),
                    ),
                    SizedBox(height: gap(4)),

                    // Поля одной панелью, как списки на остальных экранах:
                    // рамка на каждом поле дробит короткую форму на части.
                    Panel(
                      children: [
                        _FieldRow(
                          label: 'Рабочая почта',
                          controller: _email,
                          enabled: !_busy,
                          keyboardType: TextInputType.emailAddress,
                          textInputAction: TextInputAction.next,
                          autofillHints: const [AutofillHints.username],
                          onSubmitted: (_) => _passwordFocus.requestFocus(),
                        ),
                        _FieldRow(
                          label: 'Пароль',
                          controller: _password,
                          focusNode: _passwordFocus,
                          enabled: !_busy,
                          obscureText: !_showPassword,
                          textInputAction: TextInputAction.done,
                          autofillHints: const [AutofillHints.password],
                          onSubmitted: (_) => _submit(),
                          // Показать пароль дешевле, чем разбираться потом,
                          // почему вход «не работает» из-за раскладки.
                          trailing: IconButton(
                            onPressed: () =>
                                setState(() => _showPassword = !_showPassword),
                            icon: Icon(
                              _showPassword
                                  ? Icons.visibility_off_outlined
                                  : Icons.visibility_outlined,
                              size: 20,
                              color: palette.textMuted,
                            ),
                            tooltip: _showPassword
                                ? 'Скрыть пароль'
                                : 'Показать пароль',
                          ),
                        ),
                      ],
                    ),

                    if (_error != null) ...[
                      SizedBox(height: gap(2)),
                      _Message(
                        text: _error!,
                        tone: palette.danger,
                        icon: Icons.error_outline,
                      ),
                    ],
                    if (_notice != null) ...[
                      SizedBox(height: gap(2)),
                      _Message(
                        text: _notice!,
                        tone: palette.success,
                        icon: Icons.mark_email_read_outlined,
                      ),
                    ],

                    SizedBox(height: gap(3)),
                    _SubmitButton(busy: _busy, onPressed: _submit),
                    SizedBox(height: gap(1)),
                    TextButton(
                      onPressed: _busy ? null : _resetPassword,
                      child: Text(
                        'Забыли пароль?',
                        style: TextStyle(color: palette.textMuted),
                      ),
                    ),

                    SizedBox(height: gap(3)),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.phonelink_lock_outlined,
                          size: 16,
                          color: palette.textFaint,
                        ),
                        SizedBox(width: gap(0.75)),
                        Flexible(
                          child: Text(
                            'Вход только с закреплённого телефона',
                            style: TextStyle(
                              color: palette.textFaint,
                              fontSize: 13,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Знак приложения. Единственное украшение на экране — дальше начинается
/// работа, и место занимают данные, а не оформление.
class _Mark extends StatelessWidget {
  const _Mark();

  @override
  Widget build(BuildContext context) => Center(
    child: Container(
      width: 72,
      height: 72,
      decoration: BoxDecoration(
        gradient: appGradient,
        borderRadius: BorderRadius.circular(AppRadius.md),
        boxShadow: [
          BoxShadow(
            color: context.palette.accent.withValues(alpha: 0.3),
            blurRadius: 28,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: const Icon(Icons.headset_mic_outlined, color: Colors.white, size: 34),
    ),
  );
}

/// Поле внутри панели: подпись сверху, ввод без собственной рамки.
/// Рамку даёт сама панель — иначе на экране две вложенные.
class _FieldRow extends StatelessWidget {
  const _FieldRow({
    required this.label,
    required this.controller,
    required this.enabled,
    this.focusNode,
    this.obscureText = false,
    this.keyboardType,
    this.textInputAction,
    this.autofillHints,
    this.onSubmitted,
    this.trailing,
  });

  final String label;
  final TextEditingController controller;
  final bool enabled;
  final FocusNode? focusNode;
  final bool obscureText;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final Iterable<String>? autofillHints;
  final ValueChanged<String>? onSubmitted;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    return Padding(
      padding: EdgeInsets.fromLTRB(gap(2), gap(1.5), gap(1), gap(1.5)),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label.toUpperCase(),
                  style: Theme.of(context).textTheme.labelSmall,
                ),
                SizedBox(height: gap(0.5)),
                TextField(
                  controller: controller,
                  focusNode: focusNode,
                  enabled: enabled,
                  obscureText: obscureText,
                  autocorrect: false,
                  enableSuggestions: !obscureText,
                  keyboardType: keyboardType,
                  textInputAction: textInputAction,
                  autofillHints: autofillHints,
                  onSubmitted: onSubmitted,
                  style: TextStyle(color: palette.text, fontSize: 16),
                  decoration: const InputDecoration(
                    isDense: true,
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    disabledBorder: InputBorder.none,
                    contentPadding: EdgeInsets.zero,
                    filled: false,
                  ),
                ),
              ],
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

/// Отказ или подтверждение. Цветной фон, а не одна строка текста:
/// сообщение об ошибке на экране входа читают невнимательно.
class _Message extends StatelessWidget {
  const _Message({required this.text, required this.tone, required this.icon});

  final String text;
  final Color tone;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Container(
    padding: EdgeInsets.symmetric(horizontal: gap(1.75), vertical: gap(1.5)),
    decoration: BoxDecoration(
      color: tone.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(AppRadius.sm),
      border: Border.all(color: tone.withValues(alpha: 0.35)),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: tone),
        SizedBox(width: gap(1.25)),
        Expanded(
          child: Text(
            text,
            style: TextStyle(color: tone, fontSize: 14, height: 1.35),
          ),
        ),
      ],
    ),
  );
}

/// Главное действие экрана — единственная кнопка на градиенте.
class _SubmitButton extends StatelessWidget {
  const _SubmitButton({required this.busy, required this.onPressed});

  final bool busy;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: busy ? null : appGradient,
        color: busy ? palette.surfaceRaised : null,
        borderRadius: BorderRadius.circular(AppRadius.sm),
      ),
      child: FilledButton(
        onPressed: busy ? null : onPressed,
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
        child: busy
            ? SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: palette.accent,
                ),
              )
            : const Text(
                'Войти',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
              ),
      ),
    );
  }
}
