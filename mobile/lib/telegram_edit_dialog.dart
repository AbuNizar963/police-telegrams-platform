import 'package:flutter/material.dart';

import 'api.dart';

const _categories = <MapEntry<String, String>>[
  MapEntry('criminal', 'جنائي'),
  MapEntry('administrative', 'إداري'),
  MapEntry('traffic', 'مروري'),
  MapEntry('security', 'أمني'),
  MapEntry('tactical', 'تكتيكي'),
  MapEntry('intelligence', 'استخبارات'),
  MapEntry('emergency', 'طوارئ'),
  MapEntry('public_order', 'حفظ النظام'),
  MapEntry('personnel', 'أفراد'),
  MapEntry('logistics', 'لوجستي'),
  MapEntry('training', 'تدريب'),
  MapEntry('community', 'مجتمعي'),
  MapEntry('other', 'أخرى'),
];

const _classifications = <MapEntry<String, String>>[
  MapEntry('normal', 'عادي'),
  MapEntry('secret', 'سري'),
];

const _priorities = <MapEntry<String, String>>[
  MapEntry('slow', 'غير عاجل'),
  MapEntry('normal', 'عادي'),
  MapEntry('urgent', 'عاجل'),
];

class TelegramEditDialog extends StatefulWidget {
  const TelegramEditDialog({
    super.key,
    required this.api,
    required this.telegramId,
    required this.telegram,
  });

  final PoliceApi api;
  final int telegramId;
  final Map<String, dynamic> telegram;

  @override
  State<TelegramEditDialog> createState() => _TelegramEditDialogState();
}

class _TelegramEditDialogState extends State<TelegramEditDialog> {
  late final TextEditingController _subjectController;
  late final TextEditingController _recipientController;
  late final TextEditingController _bodyController;

  late String _classification;
  late String _priority;
  late String _category;

  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _subjectController = TextEditingController(
      text: _text(widget.telegram['subject']),
    );
    _recipientController = TextEditingController(
      text: _text(widget.telegram['recipient']),
    );
    _bodyController = TextEditingController(
      text: _text(widget.telegram['body']),
    );
    _classification = _choice(
      widget.telegram['classification'],
      _classifications,
      'normal',
    );
    _priority = _choice(widget.telegram['priority'], _priorities, 'normal');
    _category = _choice(
      widget.telegram['category'],
      _categories,
      'administrative',
    );
  }

  @override
  void dispose() {
    _subjectController.dispose();
    _recipientController.dispose();
    _bodyController.dispose();
    super.dispose();
  }

  String _text(dynamic value) {
    if (value == null || '$value' == 'null') return '';
    return '$value';
  }

  String _choice(
    dynamic value,
    List<MapEntry<String, String>> options,
    String fallback,
  ) {
    for (final option in options) {
      if (option.key == value) return value as String;
    }
    return fallback;
  }

  Future<void> _save() async {
    final subject = _subjectController.text.trim();
    final recipient = _recipientController.text.trim();
    final body = _bodyController.text.trim();

    if (subject.length < 2 || recipient.length < 2 || body.length < 3) {
      setState(() => _error = 'أكمل الموضوع والجهة ونص البرقية بشكل صحيح.');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      final status = _text(widget.telegram['status']);
      await widget.api.call(
        'telegrams.update',
        mutation: true,
        input: {
          'id': widget.telegramId,
          'subject': subject,
          'recipient': recipient,
          'body': body,
          'classification': _classification,
          'priority': _priority,
          'category': _category,
          'status': status.isEmpty ? 'draft' : status,
        },
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (exception) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = exception.toString().replaceFirst('Exception: ', '');
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: AlertDialog(
      title: Text(
        'تعديل بيانات البرقية',
        style: TextStyle(
          color: Theme.of(context).colorScheme.primary,
          fontWeight: FontWeight.w900,
        ),
      ),
      content: SizedBox(
        width: 460,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: _subjectController,
                enabled: !_saving,
                maxLength: 255,
                decoration: const InputDecoration(labelText: 'موضوع البرقية'),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _recipientController,
                enabled: !_saving,
                maxLength: 255,
                decoration: const InputDecoration(labelText: 'الجهة المستلمة'),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue: _classification,
                decoration: const InputDecoration(labelText: 'التصنيف'),
                items: _classifications
                    .map(
                      (option) => DropdownMenuItem(
                        value: option.key,
                        child: Text(option.value),
                      ),
                    )
                    .toList(),
                onChanged: _saving
                    ? null
                    : (value) {
                        if (value != null) {
                          setState(() => _classification = value);
                        }
                      },
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue: _priority,
                decoration: const InputDecoration(labelText: 'الأسبقية'),
                items: _priorities
                    .map(
                      (option) => DropdownMenuItem(
                        value: option.key,
                        child: Text(option.value),
                      ),
                    )
                    .toList(),
                onChanged: _saving
                    ? null
                    : (value) {
                        if (value != null) setState(() => _priority = value);
                      },
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue: _category,
                decoration: const InputDecoration(labelText: 'الفئة'),
                items: _categories
                    .map(
                      (option) => DropdownMenuItem(
                        value: option.key,
                        child: Text(option.value),
                      ),
                    )
                    .toList(),
                onChanged: _saving
                    ? null
                    : (value) {
                        if (value != null) setState(() => _category = value);
                      },
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _bodyController,
                enabled: !_saving,
                minLines: 5,
                maxLines: 9,
                maxLength: 20000,
                decoration: const InputDecoration(
                  labelText: 'نص البرقية',
                  alignLabelWithHint: true,
                ),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    _error!,
                    style: const TextStyle(color: Colors.red),
                  ),
                ),
              if (_saving) const LinearProgressIndicator(),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _saving ? null : () => Navigator.of(context).pop(false),
          child: const Text('إلغاء'),
        ),
        FilledButton.icon(
          onPressed: _saving ? null : _save,
          icon: const Icon(Icons.save_outlined),
          label: Text(_saving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'),
        ),
      ],
    ),
  );
}
