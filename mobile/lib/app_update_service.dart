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
    required this.apkSha256,
  });

  final String version;
  final int buildNumber;
  final String notes;
  final Uri apkUrl;
  final int apkSize;
  final String apkSha256;

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
    String? apkSha256;
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
            final digest = item['digest'];
            if (digest is String &&
                RegExp(
                  r'^sha256:[a-f0-9]{64}$',
                  caseSensitive: false,
                ).hasMatch(digest)) {
              apkSha256 = digest.substring('sha256:'.length).toLowerCase();
            }
            break;
          }
        }
      }
    }

    if (apkUrl == null || apkSize == null || apkSha256 == null) {
      throw const FormatException(
        'الإصدار المنشور لا يتضمن ملف APK أو بصمة SHA-256 صالحة؛ أُوقف التحديث حفاظًا على السلامة.',
      );
    }

    final body = json['body'];
    final notes = _cleanReleaseNotes(body is String ? body : '');
    return _MobileRelease(
      version: match.group(1)!,
      buildNumber: int.tryParse(match.group(2) ?? '') ?? 0,
      notes: notes.isNotEmpty
          ? notes
          : 'لا توجد تغييرات موضحة لهذا الإصدار.',
      apkUrl: apkUrl,
      apkSize: apkSize,
      apkSha256: apkSha256,
    );
  }
}

/// Keeps human-readable change descriptions and removes GitHub-generated
/// release boilerplate, contributor attribution, workflow-only entries, and
/// the comparison URL from the update dialog.
String _cleanReleaseNotes(String raw) {
  final cleanedLines = <String>[];
  var inContributorSection = false;

  for (final sourceLine in raw.replaceAll('\r\n', '\n').split('\n')) {
    final line = sourceLine.trim();
    if (line.isEmpty) continue;

    final normalized = line.toLowerCase();
    if (RegExp(r'^#{1,6}\s*(new contributors|contributors)\s*$')
        .hasMatch(normalized)) {
      inContributorSection = true;
      continue;
    }
    if (RegExp(r'^#{1,6}\s+').hasMatch(line)) {
      inContributorSection = false;
      if (RegExp(r'^#{1,6}\s*(what.s changed|full changelog)\s*$',
              caseSensitive: false)
          .hasMatch(line)) {
        continue;
      }
    }
    if (inContributorSection ||
        RegExp(r'^\*\*full changelog\*\*\s*:', caseSensitive: false)
            .hasMatch(line) ||
        RegExp(r'^full changelog\s*:', caseSensitive: false).hasMatch(line) ||
        RegExp(r'^(?:[-*]\s*)?workflows?\s+by\s+@', caseSensitive: false)
            .hasMatch(line)) {
      continue;
    }

    final withoutAttribution = line.replaceFirst(
      RegExp(r'\s+by\s+@[^\s]+\s+in\s+https?://\S+.*$',
          caseSensitive: false),
      '',
    );
    final description = withoutAttribution
        .replaceFirst(
          RegExp(r'\s+in\s+https?://github\.com/\S+.*$',
              caseSensitive: false),
          '',
        )
        .trim();
    if (description.isEmpty || description == '-' || description == '*') {
      continue;
    }
    cleanedLines.add(description);
  }

  return cleanedLines.join('\n').trim();
}
class _PendingMobileUpdate {
  const _PendingMobileUpdate({
    required this.id,
    required this.version,
    required this.buildNumber,
    required this.expectedSize,
    required this.expectedSha256,
  });

  final int id;
  final String version;
  final int buildNumber;
  final int expectedSize;
  final String expectedSha256;

  factory _PendingMobileUpdate.fromMap(Map<String, dynamic> map) {
    final id = (map['id'] as num?)?.toInt();
    final version = map['version'];
    final buildNumber = (map['buildNumber'] as num?)?.toInt();
    final expectedSize = (map['expectedSize'] as num?)?.toInt();
    final hash = map['expectedSha256'];
    if (id == null ||
        id <= 0 ||
        version is! String ||
        !RegExp(r'^\d+\.\d+\.\d+$').hasMatch(version) ||
        buildNumber == null ||
        buildNumber <= 0 ||
        expectedSize == null ||
        expectedSize <= 0 ||
        hash is! String ||
        !RegExp(r'^[a-f0-9]{64}$', caseSensitive: false).hasMatch(hash)) {
      throw const FormatException('بيانات التحديث المحفوظة غير صالحة.');
    }
    return _PendingMobileUpdate(
      id: id,
      version: version,
      buildNumber: buildNumber,
      expectedSize: expectedSize,
      expectedSha256: hash.toLowerCase(),
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
    if (!context.mounted) return;
    final resumed = await _resumePendingUpdate(context, packageInfo);
    if (resumed || !context.mounted) return;

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
      {
        'url': release.apkUrl.toString(),
        'expectedSize': release.apkSize,
        'expectedSha256': release.apkSha256,
        'version': release.version,
        'buildNumber': release.buildNumber,
      },
    );
    if (downloadId == null || downloadId <= 0) {
      throw Exception('تعذر بدء تنزيل التحديث في الخلفية.');
    }
    if (!context.mounted) return;

    messenger?.showSnackBar(
      const SnackBar(
        duration: Duration(seconds: 8),
        behavior: SnackBarBehavior.floating,
        content: Text(
          'بدأ تنزيل التحديث بواسطة Android. سيستمر التنزيل عند مغادرة التطبيق، ويمكنك متابعة تقدمه من شريط الإشعارات.',
        ),
      ),
    );

    await _watchBackgroundDownload(
      context,
      downloadId: downloadId,
      expectedSize: release.apkSize,
      expectedSha256: release.apkSha256,
    );
  } catch (error) {
    if (context.mounted) {
      messenger?.hideCurrentSnackBar();
      _showUpdateMessage(context, _updateErrorMessage(error));
    }
  }
}

