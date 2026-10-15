import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
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
    required this.telegramStatus,
    required this.canOperate,
    required this.isAdmin,
    required this.onChanged,
  });

  final PoliceApi api;
  final int telegramId;
  final String telegramStatus;
  final bool canOperate;
  final bool isAdmin;
  final VoidCallback onChanged;

  @override
  State<TelegramActionsPanel> createState() => _TelegramActionsPanelState();
}

class _TelegramActionsPanelState extends State<TelegramActionsPanel> {
  bool busy = false;
  String? error;
  List<dynamic> routes = const [];
  List<dynamic> attachments = const [];
  List<Map<String, dynamic>> routingDirectory = const [];

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final results = await Future.wait<dynamic>([
        widget.api.call(
          'telegrams.incomingRoutes',
          input: {'telegramId': widget.telegramId},
        ),
        widget.api.call(
          'telegrams.attachments',
          input: {'telegramId': widget.telegramId},
        ),
        widget.api
            .call('organizations.routingDirectory')
            .catchError((_) => <dynamic>[]),
      ]);
      if (!mounted) return;
      setState(() {
        routes = results[0] is List ? results[0] as List : const [];
        attachments = results[1] is List ? results[1] as List : const [];
        routingDirectory = results[2] is List
            ? (results[2] as List)
                  .whereType<Map>()
                  .map((item) => Map<String, dynamic>.from(item))
                  .toList()
            : const [];
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
          subject: 'برقية الشرطة — ${value(telegram['subject'], 'بدون موضوع')}',
        ),
      );
    });
  }

  Future<void> transition(String status) async {
    final reason = await _reasonDialog(
      context,
      title: 'تغيير حالة البرقية',
      requiredReason: status == 'rejected' || status == 'returned',
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
    final organizationId = await _chooseRouteTarget();
    if (organizationId == null || organizationId.isEmpty) return;
    if (!mounted) return;
    final note = await _textDialog(
      context,
      title: 'طلب إحالة عبر السلطة الأعلى',
      label: 'ملاحظة الإحالة (اختياري)',
    );
    await _run(() async {
      await widget.api.call(
        'telegrams.route',
        mutation: true,
        input: {
          'id': widget.telegramId,
          'toOrganizationId': organizationId,
          'note': note?.trim().isEmpty == true ? null : note?.trim(),
        },
      );
      widget.onChanged();
    });
  }

  Future<String?> _chooseRouteTarget() async {
    final targets = routingDirectory
        .where((row) => row['isSelectable'] == true)
        .toList();
    if (targets.isEmpty) {
      _show('لا توجد جهات متاحة للإحالة من جهة العمل الحالية.');
      return null;
    }
    var query = '';
    final byId = <String, Map<String, dynamic>>{
      for (final row in routingDirectory) '${row['id']}': row,
    };
    String pathFor(Map<String, dynamic> row) {
      final parts = <String>['${row['name'] ?? 'جهة بدون اسم'}'];
      final visited = <String>{'${row['id']}'};
      var parentId = row['parentOrganizationId']?.toString();
      while (parentId != null && parentId.isNotEmpty && visited.add(parentId)) {
        final parent = byId[parentId];
        if (parent == null) break;
        parts.insert(0, '${parent['name'] ?? 'جهة بدون اسم'}');
        parentId = parent['parentOrganizationId']?.toString();
      }
      return parts.join(' ← ');
    }

    return showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) {
          final normalized = query.trim().toLowerCase();
          final options = targets.where((row) {
            if (normalized.isEmpty) return true;
            final name = '${row['name'] ?? ''}'.toLowerCase();
            final code = '${row['code'] ?? ''}'.toLowerCase();
            return name.contains(normalized) ||
                code.contains(normalized) ||
                pathFor(row).toLowerCase().contains(normalized);
          }).toList()..sort((a, b) => pathFor(a).compareTo(pathFor(b)));
          return FractionallySizedBox(
            heightFactor: 0.86,
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                  child: Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'اختيار الجهة المستلمة',
                          style: TextStyle(fontWeight: FontWeight.w900),
                        ),
                      ),
                      IconButton(
                        onPressed: () => Navigator.pop(sheetContext),
                        icon: const Icon(Icons.close),
                        tooltip: 'إغلاق',
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: TextField(
                    autofocus: true,
                    onChanged: (value) => setSheetState(() => query = value),
                    decoration: const InputDecoration(
                      prefixIcon: Icon(Icons.search),
                      hintText: 'ابحث بالاسم أو الرمز أو المسار',
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Expanded(
                  child: options.isEmpty
                      ? const Center(child: Text('لا توجد جهات مطابقة للبحث.'))
                      : ListView.separated(
                          padding: const EdgeInsets.fromLTRB(12, 4, 12, 20),
                          itemCount: options.length,
                          separatorBuilder: (_, _) => const SizedBox(height: 4),
                          itemBuilder: (context, index) {
                            final row = options[index];
                            final code = row['code']?.toString();
                            return ListTile(
                              leading: const Icon(Icons.account_tree_outlined),
                              title: Text('${row['name'] ?? 'جهة بدون اسم'}'),
                              subtitle: Text(
                                '${pathFor(row)}${code == null || code.isEmpty ? '' : ' · $code'}',
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              onTap: () =>
                                  Navigator.pop(sheetContext, '${row['id']}'),
                            );
                          },
                        ),
                ),
              ],
            ),
          );
        },
      ),
    );
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
      final uri = Uri.tryParse('$url');
      if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) {
        throw Exception('رابط تنزيل المرفق غير صالح أو غير آمن.');
      }
      final response = await http.get(uri);
      if (response.statusCode != 200 || response.bodyBytes.isEmpty) {
        throw Exception('تعذر تنزيل ملف المرفق من مساحة التخزين.');
      }
      final fileName =
          '${attachment['originalName'] ?? attachment['fileName'] ?? 'telegram-attachment'}';
      final savedPath = await FilePicker.saveFile(
        dialogTitle: 'حفظ مرفق البرقية',
        fileName: fileName,
        bytes: response.bodyBytes,
      );
      if (mounted) {
        _show(savedPath == null ? 'تم إلغاء حفظ المرفق.' : 'تم حفظ المرفق.');
      }
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

  List<Widget> _transitionButtons() {
    final status = widget.telegramStatus.toLowerCase();
    final transitions = <(String, String, IconData)>[];
    if (widget.isAdmin) {
      if (status == 'draft') {
        transitions.add(('submitted', 'إرسال للمراجعة', Icons.send_outlined));
      } else if (status == 'submitted') {
        transitions.add(('in_review', 'بدء المراجعة', Icons.pending_actions));
      } else if (status == 'pending') {
        transitions.add(('in_progress', 'بدء الإجراء', Icons.play_arrow));
      } else if (status == 'in_review') {
        transitions.add(('approved', 'اعتماد', Icons.verified_outlined));
        transitions.add(('returned', 'إرجاع بسبب', Icons.undo_outlined));
        transitions.add(('rejected', 'رفض', Icons.cancel_outlined));
      } else if ({'in_progress', 'approved', 'forwarded'}.contains(status)) {
        transitions.add((
          'completed',
          'إكمال المعالجة',
          Icons.check_circle_outline,
        ));
      } else if ({'resolved', 'completed'}.contains(status)) {
        transitions.add(('archived', 'أرشفة', Icons.archive_outlined));
      }
    } else if (widget.canOperate) {
      if (status == 'draft') {
        transitions.add(('submitted', 'إرسال للمراجعة', Icons.send_outlined));
      } else if (status == 'submitted') {
        transitions.add(('in_review', 'بدء المراجعة', Icons.pending_actions));
      } else if (status == 'in_review') {
        transitions.add(('approved', 'اعتماد', Icons.verified_outlined));
        transitions.add(('returned', 'إرجاع بسبب', Icons.undo_outlined));
        transitions.add(('rejected', 'رفض', Icons.cancel_outlined));
      } else if ({'approved', 'in_progress', 'forwarded'}.contains(status)) {
        transitions.add((
          'completed',
          'إكمال المعالجة',
          Icons.check_circle_outline,
        ));
      }
    }
    return transitions
        .map(
          (action) => OutlinedButton.icon(
            onPressed: busy ? null : () => transition(action.$1),
            icon: Icon(action.$3),
            label: Text(action.$2),
          ),
        )
        .toList();
  }

  bool get _canRoute =>
      widget.canOperate &&
      const {
        'approved',
        'in_progress',
        'forwarded',
      }.contains(widget.telegramStatus.toLowerCase()) &&
      routingDirectory.any((row) => row['isSelectable'] == true);

  String _attachmentSummary(Map<String, dynamic> attachment) {
    final size =
        int.tryParse('${attachment['sizeBytes'] ?? attachment['size']}') ?? 0;
    final hash = '${attachment['sha256'] ?? ''}';
    final hashPrefix = hash.substring(0, hash.length < 12 ? hash.length : 12);
    final mime = '${attachment['mimeType'] ?? 'ملف'}';
    return '$mime · ${(size / 1024).ceil()} كيلوبايت · SHA-256 $hashPrefix...';
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
              ..._transitionButtons(),
              if (_canRoute)
                OutlinedButton.icon(
                  onPressed: busy ? null : routeTelegram,
                  icon: const Icon(Icons.forward_to_inbox),
                  label: const Text('إرسال طلب إحالة'),
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
          const Text('المرفقات', style: TextStyle(fontWeight: FontWeight.w800)),
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
                  _attachmentSummary(attachment),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                trailing: IconButton(
                  tooltip: 'تنزيل المرفق',
                  onPressed: busy ? null : () => downloadAttachment(attachment),
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
    final status = '${route['status'] ?? route['approvalStatus'] ?? ''}';
    final statusText = switch (status) {
      'received' => 'تم تأكيد استلام الإحالة',
      'rejected' => 'تم رفض استلام الإحالة',
      'sent' => 'بانتظار تأكيد الجهة المستقبلة',
      _ => status,
    };
    final details = <String>[statusText];
    if (status == 'received' && route['receivedAt'] != null) {
      details.add('وقت الاستلام: ${route['receivedAt']}');
    } else if (status == 'rejected') {
      details.add(
        'سبب الرفض: ${route['receiverDecisionReason'] ?? 'غير محدد'}',
      );
    }
    if (route['routeSerialCode'] != null) {
      details.add('صادر الجهة المحيلة: ${route['routeSerialCode']}');
    }
    if (route['incomingSerialCode'] != null) {
      details.add('وارد الجهة المستقبلة: ${route['incomingSerialCode']}');
    }
    return Card(
      color: Colors.grey.shade50,
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        title: Text(
          '${route['toOrganizationName'] ?? route['toOrganizationId'] ?? 'جهة مستلمة'}',
        ),
        subtitle: Text(details.join('\n')),
        isThreeLine: details.length > 1,
        trailing: routeId == null || status != 'sent'
            ? null
            : PopupMenuButton<String>(
                onSelected: (value) {
                  if (value == 'accept') decide(routeId, true);
                  if (value == 'reject') decide(routeId, false);
                },
                itemBuilder: (_) => const [
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
