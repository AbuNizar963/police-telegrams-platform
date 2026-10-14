import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

const _navy = Color(0xFF101C35);
const _gold = Color(0xFFC9A45C);
const _repository =
    'https://api.github.com/repos/AbuNizar963/police-telegrams-platform/releases/latest';
const _playStoreUrl =
    'https://play.google.com/store/apps/details?id=com.hadir.police.police_telegrams';

class _ReleaseInfo {
  const _ReleaseInfo({
    required this.version,
    required this.notes,
    required this.pageUrl,
    required this.apkUrl,
    required this.apkSize,
  });

  final String version;
  final String notes;
  final Uri pageUrl;
  final Uri? apkUrl;
  final int? apkSize;

  factory _ReleaseInfo.fromJson(Map<String, dynamic> json) {
    final tag = json['tag_name'];
    final htmlUrl = json['html_url'];
    final body = json['body'];
    final assets = json['assets'];
    if (tag is! String || tag.trim().isEmpty || htmlUrl is! String) {
      throw const FormatException('بيانات الإصدار غير مكتملة.');
    }

    final page = Uri.tryParse(htmlUrl);
    if (page == null || page.scheme != 'https' || page.host != 'github.com') {
      throw const FormatException('رابط الإصدار غير موثوق.');
    }

    Uri? apk;
    int? size;
    if (assets is List) {
      for (final asset in assets.whereType<Map>()) {
        final name = asset['name'];
        final url = asset['browser_download_url'];
        if (name is String &&
            name.toLowerCase().endsWith('.apk') &&
            url is String) {
          final parsed = Uri.tryParse(url);
          if (parsed != null &&
              parsed.scheme == 'https' &&
              parsed.host == 'github.com') {
            apk = parsed;
            final rawSize = asset['size'];
            if (rawSize is int && rawSize > 0) size = rawSize;
            break;
          }
        }
      }
    }

    return _ReleaseInfo(
      version: tag.replaceFirst(RegExp(r'^v', caseSensitive: false), ''),
      notes: body is String && body.trim().isNotEmpty
          ? body.trim()
          : 'لا توجد ملاحظات مرفقة لهذا الإصدار.',
      pageUrl: page,
      apkUrl: apk,
      apkSize: size,
    );
  }
}

class AppUpdatePage extends StatefulWidget {
  const AppUpdatePage({super.key});

  @override
  State<AppUpdatePage> createState() => _AppUpdatePageState();
}

class _AppUpdatePageState extends State<AppUpdatePage> {
  bool _checking = true;
  String? _error;
  String? _currentVersion;
  _ReleaseInfo? _release;
  bool _updateAvailable = false;

  @override
  void initState() {
    super.initState();
    _checkForUpdates();
  }

  Future<void> _checkForUpdates() async {
    if (mounted) {
      setState(() {
        _checking = true;
        _error = null;
      });
    }
    try {
      final info = await PackageInfo.fromPlatform();
      final response = await http
          .get(
            Uri.parse(_repository),
            headers: const {
              'Accept': 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
            },
          )
          .timeout(const Duration(seconds: 15));

      if (response.statusCode == 404) {
        throw const _NoPublishedRelease();
      }
      if (response.statusCode != 200) {
        throw Exception(
          'تعذر التحقق من التحديث (HTTP ${response.statusCode}).',
        );
      }

      final decoded = jsonDecode(response.body);
      if (decoded is! Map<String, dynamic>) {
        throw const FormatException('استجابة خادم التحديث غير صالحة.');
      }
      final release = _ReleaseInfo.fromJson(decoded);
      final available = _compareVersions(release.version, info.version) > 0;
      if (!mounted) return;
      setState(() {
        _currentVersion = '${info.version}+${info.buildNumber}';
        _release = release;
        _updateAvailable = available;
        _checking = false;
      });
    } on _NoPublishedRelease {
      if (!mounted) return;
      final info = await PackageInfo.fromPlatform();
      setState(() {
        _currentVersion = '${info.version}+${info.buildNumber}';
        _error =
            'لم يُنشر إصدار رسمي للتحديث بعد. يمكنك التحقق من Google Play.';
        _checking = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.toString().replaceFirst('Exception: ', '');
        _checking = false;
      });
    }
  }

