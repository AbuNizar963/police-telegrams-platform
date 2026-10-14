import 'package:flutter/material.dart';

import 'app_update_service.dart';

class AppUpdatePage extends StatefulWidget {
  const AppUpdatePage({super.key});

  @override
  State<AppUpdatePage> createState() => _AppUpdatePageState();
}

class _AppUpdatePageState extends State<AppUpdatePage> {
  bool _checking = false;

  Future<void> _check() async {
    if (_checking) return;
    setState(() => _checking = true);
    await checkAndPromptForAppUpdate(context, showResult: true);
    if (mounted) setState(() => _checking = false);
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _check());
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(
        title: const Text('تحديث التطبيق'),
        backgroundColor: const Color(0xFF101C35),
        foregroundColor: Colors.white,
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.system_update_alt_rounded,
                size: 56,
                color: Color(0xFFC9A45C),
              ),
              const SizedBox(height: 16),
              const Text(
                'تحديثات برقيات الشرطة',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 8),
              const Text(
                'يتحقق التطبيق تلقائيًا من وجود إصدار أحدث عند تشغيله بعد تسجيل الدخول.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              FilledButton.icon(
                onPressed: _checking ? null : _check,
                icon: _checking
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.refresh),
                label: Text(_checking ? 'جارٍ التحقق...' : 'التحقق الآن'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
