import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import 'api.dart';
import 'telegram_excel_codec.dart';
import 'telegram_display.dart';

const _navy = Color(0xFF10233F);
const _gold = Color(0xFFD8C38E);

bool _hasEncryptedOfficeContainerSignature(Uint8List bytes) {
  const signature = <int>[0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
  if (bytes.length < signature.length) return false;
  for (var index = 0; index < signature.length; index += 1) {
    if (bytes[index] != signature[index]) return false;
  }
  return true;
}

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
  final Set<int> selectedRows = {};
  final Set<int> duplicateIndexes = {};

  String value(dynamic input) =>
      input == null || '$input' == 'null' ? '' : '$input'.trim();

  TelegramExcelRow _rowFromMap(Map row) => TelegramExcelRow(
    originalSerial: value(row['originalSerial']),
    time: value(row['time']),
    sender: value(row['sender']),
    date: value(row['date']),
    body: value(row['body']),
    recipient: value(row['recipient']),
    signature: value(row['signature']),
    notes: value(row['notes']),
    sheetName: value(row['sheetName']) == 'وارد' ? 'وارد' : 'صادر',
  );

  TelegramExcelIssue _issueFromMap(Map row) => TelegramExcelIssue(
    rowNumber: int.tryParse('${row['rowNumber']}') ?? 0,
    sheetName: value(row['sheetName']),
    reason: value(row['reason']),
    value: value(row['value']),
  );

  void clearPreview() {
    preview = const [];
    issues = const [];
    skippedRows = 0;
    duplicateRows = 0;
    selectedRows.clear();
    duplicateIndexes.clear();
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
        final date = DateTime.tryParse(
          value(row['telegramDate'] ?? row['createdAt']),
        )?.toLocal();
        final organization = value(row['organizationId']);
        final current = value(row['currentOrganizationId']);
        final direction = value(row['direction'] ?? row['type']);
        final outgoing =
            direction == 'outgoing' ||
            direction == 'صادر' ||
            (direction.isEmpty &&
                organization.isNotEmpty &&
                organization == current);
        final sourceTime = value(row['time']);
        final sourceDate = value(row['date']);
        rows.add({
          'serial': getTelegramSerialCode(row),
          'time': sourceTime.isNotEmpty
              ? sourceTime
              : date == null
              ? ''
              : '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}:${date.second.toString().padLeft(2, '0')}',
          'sender': value(row['creatorName'] ?? row['senderName']),
          'date': sourceDate.isNotEmpty
              ? sourceDate
              : date == null
              ? ''
              : '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}',
          'body': value(row['body']),
          'recipient': value(row['recipient']),
          'signature': value(row['creatorName'] ?? row['senderName']),
          'notes': value(row['importNotes']),
          'direction': outgoing ? 'صادر' : 'وارد',
        });
      }
      if (rows.length > 1000) {
        throw Exception(
          'يحتوي السجل على ${rows.length} صفًا؛ حد ملف القالب الواحد 1000. استخدم مرشحات التاريخ لتقسيم التصدير.',
        );
      }
      final options = await _confirmExport(rows);
      if (options == null || !mounted) return;
      final exported = await widget.api.call(
        'telegrams.exportWorkbook',
        mutation: true,
        input: {
          'rows': rows,
          if (options['password']!.isNotEmpty) 'password': options['password'],
        },
      );
      if (exported is! Map || exported['base64'] is! String) {
        throw Exception('تعذر إنشاء ملف Excel.');
      }
      final outputName = value(exported['fileName']);
      final path = await FilePicker.saveFile(
        dialogTitle: 'حفظ سجل البرقيات بصيغة Excel',
        fileName: outputName,
        type: FileType.custom,
        allowedExtensions: ['xlsx'],
        bytes: Uint8List.fromList(base64Decode(exported['base64'] as String)),
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

  Future<Map<String, String>?> _confirmExport(
    List<Map<String, String>> rows,
  ) async {
    final password = TextEditingController();
    var protect = false;
    String? passwordError;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => Directionality(
          textDirection: TextDirection.rtl,
          child: AlertDialog(
            title: const Text('معاينة تصدير البرقيات'),
            content: SizedBox(
              width: 520,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('سيصدر ${rows.length} صفًا في ملف مطابق لقالب السجل.'),
                    ...rows
                        .take(5)
                        .map(
                          (row) => ListTile(
                            dense: true,
                            title: Text(
                              '${row['direction']} · ${row['serial']}',
                            ),
                            subtitle: Text(
                              row['body'] ?? '',
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      value: protect,
                      title: const Text('حماية الملف بكلمة مرور'),
                      onChanged: (value) => setDialogState(() {
                        protect = value ?? false;
                        passwordError = null;
                      }),
                    ),
                    if (protect)
                      TextField(
                        controller: password,
                        obscureText: true,
                        onChanged: (_) {
                          if (password.text.trim().length >= 4) {
                            setDialogState(() => passwordError = null);
                          }
                        },
                        decoration: InputDecoration(
                          labelText: 'كلمة المرور (4 أحرف على الأقل)',
                          errorText: passwordError,
                        ),
                      ),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('إلغاء'),
              ),
              FilledButton(
                onPressed: () {
                  if (protect && password.text.trim().length < 4) {
                    setDialogState(
                      () => passwordError =
                          'أدخل 4 أحرف على الأقل أو أوقف حماية الملف.',
                    );
                    return;
                  }
                  Navigator.pop(dialogContext, true);
                },
                child: const Text('تصدير'),
              ),
            ],
          ),
        ),
      ),
    );
    // Preserve the exact password entered by the user. Trimming here changes
    // passwords that intentionally begin or end with whitespace and makes the
    // generated workbook appear to reject the user's correct password later.
    final result = confirmed == true
        ? {'password': protect ? password.text : ''}
        : null;
    password.dispose();
    return result;
  }

  Future<String?> _askImportPassword() async {
    final controller = TextEditingController();
    final password = await showDialog<String>(
      context: context,
      builder: (dialogContext) => Directionality(
        textDirection: TextDirection.rtl,
        child: AlertDialog(
          title: const Text('الملف محمي بكلمة مرور'),
          content: TextField(
            controller: controller,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'أدخل كلمة المرور'),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('إلغاء'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, controller.text),
              child: const Text('متابعة'),
            ),
          ],
        ),
      ),
    );
    controller.dispose();
    return password;
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
      TelegramExcelParseResult? parsed;
      Set<int> duplicates = {};
      try {
        parsed = parseTelegramWorkbook(bytes);
      } catch (_) {
        // Encrypted OOXML workbooks use an OLE/CFB container signature.
        // Do not ask for a password when an ordinary XLSX parse fails for
        // another reason, such as an invalid or unsupported workbook.
        if (!_hasEncryptedOfficeContainerSignature(bytes)) rethrow;
        final password = await _askImportPassword();
        if (password == null || !mounted) return;
        final result = await widget.api.call(
          'telegrams.importWorkbookPreview',
          mutation: true,
          input: {'base64': base64Encode(bytes), 'password': password},
        );
        if (result is! Map || result['rows'] is! List) {
          throw Exception('تعذر إنشاء معاينة الملف المحمي.');
        }
        final rows = (result['rows'] as List)
            .whereType<Map>()
            .map(_rowFromMap)
            .toList();
        final duplicateList = result['duplicates'];
        duplicates = duplicateList is List
            ? duplicateList
                  .map((i) => int.tryParse('$i') ?? -1)
                  .where((i) => i >= 0)
                  .toSet()
            : {};
        final issues = result['issues'] is List
            ? (result['issues'] as List)
                  .whereType<Map>()
                  .map(_issueFromMap)
                  .toList()
            : <TelegramExcelIssue>[];
        parsed = TelegramExcelParseResult(
          rows: rows,
          skippedRows: int.tryParse('${result['skippedRows']}') ?? 0,
          duplicateRows: int.tryParse('${result['duplicateRows']}') ?? 0,
          issues: issues,
          sheets: result['sheets'] is List
              ? (result['sheets'] as List).map(value).toList()
              : const [],
        );
      }
      if (parsed.rows.isEmpty) {
        throw Exception('لم يتم العثور على صفوف صالحة للاستيراد في ملف Excel.');
      }
      if (duplicates.isEmpty) {
        const batchSize = 50;
        for (var start = 0; start < parsed.rows.length; start += batchSize) {
          final batchRows = parsed.rows
              .skip(start)
              .take(batchSize)
              .map((row) => row.toImportMap())
              .toList();
          final checked = await widget.api.call(
            'telegrams.importPreview',
            mutation: true,
            input: {'rows': batchRows},
          );
          if (checked is List) {
            duplicates.addAll(
              checked
                  .whereType<Map>()
                  .where((item) => item['duplicate'] == true)
                  .map(
                    (item) => start + (int.tryParse('${item['index']}') ?? -1),
                  )
                  .where(
                    (index) =>
                        index >= start && index < start + batchRows.length,
                  ),
            );
          }
        }
      }
      if (!mounted) return;
      setState(() {
        fileName = picked.files.single.name;
        preview = parsed!.rows;
        duplicateIndexes
          ..clear()
          ..addAll(duplicates);
        selectedRows
          ..clear()
          ..addAll(
            List.generate(
              preview.length,
              (i) => i,
            ).where((i) => !duplicates.contains(i)),
          );
        skippedRows = parsed.skippedRows;
        duplicateRows = parsed.duplicateRows + duplicates.length;
        issues = parsed.issues;
        message =
            'تمت قراءة ${preview.length} صفًا من ${parsed.sheets.length} ورقة. تم إلغاء تحديد ${duplicates.length} رقمًا موجودًا مسبقًا.';
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
    if (selectedRows.isEmpty) return;
    final chosenRows = selectedRows.toList()..sort();
    final rowsToImport = chosenRows.map((index) => preview[index]).toList();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => Directionality(
        textDirection: TextDirection.rtl,
        child: AlertDialog(
          title: const Text('تأكيد استيراد سجل Excel'),
          content: Text(
            'سيتم استيراد ${rowsToImport.length} صفًا من اختيارك. الصفوف المتجاوزة: $skippedRows، والمكررات المستبعدة تلقائيًا: $duplicateRows.',
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
      for (var start = 0; start < rowsToImport.length; start += 100) {
        final batch = rowsToImport
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

  Future<void> _editRow(int index) async {
    final row = preview[index];
    final controllers = <String, TextEditingController>{
      'originalSerial': TextEditingController(text: row.originalSerial),
      'time': TextEditingController(text: row.time),
      'sender': TextEditingController(text: row.sender),
      'date': TextEditingController(text: row.date),
      'body': TextEditingController(text: row.body),
      'recipient': TextEditingController(text: row.recipient),
      'signature': TextEditingController(text: row.signature),
      'notes': TextEditingController(text: row.notes),
    };
    String? bodyError;
    final accepted = await showDialog<bool>(
      context: context,
      builder: (_) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => Directionality(
          textDirection: TextDirection.rtl,
          child: AlertDialog(
            title: Text('تعديل صف ${index + 1} قبل الاستيراد'),
            content: SizedBox(
              width: 520,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (final entry in controllers.entries)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: TextField(
                          controller: entry.value,
                          onChanged: entry.key == 'body'
                              ? (value) {
                                  if (value.trim().length >= 3) {
                                    setDialogState(() => bodyError = null);
                                  }
                                }
                              : null,
                          minLines: entry.key == 'body' || entry.key == 'notes'
                              ? 2
                              : 1,
                          maxLines: entry.key == 'body' || entry.key == 'notes'
                              ? 5
                              : 1,
                          decoration: InputDecoration(
                            labelText: {
                              'originalSerial': 'الرقم المتسلسل',
                              'time': 'الوقت',
                              'sender': 'المرسل',
                              'date': 'التاريخ',
                              'body': 'نص البرقية',
                              'recipient': 'المستلم',
                              'signature': 'التوقيع',
                              'notes': 'ملاحظات',
                            }[entry.key],
                            border: const OutlineInputBorder(),
                            errorText: entry.key == 'body' ? bodyError : null,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('إلغاء'),
              ),
              FilledButton(
                onPressed: () {
                  if (controllers['body']!.text.trim().length < 3) {
                    setDialogState(
                      () => bodyError = 'أدخل نصًا لا يقل عن 3 أحرف.',
                    );
                    return;
                  }
                  Navigator.pop(dialogContext, true);
                },
                child: const Text('حفظ التعديل'),
              ),
            ],
          ),
        ),
      ),
    );
    if (accepted == true && mounted) {
      setState(() {
        preview[index] = row.copyWith(
          originalSerial: controllers['originalSerial']!.text.trim(),
          time: controllers['time']!.text.trim(),
          sender: controllers['sender']!.text.trim(),
          date: controllers['date']!.text.trim(),
          body: controllers['body']!.text.trim(),
          recipient: controllers['recipient']!.text.trim(),
          signature: controllers['signature']!.text.trim(),
          notes: controllers['notes']!.text.trim(),
        );
      });
    }
    for (final controller in controllers.values) {
      controller.dispose();
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
                      'معاينة الصفوف — راجع أو عدّل قبل الاعتماد',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                    Wrap(
                      spacing: 8,
                      children: [
                        TextButton(
                          onPressed: () => setState(() {
                            selectedRows
                              ..clear()
                              ..addAll(
                                List.generate(
                                  preview.length,
                                  (i) => i,
                                ).where((i) => !duplicateIndexes.contains(i)),
                              );
                          }),
                          child: const Text('تحديد غير المكرر'),
                        ),
                        TextButton(
                          onPressed: () => setState(selectedRows.clear),
                          child: const Text('إلغاء التحديد'),
                        ),
                      ],
                    ),
                    ...preview.asMap().entries.map((entry) {
                      final index = entry.key;
                      final row = entry.value;
                      final duplicate = duplicateIndexes.contains(index);
                      return CheckboxListTile(
                        dense: true,
                        value: !duplicate && selectedRows.contains(index),
                        onChanged: duplicate
                            ? null
                            : (checked) => setState(() {
                                if (checked == true) {
                                  selectedRows.add(index);
                                } else {
                                  selectedRows.remove(index);
                                }
                              }),
                        title: Text(
                          '${row.sheetName} · ${row.originalSerial.isEmpty ? row.sender : row.originalSerial}${duplicate ? ' · موجود مسبقًا' : ''}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: duplicate
                              ? const TextStyle(color: Colors.deepOrange)
                              : null,
                        ),
                        subtitle: Text(
                          row.body,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        secondary: IconButton(
                          tooltip: 'تعديل الصف',
                          icon: const Icon(Icons.edit_outlined),
                          onPressed: () => _editRow(index),
                        ),
                      );
                    }),
                    const SizedBox(height: 8),
                    FilledButton.icon(
                      onPressed: busy || selectedRows.isEmpty
                          ? null
                          : importExcel,
                      icon: const Icon(Icons.cloud_upload_outlined),
                      label: Text('استيراد ${selectedRows.length} صف محدد'),
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
