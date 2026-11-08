import 'package:flutter/material.dart';

import '../../api.dart';
import '../notifications/toast.dart';

const _navy = Color(0xFF10233F);

String _settingsErrorMessage(Object error) =>
    error.toString().replaceFirst('Exception: ', '');

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) => Card(
    color: Theme.of(context).colorScheme.errorContainer,
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Text(
        message,
        style: TextStyle(color: Theme.of(context).colorScheme.onErrorContainer),
      ),
    ),
  );
}

class PlatformDocumentSettingsPage extends StatefulWidget {
  const PlatformDocumentSettingsPage({super.key, required this.api});

  final PoliceApi api;

  @override
  State<PlatformDocumentSettingsPage> createState() =>
      _PlatformDocumentSettingsPageState();
}

class _PlatformDocumentSettingsPageState
    extends State<PlatformDocumentSettingsPage> {
  static const _defaultColor = '#b49a55';
  static const _colorOptions = <String>[
    '#17365D',
    '#2457A6',
    '#168AAD',
    '#2A7F62',
    '#5B8C3A',
    '#B49A55',
    '#A66A24',
    '#9B4A42',
    '#8B3A62',
    '#684A8E',
    '#5D6775',
    '#202833',
  ];

  bool _loading = true;
  bool _saving = false;
  bool _settingsConfirmed = false;
  bool _showMinistryWatermarkText = true;
  bool _showVerificationQr = true;
  double _watermarkOpacityPercent = 12;
  String _headerDividerColor = _defaultColor;
  String? _error;
  final TextEditingController _colorController = TextEditingController(
    text: _defaultColor,
  );

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _colorController.dispose();
    super.dispose();
  }

  Color _parseColor(String value) {
    final normalized = value.replaceFirst('#', '');
    final parsed = int.tryParse(normalized, radix: 16);
    return Color(0xFF000000 | (parsed ?? 0xB49A55));
  }

  bool _hasValidSettingsContract(Map result) {
    final opacity = result['watermarkOpacityPercent'];
    final color = result['headerDividerColor'];
    return result['showMinistryWatermarkText'] is bool &&
        result['showVerificationQr'] is bool &&
        opacity is int &&
        opacity >= 0 &&
        opacity <= 60 &&
        color is String &&
        RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(color);
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _settingsConfirmed = false;
    });
    try {
      final result = await widget.api.call(
        'platformDocumentSettings.get',
        allowOfflineCache: false,
      );
      if (result is! Map || !_hasValidSettingsContract(result)) {
        throw Exception('تعذر قراءة إعدادات النظام.');
      }
      final opacity = result['watermarkOpacityPercent'] as int;
      final color = result['headerDividerColor'] as String;
      if (!mounted) return;
      setState(() {
        _showMinistryWatermarkText =
            result['showMinistryWatermarkText'] as bool;
        _showVerificationQr = result['showVerificationQr'] as bool;
        _watermarkOpacityPercent = opacity.toDouble();
        _headerDividerColor = color.toLowerCase();
        _colorController.text = _headerDividerColor;
        _settingsConfirmed = true;
      });
    } catch (exception) {
      if (mounted) {
        setState(() {
          _settingsConfirmed = false;
          _error = _settingsErrorMessage(exception);
        });
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    if (!_settingsConfirmed) {
      setState(() => _error = 'حمّل إعدادات النظام من الخادم أولاً.');
      return;
    }
    final color = _colorController.text.trim();
    if (!RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(color)) {
      setState(() => _error = 'أدخل لونًا صحيحًا بصيغة #RRGGBB.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final result = await widget.api.call(
        'platformDocumentSettings.update',
        mutation: true,
        input: {
          'showMinistryWatermarkText': _showMinistryWatermarkText,
          'watermarkOpacityPercent': _watermarkOpacityPercent.round(),
          'headerDividerColor': color.toLowerCase(),
          'showVerificationQr': _showVerificationQr,
        },
      );
      if (!mounted) return;
      if (result is! Map || !_hasValidSettingsContract(result)) {
        throw Exception('تعذر تأكيد حفظ إعدادات النظام.');
      }
      setState(() {
        _showMinistryWatermarkText =
            result['showMinistryWatermarkText'] as bool;
        _showVerificationQr = result['showVerificationQr'] as bool;
        _watermarkOpacityPercent = (result['watermarkOpacityPercent'] as int)
            .toDouble();
        _headerDividerColor = (result['headerDividerColor'] as String)
            .toLowerCase();
        _colorController.text = _headerDividerColor;
      });
      Toast.success(context, 'تم حفظ إعدادات وثائق النظام.');
    } catch (exception) {
      if (mounted) setState(() => _error = _settingsErrorMessage(exception));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(
        title: const Text(
          'إعدادات النظام',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : !_settingsConfirmed
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _ErrorCard(message: _error ?? 'تعذر قراءة إعدادات النظام.'),
                    const SizedBox(height: 12),
                    FilledButton.icon(
                      onPressed: _load,
                      icon: const Icon(Icons.refresh),
                      label: const Text('إعادة المحاولة'),
                    ),
                  ],
                ),
              ),
            )
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_error != null) _ErrorCard(message: _error!),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          'هوية الوثيقة الرسمية',
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.onSurface,
                            fontSize: 17,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'تُطبّق هذه الإعدادات على وثائق جميع الجهات الجديدة، ويستطيع مالك النظام وحده تعديلها.',
                          style: TextStyle(
                            color: Theme.of(context)
                                .colorScheme
                                .onSurfaceVariant,
                            height: 1.6,
                          ),
                        ),
                        const SizedBox(height: 12),
                        SwitchListTile.adaptive(
                          contentPadding: EdgeInsets.zero,
                          title: const Text(
                            'إظهار عبارة وزارة الداخلية كعلامة مائية',
                            style: TextStyle(fontWeight: FontWeight.w700),
                          ),
                          subtitle: const Text(
                            'يتحكم بالعبارات المتكررة خلف المحتوى، ولا يغيّر الترويسة الرسمية.',
                          ),
                          value: _showMinistryWatermarkText,
                          onChanged: _saving
                              ? null
                              : (value) => setState(
                                  () => _showMinistryWatermarkText = value,
                                ),
                        ),
                        const Divider(height: 20),
                        Row(
                          children: [
                            const Expanded(
                              child: Text(
                                'شفافية العلامة المائية',
                                style: TextStyle(fontWeight: FontWeight.w700),
                              ),
                            ),
                            Text(
                              '${_watermarkOpacityPercent.round()}%',
                              style: const TextStyle(
                                color: _navy,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ],
                        ),
                        Slider.adaptive(
                          value: _watermarkOpacityPercent,
                          min: 0,
                          max: 60,
                          divisions: 60,
                          label: '${_watermarkOpacityPercent.round()}%',
                          onChanged: _saving
                              ? null
                              : (value) => setState(
                                  () => _watermarkOpacityPercent = value,
                                ),
                        ),
                        Text(
                          'تُطبّق النسبة على عبارة الوزارة وشعار الجهة. الحد الأعلى 60% للحفاظ على وضوح النص.',
                          style: TextStyle(
                            color: Theme.of(context)
                                .colorScheme
                                .onSurfaceVariant,
                            height: 1.5,
                          ),
                        ),
                        const SizedBox(height: 18),
                        const Text(
                          'لون الخط الفاصل في الترويسة',
                          style: TextStyle(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 10),
                        Wrap(
                          spacing: 10,
                          runSpacing: 10,
                          children: _colorOptions.map((color) {
                            final selected =
                                _headerDividerColor.toLowerCase() == color;
                            return Tooltip(
                              message: color.toUpperCase(),
                              child: InkWell(
                                customBorder: const CircleBorder(),
                                onTap: _saving
                                    ? null
                                    : () => setState(() {
                                        _headerDividerColor = color;
                                        _colorController.text = color;
                                      }),
                                child: Container(
                                  width: 36,
                                  height: 36,
                                  decoration: BoxDecoration(
                                    color: _parseColor(color),
                                    shape: BoxShape.circle,
                                    border: Border.all(
                                      color: selected
                                          ? Theme.of(context)
                                                .colorScheme
                                                .onSurface
                                          : Theme.of(context)
                                                .colorScheme
                                                .outline,
                                      width: selected ? 3 : 1,
                                    ),
                                    boxShadow: const [
                                      BoxShadow(
                                        color: Color(0x22000000),
                                        blurRadius: 3,
                                      ),
                                    ],
                                  ),
                                  child: selected
                                      ? const Icon(
                                          Icons.check,
                                          color: Colors.white,
                                          size: 18,
                                        )
                                      : null,
                                ),
                              ),
                            );
                          }).toList(),
                        ),
                        const SizedBox(height: 10),
                        TextField(
                          controller: _colorController,
                          enabled: !_saving,
                          textDirection: TextDirection.ltr,
                          decoration: InputDecoration(
                            labelText: 'رمز اللون المخصص',
                            hintText: '#2457A6',
                            prefixIcon: Icon(
                              Icons.palette_outlined,
                              color: _parseColor(_headerDividerColor),
                            ),
                            border: const OutlineInputBorder(),
                          ),
                          onChanged: (value) {
                            if (RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(value)) {
                              setState(
                                () => _headerDividerColor = value.toLowerCase(),
                              );
                            }
                          },
                        ),
                        const SizedBox(height: 8),
                        SwitchListTile.adaptive(
                          contentPadding: EdgeInsets.zero,
                          title: const Text(
                            'إظهار QR للتحقق في وثائق جميع الجهات',
                            style: TextStyle(fontWeight: FontWeight.w700),
                          ),
                          subtitle: const Text(
                            'إخفاء الرمز المطبوع لا يعطّل رابط التحقق أو صلاحية التحقق من البرقية.',
                          ),
                          value: _showVerificationQr,
                          onChanged: _saving
                              ? null
                              : (value) =>
                                    setState(() => _showVerificationQr = value),
                        ),
                        const SizedBox(height: 12),
                        FilledButton.icon(
                          onPressed: _saving ? null : _save,
                          icon: const Icon(Icons.save_outlined),
                          label: Text(
                            _saving ? 'جارٍ الحفظ...' : 'حفظ إعدادات النظام',
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    ),
  );
}