Future<void> _watchBackgroundDownload(
  BuildContext context, {
  required int downloadId,
  required int expectedSize,
  required String expectedSha256,
}) async {
  final messenger = ScaffoldMessenger.maybeOf(context);
  try {
    // DownloadManager owns the transfer and retains it when this process exits.
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
        await _installerChannel.invokeMethod<void>('clearPendingUpdate');
        throw Exception(
          'فشل تنزيل التحديث في الخلفية'
          '${reason == null ? '.' : ' (رمز الخطأ: $reason).'}',
        );
      }
      if (state != 'successful') continue;

      final downloaded = (status['downloaded'] as num?)?.toInt() ?? 0;
      final reportedTotal = (status['total'] as num?)?.toInt() ?? 0;
      if (downloaded != expectedSize ||
          (reportedTotal > 0 && reportedTotal != expectedSize)) {
        await _installerChannel.invokeMethod<void>('clearPendingUpdate');
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

      messenger?.hideCurrentSnackBar();
      if (!context.mounted) return;
      final result = await _installerChannel.invokeMethod<String>(
        'installApk',
        {'path': localPath, 'expectedSha256': expectedSha256},
      );
      if (result == 'permission_required' && context.mounted) {
        await _showInstallPermissionDialog(context, localPath, expectedSha256);
      } else if (result != 'launched' && context.mounted) {
        _showUpdateMessage(context, 'تعذر فتح مُثبّت Android. أعد المحاولة.');
      }
      return;
    }
  } catch (error) {
    if (error is PlatformException && error.code == 'APK_CHECKSUM_MISMATCH') {
      await _installerChannel.invokeMethod<void>('clearPendingUpdate');
    }
    if (context.mounted) {
      messenger?.hideCurrentSnackBar();
      _showUpdateMessage(context, _updateErrorMessage(error));
    }
  }
}

Future<void> _showInstallPermissionDialog(
  BuildContext context,
  String localPath,
  String expectedSha256,
) async {
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
              await _retryInstall(context, localPath, expectedSha256);
            },
            child: const Text('إعادة محاولة التثبيت'),
          ),
        ],
      ),
    ),
  );
}

Future<void> _retryInstall(
  BuildContext context,
  String path,
  String expectedSha256,
) async {
  try {
    final result = await _installerChannel.invokeMethod<String>('installApk', {
      'path': path,
      'expectedSha256': expectedSha256,
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
      if (error.code == 'APK_CHECKSUM_MISMATCH') {
        await _installerChannel.invokeMethod<void>('clearPendingUpdate');
      }
      if (!context.mounted) return;
      _showUpdateMessage(context, error.message ?? 'تعذر بدء التثبيت.');
    }
  }
}

String _updateErrorMessage(Object error) {
  if (error is PlatformException) {
    return error.message ?? 'تعذر متابعة تثبيت التحديث.';
  }
  return error.toString().replaceFirst('Exception: ', '');
}

void _showUpdateMessage(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text(message), behavior: SnackBarBehavior.floating),
  );
}

Future<bool> _resumePendingUpdate(
  BuildContext context,
  PackageInfo packageInfo,
) async {
  final raw = await _installerChannel.invokeMapMethod<String, dynamic>(
    'getPendingUpdate',
  );
  if (raw == null) return false;

  late final _PendingMobileUpdate pending;
  try {
    pending = _PendingMobileUpdate.fromMap(raw);
  } on FormatException catch (error) {
    await _installerChannel.invokeMethod<void>('clearPendingUpdate');
    if (context.mounted) {
      _showUpdateMessage(context, error.message);
    }
    return false;
  }

  final installedVersion = _compareVersion(
    packageInfo.version,
    pending.version,
  );
  final installedBuild = int.tryParse(packageInfo.buildNumber) ?? 0;
  if (installedVersion > 0 ||
      (installedVersion == 0 && installedBuild >= pending.buildNumber)) {
    await _installerChannel.invokeMethod<void>('clearPendingUpdate');
    return false;
  }

  final status = await _installerChannel.invokeMapMethod<String, dynamic>(
    'queryBackgroundDownload',
    {'id': pending.id},
  );
  final state = status?['status'];
  if (state == null || state == 'not_found' || state == 'failed') {
    await _installerChannel.invokeMethod<void>('clearPendingUpdate');
    if (context.mounted) {
      _showUpdateMessage(
        context,
        'تعذر استعادة تنزيل التحديث السابق. يمكنك التحقق من التحديثات والمحاولة مجددًا.',
      );
    }
    return false;
  }

  if (!context.mounted) return true;
  final downloaded = state == 'successful';
  final shouldResume = await showDialog<bool>(
    context: context,
    barrierDismissible: true,
    builder: (dialogContext) => Directionality(
      textDirection: TextDirection.rtl,
      child: AlertDialog(
        title: Text(downloaded ? 'التحديث جاهز للتثبيت' : 'تنزيل تحديث محفوظ'),
        content: Text(
          downloaded
              ? 'عُثر على ملف التحديث ${pending.version}+${pending.buildNumber} الذي اكتمل تنزيله سابقًا. سيُتحقق من حجمه وبصمته قبل فتح مُثبّت Android.'
              : 'عُثر على تنزيل التحديث ${pending.version}+${pending.buildNumber} (${_downloadStateLabel(state)}). يمكنك متابعة التنزيل أو تركه يعمل في الخلفية والعودة لاحقًا.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('لاحقًا'),
          ),
          FilledButton.icon(
            onPressed: () => Navigator.pop(dialogContext, true),
            icon: Icon(downloaded ? Icons.system_update_alt : Icons.download),
            label: Text(downloaded ? 'التحقق والتثبيت' : 'متابعة التنزيل'),
          ),
        ],
      ),
    ),
  );

  if (shouldResume == true && context.mounted) {
    await _watchBackgroundDownload(
      context,
      downloadId: pending.id,
      expectedSize: pending.expectedSize,
      expectedSha256: pending.expectedSha256,
    );
  }
  return true;
}

