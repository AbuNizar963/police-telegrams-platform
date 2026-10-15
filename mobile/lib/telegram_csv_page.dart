import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import 'api.dart';
import 'telegram_csv_codec.dart';

const _navy = Color(0xFF101C35);
const _gold = Color(0xFFC9A45C);

class TelegramCsvPage extends StatefulWidget {
  const TelegramCsvPage({super.key, required this.api});
  final PoliceApi api;
  @override
  State<TelegramCsvPage> createState() => _TelegramCsvPageState();
}

class _TelegramCsvPageState extends State<TelegramCsvPage> {
  bool busy = false;
  String? message;
  String? error;
  List<Map<String, dynamic>> preview = [];
  int invalidRows = 0;

  String value(dynamic v) => v == null || '$v' == 'null' ? '' : '$v'.trim();
  Future<void> exportCsv() async {
    setState(() {
      busy = true;
      message = null;
      error = null;
    });
    try {
      final result = await widget.api.call(
        'telegrams.exportRows',
        input: const {},
      );
      final items = result is List
          ? result
          : result is Map && result['items'] is List
          ? result['items'] as List
          : const [];
      if (items.isEmpty) {
        setState(() => message = 'لا توجد برقيات قابلة للتصدير.');
        return;
      }
      final rows = <List<String>>[
        [
          'originalSerial',
          'time',
          'sender',
          'date',
          'body',
          'recipient',
          'signature',
          'notes',
          'sheetName',
        ],
      ];
      for (final item in items) {
        if (item is! Map) continue;
        final row = Map<String, dynamic>.from(item);
        final date = DateTime.tryParse(value(row['createdAt']))?.toLocal();
        final org = value(row['organizationId']);
        final current = value(row['currentOrganizationId']);
        final dir = value(row['direction'] ?? row['type']);
        final outgoing =
            dir == 'outgoing' ||
            dir == 'صادر' ||
            (dir.isEmpty && org.isNotEmpty && org == current);
        rows.add([
          value(row['serialCode'] ?? row['serialNumber']),
          date == null
              ? ''
              : '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}',
          value(row['creatorName'] ?? row['senderName']),
          date == null
              ? ''
              : '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}',
          value(row['body']),
          value(row['recipient']),
          value(row['creatorName'] ?? row['senderName']),
          value(row['workflowReason'] ?? row['notes']),
          outgoing ? 'صادر' : 'وارد',
        ]);
      }
      final csv = TelegramCsvCodec.encodeRows(rows);
      final date = DateTime.now().toIso8601String().substring(0, 10);
      final path = await FilePicker.saveFile(
        dialogTitle: 'حفظ سجل البرقيات',
        fileName: 'سجل-البرقيات-$date.csv',
        type: FileType.custom,
        allowedExtensions: ['csv'],
        bytes: Uint8List.fromList(utf8.encode(csv)),
      );
      if (mounted) {
        setState(
          () => message = path == null
              ? 'تم إلغاء حفظ الملف.'
              : 'تم تجهيز ${rows.length - 1} برقية للتصدير.',
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> chooseCsv() async {
    setState(() {
      busy = true;
      message = null;
      error = null;
      preview = [];
      invalidRows = 0;
    });
    try {
      final picked = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['csv'],
        withData: true,
      );
      if (picked == null || picked.files.isEmpty) return;
      final bytes = picked.files.single.bytes;
      if (bytes == null) throw Exception('تعذر قراءة محتوى الملف المحدد.');
      final parsed = TelegramCsvCodec.parseImport(
        utf8.decode(bytes, allowMalformed: false),
      );
      if (!mounted) return;
      setState(() {
        preview = parsed.rows;
        invalidRows = parsed.invalidRows;
        message = 'تمت قراءة ${preview.length} صفًا صالحًا.';
      });
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> importCsv() async {
    if (preview.isEmpty) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => Directionality(
        textDirection: TextDirection.rtl,
        child: AlertDialog(
          title: const Text('تأكيد استيراد السجل'),
          content: Text(
            'سيتم إرسال ${preview.length} صفًا. ستُنشأ السجلات كمسودات وتُطبق صلاحيات الخادم. الصفوف المتجاوزة: $invalidRows',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('إلغاء'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('بدء الاستيراد'),
            ),
          ],
        ),
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() {
      busy = true;
      error = null;
      message = null;
    });
    try {
      var created = 0, skipped = 0, failed = 0;
      for (var start = 0; start < preview.length; start += 100) {
        final batch = preview.skip(start).take(100).toList();
        final result = await widget.api.call(
          'telegrams.importRows',
          mutation: true,
          input: {'rows': batch},
        );
        if (result is Map) {
          created += int.tryParse('${result['created']}') ?? 0;
          skipped += int.tryParse('${result['skipped']}') ?? 0;
          final errorCount = result['errorCount'];
          if (errorCount is num) {
            failed += errorCount.toInt();
          } else if (result['errors'] is List) {
            failed += (result['errors'] as List).length;
          }
        }
      }
      if (mounted) {
        setState(() {
          message =
              'اكتمل الاستيراد: أُنشئت $created برقية، وتم تخطي $skipped مكررة${failed > 0 ? '، وتعذر استيراد $failed صفًا' : ''}.';
          preview = [];
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(
        backgroundColor: Theme.of(context).colorScheme.surface,
        foregroundColor: Theme.of(context).colorScheme.onSurface,
        title: const Text(
          'استيراد وتصدير السجل',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Icon(Icons.shield_outlined, color: _gold, size: 34),
                  const SizedBox(height: 10),
                  const Text(
                    'أدوات سجل البرقيات',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: _navy,
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'تصدير السجل المسموح لحسابك بعرضه، أو استيراد ملف CSV إلى الجهة النشطة. تُنفذ الصلاحيات والتحقق النهائي على الخادم.',
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'تصدير السجل',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w900,
                      color: _navy,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'ينشئ ملف CSV بترميز UTF-8 يمكن فتحه في Excel أو برامج الجداول.',
                  ),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: busy ? null : exportCsv,
                    icon: const Icon(Icons.download_outlined),
                    label: const Text('تصدير البرقيات إلى CSV'),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'استيراد ملف CSV',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w900,
                      color: _navy,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'يجب أن يحتوي الملف على عمود body أو «المتن». الصفوف المستوردة تُنشأ كمسودات وتخضع لصلاحيات الخادم.',
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: busy ? null : chooseCsv,
                    icon: const Icon(Icons.upload_file_outlined),
                    label: const Text('اختيار ملف CSV'),
                  ),
                  if (preview.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text(
                      'معاينة: ${preview.length} صف صالح، $invalidRows صف متجاوز',
                    ),
                    ...preview
                        .take(3)
                        .map(
                          (r) => ListTile(
                            dense: true,
                            leading: const Icon(
                              Icons.description_outlined,
                              color: _gold,
                            ),
                            title: Text(
                              value(r['sender']).isEmpty
                                  ? value(r['originalSerial']).isEmpty
                                        ? 'برقية مستوردة'
                                        : value(r['originalSerial'])
                                  : value(r['sender']),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            subtitle: Text(
                              value(r['body']),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                    if (preview.length > 3)
                      Text('و ${preview.length - 3} صفوف أخرى'),
                    const SizedBox(height: 8),
                    FilledButton.icon(
                      onPressed: busy ? null : importCsv,
                      icon: const Icon(Icons.cloud_upload_outlined),
                      label: Text('استيراد ${preview.length} صف'),
                    ),
                  ],
                ],
              ),
            ),
          ),
          if (busy) ...[
            const SizedBox(height: 12),
            const LinearProgressIndicator(),
          ],
          if (message != null) ...[
            const SizedBox(height: 12),
            Card(
              color: const Color(0xFFEAF4EC),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Text(
                  message!,
                  style: const TextStyle(color: Color(0xFF215A32)),
                ),
              ),
            ),
          ],
          if (error != null) ...[
            const SizedBox(height: 12),
            Card(
              color: const Color(0xFFFFEEEE),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Text(error!, style: const TextStyle(color: Colors.red)),
              ),
            ),
          ],
        ],
      ),
    ),
  );
}
