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
      barrierDismissible: false,
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
  final progressKey = GlobalKey<_DownloadProgressState>();
  var downloadDialogOpen = true;
  unawaited(
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) =>
          _DownloadProgress(key: progressKey, total: release.apkSize),
    ),
  );

  try {
    final directory = Directory('${Directory.systemTemp.path}/updates');
    await directory.create(recursive: true);
    final file = File('${directory.path}/police-telegrams-update.apk');
    if (await file.exists()) await file.delete();

    final client = http.Client();
    try {
      final request = http.Request('GET', release.apkUrl);
      request.headers['Accept'] = 'application/octet-stream';
      final response = await client
          .send(request)
          .timeout(const Duration(seconds: 45));
      if (response.statusCode != 200) {
        throw Exception('فشل تنزيل التحديث (HTTP ${response.statusCode}).');
      }

      final sink = file.openWrite();
      var received = 0;
      try {
        await for (final chunk in response.stream.timeout(
          const Duration(minutes: 3),
        )) {
          sink.add(chunk);
          received += chunk.length;
          progressKey.currentState?.update(received);
        }
        await sink.flush();
      } finally {
        // Always close the file handle, including stream errors and timeouts.
        await sink.close();
      }

      if (received != release.apkSize) {
        throw Exception('ملف التحديث غير مكتمل. أعد المحاولة.');
      }
    } catch (_) {
      // Never leave a partial APK that could be mistaken for a complete update.
      try {
        if (await file.exists()) {
          await file.delete();
        }
      } catch (_) {
        // Preserve the original download error if cleanup also fails.
      }
      rethrow;
    } finally {
      client.close();
    }

    if (downloadDialogOpen && context.mounted) {
      Navigator.of(context, rootNavigator: true).pop();
      downloadDialogOpen = false;
    }
    if (!context.mounted) return;

    final result = await _installerChannel.invokeMethod<String>('installApk', {
      'path': file.path,
    });
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
              FilledButton(
                onPressed: () async {
                  Navigator.pop(dialogContext);
                  await _retryInstall(context, file.path);
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
  } catch (error) {
    if (downloadDialogOpen && context.mounted) {
      Navigator.of(context, rootNavigator: true).pop();
      downloadDialogOpen = false;
    }
    if (context.mounted) {
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

class _DownloadProgress extends StatefulWidget {
  const _DownloadProgress({super.key, required this.total});

  final int total;

  @override
  State<_DownloadProgress> createState() => _DownloadProgressState();
}

class _DownloadProgressState extends State<_DownloadProgress> {
  int _received = 0;

  void update(int received) {
    if (mounted) setState(() => _received = received);
  }

  @override
  Widget build(BuildContext context) {
    final progress = widget.total > 0 ? _received / widget.total : 0.0;
    return Directionality(
      textDirection: TextDirection.rtl,
      child: AlertDialog(
        title: const Text('جارٍ تنزيل التحديث'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            LinearProgressIndicator(
              value: progress.clamp(0.0, 1.0).toDouble(),
              color: _updateGold,
              backgroundColor: const Color(0xFFE5E7EB),
            ),
            const SizedBox(height: 12),
            Text(
              '${(_received / (1024 * 1024)).toStringAsFixed(1)} / ${(widget.total / (1024 * 1024)).toStringAsFixed(1)} ميغابايت',
            ),
          ],
        ),
      ),
    );
  }
}