String _downloadStateLabel(dynamic state) {
  switch (state) {
    case 'running':
      return 'قيد التنزيل';
    case 'pending':
      return 'بانتظار بدء التنزيل';
    case 'paused':
      return 'متوقف مؤقتًا بانتظار الشبكة';
    default:
      return 'قيد المعالجة';
  }
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

class _PendingMobileUpdate {
  const _PendingMobileUpdate({
    required this.id,
    required this.version,
    required this.buildNumber,
    required this.expectedSize,
    required this.expectedSha256,
  });

  final int id;
  final String version;
  final int buildNumber;
  final int expectedSize;
  final String expectedSha256;

  factory _PendingMobileUpdate.fromMap(Map<String, dynamic> map) {
    final id = (map['id'] as num?)?.toInt();
    final version = map['version'];
    final buildNumber = (map['buildNumber'] as num?)?.toInt();
    final expectedSize = (map['expectedSize'] as num?)?.toInt();
    final hash = map['expectedSha256'];
    if (id == null ||
        id <= 0 ||
        version is! String ||
        !RegExp(r'^\d+\.\d+\.\d+$').hasMatch(version) ||
        buildNumber == null ||
        buildNumber <= 0 ||
        expectedSize == null ||
        expectedSize <= 0 ||
        hash is! String ||
        !RegExp(r'^[a-f0-9]{64}$', caseSensitive: false).hasMatch(hash)) {
      throw const FormatException('بيانات التحديث المحفوظة غير صالحة.');
    }
    return _PendingMobileUpdate(
      id: id,
      version: version,
      buildNumber: buildNumber,
      expectedSize: expectedSize,
      expectedSha256: hash.toLowerCase(),
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
    if (!context.mounted) return;
    final resumed = await _resumePendingUpdate(context, packageInfo);
    if (resumed || !context.mounted) return;

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
      {
        'url': release.apkUrl.toString(),
        'expectedSize': release.apkSize,
        'expectedSha256': release.apkSha256,
        'version': release.version,
        'buildNumber': release.buildNumber,
      },
    );
    if (downloadId == null || downloadId <= 0) {
      throw Exception('تعذر بدء تنزيل التحديث في الخلفية.');
    }
    if (!context.mounted) return;

    messenger?.showSnackBar(
      const SnackBar(
        duration: Duration(seconds: 8),
        behavior: SnackBarBehavior.floating,
        content: Text(
          'بدأ تنزيل التحديث بواسطة Android. سيستمر التنزيل عند مغادرة التطبيق، ويمكنك متابعة تقدمه من شريط الإشعارات.',
        ),
      ),
    );

    await _watchBackgroundDownload(
      context,
      downloadId: downloadId,
      expectedSize: release.apkSize,
      expectedSha256: release.apkSha256,
    );
  } catch (error) {
    if (context.mounted) {
      messenger?.hideCurrentSnackBar();
      _showUpdateMessage(context, _updateErrorMessage(error));
    }
  }
}

Future<void> _watchBackgroundDownload(
  BuildContext context, {
  required int downloadId,
  required int expectedSize,
  required String expectedSha256,
}) async {
  final messenger = ScaffoldMessenger.maybeOf(context);
  try {
    // DownloadManager owns the transfer and retains it when this process exits.
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
        await _installerChannel.invokeMethod<void>('clearPendingUpdate');
        throw Exception(
          'فشل تنزيل التحديث في الخلفية'
          '${reason == null ? '.' : ' (رمز الخطأ: $reason).'}',
        );
      }
      if (state != 'successful') continue;

      final downloaded = (status['downloaded'] as num?)?.toInt() ?? 0;
      final reportedTotal = (status['total'] as num?)?.toInt() ?? 0;
      if (downloaded != expectedSize ||
          (reportedTotal > 0 && reportedTotal != expectedSize)) {
        await _installerChannel.invokeMethod<void>('clearPendingUpdate');
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

      messenger?.hideCurrentSnackBar();
      if (!context.mounted) return;
      final result = await _installerChannel.invokeMethod<String>(
        'installApk',
        {'path': localPath, 'expectedSha256': expectedSha256},
      );
      if (result == 'permission_required' && context.mounted) {
        await _showInstallPermissionDialog(context, localPath, expectedSha256);
      } else if (result != 'launched' && context.mounted) {
        _showUpdateMessage(context, 'تعذر فتح مُثبّت Android. أعد المحاولة.');
      }
      return;
    }
  } catch (error) {
    if (error is PlatformException && error.code == 'APK_CHECKSUM_MISMATCH') {
      await _installerChannel.invokeMethod<void>('clearPendingUpdate');
    }
    if (context.mounted) {
      messenger?.hideCurrentSnackBar();
      _showUpdateMessage(context, _updateErrorMessage(error));
    }
  }
}

Future<void> _showInstallPermissionDialog(
  BuildContext context,
  String localPath,
  String expectedSha256,
) async {
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
              await _retryInstall(context, localPath, expectedSha256);
            },
            child: const Text('إعادة محاولة التثبيت'),
          ),
        ],
      ),
    ),
  );
}

Future<void> _retryInstall(
  BuildContext context,
  String path,
  String expectedSha256,
) async {
  try {
    final result = await _installerChannel.invokeMethod<String>('installApk', {
      'path': path,
      'expectedSha256': expectedSha256,
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
      if (error.code == 'APK_CHECKSUM_MISMATCH') {
        await _installerChannel.invokeMethod<void>('clearPendingUpdate');
      }
      if (!context.mounted) return;
      _showUpdateMessage(context, error.message ?? 'تعذر بدء التثبيت.');
    }
  }
}

String _updateErrorMessage(Object error) {
  if (error is PlatformException) {
    return error.message ?? 'تعذر متابعة تثبيت التحديث.';
  }
  return error.toString().replaceFirst('Exception: ', '');
}

void _showUpdateMessage(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text(message), behavior: SnackBarBehavior.floating),
  );
}

