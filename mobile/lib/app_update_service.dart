import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';

const _releaseApi =
    'https://api.github.com/repos/AbuNizar963/police-telegrams-platform/releases/latest';
const _installerChannel = MethodChannel(
  'com.hadir.police.police_telegrams/apk_installer',
);
const _updateNavy = Color(0xFF101C35);
const _updateGold = Color(0xFFC9A45C);

class _MobileRelease {
  const _MobileRelease({
    required this.version,
    required this.buildNumber,
    required this.notes,
    required this.apkUrl,
    required this.apkSize,
  });

  final String version;
  final int buildNumber;
  final String notes;
  final Uri apkUrl;
  final int apkSize;

  factory _MobileRelease.fromJson(Map<String, dynamic> json) {
    final tag = json['tag_name'];
    final assets = json['assets'];
    if (tag is! String) {
      throw const FormatException('تعذر قراءة رقم إصدار التحديث.');
    }

    final match = RegExp(
      r'^v?(\d+\.\d+\.\d+)(?:-build\.(\d+))?$',
      caseSensitive: false,
    ).firstMatch(tag.trim());
    if (match == null) {
      throw const FormatException('صيغة رقم إصدار التحديث غير مدعومة.');
    }

    Uri? apkUrl;
    int? apkSize;
    if (assets is List) {
      for (final item in assets.whereType<Map>()) {
        final name = item['name'];
        final url = item['browser_download_url'];
        if (name is String &&
            name.toLowerCase().endsWith('.apk') &&
            url is String) {
          final candidate = Uri.tryParse(url);
          if (candidate != null &&
              candidate.scheme == 'https' &&
              candidate.host == 'github.com' &&
              candidate.path.contains('/releases/download/')) {
            apkUrl = candidate;
            if (item['size'] is int && (item['size'] as int) > 0) {
              apkSize = item['size'] as int;
            }
            break;
          }
        }
      }
    }

    if (apkUrl == null || apkSize == null) {
      throw const FormatException(
        'الإصدار منشور، لكن ملف APK غير متوفر للتنزيل.',
      );
    }

    final body = json['body'];
    return _MobileRelease(
      version: match.group(1)!,
      buildNumber: int.tryParse(match.group(2) ?? '') ?? 0,
      notes: body is String && body.trim().isNotEmpty
          ? body.trim()
          : 'لا توجد ملاحظات مرفقة لهذا الإصدار.',
      apkUrl: apkUrl,
      apkSize: apkSize,
    );
  }
}

/// Checks for a newer signed Android release and offers an in-app download.
/// Android still displays its own confirmation screen before installing an APK.
Future<void> checkAndPromptForAppUpdate(
  BuildContext context, {
  bool showResult = false,
}) async {
  if (!Platform.isAndroid || !context.mounted) return;

  try {
    final packageInfo = await PackageInfo.fromPlatform();
    final response = await http
        .get(
          Uri.parse(_releaseApi),
          headers: const {
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        )
        .timeout(const Duration(seconds: 15));

    if (response.statusCode != 200) {
      throw Exception(
        'تعذر التحقق من التحديثات (HTTP ${response.statusCode}).',
      );
    }

    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('استجابة خادم التحديث غير صالحة.');
    }
    final release = _MobileRelease.fromJson(decoded);
    final comparison = _compareVersion(release.version, packageInfo.version);
    final currentBuild = int.tryParse(packageInfo.buildNumber) ?? 0;
    final updateAvailable =
        comparison > 0 ||
        (comparison == 0 && release.buildNumber > currentBuild);
    if (!updateAvailable || !context.mounted) {
      if (showResult && context.mounted) {
        _showUpdateMessage(context, 'أنت تستخدم أحدث إصدار منشور.');
      }
      return;
    }

    final shouldUpdate = await showDialog<bool>(
      context: context,
      barrierDismissible: true,
      builder: (dialogContext) => Directionality(
        textDirection: TextDirection.rtl,
        child: AlertDialog(
          icon: const Icon(
            Icons.system_update_alt_rounded,
            color: _updateGold,
            size: 42,
          ),
          title: const Text(
            'تحديث جديد متوفر الآن',
            textAlign: TextAlign.center,
            style: TextStyle(fontWeight: FontWeight.w900),
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'الإصدار الجديد: ${release.version}+${release.buildNumber}',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  'حجم التحديث: ${(release.apkSize / (1024 * 1024)).toStringAsFixed(1)} ميغابايت',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 12),
                Container(
                  constraints: const BoxConstraints(maxHeight: 180),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF5F7FA),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: SingleChildScrollView(child: Text(release.notes)),
                ),
                const SizedBox(height: 10),
                const Text(
                  'سيتم تنزيل التحديث داخل التطبيق، ثم سيطلب Android تأكيد التثبيت.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12, color: Colors.black54),
                ),
              ],
            ),
          ),
          actionsAlignment: MainAxisAlignment.spaceBetween,
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('تخطي'),
            ),
            FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: _updateNavy,
                foregroundColor: Colors.white,
              ),
              onPressed: () => Navigator.pop(dialogContext, true),
              icon: const Icon(Icons.download_rounded),
              label: const Text('تحديث الآن'),
            ),
          ],
        ),
      ),
    );

    if (shouldUpdate == true && context.mounted) {
      await _downloadAndInstall(context, release);
    }
  } catch (error) {
    // Update checks must never prevent access to the app if GitHub is offline.
    debugPrint('App update check failed: $error');
    if (showResult && context.mounted) {
      _showUpdateMessage(
        context,
        'تعذر التحقق من التحديث الآن. تحقق من الاتصال ثم أعد المحاولة.',
      );
    }
  }
}

