import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/client.dart';
import '../state/auth_controller.dart';
import '../theme.dart';

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

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      await context.read<AuthController>().signIn(_email.text, _password.text);
    } on ApiError catch (error) {
      setState(() => _error = _rejectionMessages[error.code] ?? error.message);
    } catch (_) {
      setState(() => _error = 'Неверная почта или пароль');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
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
                const Text(
                  'Вход для менеджера',
                  style: TextStyle(color: AppColors.textMuted, fontSize: 15),
                ),
                SizedBox(height: gap(4)),
                TextField(
                  controller: _email,
                  enabled: !_busy,
                  keyboardType: TextInputType.emailAddress,
                  autocorrect: false,
                  textInputAction: TextInputAction.next,
                  style: const TextStyle(color: AppColors.text),
                  decoration: _fieldDecoration('Рабочая почта'),
                ),
                SizedBox(height: gap(1.5)),
                TextField(
                  controller: _password,
                  enabled: !_busy,
                  obscureText: true,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _submit(),
                  style: const TextStyle(color: AppColors.text),
                  decoration: _fieldDecoration('Пароль'),
                ),
                if (_error != null) ...[
                  SizedBox(height: gap(2)),
                  Text(
                    _error!,
                    style: const TextStyle(
                      color: AppColors.danger,
                      fontSize: 14,
                    ),
                  ),
                ],
                SizedBox(height: gap(3)),
                FilledButton(
                  onPressed: _busy ? null : _submit,
                  style: FilledButton.styleFrom(
                    padding: EdgeInsets.symmetric(vertical: gap(2)),
                    backgroundColor: AppColors.accent,
                    foregroundColor: AppColors.background,
                  ),
                  child: _busy
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Войти'),
                ),
                SizedBox(height: gap(2)),
                const Text(
                  'Войти можно только с закреплённого телефона.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.textMuted, fontSize: 13),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  InputDecoration _fieldDecoration(String label) => InputDecoration(
    labelText: label,
    labelStyle: const TextStyle(color: AppColors.textMuted),
    filled: true,
    fillColor: AppColors.surface,
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppRadius.md),
      borderSide: const BorderSide(color: AppColors.border),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppRadius.md),
      borderSide: const BorderSide(color: AppColors.border),
    ),
  );
}