Future<bool> _resumePendingUpdate(
  BuildContext context,
  PackageInfo packageInfo,
) async {
  final raw = await _installerChannel.invokeMapMethod<String, dynamic>(
    'getPendingUpdate',
  );
  if (raw == null) return false;

  late final _PendingMobileUpdate pending;
  try {
    pending = _PendingMobileUpdate.fromMap(raw);
  } on FormatException catch (error) {
    await _installerChannel.invokeMethod<void>('clearPendingUpdate');
    if (context.mounted) {
      _showUpdateMessage(context, error.message);
    }
    return false;
  }

  final installedVersion = _compareVersion(
    packageInfo.version,
    pending.version,
  );
  final installedBuild = int.tryParse(packageInfo.buildNumber) ?? 0;
  if (installedVersion > 0 ||
      (installedVersion == 0 && installedBuild >= pending.buildNumber)) {
    await _installerChannel.invokeMethod<void>('clearPendingUpdate');
    return false;
  }

  final status = await _installerChannel.invokeMapMethod<String, dynamic>(
    'queryBackgroundDownload',
    {'id': pending.id},
  );
  final state = status?['status'];
  if (state == null || state == 'not_found' || state == 'failed') {
    await _installerChannel.invokeMethod<void>('clearPendingUpdate');
    if (context.mounted) {
      _showUpdateMessage(
        context,
        'تعذر استعادة تنزيل التحديث السابق. يمكنك التحقق من التحديثات والمحاولة مجددًا.',
      );
    }
    return false;
  }

  if (!context.mounted) return true;
  final downloaded = state == 'successful';
  final shouldResume = await showDialog<bool>(
    context: context,
    barrierDismissible: true,
    builder: (dialogContext) => Directionality(
      textDirection: TextDirection.rtl,
      child: AlertDialog(
        title: Text(downloaded ? 'التحديث جاهز للتثبيت' : 'تنزيل تحديث محفوظ'),
        content: Text(
          downloaded
              ? 'عُثر على ملف التحديث ${pending.version}+${pending.buildNumber} الذي اكتمل تنزيله سابقًا. سيُتحقق من حجمه وبصمته قبل فتح مُثبّت Android.'
              : 'عُثر على تنزيل التحديث ${pending.version}+${pending.buildNumber} (${_downloadStateLabel(state)}). يمكنك متابعة التنزيل أو تركه يعمل في الخلفية والعودة لاحقًا.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('لاحقًا'),
          ),
          FilledButton.icon(
            onPressed: () => Navigator.pop(dialogContext, true),
            icon: Icon(downloaded ? Icons.system_update_alt : Icons.download),
            label: Text(downloaded ? 'التحقق والتثبيت' : 'متابعة التنزيل'),
          ),
        ],
      ),
    ),
  );

  if (shouldResume == true && context.mounted) {
    await _watchBackgroundDownload(
      context,
      downloadId: pending.id,
      expectedSize: pending.expectedSize,
      expectedSha256: pending.expectedSha256,
    );
  }
  return true;
}

String _downloadStateLabel(dynamic state) {
  switch (state) {
    case 'running':
      return 'قيد التنزيل';
    case 'pending':
      return 'بانتظار بدء التنزيل';
    case 'paused':
      return 'متوقف مؤقتًا بانتظار الشبكة';
    default:
      return 'قيد المعالجة';
  }
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
,
              caseSensitive: false)
          .hasMatch(line)) {
        continue;
      }
    }
    if (inContributorSection ||
        RegExp(r'^\\*\\*full changelog\\*\\*\\s*:', caseSensitive: false)
            .hasMatch(line) ||
        RegExp(r'^full changelog\\s*:', caseSensitive: false).hasMatch(line) ||
        RegExp(r'^(?:[-*]\\s*)?workflows?\\s+by\\s+@', caseSensitive: false)
            .hasMatch(line)) {
      continue;
    }

    // GitHub appends author and PR metadata to generated release-note bullets.
    // Keep the change description while dropping the attribution/link suffix.
    final withoutAttribution = line.replaceFirst(
      RegExp(r'\\s+by\\s+@[^\\s]+\\s+in\\s+https?://\\S+.*

class _PendingMobileUpdate {
  const _PendingMobileUpdate({
    required this.id,
    required this.version,
    required this.buildNumber,
    required this.expectedSize,
    required this.expectedSha256,
  });

  final int id;
  final String version;
  final int buildNumber;
  final int expectedSize;
  final String expectedSha256;

  factory _PendingMobileUpdate.fromMap(Map<String, dynamic> map) {
    final id = (map['id'] as num?)?.toInt();
    final version = map['version'];
    final buildNumber = (map['buildNumber'] as num?)?.toInt();
    final expectedSize = (map['expectedSize'] as num?)?.toInt();
    final hash = map['expectedSha256'];
    if (id == null ||
        id <= 0 ||
        version is! String ||
        !RegExp(r'^\d+\.\d+\.\d+$').hasMatch(version) ||
        buildNumber == null ||
        buildNumber <= 0 ||
        expectedSize == null ||
        expectedSize <= 0 ||
        hash is! String ||
        !RegExp(r'^[a-f0-9]{64}$', caseSensitive: false).hasMatch(hash)) {
      throw const FormatException('بيانات التحديث المحفوظة غير صالحة.');
    }
    return _PendingMobileUpdate(
      id: id,
      version: version,
      buildNumber: buildNumber,
      expectedSize: expectedSize,
      expectedSha256: hash.toLowerCase(),
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
    if (!context.mounted) return;
    final resumed = await _resumePendingUpdate(context, packageInfo);
    if (resumed || !context.mounted) return;

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
      {
        'url': release.apkUrl.toString(),
        'expectedSize': release.apkSize,
        'expectedSha256': release.apkSha256,
        'version': release.version,
        'buildNumber': release.buildNumber,
      },
    );
    if (downloadId == null || downloadId <= 0) {
      throw Exception('تعذر بدء تنزيل التحديث في الخلفية.');
    }
    if (!context.mounted) return;

    messenger?.showSnackBar(
      const SnackBar(
        duration: Duration(seconds: 8),
        behavior: SnackBarBehavior.floating,
        content: Text(
          'بدأ تنزيل التحديث بواسطة Android. سيستمر التنزيل عند مغادرة التطبيق، ويمكنك متابعة تقدمه من شريط الإشعارات.',
        ),
      ),
    );

    await _watchBackgroundDownload(
      context,
      downloadId: downloadId,
      expectedSize: release.apkSize,
      expectedSha256: release.apkSha256,
    );
  } catch (error) {
    if (context.mounted) {
      messenger?.hideCurrentSnackBar();
      _showUpdateMessage(context, _updateErrorMessage(error));
    }
  }
}

Future<void> _watchBackgroundDownload(
  BuildContext context, {
  required int downloadId,
  required int expectedSize,
  required String expectedSha256,
}) async {
  final messenger = ScaffoldMessenger.maybeOf(context);
  try {
    // DownloadManager owns the transfer and retains it when this process exits.
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
        await _installerChannel.invokeMethod<void>('clearPendingUpdate');
        throw Exception(
          'فشل تنزيل التحديث في الخلفية'
          '${reason == null ? '.' : ' (رمز الخطأ: $reason).'}',
        );
      }
      if (state != 'successful') continue;

      final downloaded = (status['downloaded'] as num?)?.toInt() ?? 0;
      final reportedTotal = (status['total'] as num?)?.toInt() ?? 0;
      if (downloaded != expectedSize ||
          (reportedTotal > 0 && reportedTotal != expectedSize)) {
        await _installerChannel.invokeMethod<void>('clearPendingUpdate');
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

      messenger?.hideCurrentSnackBar();
      if (!context.mounted) return;
      final result = await _installerChannel.invokeMethod<String>(
        'installApk',
        {'path': localPath, 'expectedSha256': expectedSha256},
      );
      if (result == 'permission_required' && context.mounted) {
        await _showInstallPermissionDialog(context, localPath, expectedSha256);
      } else if (result != 'launched' && context.mounted) {
        _showUpdateMessage(context, 'تعذر فتح مُثبّت Android. أعد المحاولة.');
      }
      return;
    }
  } catch (error) {
    if (error is PlatformException && error.code == 'APK_CHECKSUM_MISMATCH') {
      await _installerChannel.invokeMethod<void>('clearPendingUpdate');
    }
    if (context.mounted) {
      messenger?.hideCurrentSnackBar();
      _showUpdateMessage(context, _updateErrorMessage(error));
    }
  }
}

Future<void> _showInstallPermissionDialog(
  BuildContext context,
  String localPath,
  String expectedSha256,
) async {
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
              await _retryInstall(context, localPath, expectedSha256);
            },
            child: const Text('إعادة محاولة التثبيت'),
          ),
        ],
      ),
    ),
  );
}