Future<void> _downloadAndInstall(
  BuildContext context,
  _MobileRelease release,
) async {
  final messenger = ScaffoldMessenger.maybeOf(context);
  try {
    try {
      await _installerChannel.invokeMethod<bool>(
        'requestUpdateNotificationPermission',
      );
    } on PlatformException catch (error) {
      debugPrint(
        'Update notification permission unavailable: ${error.message}',
      );
    }

    final downloadId = await _installerChannel.invokeMethod<int>(
      'enqueueBackgroundDownload',
      {'url': release.apkUrl.toString(), 'expectedSize': release.apkSize},
    );
    if (downloadId == null || downloadId <= 0) {
      throw Exception('تعذر بدء تنزيل التحديث في الخلفية.');
    }

    messenger?.showSnackBar(
      const SnackBar(
        duration: Duration(seconds: 8),
        behavior: SnackBarBehavior.floating,
        content: Text(
          'بدأ تنزيل التحديث بواسطة Android. سيستمر التنزيل عند مغادرة التطبيق، ويمكنك متابعة تقدمه من شريط الإشعارات.',
        ),
      ),
    );

    // Android DownloadManager owns the network transfer. It continues when
    // Flutter is paused or the app process is reclaimed by the system.
    while (context.mounted) {
      await Future<void>.delayed(const Duration(seconds: 2));
      if (!context.mounted) return;

      final status = await _installerChannel.invokeMapMethod<String, dynamic>(
        'queryBackgroundDownload',
        {'id': downloadId},
      );
      if (status == null) continue;

      final state = status['status'];
      if (state == 'failed' || state == 'not_found') {
        final reason = status['reason'];
        throw Exception(
          'فشل تنزيل التحديث في الخلفية'
          '${reason == null ? '.' : ' (رمز الخطأ: $reason).'}',
        );
      }
      if (state != 'successful') continue;

      final downloaded = (status['downloaded'] as num?)?.toInt() ?? 0;
      final reportedTotal = (status['total'] as num?)?.toInt() ?? 0;
      if (downloaded != release.apkSize ||
          (reportedTotal > 0 && reportedTotal != release.apkSize)) {
        throw Exception('حجم ملف التحديث لا يطابق الإصدار المنشور.');
      }

      final localUri = status['localUri'] as String?;
      if (localUri == null || localUri.isEmpty) {
        throw Exception('اكتمل التنزيل لكن تعذر تحديد ملف التحديث.');
      }
      final localPath = Uri.tryParse(localUri)?.toFilePath();
      if (localPath == null || localPath.isEmpty) {
        throw Exception('مسار ملف التحديث الذي أعاده Android غير صالح.');
      }

      if (context.mounted) {
        messenger?.hideCurrentSnackBar();
      }
      if (!context.mounted) return;

      final result = await _installerChannel.invokeMethod<String>(
        'installApk',
        {'path': localPath},
      );
      if (result == 'permission_required' && context.mounted) {
        await showDialog<void>(
          context: context,
          builder: (dialogContext) => Directionality(
            textDirection: TextDirection.rtl,
            child: AlertDialog(
              title: const Text('السماح بتثبيت التحديث'),
              content: const Text(
                'افتح إعدادات Android وفعّل السماح بتثبيت التطبيقات من هذا المصدر. بعد العودة، اضغط «إعادة محاولة التثبيت».',
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(dialogContext),
                  child: const Text('لاحقًا'),
                ),
                TextButton(
                  onPressed: () async {
                    try {
                      await _installerChannel.invokeMethod<String>(
                        'openInstallSettings',
                      );
                    } on PlatformException catch (error) {
                      if (context.mounted) {
                        _showUpdateMessage(
                          context,
                          error.message ?? 'تعذر فتح إعدادات التثبيت.',
                        );
                      }
                    }
                  },
                  child: const Text('فتح الإعدادات'),
                ),
                FilledButton(
                  onPressed: () async {
                    Navigator.pop(dialogContext);
                    await _retryInstall(context, localPath);
                  },
                  child: const Text('إعادة محاولة التثبيت'),
                ),
              ],
            ),
          ),
        );
      } else if (result != 'launched' && context.mounted) {
        _showUpdateMessage(context, 'تعذر فتح مُثبّت Android. أعد المحاولة.');
      }
      return;
    }
  } catch (error) {
    if (context.mounted) {
      messenger?.hideCurrentSnackBar();
      _showUpdateMessage(
        context,
        error.toString().replaceFirst('Exception: ', ''),
      );
    }
  }
}

Future<void> _retryInstall(BuildContext context, String path) async {
  try {
    final result = await _installerChannel.invokeMethod<String>('installApk', {
      'path': path,
    });
    if (result == 'permission_required' && context.mounted) {
      _showUpdateMessage(
        context,
        'لم يُفعّل إذن التثبيت بعد. فعّله من إعدادات Android ثم أعد المحاولة.',
      );
    } else if (result != 'launched' && context.mounted) {
      _showUpdateMessage(context, 'تعذر فتح مُثبّت Android.');
    }
  } on PlatformException catch (error) {
    if (context.mounted) {
      _showUpdateMessage(context, error.message ?? 'تعذر بدء التثبيت.');
    }
  }
}

void _showUpdateMessage(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text(message), behavior: SnackBarBehavior.floating),
  );
}

int _compareVersion(String latest, String current) {
  List<int> parse(String value) =>
      value.split('.').map((part) => int.tryParse(part) ?? 0).toList();
  final a = parse(latest);
  final b = parse(current);
  final componentCount = a.length > b.length ? a.length : b.length;
  for (var index = 0; index < componentCount; index++) {
    final left = index < a.length ? a[index] : 0;
    final right = index < b.length ? b[index] : 0;
    if (left != right) return left.compareTo(right);
  }
  return 0;
}
