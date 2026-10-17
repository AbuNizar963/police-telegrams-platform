import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import 'api.dart';
import 'telegram_excel_codec.dart';

const _navy = Color(0xFF10233F);
const _gold = Color(0xFFD8C38E);

class TelegramExcelPage extends StatefulWidget {
  const TelegramExcelPage({super.key, required this.api});

  final PoliceApi api;

  @override
  State<TelegramExcelPage> createState() => _TelegramExcelPageState();
}

class _TelegramExcelPageState extends State<TelegramExcelPage> {
  bool busy = false;
  String? message;
  String? error;
  String? fileName;
  List<TelegramExcelRow> preview = const [];
  List<TelegramExcelIssue> issues = const [];
  int skippedRows = 0;
  int duplicateRows = 0;

  String value(dynamic input) =>
      input == null || '$input' == 'null' ? '' : '$input'.trim();

  void clearPreview() {
    preview = const [];
    issues = const [];
    skippedRows = 0;
    duplicateRows = 0;
    fileName = null;
  }

  Future<void> exportExcel() async {
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
        if (mounted) setState(() => message = 'لا توجد برقيات قابلة للتصدير.');
        return;
      }
      final rows = <Map<String, String>>[];
      for (final item in items) {
        if (item is! Map) continue;
        final row = Map<String, dynamic>.from(item);
        final date = DateTime.tryParse(value(row['createdAt']))?.toLocal();
        final organization = value(row['organizationId']);
        final current = value(row['currentOrganizationId']);
        final direction = value(row['direction'] ?? row['type']);
        final outgoing =
            direction == 'outgoing' ||
            direction == 'صادر' ||
            (direction.isEmpty &&
                organization.isNotEmpty &&
                organization == current);
        rows.add({
          'serial': value(row['organizationSerialCode'] ?? row['serialCode']),
          'time': date == null
              ? ''
              : '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}',
          'sender': value(row['creatorName'] ?? row['senderName']),
          'date': date == null
              ? ''
              : '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}',
          'body': value(row['body']),
          'recipient': value(row['recipient']),
          'signature': value(row['creatorName'] ?? row['senderName']),
          'notes': value(row['workflowReason'] ?? row['notes']),
          'direction': outgoing ? 'صادر' : 'وارد',
        });
      }
      final date = DateTime.now().toIso8601String().substring(0, 10);
      final bytes = buildTelegramWorkbook(
        rows,
        fileName: 'سجل-البرقيات-$date.xlsx',
      );
      final path = await FilePicker.saveFile(
        dialogTitle: 'حفظ سجل البرقيات بصيغة Excel',
        fileName: 'سجل-البرقيات-$date.xlsx',
        type: FileType.custom,
        allowedExtensions: ['xlsx'],
        bytes: Uint8List.fromList(bytes),
      );
      if (mounted) {
        setState(
          () => message = path == null
              ? 'تم إلغاء حفظ الملف.'
              : 'تم تجهيز ${rows.length} برقية في ورقتي صادر ووارد بصيغة Excel.',
        );
      }
    } catch (exception) {
      if (mounted) {
        setState(
          () => error = exception.toString().replaceFirst('Exception: ', ''),
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> chooseExcel() async {
    setState(() {
      busy = true;
      message = null;
      error = null;
      clearPreview();
    });
    try {
      final picked = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['xlsx'],
        withData: true,
      );
      if (picked == null || picked.files.isEmpty) return;
      final bytes = picked.files.single.bytes;
      if (bytes == null) throw Exception('تعذر قراءة محتوى ملف Excel المحدد.');
      final parsed = parseTelegramWorkbook(bytes);
      if (!mounted) return;
      setState(() {
        fileName = picked.files.single.name;
        preview = parsed.rows;
        skippedRows = parsed.skippedRows;
        duplicateRows = parsed.duplicateRows;
        issues = parsed.issues;
        message =
            'تمت قراءة ${preview.length} صفًا صالحًا من ${parsed.sheets.length} ورقة.';
      });
    } catch (exception) {
      if (mounted) {
        setState(
          () => error = exception.toString().replaceFirst('Exception: ', ''),
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> importExcel() async {
    if (preview.isEmpty) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => Directionality(
        textDirection: TextDirection.rtl,
        child: AlertDialog(
          title: const Text('تأكيد استيراد سجل Excel'),
          content: Text(
            'سيتم إرسال ${preview.length} صفًا صالحًا. الصفوف المتجاوزة: $skippedRows، والمكررات المستبعدة: $duplicateRows. ستُنشأ السجلات كمسودات وتُطبق صلاحيات الخادم.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('إلغاء'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, true),
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
      var created = 0;
      var skipped = 0;
      var failed = 0;
      for (var start = 0; start < preview.length; start += 100) {
        final batch = preview
            .skip(start)
            .take(100)
            .map((row) => row.toImportMap())
            .toList();
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
              'اكتمل استيراد Excel: أُنشئت $created برقية، وتم تخطي $skipped مكررة${failed > 0 ? '، وتعذر استيراد $failed صفًا' : ''}.';
          clearPreview();
        });
      }
    } catch (exception) {
      if (mounted) {
        setState(
          () => error = exception.toString().replaceFirst('Exception: ', ''),
        );
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
          'استيراد وتصدير Excel',
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
                children: const [
                  Icon(Icons.file_copy_outlined, color: _gold, size: 34),
                  SizedBox(height: 10),
                  Text(
                    'أدوات سجل البرقيات بصيغة Excel',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: _navy,
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  SizedBox(height: 8),
                  Text(
                    'تصدير السجل إلى ملف XLSX بورقتي صادر ووارد، أو استيراد ملف Excel مع معاينة وفحص قبل الاعتماد. تُطبق الصلاحيات والتحقق النهائي على الخادم.',
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
                    'ينشئ ملف Excel حقيقياً بصيغة XLSX، مع فصل البرقيات الصادرة والواردة في ورقتين.',
                  ),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: busy ? null : exportExcel,
                    icon: const Icon(Icons.download_outlined),
                    label: const Text('تصدير سجل البرقيات إلى Excel'),
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
                    'استيراد ملف Excel',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w900,
                      color: _navy,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'يدعم ملفات XLSX التي تحتوي على ورقة صادر أو وارد، ويتعرف على عناوين الأعمدة العربية أو ترتيب النموذج المعتمد.',
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: busy ? null : chooseExcel,
                    icon: const Icon(Icons.upload_file_outlined),
                    label: const Text('اختيار ملف Excel (.xlsx)'),
                  ),
                  if (preview.isNotEmpty) ...[
                    const SizedBox(height: 14),
                    _SummaryGrid(
                      fileName: fileName ?? '—',
                      valid: preview.length,
                      skipped: skippedRows,
                      duplicates: duplicateRows,
                    ),
                    const SizedBox(height: 10),
                    if (issues.isNotEmpty)
                      ExpansionTile(
                        tilePadding: EdgeInsets.zero,
                        title: Text('تقرير التحقق (${issues.length} ملاحظة)'),
                        children: issues.take(20).map((issue) {
                          return ListTile(
                            dense: true,
                            title: Text(
                              '${issue.sheetName} — صف ${issue.rowNumber}',
                            ),
                            subtitle: Text(
                              '${issue.reason}${issue.value.isEmpty ? '' : ' (${issue.value})'}',
                            ),
                          );
                        }).toList(),
                      ),
                    const Divider(),
                    const Text(
                      'معاينة أول 100 صف صالح',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                    ...preview
                        .take(3)
                        .map(
                          (row) => ListTile(
                            dense: true,
                            leading: const Icon(
                              Icons.description_outlined,
                              color: _gold,
                            ),
                            title: Text(
                              '${row.sheetName} · ${row.sender.isEmpty ? row.originalSerial : row.sender}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            subtitle: Text(
                              row.body,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                    if (preview.length > 3)
                      Text('و ${preview.length - 3} صفوف أخرى'),
                    const SizedBox(height: 8),
                    FilledButton.icon(
                      onPressed: busy ? null : importExcel,
                      icon: const Icon(Icons.cloud_upload_outlined),
                      label: Text('اعتماد استيراد ${preview.length} صف'),
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

class _SummaryGrid extends StatelessWidget {
  const _SummaryGrid({
    required this.fileName,
    required this.valid,
    required this.skipped,
    required this.duplicates,
  });

  final String fileName;
  final int valid;
  final int skipped;
  final int duplicates;

  @override
  Widget build(BuildContext context) => Wrap(
    spacing: 8,
    runSpacing: 8,
    children: [
      _SummaryItem(label: 'الملف', value: fileName, wide: true),
      _SummaryItem(label: 'صفوف صالحة', value: '$valid'),
      _SummaryItem(label: 'صفوف متجاوزة', value: '$skipped'),
      _SummaryItem(label: 'مكررات', value: '$duplicates'),
    ],
  );
}

class _SummaryItem extends StatelessWidget {
  const _SummaryItem({
    required this.label,
    required this.value,
    this.wide = false,
  });

  final String label;
  final String value;
  final bool wide;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: wide ? 220 : 105,
    child: Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 10)),
          const SizedBox(height: 3),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w900),
          ),
        ],
      ),
    ),
  );
}