Future<void> _retryInstall(
  BuildContext context,
  String path,
  String expectedSha256,
) async {
  try {
    final result = await _installerChannel.invokeMethod<String>('installApk', {
      'path': path,
      'expectedSha256': expectedSha256,
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
      if (error.code == 'APK_CHECKSUM_MISMATCH') {
        await _installerChannel.invokeMethod<void>('clearPendingUpdate');
      }
      if (!context.mounted) return;
      _showUpdateMessage(context, error.message ?? 'تعذر بدء التثبيت.');
    }
  }
}

String _updateErrorMessage(Object error) {
  if (error is PlatformException) {
    return error.message ?? 'تعذر متابعة تثبيت التحديث.';
  }
  return error.toString().replaceFirst('Exception: ', '');
}

void _showUpdateMessage(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text(message), behavior: SnackBarBehavior.floating),
  );
}

Future<bool> _resumePendingUpdate(
  BuildContext context,
  PackageInfo packageInfo,
) async {
  final raw = await _installerChannel.invokeMapMethod<String, dynamic>(
    'getPendingUpdate',
  );
  if (raw == null) return false;

  late final _PendingMobileUpdate pending;
  try {
    pending = _PendingMobileUpdate.fromMap(raw);
  } on FormatException catch (error) {
    await _installerChannel.invokeMethod<void>('clearPendingUpdate');
    if (context.mounted) {
      _showUpdateMessage(context, error.message);
    }
    return false;
  }

  final installedVersion = _compareVersion(
    packageInfo.version,
    pending.version,
  );
  final installedBuild = int.tryParse(packageInfo.buildNumber) ?? 0;
  if (installedVersion > 0 ||
      (installedVersion == 0 && installedBuild >= pending.buildNumber)) {
    await _installerChannel.invokeMethod<void>('clearPendingUpdate');
    return false;
  }

  final status = await _installerChannel.invokeMapMethod<String, dynamic>(
    'queryBackgroundDownload',
    {'id': pending.id},
  );
  final state = status?['status'];
  if (state == null || state == 'not_found' || state == 'failed') {
    await _installerChannel.invokeMethod<void>('clearPendingUpdate');
    if (context.mounted) {
      _showUpdateMessage(
        context,
        'تعذر استعادة تنزيل التحديث السابق. يمكنك التحقق من التحديثات والمحاولة مجددًا.',
      );
    }
    return false;
  }

  if (!context.mounted) return true;
  final downloaded = state == 'successful';
  final shouldResume = await showDialog<bool>(
    context: context,
    barrierDismissible: true,
    builder: (dialogContext) => Directionality(
      textDirection: TextDirection.rtl,
      child: AlertDialog(
        title: Text(downloaded ? 'التحديث جاهز للتثبيت' : 'تنزيل تحديث محفوظ'),
        content: Text(
          downloaded
              ? 'عُثر على ملف التحديث ${pending.version}+${pending.buildNumber} الذي اكتمل تنزيله سابقًا. سيُتحقق من حجمه وبصمته قبل فتح مُثبّت Android.'
              : 'عُثر على تنزيل التحديث ${pending.version}+${pending.buildNumber} (${_downloadStateLabel(state)}). يمكنك متابعة التنزيل أو تركه يعمل في الخلفية والعودة لاحقًا.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('لاحقًا'),
          ),
          FilledButton.icon(
            onPressed: () => Navigator.pop(dialogContext, true),
            icon: Icon(downloaded ? Icons.system_update_alt : Icons.download),
            label: Text(downloaded ? 'التحقق والتثبيت' : 'متابعة التنزيل'),
          ),
        ],
      ),
    ),
  );

  if (shouldResume == true && context.mounted) {
    await _watchBackgroundDownload(
      context,
      downloadId: pending.id,
      expectedSize: pending.expectedSize,
      expectedSha256: pending.expectedSha256,
    );
  }
  return true;
}