  int _compareVersions(String latest, String current) {
    List<int> parse(String value) {
      final cleaned = value.split('+').first.split('-').first;
      return cleaned.split('.').map((part) => int.tryParse(part) ?? 0).toList();
    }

    final a = parse(latest);
    final b = parse(current);
    final length = a.length > b.length ? a.length : b.length;
    for (var i = 0; i < length; i++) {
      final left = i < a.length ? a[i] : 0;
      final right = i < b.length ? b[i] : 0;
      if (left != right) return left.compareTo(right);
    }
    return 0;
  }

  Future<void> _open(Uri uri) async {
    if (uri.scheme != 'https') {
      _showMessage('رُفض فتح رابط غير آمن.');
      return;
    }
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && mounted) {
      _showMessage('تعذر فتح الرابط. تحقق من اتصال الإنترنت ثم أعد المحاولة.');
    }
  }

  Future<void> _openPlayStore() => _open(Uri.parse(_playStoreUrl));

  void _showMessage(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  String _formatSize(int? bytes) {
    if (bytes == null) return 'غير معروف';
    if (bytes < 1024 * 1024) {
      return '${(bytes / 1024).toStringAsFixed(0)} كيلوبايت';
    }
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} ميغابايت';
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(
        title: const Text('تحديث التطبيق'),
        backgroundColor: _navy,
        foregroundColor: Colors.white,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const CircleAvatar(
                    radius: 32,
                    backgroundColor: _navy,
                    child: Icon(
                      Icons.system_update_alt,
                      color: _gold,
                      size: 32,
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'تحديثات برقيات الشرطة',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'الإصدار المثبت: ${_currentVersion ?? 'جارٍ التحقق...'}',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 18),
                  if (_checking) ...[
                    const LinearProgressIndicator(color: _gold),
                    const SizedBox(height: 10),
                    const Text(
                      'جارٍ التحقق من وجود إصدار أحدث...',
                      textAlign: TextAlign.center,
                    ),
                  ] else if (_error != null) ...[
                    const Icon(Icons.info_outline, size: 30, color: _navy),
                    const SizedBox(height: 8),
                    Text(_error!, textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed: _checkForUpdates,
                      icon: const Icon(Icons.refresh),
                      label: const Text('إعادة المحاولة'),
                    ),
                  ] else if (_updateAvailable && _release != null) ...[
                    Text(
                      'يتوفر إصدار أحدث: ${_release!.version}',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        color: _navy,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'حجم APK: ${_formatSize(_release!.apkSize)}',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF5F7FA),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(_release!.notes),
                    ),
                    const SizedBox(height: 16),
                    if (Platform.isAndroid && _release!.apkUrl != null)
                      FilledButton.icon(
                        onPressed: () => _open(_release!.apkUrl!),
                        icon: const Icon(Icons.download),
                        label: const Text('تنزيل APK مباشر'),
                      ),
                    const SizedBox(height: 8),
                    FilledButton.tonalIcon(
                      onPressed: _openPlayStore,
                      icon: const Icon(Icons.shop_outlined),
                      label: const Text('التحديث عبر Google Play'),
                    ),
                    TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('تخطي الآن'),
                    ),
                  ] else ...[
                    const Icon(
                      Icons.check_circle_outline,
                      color: Colors.green,
                      size: 36,
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'أنت تستخدم أحدث إصدار منشور.',
                      textAlign: TextAlign.center,
                    ),
                    TextButton.icon(
                      onPressed: _checkForUpdates,
                      icon: const Icon(Icons.refresh),
                      label: const Text('التحقق مجددًا'),
                    ),
                  ],
                ],
              ),
            ),
          ),
          if (_release != null && !_updateAvailable)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: TextButton(
                onPressed: () => _open(_release!.pageUrl),
                child: const Text('عرض صفحة الإصدار'),
              ),
            ),
        ],
      ),
    ),
  );
}

class _NoPublishedRelease implements Exception {
  const _NoPublishedRelease();
}
