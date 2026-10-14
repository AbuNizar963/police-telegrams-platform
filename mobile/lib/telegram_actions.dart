import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import 'api.dart';

const _navy = Color(0xFF101C35);
const _gold = Color(0xFFC9A45C);

String _actionError(Object error) =>
    error.toString().replaceFirst('Exception: ', '');

class TelegramActionsPanel extends StatefulWidget {
  const TelegramActionsPanel({
    super.key,
    required this.api,
    required this.telegramId,
    required this.onChanged,
  });

  final PoliceApi api;
  final int telegramId;
  final VoidCallback onChanged;

  @override
  State<TelegramActionsPanel> createState() => _TelegramActionsPanelState();
}

class _TelegramActionsPanelState extends State<TelegramActionsPanel> {
  bool busy = false;
  String? error;
  List<dynamic> routes = const [];
  List<dynamic> attachments = const [];

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final results = await Future.wait([
        widget.api.call(
          'telegrams.incomingRoutes',
          input: {'telegramId': widget.telegramId},
        ),
        widget.api.call(
          'telegrams.attachments',
          input: {'telegramId': widget.telegramId},
        ),
      ]);
      if (!mounted) return;
      setState(() {
        routes = results[0] is List ? results[0] as List : const [];
        attachments = results[1] is List ? results[1] as List : const [];
        error = null;
      });
    } catch (exception) {
      if (mounted) setState(() => error = _actionError(exception));
    }
  }

  Future<void> shareTelegram() async {
    await _run(() async {
      final result = await widget.api.call(
        'telegrams.get',
        input: {'id': widget.telegramId},
      );
      if (result is! Map) {
        throw Exception('تعذر تحميل بيانات البرقية للمشاركة.');
      }

      final telegram = Map<String, dynamic>.from(result);
      String value(dynamic input, [String fallback = '—']) {
        if (input == null || '$input'.trim().isEmpty || '$input' == 'null') {
          return fallback;
        }
        return '$input'.trim();
      }

      final text = [
        'برقيات الشرطة',
        'رقم البرقية: ${value(telegram['serialCode'] ?? telegram['serialNumber'] ?? telegram['number'])}',
        'الموضوع: ${value(telegram['subject'], 'بدون موضوع')}',
        'الجهة المستلمة: ${value(telegram['recipient'])}',
        'الحالة: ${value(telegram['status'])}',
        'الأولوية: ${value(telegram['priority'])}',
        'التصنيف: ${value(telegram['classification'])}',
        'تاريخ الإنشاء: ${value(telegram['createdAt'])}',
        '',
        'نص البرقية:',
        value(telegram['body'], 'لا يوجد نص'),
      ].join('\n');

      await SharePlus.instance.share(
        ShareParams(
          text: text,
          subject:
              'برقية الشرطة — ${value(telegram['subject'], 'بدون موضوع')}',
        ),
      );
    });
  }

  Future<void> transition(String status) async {
    final reason = await _reasonDialog(
      context,
      title: 'تغيير حالة البرقية',
      requiredReason: status == 'rejected',
    );
    if (reason == null) return;
    await _run(() async {
      await widget.api.call(
        'telegrams.transition',
        mutation: true,
        input: {
          'id': widget.telegramId,
          'toStatus': status,
          'reason': reason.isEmpty ? null : reason,
        },
      );
      widget.onChanged();
    });
  }

  Future<void> routeTelegram() async {
    final organizationId = await _textDialog(
      context,
      title: 'إحالة البرقية',
      label: 'معرّف الجهة المستلمة',
      hint: 'UUID الجهة من دليل التوجيه',
    );
    if (organizationId == null || organizationId.trim().isEmpty) return;
    if (!mounted) return;
    final note = await _textDialog(
      context,
      title: 'ملاحظة الإحالة',
      label: 'الملاحظة الاختيارية',
    );
    await _run(() async {
      await widget.api.call(
        'telegrams.route',
        mutation: true,
        input: {
          'id': widget.telegramId,
          'toOrganizationId': organizationId.trim(),
          'note': note?.trim().isEmpty == true ? null : note?.trim(),
        },
      );
      widget.onChanged();
    });
  }

  Future<void> receive(int routeId) async {
    await _run(() async {
      await widget.api.call(
        'telegrams.receiveRoute',
        mutation: true,
        input: {'routeId': routeId},
      );
      await load();
      widget.onChanged();
    });
  }

  Future<void> decide(int routeId, bool accepted) async {
    final reason = await _reasonDialog(
      context,
      title: accepted ? 'تأكيد استلام البرقية' : 'رفض استلام البرقية',
      requiredReason: !accepted,
    );
    if (reason == null) return;
    await _run(() async {
      await widget.api.call(
        'telegrams.decideRouteAsReceiver',
        mutation: true,
        input: {
          'routeId': routeId,
          'accepted': accepted,
          'reason': reason.isEmpty ? null : reason,
        },
      );
      await load();
      widget.onChanged();
    });
  }

  Future<void> pickAttachment() async {
    final result = await FilePicker.pickFiles(withData: true);
    if (result == null || result.files.isEmpty) return;
    final file = result.files.single;
    final bytes = file.bytes;
    if (bytes == null || bytes.isEmpty) {
      _show('تعذر قراءة الملف المحدد.');
      return;
    }
    final contentType = _contentType(file.extension);
    if (contentType == null) {
      _show('نوع الملف غير مدعوم');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      _show('حجم المرفق يتجاوز 10 ميغابايت');
      return;
    }
    await _run(() async {
      await widget.api.call(
        'telegrams.uploadAttachment',
        mutation: true,
        input: {
          'telegramId': widget.telegramId,
          'fileName': file.name,
          'contentType': contentType,
          'base64': base64Encode(bytes),
        },
      );
      await load();
      _show('تم رفع المرفق بنجاح');
    });
  }

  Future<void> downloadAttachment(Map<String, dynamic> attachment) async {
    final id = int.tryParse('${attachment['id']}');
    if (id == null) return;
    await _run(() async {
      final result = await widget.api.call(
        'telegrams.downloadAttachment',
        mutation: true,
        input: {'attachmentId': id},
      );
      final url = result is Map ? result['url'] : null;
      if (url == null || '$url'.trim().isEmpty) {
        throw Exception('لم يُرجع الخادم رابط تنزيل المرفق.');
      }
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('رابط المرفق'),
          content: SelectableText('$url'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('إغلاق'),
            ),
            FilledButton.icon(
              onPressed: () async {
                await SharePlus.instance.share(
                  ShareParams(text: '$url', subject: 'رابط مرفق البرقية'),
                );
              },
              icon: const Icon(Icons.share_outlined),
              label: const Text('مشاركة الرابط'),
            ),
          ],
        ),
      );
    });
  }

  Future<void> _run(Future<void> Function() action) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await action();
    } catch (exception) {
      if (mounted) {
        setState(() => error = _actionError(exception));
        _show(_actionError(exception));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'إجراءات البرقية',
            style: TextStyle(
              color: _navy,
              fontSize: 17,
              fontWeight: FontWeight.w900,
            ),
          ),
          if (error != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(error!, style: const TextStyle(color: Colors.red)),
            ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                onPressed: busy ? null : shareTelegram,
                icon: const Icon(Icons.share_outlined),
                label: const Text('مشاركة البرقية'),
              ),
              OutlinedButton.icon(
                onPressed: busy ? null : () => transition('in_review'),
                icon: const Icon(Icons.pending_actions),
                label: const Text('إرسال للمراجعة'),
              ),
              OutlinedButton.icon(
                onPressed: busy ? null : () => transition('completed'),
                icon: const Icon(Icons.check_circle_outline),
                label: const Text('إكمال'),
              ),
              OutlinedButton.icon(
                onPressed: busy ? null : () => transition('rejected'),
                icon: const Icon(Icons.cancel_outlined),
                label: const Text('رفض'),
              ),
              OutlinedButton.icon(
                onPressed: busy ? null : routeTelegram,
                icon: const Icon(Icons.forward_to_inbox),
                label: const Text('إحالة'),
              ),
              OutlinedButton.icon(
                onPressed: busy ? null : pickAttachment,
                icon: const Icon(Icons.attach_file),
                label: const Text('إرفاق ملف'),
              ),
            ],
          ),
          if (busy) ...[
            const SizedBox(height: 10),
            const LinearProgressIndicator(),
          ],
          if (routes.isNotEmpty) ...[
            const Divider(height: 28),
            const Text(
              'مسار الاستلام والإحالات',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
            ...routes.map(_routeTile),
          ],
          const Divider(height: 28),
          const Text(
            'المرفقات',
            style: TextStyle(fontWeight: FontWeight.w800),
          ),
          if (attachments.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text('لا توجد مرفقات لهذه البرقية.'),
            )
          else
            ...attachments.map((item) {
              final attachment = Map<String, dynamic>.from(item as Map);
              return ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(
                  Icons.insert_drive_file_outlined,
                  color: _gold,
                ),
                title: Text(
                  '${attachment['originalName'] ?? attachment['fileName'] ?? 'مرفق'}',
                ),
                subtitle: Text(
                  '${attachment['sizeBytes'] ?? attachment['size'] ?? '—'} بايت',
                ),
                trailing: IconButton(
                  tooltip: 'تنزيل المرفق',
                  onPressed: busy
                      ? null
                      : () => downloadAttachment(attachment),
                  icon: const Icon(Icons.download_outlined),
                ),
              );
            }),
        ],
      ),
    ),
  );

  Widget _routeTile(dynamic item) {
    final route = Map<String, dynamic>.from(item as Map);
    final routeId = int.tryParse('${route['id']}');
    final approval = '${route['approvalStatus'] ?? route['status'] ?? ''}';
    return Card(
      color: Colors.grey.shade50,
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        title: Text(
          '${route['toOrganizationName'] ?? route['toOrganizationId'] ?? 'جهة مستلمة'}',
        ),
        subtitle: Text('الحالة: $approval'),
        trailing: routeId == null
            ? null
            : PopupMenuButton<String>(
                onSelected: (value) {
                  if (value == 'receive') receive(routeId);
                  if (value == 'accept') decide(routeId, true);
                  if (value == 'reject') decide(routeId, false);
                },
                itemBuilder: (_) => const [
                  PopupMenuItem(
                    value: 'receive',
                    child: Text('تسجيل الاستلام'),
                  ),
                  PopupMenuItem(value: 'accept', child: Text('قبول الإحالة')),
                  PopupMenuItem(value: 'reject', child: Text('رفض الإحالة')),
                ],
              ),
      ),
    );
  }

  void _show(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  String? _contentType(String? extension) {
    switch (extension?.toLowerCase()) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'pdf':
        return 'application/pdf';
      case 'mp3':
        return 'audio/mpeg';
      case 'wav':
        return 'audio/wav';
      case 'webm':
        return 'audio/webm';
      default:
        return null;
    }
  }
}

Future<String?> _textDialog(
  BuildContext context, {
  required String title,
  required String label,
  String? hint,
}) async {
  final controller = TextEditingController();
  final value = await showDialog<String>(
    context: context,
    builder: (_) => AlertDialog(
      title: Text(title),
      content: TextField(
        controller: controller,
        decoration: InputDecoration(labelText: label, hintText: hint),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('إلغاء'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, controller.text),
          child: const Text('متابعة'),
        ),
      ],
    ),
  );
  controller.dispose();
  return value;
}

Future<String?> _reasonDialog(
  BuildContext context, {
  required String title,
  required bool requiredReason,
}) async {
  final value = await _textDialog(
    context,
    title: title,
    label: requiredReason ? 'السبب (مطلوب)' : 'السبب (اختياري)',
  );
  if (requiredReason && value != null && value.trim().isEmpty) return null;
  return value;
}