String _downloadStateLabel(dynamic state) {
  switch (state) {
    case 'running':
      return 'قيد التنزيل';
    case 'pending':
      return 'بانتظار بدء التنزيل';
    case 'paused':
      return 'متوقف مؤقتًا بانتظار الشبكة';
    default:
      return 'قيد المعالجة';
  }
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
,
          caseSensitive: false),
      '',
    );
    final description = withoutAttribution
        .replaceFirst(RegExp(r'\\s+in\\s+https?://github\\.com/\\S+.*

class _PendingMobileUpdate {
  const _PendingMobileUpdate({
    required this.id,
    required this.version,
    required this.buildNumber,
    required this.expectedSize,
    required this.expectedSha256,
  });

  final int id;
  final String version;
  final int buildNumber;
  final int expectedSize;
  final String expectedSha256;

  factory _PendingMobileUpdate.fromMap(Map<String, dynamic> map) {
    final id = (map['id'] as num?)?.toInt();
    final version = map['version'];
    final buildNumber = (map['buildNumber'] as num?)?.toInt();
    final expectedSize = (map['expectedSize'] as num?)?.toInt();
    final hash = map['expectedSha256'];
    if (id == null ||
        id <= 0 ||
        version is! String ||
        !RegExp(r'^\d+\.\d+\.\d+$').hasMatch(version) ||
        buildNumber == null ||
        buildNumber <= 0 ||
        expectedSize == null ||
        expectedSize <= 0 ||
        hash is! String ||
        !RegExp(r'^[a-f0-9]{64}$', caseSensitive: false).hasMatch(hash)) {
      throw const FormatException('بيانات التحديث المحفوظة غير صالحة.');
    }
    return _PendingMobileUpdate(
      id: id,
      version: version,
      buildNumber: buildNumber,
      expectedSize: expectedSize,
      expectedSha256: hash.toLowerCase(),
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
    if (!context.mounted) return;
    final resumed = await _resumePendingUpdate(context, packageInfo);
    if (resumed || !context.mounted) return;

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
      {
        'url': release.apkUrl.toString(),
        'expectedSize': release.apkSize,
        'expectedSha256': release.apkSha256,
        'version': release.version,
        'buildNumber': release.buildNumber,
      },
    );
    if (downloadId == null || downloadId <= 0) {
      throw Exception('تعذر بدء تنزيل التحديث في الخلفية.');
    }
    if (!context.mounted) return;

    messenger?.showSnackBar(
      const SnackBar(
        duration: Duration(seconds: 8),
        behavior: SnackBarBehavior.floating,
        content: Text(
          'بدأ تنزيل التحديث بواسطة Android. سيستمر التنزيل عند مغادرة التطبيق، ويمكنك متابعة تقدمه من شريط الإشعارات.',
        ),
      ),
    );

    await _watchBackgroundDownload(
      context,
      downloadId: downloadId,
      expectedSize: release.apkSize,
      expectedSha256: release.apkSha256,
    );
  } catch (error) {
    if (context.mounted) {
      messenger?.hideCurrentSnackBar();
      _showUpdateMessage(context, _updateErrorMessage(error));
    }
  }
}

Future<void> _watchBackgroundDownload(
  BuildContext context, {
  required int downloadId,
  required int expectedSize,
  required String expectedSha256,
}) async {
  final messenger = ScaffoldMessenger.maybeOf(context);
  try {
    // DownloadManager owns the transfer and retains it when this process exits.
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
        await _installerChannel.invokeMethod<void>('clearPendingUpdate');
        throw Exception(
          'فشل تنزيل التحديث في الخلفية'
          '${reason == null ? '.' : ' (رمز الخطأ: $reason).'}',
        );
      }
      if (state != 'successful') continue;

      final downloaded = (status['downloaded'] as num?)?.toInt() ?? 0;
      final reportedTotal = (status['total'] as num?)?.toInt() ?? 0;
      if (downloaded != expectedSize ||
          (reportedTotal > 0 && reportedTotal != expectedSize)) {
        await _installerChannel.invokeMethod<void>('clearPendingUpdate');
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

      messenger?.hideCurrentSnackBar();
      if (!context.mounted) return;
      final result = await _installerChannel.invokeMethod<String>(
        'installApk',
        {'path': localPath, 'expectedSha256': expectedSha256},
      );
      if (result == 'permission_required' && context.mounted) {
        await _showInstallPermissionDialog(context, localPath, expectedSha256);
      } else if (result != 'launched' && context.mounted) {
        _showUpdateMessage(context, 'تعذر فتح مُثبّت Android. أعد المحاولة.');
      }
      return;
    }
  } catch (error) {
    if (error is PlatformException && error.code == 'APK_CHECKSUM_MISMATCH') {
      await _installerChannel.invokeMethod<void>('clearPendingUpdate');
    }
    if (context.mounted) {
      messenger?.hideCurrentSnackBar();
      _showUpdateMessage(context, _updateErrorMessage(error));
    }
  }
}

Future<void> _showInstallPermissionDialog(
  BuildContext context,
  String localPath,
  String expectedSha256,
) async {
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
              await _retryInstall(context, localPath, expectedSha256);
            },
            child: const Text('إعادة محاولة التثبيت'),
          ),
        ],
      ),
    ),
  );
}

Future<void> _retryInstall(
  BuildContext context,
  String path,
  String expectedSha256,
) async {
  try {
    final result = await _installerChannel.invokeMethod<String>('installApk', {
      'path': path,
      'expectedSha256': expectedSha256,
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
      if (error.code == 'APK_CHECKSUM_MISMATCH') {
        await _installerChannel.invokeMethod<void>('clearPendingUpdate');
      }
      if (!context.mounted) return;
      _showUpdateMessage(context, error.message ?? 'تعذر بدء التثبيت.');
    }
  }
}

String _updateErrorMessage(Object error) {
  if (error is PlatformException) {
    return error.message ?? 'تعذر متابعة تثبيت التحديث.';
  }
  return error.toString().replaceFirst('Exception: ', '');
}

void _showUpdateMessage(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text(message), behavior: SnackBarBehavior.floating),
  );
}

