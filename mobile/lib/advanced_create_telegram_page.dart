import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import 'api.dart';

const _composerNavy = Color(0xFF101C35);
const _composerGold = Color(0xFFC9A45C);

class AdvancedCreateTelegramSheet extends StatefulWidget {
  const AdvancedCreateTelegramSheet({super.key, required this.api});
  final PoliceApi api;

  @override
  State<AdvancedCreateTelegramSheet> createState() =>
      _AdvancedCreateTelegramSheetState();
}

class _AdvancedCreateTelegramSheetState
    extends State<AdvancedCreateTelegramSheet> {
  final _serial = TextEditingController();
  final _subject = TextEditingController();
  final _recipient = TextEditingController();
  final _body = TextEditingController();
  bool _loading = true;
  bool _saving = false;
  bool _serialEdited = false;
  bool _broadcast = false;
  String? _error;
  String? _recipientId;
  String _classification = 'normal';
  String _priority = 'normal';
  String _category = 'administrative';
  List<Map<String, dynamic>> _routingDirectory = [];
  List<Map<String, dynamic>> _descendants = [];
  PlatformFile? _attachment;

  static const _classifications = <String, String>{
    'normal': 'عادي',
    'secret': 'سري',
    'top_secret': 'سري للغاية',
    'confidential': 'سري',
  };
  static const _priorities = <String, String>{
    'normal': 'عادي',
    'urgent': 'عاجل',
    'slow': 'بطيء',
  };
  static const _categories = <String, String>{
    'criminal': 'جنائي',
    'administrative': 'إداري',
    'traffic': 'مروري',
    'security': 'أمني',
    'tactical': 'تكتيكي',
    'intelligence': 'استخباراتي',
    'emergency': 'طوارئ',
    'public_order': 'حفظ النظام',
    'personnel': 'شؤون الأفراد',
    'logistics': 'إمداد ودعم',
    'training': 'تدريب',
    'community': 'مجتمعي',
    'other': 'أخرى',
  };

  @override
  void initState() {
    super.initState();
    _loadFormData();
  }

  @override
  void dispose() {
    _serial.dispose();
    _subject.dispose();
    _recipient.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _loadFormData() async {
    try {
      final results = await Future.wait<dynamic>([
        widget.api.call('telegrams.nextOutgoingSerial'),
        widget.api.call('organizations.routingDirectory'),
        widget.api.call('organizations.descendants'),
      ]);
      if (!mounted) return;
      final directory = results[1] is List
          ? (results[1] as List)
                .whereType<Map>()
                .map((row) => Map<String, dynamic>.from(row))
                .where((row) => row['isSelectable'] == true)
                .toList()
          : <Map<String, dynamic>>[];
      final descendants = results[2] is List
          ? (results[2] as List)
                .whereType<Map>()
                .map((row) => Map<String, dynamic>.from(row))
                .toList()
          : <Map<String, dynamic>>[];
      final suggested = results[0] is Map ? results[0]['number'] : null;
      setState(() {
        _routingDirectory = directory;
        _descendants = descendants;
        if (!_serialEdited && suggested != null) _serial.text = '$suggested';
        final configured = directory.firstWhere(
          (row) => row['isConfiguredDestination'] == true,
          orElse: () => <String, dynamic>{},
        );
        if (configured.isNotEmpty) {
          _recipientId = '${configured['id']}';
          _recipient.text = '${configured['name'] ?? ''}';
        }
      });
    } catch (exception) {
      if (mounted) setState(() => _error = _message(exception));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _message(Object exception) =>
      exception.toString().replaceFirst('Exception: ', '');

  String? _contentType(String? extension) {
    switch ((extension ?? '').toLowerCase()) {
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
    }
    return null;
  }

  Future<void> _chooseAttachment() async {
    final result = await FilePicker.pickFiles(
      withData: true,
      type: FileType.custom,
      allowedExtensions: const [
        'jpg',
        'jpeg',
        'png',
        'webp',
        'pdf',
        'mp3',
        'wav',
        'webm',
      ],
    );
    if (result == null || result.files.isEmpty || !mounted) return;
    final file = result.files.single;
    if (_contentType(file.extension) == null) {
      setState(() => _error = 'نوع المرفق غير مدعوم.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setState(() => _error = 'حجم المرفق يتجاوز 10 ميغابايت.');
      return;
    }
    if (file.bytes == null || file.bytes!.isEmpty) {
      setState(() => _error = 'تعذر قراءة المرفق المحدد.');
      return;
    }
    setState(() {
      _attachment = file;
      _error = null;
    });
  }

  void _selectRecipient(String? id) {
    setState(() {
      _broadcast = false;
      _recipientId = id;
      final row = _routingDirectory.firstWhere(
        (item) => '${item['id']}' == id,
        orElse: () => <String, dynamic>{},
      );
      _recipient.text = '${row['name'] ?? ''}';
    });
  }

  Future<void> _submit() async {
    final serial = int.tryParse(_serial.text.trim());
    if (serial == null || serial < 1 || serial > 999999999) {
      setState(() => _error = 'أدخل رقم برقية صحيحًا بين 1 و999999999.');
      return;
    }
    if (_subject.text.trim().length < 2 ||
        _recipient.text.trim().length < 2 ||
        _body.text.trim().length < 3) {
      setState(() => _error = 'أكمل الموضوع والجهة ونص البرقية.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final result = await widget.api.call(
        'telegrams.create',
        mutation: true,
        input: {
          'subject': _subject.text.trim(),
          'recipient': _recipient.text.trim(),
          if (_recipientId != null && !_broadcast)
            'recipientOrganizationId': _recipientId,
          if (_broadcast) 'broadcastToDescendants': true,
          'body': _body.text.trim(),
          'classification': _classification,
          'priority': _priority,
          'category': _category,
          'requestedOrganizationSerialNumber': serial,
        },
      );
      final id = result is Map ? int.tryParse('${result['id']}') : null;
      final attachment = _attachment;
      if (id != null && attachment != null && attachment.bytes != null) {
        await widget.api.call(
          'telegrams.uploadAttachment',
          mutation: true,
          input: {
            'telegramId': id,
            'fileName': attachment.name,
            'contentType': _contentType(attachment.extension),
            'base64': base64Encode(attachment.bytes!),
          },
        );
      }
      if (mounted) Navigator.pop(context, true);
    } catch (exception) {
      if (mounted) setState(() => _error = _message(exception));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: SafeArea(
      child: Material(
        color: Theme.of(context).scaffoldBackgroundColor,
        child: Column(
          children: [
            _header(context),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : Form(
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                        children: [
                          if (_error != null) _errorCard(_error!),
                          _offlineStyleNotice(),
                          _fieldLabel('رقم البرقية'),
                          TextField(
                            controller: _serial,
                            keyboardType: TextInputType.number,
                            onChanged: (_) => _serialEdited = true,
                            decoration: const InputDecoration(
                              hintText: 'يوضع الرقم التالي تلقائيًا',
                              prefixIcon: Icon(Icons.numbers_outlined),
                            ),
                          ),
                          const SizedBox(height: 14),
                          _fieldLabel('الجهة الموجهة إليها'),
                          DropdownButtonFormField<String>(
                            initialValue: _broadcast ? null : _recipientId,
                            isExpanded: true,
                            decoration: const InputDecoration(
                              hintText: 'اختر الجهة المستلمة من دليل التوجيه',
                              prefixIcon: Icon(Icons.account_tree_outlined),
                            ),
                            items: _routingDirectory
                                .map(
                                  (row) => DropdownMenuItem<String>(
                                    value: '${row['id']}',
                                    child: Text(
                                      '${row['name'] ?? 'جهة بدون اسم'}',
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                )
                                .toList(),
                            onChanged: _saving ? null : _selectRecipient,
                          ),
                          if (_descendants.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            Card(
                              margin: EdgeInsets.zero,
                              color: _broadcast
                                  ? const Color(0xFFFFF8E8)
                                  : null,
                              child: CheckboxListTile(
                                value: _broadcast,
                                onChanged: _saving
                                    ? null
                                    : (value) => setState(() {
                                        _broadcast = value ?? false;
                                        if (_broadcast) {
                                          _recipientId = null;
                                          _recipient.text = 'كافة الوحدات';
                                        }
                                      }),
                                title: const Text(
                                  'كافة الوحدات',
                                  style: TextStyle(fontWeight: FontWeight.w800),
                                ),
                                subtitle: Text(
                                  'إرسال نسخة إلى الجهات التابعة مباشرة (${_descendants.length})',
                                ),
                                controlAffinity:
                                    ListTileControlAffinity.leading,
                              ),
                            ),
                          ],
                          const SizedBox(height: 14),
                          _fieldLabel('درجة السرية'),
                          _choiceGrid(_classifications, _classification, (v) {
                            setState(() => _classification = v);
                          }, columns: 2),
                          const SizedBox(height: 14),
                          _fieldLabel('درجة الأولوية'),
                          _choiceGrid(_priorities, _priority, (v) {
                            setState(() => _priority = v);
                          }, columns: 3),
                          const SizedBox(height: 14),
                          _fieldLabel('تصنيف البلاغ'),
                          DropdownButtonFormField<String>(
                            initialValue: _category,
                            isExpanded: true,
                            decoration: const InputDecoration(
                              prefixIcon: Icon(Icons.category_outlined),
                            ),
                            items: _categories.entries
                                .map(
                                  (entry) => DropdownMenuItem(
                                    value: entry.key,
                                    child: Text(entry.value),
                                  ),
                                )
                                .toList(),
                            onChanged: _saving
                                ? null
                                : (value) => setState(() {
                                    if (value != null) _category = value;
                                  }),
                          ),
                          const SizedBox(height: 14),
                          _fieldLabel('الموضوع'),
                          TextField(
                            controller: _subject,
                            textInputAction: TextInputAction.next,
                            decoration: const InputDecoration(
                              hintText: 'عنوان مختصر ودقيق للبلاغ',
                              prefixIcon: Icon(Icons.title_outlined),
                            ),
                          ),
                          const SizedBox(height: 14),
                          _fieldLabel('نص البرقية'),
                          TextField(
                            controller: _body,
                            minLines: 8,
                            maxLines: 14,
                            textAlignVertical: TextAlignVertical.top,
                            decoration: const InputDecoration(
                              hintText: 'اكتب تفاصيل البلاغ...',
                              alignLabelWithHint: true,
                              prefixIcon: Padding(
                                padding: EdgeInsets.only(bottom: 120),
                                child: Icon(Icons.article_outlined),
                              ),
                            ),
                          ),
                          const SizedBox(height: 10),
                          OutlinedButton.icon(
                            onPressed: _saving ? null : _chooseAttachment,
                            icon: const Icon(Icons.attach_file),
                            label: Text(
                              _attachment == null
                                  ? 'إرفاق صورة أو PDF أو ملف صوتي'
                                  : 'تغيير المرفق: ${_attachment!.name}',
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (_attachment != null)
                            Align(
                              alignment: AlignmentDirectional.centerStart,
                              child: TextButton.icon(
                                onPressed: _saving
                                    ? null
                                    : () => setState(() => _attachment = null),
                                icon: const Icon(Icons.close),
                                label: const Text('إزالة المرفق'),
                              ),
                            ),
                          const SizedBox(height: 14),
                          FilledButton.icon(
                            onPressed: _saving ? null : _submit,
                            icon: _saving
                                ? const SizedBox.square(
                                    dimension: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white,
                                    ),
                                  )
                                : const Icon(Icons.send_outlined),
                            label: Text(
                              _saving
                                  ? 'جارٍ الحفظ والإرسال...'
                                  : 'حفظ وإرسال البرقية',
                            ),
                          ),
                        ],
                      ),
                    ),
            ),
          ],
        ),
      ),
    ),
  );

  Widget _header(BuildContext context) => Container(
    color: _composerNavy,
    padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
    child: Row(
      children: [
        IconButton(
          onPressed: () => Navigator.pop(context),
          color: Colors.white,
          icon: const Icon(Icons.close),
          tooltip: 'إغلاق',
        ),
        const Expanded(
          child: Text(
            'إنشاء برقية جديدة',
            textAlign: TextAlign.right,
            style: TextStyle(
              color: Colors.white,
              fontSize: 19,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
        const Icon(Icons.description_outlined, color: _composerGold),
      ],
    ),
  );

  Widget _fieldLabel(String label) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(
      label,
      style: const TextStyle(
        color: _composerNavy,
        fontSize: 13,
        fontWeight: FontWeight.w800,
      ),
    ),
  );

  Widget _choiceGrid(
    Map<String, String> options,
    String selected,
    ValueChanged<String> onChanged, {
    required int columns,
  }) => GridView.count(
    crossAxisCount: columns,
    crossAxisSpacing: 8,
    mainAxisSpacing: 8,
    childAspectRatio: columns == 3 ? 2.3 : 2.6,
    shrinkWrap: true,
    physics: const NeverScrollableScrollPhysics(),
    children: options.entries
        .map(
          (entry) => OutlinedButton(
            style: OutlinedButton.styleFrom(
              backgroundColor: entry.key == selected
                  ? const Color(0xFFFFF8E8)
                  : null,
              foregroundColor: entry.key == selected
                  ? const Color(0xFF7A5C1E)
                  : _composerNavy,
              side: BorderSide(
                color: entry.key == selected
                    ? _composerGold
                    : const Color(0xFFD9DEE7),
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
            onPressed: () => onChanged(entry.key),
            child: Text(entry.value),
          ),
        )
        .toList(),
  );

  Widget _offlineStyleNotice() => const Padding(
    padding: EdgeInsets.only(bottom: 12),
    child: Text(
      'تُحفظ البرقية مركزيًا بعد نجاح الإرسال، وتُطبق الصلاحيات والتحقق النهائي على الخادم.',
      style: TextStyle(color: Colors.black54, fontSize: 12, height: 1.5),
    ),
  );

  Widget _errorCard(String message) => Card(
    color: const Color(0xFFFFEEEE),
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Text(message, style: const TextStyle(color: Colors.red)),
    ),
  );
}
