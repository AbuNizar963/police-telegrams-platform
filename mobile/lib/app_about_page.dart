import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';

const _appAboutNavy = Color(0xFF10233F);
const _appAboutGold = Color(0xFFD8C38E);

class AppAboutPage extends StatefulWidget {
  const AppAboutPage({super.key});

  @override
  State<AppAboutPage> createState() => _AppAboutPageState();
}

class _AppAboutPageState extends State<AppAboutPage> {
  String _version = 'جارٍ التحميل...';

  @override
  void initState() {
    super.initState();
    _loadVersion();
  }

  Future<void> _loadVersion() async {
    try {
      final info = await PackageInfo.fromPlatform();
      if (!mounted) return;
      setState(() => _version = '${info.version}+${info.buildNumber}');
    } catch (error) {
      debugPrint('Unable to load app version: $error');
      if (!mounted) return;
      setState(() => _version = 'غير متاح');
    }
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(
        title: const Text('حول التطبيق'),
        backgroundColor: _appAboutNavy,
        foregroundColor: Colors.white,
      ),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const SizedBox(height: 20),
          Center(
            child: Container(
              width: 104,
              height: 104,
              decoration: BoxDecoration(
                color: _appAboutNavy,
                borderRadius: BorderRadius.circular(26),
                boxShadow: [
                  BoxShadow(
                    color: _appAboutNavy.withValues(alpha: 0.16),
                    blurRadius: 22,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              clipBehavior: Clip.antiAlias,
              child: Image.asset(
                'assets/police-telegrams-icon.png',
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => const Icon(
                  Icons.local_police_rounded,
                  color: _appAboutGold,
                  size: 52,
                ),
              ),
            ),
          ),
          const SizedBox(height: 20),
          const Text(
            'برقيات الشرطة',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: _appAboutNavy,
              fontSize: 25,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'تطبيق الهاتف المحمول للوصول إلى نظام برقيات الشرطة.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              height: 1.6,
            ),
          ),
          const SizedBox(height: 28),
          Card(
            child: ListTile(
              leading: const Icon(
                Icons.info_outline_rounded,
                color: _appAboutNavy,
              ),
              title: const Text(
                'إصدار التطبيق',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
              subtitle: const Text('رقم النسخة المثبتة على هذا الجهاز'),
              trailing: Text(
                _version,
                textDirection: TextDirection.ltr,
                style: const TextStyle(
                  color: _appAboutNavy,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          const Card(
            child: Padding(
              padding: EdgeInsets.all(18),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.security_outlined, color: _appAboutNavy),
                  SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'الاستخدام والصلاحيات',
                          style: TextStyle(fontWeight: FontWeight.w800),
                        ),
                        SizedBox(height: 6),
                        Text(
                          'تظهر البيانات والإجراءات المتاحة وفق حساب المستخدم والصلاحيات الممنوحة له.',
                          style: TextStyle(height: 1.6),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    ),
  );
}