Future<bool> _resumePendingUpdate(
  BuildContext context,
  PackageInfo packageInfo,
) async {
  final raw = await _installerChannel.invokeMapMethod<String, dynamic>(
    'getPendingUpdate',
  );
  if (raw == null) return false;

  late final _PendingMobileUpdate pending;
  try {
    pending = _PendingMobileUpdate.fromMap(raw);
  } on FormatException catch (error) {
    await _installerChannel.invokeMethod<void>('clearPendingUpdate');
    if (context.mounted) {
      _showUpdateMessage(context, error.message);
    }
    return false;
  }

  final installedVersion = _compareVersion(
    packageInfo.version,
    pending.version,
  );
  final installedBuild = int.tryParse(packageInfo.buildNumber) ?? 0;
  if (installedVersion > 0 ||
      (installedVersion == 0 && installedBuild >= pending.buildNumber)) {
    await _installerChannel.invokeMethod<void>('clearPendingUpdate');
    return false;
  }

  final status = await _installerChannel.invokeMapMethod<String, dynamic>(
    'queryBackgroundDownload',
    {'id': pending.id},
  );
  final state = status?['status'];
  if (state == null || state == 'not_found' || state == 'failed') {
    await _installerChannel.invokeMethod<void>('clearPendingUpdate');
    if (context.mounted) {
      _showUpdateMessage(
        context,
        'تعذر استعادة تنزيل التحديث السابق. يمكنك التحقق من التحديثات والمحاولة مجددًا.',
      );
    }
    return false;
  }

  if (!context.mounted) return true;
  final downloaded = state == 'successful';
  final shouldResume = await showDialog<bool>(
    context: context,
    barrierDismissible: true,
    builder: (dialogContext) => Directionality(
      textDirection: TextDirection.rtl,
      child: AlertDialog(
        title: Text(downloaded ? 'التحديث جاهز للتثبيت' : 'تنزيل تحديث محفوظ'),
        content: Text(
          downloaded
              ? 'عُثر على ملف التحديث ${pending.version}+${pending.buildNumber} الذي اكتمل تنزيله سابقًا. سيُتحقق من حجمه وبصمته قبل فتح مُثبّت Android.'
              : 'عُثر على تنزيل التحديث ${pending.version}+${pending.buildNumber} (${_downloadStateLabel(state)}). يمكنك متابعة التنزيل أو تركه يعمل في الخلفية والعودة لاحقًا.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('لاحقًا'),
          ),
          FilledButton.icon(
            onPressed: () => Navigator.pop(dialogContext, true),
            icon: Icon(downloaded ? Icons.system_update_alt : Icons.download),
            label: Text(downloaded ? 'التحقق والتثبيت' : 'متابعة التنزيل'),
          ),
        ],
      ),
    ),
  );

  if (shouldResume == true && context.mounted) {
    await _watchBackgroundDownload(
      context,
      downloadId: pending.id,
      expectedSize: pending.expectedSize,
      expectedSha256: pending.expectedSha256,
    );
  }
  return true;
}

String _downloadStateLabel(dynamic state) {
  switch (state) {
    case 'running':
      return 'قيد التنزيل';
    case 'pending':
      return 'بانتظار بدء التنزيل';
    case 'paused':
      return 'متوقف مؤقتًا بانتظار الشبكة';
    default:
      return 'قيد المعالجة';
  }
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
,
            caseSensitive: false), '')
        .trim();
    if (description.isEmpty || description == '-' || description == '*') {
      continue;
    }
    cleanedLines.add(description);
  }

  return cleanedLines.join('\\n').trim();
}

class _PendingMobileUpdate {
  const _PendingMobileUpdate({
    required this.id,
    required this.version,
    required this.buildNumber,
    required this.expectedSize,
    required this.expectedSha256,
  });

  final int id;
  final String version;
  final int buildNumber;
  final int expectedSize;
  final String expectedSha256;

  factory _PendingMobileUpdate.fromMap(Map<String, dynamic> map) {
    final id = (map['id'] as num?)?.toInt();
    final version = map['version'];
    final buildNumber = (map['buildNumber'] as num?)?.toInt();
    final expectedSize = (map['expectedSize'] as num?)?.toInt();
    final hash = map['expectedSha256'];
    if (id == null ||
        id <= 0 ||
        version is! String ||
        !RegExp(r'^\d+\.\d+\.\d+$').hasMatch(version) ||
        buildNumber == null ||
        buildNumber <= 0 ||
        expectedSize == null ||
        expectedSize <= 0 ||
        hash is! String ||
        !RegExp(r'^[a-f0-9]{64}$', caseSensitive: false).hasMatch(hash)) {
      throw const FormatException('بيانات التحديث المحفوظة غير صالحة.');
    }
    return _PendingMobileUpdate(
      id: id,
      version: version,
      buildNumber: buildNumber,
      expectedSize: expectedSize,
      expectedSha256: hash.toLowerCase(),
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
    if (!context.mounted) return;
    final resumed = await _resumePendingUpdate(context, packageInfo);
    if (resumed || !context.mounted) return;

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
      {
        'url': release.apkUrl.toString(),
        'expectedSize': release.apkSize,
        'expectedSha256': release.apkSha256,
        'version': release.version,
        'buildNumber': release.buildNumber,
      },
    );
    if (downloadId == null || downloadId <= 0) {
      throw Exception('تعذر بدء تنزيل التحديث في الخلفية.');
    }
    if (!context.mounted) return;

    messenger?.showSnackBar(
      const SnackBar(
        duration: Duration(seconds: 8),
        behavior: SnackBarBehavior.floating,
        content: Text(
          'بدأ تنزيل التحديث بواسطة Android. سيستمر التنزيل عند مغادرة التطبيق، ويمكنك متابعة تقدمه من شريط الإشعارات.',
        ),
      ),
    );

    await _watchBackgroundDownload(
      context,
      downloadId: downloadId,
      expectedSize: release.apkSize,
      expectedSha256: release.apkSha256,
    );
  } catch (error) {
    if (context.mounted) {
      messenger?.hideCurrentSnackBar();
      _showUpdateMessage(context, _updateErrorMessage(error));
    }
  }
}

