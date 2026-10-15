import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';

import 'app_update_service.dart';

const _updateNavy = Color(0xFF101C35);
const _updateGold = Color(0xFFC9A45C);

class AppUpdatePage extends StatefulWidget {
  const AppUpdatePage({super.key});

  @override
  State<AppUpdatePage> createState() => _AppUpdatePageState();
}

class _AppUpdatePageState extends State<AppUpdatePage> {
  bool _checking = false;
  bool _loadingVersion = true;
  String _version = '—';
  String? _versionError;

  @override
  void initState() {
    super.initState();
    _loadVersion();
  }

  Future<void> _loadVersion() async {
    try {
      final info = await PackageInfo.fromPlatform();
      if (!mounted) return;
      setState(() {
        _version = '${info.version}+${info.buildNumber}';
        _loadingVersion = false;
        _versionError = null;
      });
    } catch (error) {
      debugPrint('Unable to load app version: $error');
      if (!mounted) return;
      setState(() {
        _loadingVersion = false;
        _versionError = 'تعذر قراءة رقم الإصدار من النظام.';
      });
    }
  }

  Future<void> _check() async {
    if (_checking) return;
    setState(() => _checking = true);
    try {
      await checkAndPromptForAppUpdate(context, showResult: true);
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(
        title: const Text('حول التطبيق'),
        backgroundColor: _updateNavy,
        foregroundColor: Colors.white,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const SizedBox(height: 12),
          Center(
            child: Container(
              width: 92,
              height: 92,
              decoration: BoxDecoration(
                color: _updateNavy,
                borderRadius: BorderRadius.circular(26),
                boxShadow: [
                  BoxShadow(
                    color: _updateNavy.withValues(alpha: 0.14),
                    blurRadius: 22,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(26),
                child: Image.asset(
                  'assets/police-telegrams-icon.png',
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => const Icon(
                    Icons.local_police_rounded,
                    color: _updateGold,
                    size: 48,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 18),
          const Text(
            'برقيات الشرطة',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: _updateNavy,
              fontSize: 24,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'منصة رسمية لإدارة البرقيات والعمليات',
            textAlign: TextAlign.center,
            style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: 28),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Row(
                children: [
                  Container(
                    width: 46,
                    height: 46,
                    decoration: BoxDecoration(
                      color: _updateGold.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Icon(
                      Icons.verified_outlined,
                      color: _updateNavy,
                      size: 25,
                    ),
                  ),
                  const SizedBox(width: 14),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'الإصدار الحالي',
                          style: TextStyle(fontWeight: FontWeight.w800),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'رقم النسخة المثبتة على هذا الجهاز',
                          style: TextStyle(fontSize: 12, color: Colors.grey),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  if (_loadingVersion)
                    const SizedBox.square(
                      dimension: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  else
                    Text(
                      _version,
                      textDirection: TextDirection.ltr,
                      style: const TextStyle(
                        color: _updateNavy,
                        fontWeight: FontWeight.w900,
                        fontSize: 14,
                      ),
                    ),
                ],
              ),
            ),
          ),
          if (_versionError != null) ...[
            const SizedBox(height: 8),
            Text(
              _versionError!,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.red, fontSize: 12),
            ),
            Center(
              child: TextButton.icon(
                onPressed: _loadVersion,
                icon: const Icon(Icons.refresh),
                label: const Text('إعادة قراءة الإصدار'),
              ),
            ),
          ],
          const SizedBox(height: 14),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.system_update_alt_rounded, color: _updateGold),
                      SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'تحديث التطبيق',
                          style: TextStyle(fontWeight: FontWeight.w900),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'ابحث عن أحدث إصدار رسمي. إذا توفر تحديث، سيعرض التطبيق رقم الإصدار وحجمه وملاحظاته قبل بدء التنزيل.',
                    style: TextStyle(fontSize: 13, height: 1.6),
                  ),
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    style: FilledButton.styleFrom(
                      backgroundColor: _updateNavy,
                      foregroundColor: Colors.white,
                      minimumSize: const Size.fromHeight(48),
                    ),
                    onPressed: _checking ? null : _check,
                    icon: _checking
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.manage_search_rounded),
                    label: Text(
                      _checking ? 'جارٍ البحث عن التحديثات...' : 'البحث عن تحديث',
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'يتم التحقق من الإصدار المنشور، ولا يبدأ تنزيل أي تحديث إلا بعد موافقتك.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'يتم التحقق تلقائيًا من وجود إصدار أحدث عند تشغيل التطبيق بعد تسجيل الدخول.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              fontSize: 12,
            ),
          ),
        ],
      ),
    ),
  );
}