Future<void> _watchBackgroundDownload(
  BuildContext context, {
  required int downloadId,
  required int expectedSize,
  required String expectedSha256,
}) async {
  final messenger = ScaffoldMessenger.maybeOf(context);
  try {
    // DownloadManager owns the transfer and retains it when this process exits.
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
        await _installerChannel.invokeMethod<void>('clearPendingUpdate');
        throw Exception(
          'فشل تنزيل التحديث في الخلفية'
          '${reason == null ? '.' : ' (رمز الخطأ: $reason).'}',
        );
      }
      if (state != 'successful') continue;

      final downloaded = (status['downloaded'] as num?)?.toInt() ?? 0;
      final reportedTotal = (status['total'] as num?)?.toInt() ?? 0;
      if (downloaded != expectedSize ||
          (reportedTotal > 0 && reportedTotal != expectedSize)) {
        await _installerChannel.invokeMethod<void>('clearPendingUpdate');
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

      messenger?.hideCurrentSnackBar();
      if (!context.mounted) return;
      final result = await _installerChannel.invokeMethod<String>(
        'installApk',
        {'path': localPath, 'expectedSha256': expectedSha256},
      );
      if (result == 'permission_required' && context.mounted) {
        await _showInstallPermissionDialog(context, localPath, expectedSha256);
      } else if (result != 'launched' && context.mounted) {
        _showUpdateMessage(context, 'تعذر فتح مُثبّت Android. أعد المحاولة.');
      }
      return;
    }
  } catch (error) {
    if (error is PlatformException && error.code == 'APK_CHECKSUM_MISMATCH') {
      await _installerChannel.invokeMethod<void>('clearPendingUpdate');
    }
    if (context.mounted) {
      messenger?.hideCurrentSnackBar();
      _showUpdateMessage(context, _updateErrorMessage(error));
    }
  }
}

Future<void> _showInstallPermissionDialog(
  BuildContext context,
  String localPath,
  String expectedSha256,
) async {
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
              await _retryInstall(context, localPath, expectedSha256);
            },
            child: const Text('إعادة محاولة التثبيت'),
          ),
        ],
      ),
    ),
  );
}

Future<void> _retryInstall(
  BuildContext context,
  String path,
  String expectedSha256,
) async {
  try {
    final result = await _installerChannel.invokeMethod<String>('installApk', {
      'path': path,
      'expectedSha256': expectedSha256,
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
      if (error.code == 'APK_CHECKSUM_MISMATCH') {
        await _installerChannel.invokeMethod<void>('clearPendingUpdate');
      }
      if (!context.mounted) return;
      _showUpdateMessage(context, error.message ?? 'تعذر بدء التثبيت.');
    }
  }
}

String _updateErrorMessage(Object error) {
  if (error is PlatformException) {
    return error.message ?? 'تعذر متابعة تثبيت التحديث.';
  }
  return error.toString().replaceFirst('Exception: ', '');
}

void _showUpdateMessage(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text(message), behavior: SnackBarBehavior.floating),
  );
}

Future<bool> _resumePendingUpdate(
  BuildContext context,
  PackageInfo packageInfo,
) async {
  final raw = await _installerChannel.invokeMapMethod<String, dynamic>(
    'getPendingUpdate',
  );
  if (raw == null) return false;

  late final _PendingMobileUpdate pending;
  try {
    pending = _PendingMobileUpdate.fromMap(raw);
  } on FormatException catch (error) {
    await _installerChannel.invokeMethod<void>('clearPendingUpdate');
    if (context.mounted) {
      _showUpdateMessage(context, error.message);
    }
    return false;
  }

  final installedVersion = _compareVersion(
    packageInfo.version,
    pending.version,
  );
  final installedBuild = int.tryParse(packageInfo.buildNumber) ?? 0;
  if (installedVersion > 0 ||
      (installedVersion == 0 && installedBuild >= pending.buildNumber)) {
    await _installerChannel.invokeMethod<void>('clearPendingUpdate');
    return false;
  }

  final status = await _installerChannel.invokeMapMethod<String, dynamic>(
    'queryBackgroundDownload',
    {'id': pending.id},
  );
  final state = status?['status'];
  if (state == null || state == 'not_found' || state == 'failed') {
    await _installerChannel.invokeMethod<void>('clearPendingUpdate');
    if (context.mounted) {
      _showUpdateMessage(
        context,
        'تعذر استعادة تنزيل التحديث السابق. يمكنك التحقق من التحديثات والمحاولة مجددًا.',
      );
    }
    return false;
  }

  if (!context.mounted) return true;
  final downloaded = state == 'successful';
  final shouldResume = await showDialog<bool>(
    context: context,
    barrierDismissible: true,
    builder: (dialogContext) => Directionality(
      textDirection: TextDirection.rtl,
      child: AlertDialog(
        title: Text(downloaded ? 'التحديث جاهز للتثبيت' : 'تنزيل تحديث محفوظ'),
        content: Text(
          downloaded
              ? 'عُثر على ملف التحديث ${pending.version}+${pending.buildNumber} الذي اكتمل تنزيله سابقًا. سيُتحقق من حجمه وبصمته قبل فتح مُثبّت Android.'
              : 'عُثر على تنزيل التحديث ${pending.version}+${pending.buildNumber} (${_downloadStateLabel(state)}). يمكنك متابعة التنزيل أو تركه يعمل في الخلفية والعودة لاحقًا.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('لاحقًا'),
          ),
          FilledButton.icon(
            onPressed: () => Navigator.pop(dialogContext, true),
            icon: Icon(downloaded ? Icons.system_update_alt : Icons.download),
            label: Text(downloaded ? 'التحقق والتثبيت' : 'متابعة التنزيل'),
          ),
        ],
      ),
    ),
  );

  if (shouldResume == true && context.mounted) {
    await _watchBackgroundDownload(
      context,
      downloadId: pending.id,
      expectedSize: pending.expectedSize,
      expectedSha256: pending.expectedSha256,
    );
  }
  return true;
}

String _downloadStateLabel(dynamic state) {
  switch (state) {
    case 'running':
      return 'قيد التنزيل';
    case 'pending':
      return 'بانتظار بدء التنزيل';
    case 'paused':
      return 'متوقف مؤقتًا بانتظار الشبكة';
    default:
      return 'قيد المعالجة';
  }
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
