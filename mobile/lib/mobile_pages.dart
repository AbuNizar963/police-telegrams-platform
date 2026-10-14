import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import 'api.dart';

const _navy = Color(0xFF101C35);
const _gold = Color(0xFFC9A45C);

String _errorMessage(Object error) =>
    error.toString().replaceFirst('Exception: ', '');

String _stringValue(dynamic value, [String fallback = '—']) {
  final text = '$value'.trim();
  return text.isEmpty || text == 'null' ? fallback : text;
}

class NotificationsPage extends StatefulWidget {
  const NotificationsPage({super.key, required this.api});
  final PoliceApi api;

  @override
  State<NotificationsPage> createState() => _NotificationsPageState();
}

class _NotificationsPageState extends State<NotificationsPage> {
  bool loading = true;
  String? error;
  List<dynamic> notifications = const [];

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() => loading = true);
    try {
      final result = await widget.api.call('notifications.inbox');
      if (!mounted) return;
      setState(() {
        notifications = result is List ? result : const [];
        error = null;
      });
    } catch (exception) {
      if (mounted) setState(() => error = _errorMessage(exception));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> markRead(int id) async {
    try {
      await widget.api.call(
        'notifications.markRead',
        mutation: true,
        input: {'id': id},
      );
      await load();
    } catch (exception) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(_errorMessage(exception))));
      }
    }
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(
        backgroundColor: _navy,
        foregroundColor: Colors.white,
        title: const Text(
          'الإشعارات',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (error != null) _ErrorCard(message: error!),
                  if (notifications.isEmpty)
                    const _EmptyCard(message: 'لا توجد إشعارات جديدة')
                  else
                    ...notifications.map((item) {
                      final notification = Map<String, dynamic>.from(
                        item as Map,
                      );
                      final id = int.tryParse('${notification['id']}');
                      final read = notification['readAt'] != null;
                      return Card(
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: read ? Colors.grey : _gold,
                            child: Icon(
                              read
                                  ? Icons.notifications_none
                                  : Icons.notifications_active,
                              color: _navy,
                            ),
                          ),
                          title: Text(
                            _stringValue(notification['title'], 'إشعار'),
                            style: TextStyle(
                              fontWeight: read
                                  ? FontWeight.w600
                                  : FontWeight.w900,
                            ),
                          ),
                          subtitle: Text(
                            '${_stringValue(notification['body'] ?? notification['content'])}\n${_stringValue(notification['createdAt'])}',
                          ),
                          isThreeLine: true,
                          trailing: !read && id != null
                              ? IconButton(
                                  tooltip: 'تحديد كمقروء',
                                  onPressed: () => markRead(id),
                                  icon: const Icon(Icons.done),
                                )
                              : null,
                        ),
                      );
                    }),
                ],
              ),
            ),
    ),
  );
}

class ReportsPage extends StatefulWidget {
  const ReportsPage({super.key, required this.api});
  final PoliceApi api;

  @override
  State<ReportsPage> createState() => _ReportsPageState();
}

class _ReportsPageState extends State<ReportsPage> {
  bool loading = true;
  String? error;
  Map<String, dynamic>? report;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() => loading = true);
    try {
      final result = await widget.api.call(
        'reports.telegrams',
        input: {'page': 1, 'pageSize': 100},
      );
      if (!mounted) return;
      setState(() {
        report = result is Map ? Map<String, dynamic>.from(result) : {};
        error = null;
      });
    } catch (exception) {
      if (mounted) setState(() => error = _errorMessage(exception));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(
        backgroundColor: _navy,
        foregroundColor: Colors.white,
        title: const Text(
          'التقارير',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (error != null) _ErrorCard(message: error!),
                  if (report != null) ...[
                    _ReportSummary(report: report!),
                    const SizedBox(height: 14),
                    _ReportRows(report: report!),
                  ],
                ],
              ),
            ),
    ),
  );
}

class _ReportSummary extends StatelessWidget {
  const _ReportSummary({required this.report});
  final Map<String, dynamic> report;

  @override
  Widget build(BuildContext context) {
    final total =
        report['total'] ?? report['count'] ?? report['totalTelegrams'] ?? 0;
    final items = report['items'] ?? report['rows'] ?? report['telegrams'];
    final pending = report['pending'] ?? report['inReview'] ?? 0;
    final completed = report['completed'] ?? report['approved'] ?? 0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'ملخص البرقيات',
          style: TextStyle(
            color: _navy,
            fontSize: 20,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            _metric('الإجمالي', total, Icons.description_outlined),
            _metric('قيد المراجعة', pending, Icons.pending_actions_outlined),
            _metric('مكتملة', completed, Icons.verified_outlined),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          'السجلات المعروضة: ${items is List ? items.length : '—'}',
          style: const TextStyle(color: Colors.black54),
        ),
      ],
    );
  }

  Widget _metric(String label, dynamic value, IconData icon) => Expanded(
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            Icon(icon, color: _gold),
            const SizedBox(height: 5),
            Text(
              '$value',
              style: const TextStyle(
                color: _navy,
                fontSize: 19,
                fontWeight: FontWeight.w900,
              ),
            ),
            Text(label, style: const TextStyle(fontSize: 10)),
          ],
        ),
      ),
    ),
  );
}

class _ReportRows extends StatelessWidget {
  const _ReportRows({required this.report});
  final Map<String, dynamic> report;

  @override
  Widget build(BuildContext context) {
    final raw = report['items'] ?? report['rows'] ?? report['telegrams'];
    if (raw is! List || raw.isEmpty) {
      return const _EmptyCard(message: 'لا توجد سجلات في التقرير');
    }
    return Card(
      child: Column(
        children: raw.take(100).map((item) {
          final row = Map<String, dynamic>.from(item as Map);
          return ListTile(
            leading: const Icon(Icons.description_outlined, color: _navy),
            title: Text(
              _stringValue(row['subject'], 'برقية بدون موضوع'),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            subtitle: Text(
              '${_stringValue(row['serialCode'] ?? row['serialNumber'])} · ${_stringValue(row['status'])}',
            ),
          );
        }).toList(),
      ),
    );
  }
}

class ProfileSettingsPage extends StatefulWidget {
  const ProfileSettingsPage({super.key, required this.api});
  final PoliceApi api;

  @override
  State<ProfileSettingsPage> createState() => _ProfileSettingsPageState();
}

class _ProfileSettingsPageState extends State<ProfileSettingsPage> {
  final name = TextEditingController();
  final badge = TextEditingController();
  final phone = TextEditingController();
  final rank = TextEditingController();
  final unit = TextEditingController();
  final bio = TextEditingController();
  final currentPassword = TextEditingController();
  final newPassword = TextEditingController();
  bool loading = true;
  bool saving = false;
  String? error;

  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    for (final controller in [
      name,
      badge,
      phone,
      rank,
      unit,
      bio,
      currentPassword,
      newPassword,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> load() async {
    try {
      final result = await widget.api.call('profile.get');
      final profile = Map<String, dynamic>.from(result as Map);
      name.text = _stringValue(profile['name'], '');
      badge.text = _stringValue(profile['badgeNumber'], '');
      phone.text = _stringValue(profile['phone'], '');
      rank.text = _stringValue(profile['rank'], '');
      unit.text = _stringValue(profile['unit'], '');
      bio.text = _stringValue(profile['bio'], '');
    } catch (exception) {
      if (mounted) setState(() => error = _errorMessage(exception));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> saveProfile() async {
    setState(() {
      saving = true;
      error = null;
    });
    try {
      await widget.api.call(
        'profile.update',
        mutation: true,
        input: {
          'name': name.text.trim(),
          'badgeNumber': badge.text.trim().isEmpty ? null : badge.text.trim(),
          'phone': phone.text.trim().isEmpty ? null : phone.text.trim(),
          'rank': rank.text.trim().isEmpty ? null : rank.text.trim(),
          'unit': unit.text.trim().isEmpty ? null : unit.text.trim(),
          'bio': bio.text.trim().isEmpty ? null : bio.text.trim(),
        },
      );
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('تم حفظ الملف الشخصي')));
      }
    } catch (exception) {
      if (mounted) setState(() => error = _errorMessage(exception));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> changePassword() async {
    if (currentPassword.text.isEmpty || newPassword.text.length < 12) {
      setState(() => error = 'كلمة المرور الجديدة يجب ألا تقل عن 12 محرفًا');
      return;
    }
    setState(() {
      saving = true;
      error = null;
    });
    try {
      await widget.api.call(
        'profile.changePassword',
        mutation: true,
        input: {
          'currentPassword': currentPassword.text,
          'newPassword': newPassword.text,
        },
      );
      currentPassword.clear();
      newPassword.clear();
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('تم تغيير كلمة المرور')));
      }
    } catch (exception) {
      if (mounted) setState(() => error = _errorMessage(exception));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(
        backgroundColor: _navy,
        foregroundColor: Colors.white,
        title: const Text(
          'الإعدادات والملف الشخصي',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (error != null) _ErrorCard(message: error!),
                _FormCard(
                  title: 'بيانات الحساب',
                  children: [
                    _input(name, 'الاسم'),
                    _input(badge, 'الرقم الوظيفي'),
                    _input(phone, 'الهاتف'),
                    _input(rank, 'الرتبة'),
                    _input(unit, 'الوحدة'),
                    _input(bio, 'نبذة', maxLines: 3),
                    const SizedBox(height: 8),
                    FilledButton.icon(
                      onPressed: saving ? null : saveProfile,
                      icon: const Icon(Icons.save_outlined),
                      label: const Text('حفظ بيانات الحساب'),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                _FormCard(
                  title: 'الأمان',
                  children: [
                    _input(
                      currentPassword,
                      'كلمة المرور الحالية',
                      obscure: true,
                    ),
                    _input(newPassword, 'كلمة المرور الجديدة', obscure: true),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: saving ? null : changePassword,
                      icon: const Icon(Icons.lock_reset),
                      label: const Text('تغيير كلمة المرور'),
                    ),
                  ],
                ),
              ],
            ),
    ),
  );

  Widget _input(
    TextEditingController controller,
    String label, {
    bool obscure = false,
    int maxLines = 1,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: TextField(
      controller: controller,
      obscureText: obscure,
      maxLines: obscure ? 1 : maxLines,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
    ),
  );
}

class _FormCard extends StatelessWidget {
  const _FormCard({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: _navy,
              fontSize: 17,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 14),
          ...children,
        ],
      ),
    ),
  );
}

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => Card(
    color: Colors.red.shade50,
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Text(message, style: const TextStyle(color: Colors.red)),
    ),
  );
}

class _EmptyCard extends StatelessWidget {
  const _EmptyCard({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(22),
      child: Center(child: Text(message)),
    ),
  );
}


class DepartmentSettingsPage extends StatefulWidget {
  const DepartmentSettingsPage({super.key, required this.api});

  final PoliceApi api;

  @override
  State<DepartmentSettingsPage> createState() => _DepartmentSettingsPageState();
}

class _DepartmentSettingsPageState extends State<DepartmentSettingsPage> {
  final _departmentName = TextEditingController();
  final _unitName = TextEditingController();
  final _unitChiefRank = TextEditingController();
  final _unitChiefName = TextEditingController();
  final _serialPrefix = TextEditingController();
  final _incomingSerialPrefix = TextEditingController();
  final _serialStart = TextEditingController();
  final _incomingSerialStart = TextEditingController();

  static const _timeZones = <MapEntry<String, String>>[
    MapEntry('Asia/Riyadh', 'الرياض — Asia/Riyadh'),
    MapEntry('Asia/Damascus', 'دمشق — Asia/Damascus'),
    MapEntry('Europe/Istanbul', 'إسطنبول — Europe/Istanbul'),
    MapEntry('Asia/Amman', 'عمّان — Asia/Amman'),
    MapEntry('Asia/Baghdad', 'بغداد — Asia/Baghdad'),
    MapEntry('Africa/Cairo', 'القاهرة — Africa/Cairo'),
    MapEntry('UTC', 'التوقيت العالمي — UTC'),
  ];

  static const _dateFormats = <MapEntry<String, String>>[
    MapEntry('dd/MM/yyyy HH:mm:ss', 'يوم/شهر/سنة مع الثواني'),
    MapEntry('yyyy-MM-dd HH:mm:ss', 'سنة-شهر-يوم مع الثواني'),
    MapEntry('yyyy/MM/dd HH:mm:ss', 'سنة/شهر/يوم مع الثواني'),
    MapEntry('dd MMM yyyy HH:mm', 'يوم وشهر مختصر وسنة'),
  ];

  bool _loading = true;
  bool _saving = false;
  bool _uploadingLogo = false;
  String? _error;
  String? _logoUrl;
  String _timezone = 'Asia/Riyadh';
  String _dateFormat = 'yyyy/MM/dd HH:mm:ss';
  String _timeFormat = '24';
  String _numberSystem = 'latin';
  Map<String, dynamic> _settings = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _departmentName.dispose();
    _unitName.dispose();
    _unitChiefRank.dispose();
    _unitChiefName.dispose();
    _serialPrefix.dispose();
    _incomingSerialPrefix.dispose();
    _serialStart.dispose();
    _incomingSerialStart.dispose();
    super.dispose();
  }

  String _text(dynamic value, [String fallback = '']) {
    if (value == null || '$value' == 'null') return fallback;
    return '$value';
  }

  String _choice(
    dynamic value,
    List<MapEntry<String, String>> options,
    String fallback,
  ) {
    for (final option in options) {
      if (option.key == value) return option.key;
    }
    return fallback;
  }

  List<MapEntry<String, String>> _withCurrent(
    List<MapEntry<String, String>> options,
    String current,
  ) {
    if (options.any((option) => option.key == current)) return options;
    return [MapEntry(current, current), ...options];
  }

  Future<void> _load() async {
    try {
      final result = await widget.api.call('settings.get');
      final settings = Map<String, dynamic>.from(result as Map);
      if (!mounted) return;
      setState(() {
        _settings = settings;
        _departmentName.text = _text(settings['departmentName']);
        _unitName.text = _text(settings['unitName'], 'وحدة العمليات');
        _unitChiefRank.text = _text(settings['unitChiefRank'], 'العقيد');
        _unitChiefName.text = _text(settings['unitChiefName'], 'رئيس الوحدة');
        _serialPrefix.text = _text(settings['serialPrefix'], 'POL');
        _incomingSerialPrefix.text = _text(
          settings['incomingSerialPrefix'],
          _text(settings['serialPrefix'], 'POL'),
        );
        _serialStart.text = _text(settings['serialStart'], '1');
        _incomingSerialStart.text = _text(
          settings['incomingSerialStart'],
          '1',
        );
        _timezone = _text(settings['timezone'], 'Asia/Riyadh');
        _dateFormat = _text(settings['dateFormat'], 'yyyy/MM/dd HH:mm:ss');
        _timeFormat = _text(settings['timeFormat'], '24') == '12' ? '12' : '24';
        _numberSystem =
            _text(settings['numberSystem'], 'latin') == 'arabic'
                ? 'arabic'
                : 'latin';
        final logo = _text(settings['logoUrl']);
        _logoUrl = logo.isEmpty ? null : logo;
        _error = null;
      });
    } catch (exception) {
      if (mounted) {
        setState(
          () => _error = exception.toString().replaceFirst('Exception: ', ''),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    final departmentName = _departmentName.text.trim();
    final outgoingPrefix = _serialPrefix.text.trim().toUpperCase();
    final incomingPrefix = _incomingSerialPrefix.text.trim().toUpperCase();
    final outgoingStart = int.tryParse(_serialStart.text.trim());
    final incomingStart = int.tryParse(_incomingSerialStart.text.trim());

    if (departmentName.length < 2) {
      setState(() => _error = 'اسم الجهة يجب ألا يقل عن محرفين.');
      return;
    }
    final prefixPattern = RegExp(r'^[A-Z0-9-]{1,24}$');
    if (!prefixPattern.hasMatch(outgoingPrefix) ||
        !prefixPattern.hasMatch(incomingPrefix)) {
      setState(
        () => _error =
            'بادئتا الصادر والوارد يجب أن تكونا أحرفًا لاتينية كبيرة أو أرقامًا أو شرطة.',
      );
      return;
    }
    if (outgoingStart == null ||
        incomingStart == null ||
        outgoingStart < 1 ||
        incomingStart < 1 ||
        outgoingStart > 999999999 ||
        incomingStart > 999999999) {
      setState(
        () => _error = 'أرقام بداية التسلسل يجب أن تكون بين 1 و999999999.',
      );
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      final payload = <String, dynamic>{
        'departmentName': departmentName,
        'unitName': _unitName.text.trim(),
        'unitChiefRank': _unitChiefRank.text.trim(),
        'unitChiefName': _unitChiefName.text.trim(),
        'serialPrefix': outgoingPrefix,
        'incomingSerialPrefix': incomingPrefix,
        'serialStart': outgoingStart,
        'incomingSerialStart': incomingStart,
        'timezone': _timezone,
        'dateFormat': _dateFormat,
        'timeFormat': _timeFormat,
        'numberSystem': _numberSystem,
        'logoUrl': _logoUrl,
      };
      final result = await widget.api.call(
        'settings.update',
        mutation: true,
        input: payload,
      );
      if (!mounted) return;
      if (result is Map) {
        final saved = Map<String, dynamic>.from(result);
        setState(() {
          _settings = saved;
          if (saved.containsKey('logoUrl')) {
            final logo = _text(saved['logoUrl']);
            _logoUrl = logo.isEmpty ? null : logo;
          }
        });
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم حفظ إعدادات الجهة.')),
      );
    } catch (exception) {
      if (mounted) {
        setState(
          () => _error = exception.toString().replaceFirst('Exception: ', ''),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _uploadLogo() async {
    final selection = await FilePicker.platform.pickFiles(
      type: FileType.image,
      withData: true,
    );
    if (selection == null || selection.files.isEmpty || !mounted) return;

    final file = selection.files.single;
    final extension = _text(file.extension).toLowerCase();
    final contentType = extension == 'jpg' || extension == 'jpeg'
        ? 'image/jpeg'
        : extension == 'png'
        ? 'image/png'
        : null;
    if (contentType == null) {
      setState(() => _error = 'صيغة الشعار يجب أن تكون PNG أو JPG.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setState(() => _error = 'حجم الشعار يجب ألا يتجاوز 5 ميغابايت.');
      return;
    }
    final bytes = file.bytes;
    if (bytes == null || bytes.isEmpty) {
      setState(() => _error = 'تعذر قراءة ملف الشعار.');
      return;
    }

    setState(() {
      _uploadingLogo = true;
      _error = null;
    });
    try {
      final result = await widget.api.call(
        'settings.uploadLogo',
        mutation: true,
        input: {
          'fileName': file.name,
          'contentType': contentType,
          'base64': base64Encode(bytes),
        },
      );
      if (!mounted) return;
      final uploaded = Map<String, dynamic>.from(result as Map);
      final logo = _text(uploaded['url']);
      if (logo.isEmpty) throw Exception('لم يُرجع الخادم رابط الشعار.');
      setState(() => _logoUrl = logo);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم رفع الشعار. اضغط حفظ لاعتماده.')),
      );
    } catch (exception) {
      if (mounted) {
        setState(
          () => _error = exception.toString().replaceFirst('Exception: ', ''),
        );
      }
    } finally {
      if (mounted) setState(() => _uploadingLogo = false);
    }
  }

  String? get _logoPreviewUrl {
    final value = _logoUrl;
    if (value == null || value.isEmpty) return null;
    final uri = Uri.tryParse(value);
    if (uri != null && uri.hasScheme) return value;
    return Uri.parse(widget.api.baseUrl).resolve(value).toString();
  }

  Widget _input(
    TextEditingController controller,
    String label, {
    bool numeric = false,
    int maxLength = 255,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: TextField(
      controller: controller,
      enabled: !_saving,
      maxLength: maxLength,
      keyboardType: numeric ? TextInputType.number : TextInputType.text,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
    ),
  );

  Widget _dropdown(
    String label,
    String value,
    List<MapEntry<String, String>> options,
    ValueChanged<String?> onChanged,
  ) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: DropdownButtonFormField<String>(
      initialValue: value,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
      items: options
          .map(
            (option) => DropdownMenuItem(
              value: option.key,
              child: Text(option.value),
            ),
          )
          .toList(),
      onChanged: _saving ? null : onChanged,
    ),
  );

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(
        backgroundColor: _navy,
        foregroundColor: Colors.white,
        title: const Text(
          'إعدادات الجهة',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
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
                        const Text(
                          'هوية الجهة وترويسة البرقية',
                          style: TextStyle(
                            color: _navy,
                            fontSize: 17,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Container(
                              width: 64,
                              height: 64,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: _navy,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: _logoPreviewUrl == null
                                  ? const Icon(
                                      Icons.shield_outlined,
                                      color: Color(0xFFC9A45C),
                                      size: 32,
                                    )
                                  : ClipRRect(
                                      borderRadius: BorderRadius.circular(12),
                                      child: Image.network(
                                        _logoPreviewUrl!,
                                        width: 64,
                                        height: 64,
                                        fit: BoxFit.contain,
                                        errorBuilder: (_, _, _) => const Icon(
                                          Icons.broken_image_outlined,
                                          color: Colors.white70,
                                        ),
                                      ),
                                    ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: _saving || _uploadingLogo
                                    ? null
                                    : _uploadLogo,
                                icon: const Icon(Icons.upload_file_outlined),
                                label: Text(
                                  _uploadingLogo
                                      ? 'جارٍ رفع الشعار...'
                                      : 'رفع شعار PNG أو JPG',
                                ),
                              ),
                            ),
                          ],
                        ),
                        if (_logoUrl != null) ...[
                          const SizedBox(height: 6),
                          Align(
                            alignment: Alignment.centerRight,
                            child: TextButton.icon(
                              onPressed: _saving || _uploadingLogo
                                  ? null
                                  : () => setState(() => _logoUrl = null),
                              icon: const Icon(Icons.delete_outline),
                              label: const Text('إزالة الشعار عند الحفظ'),
                            ),
                          ),
                        ],
                        const SizedBox(height: 14),
                        _input(_departmentName, 'اسم الجهة الشرطية'),
                        _input(_unitName, 'اسم الوحدة التابعة'),
                        _input(_unitChiefRank, 'رتبة رئيس الوحدة'),
                        _input(_unitChiefName, 'اسم رئيس الوحدة'),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                _FormCard(
                  title: 'الترقيم والتوقيت',
                  children: [
                    _input(
                      _serialPrefix,
                      'بادئة البرقيات الصادرة',
                      maxLength: 24,
                    ),
                    _input(
                      _incomingSerialPrefix,
                      'بادئة البرقيات الواردة',
                      maxLength: 24,
                    ),
                    _input(
                      _serialStart,
                      'بداية تسلسل الصادر',
                      numeric: true,
                      maxLength: 9,
                    ),
                    _input(
                      _incomingSerialStart,
                      'بداية تسلسل الوارد',
                      numeric: true,
                      maxLength: 9,
                    ),
                    _dropdown(
                      'المنطقة الزمنية',
                      _timezone,
                      _withCurrent(_timeZones, _timezone),
                      (value) {
                        if (value != null) setState(() => _timezone = value);
                      },
                    ),
                    _dropdown(
                      'تنسيق التاريخ',
                      _dateFormat,
                      _withCurrent(_dateFormats, _dateFormat),
                      (value) {
                        if (value != null) setState(() => _dateFormat = value);
                      },
                    ),
                    _dropdown(
                      'تنسيق الوقت',
                      _timeFormat,
                      const [
                        MapEntry('24', '24 ساعة'),
                        MapEntry('12', '12 ساعة'),
                      ],
                      (value) {
                        if (value != null) setState(() => _timeFormat = value);
                      },
                    ),
                    _dropdown(
                      'نظام الأرقام',
                      _numberSystem,
                      const [
                        MapEntry('latin', 'لاتينية 123'),
                        MapEntry('arabic', 'عربية ١٢٣'),
                      ],
                      (value) {
                        if (value != null) setState(() => _numberSystem = value);
                      },
                    ),
                    if (_settings['nextOutgoingSerial'] != null ||
                        _settings['nextIncomingSerial'] != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Text(
                          'الرقم التالي — صادر: ${_text(_settings['nextOutgoingSerial'], '—')}، وارد: ${_text(_settings['nextIncomingSerial'], '—')}',
                          style: const TextStyle(
                            color: _navy,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    FilledButton.icon(
                      onPressed: _saving || _uploadingLogo ? null : _save,
                      icon: const Icon(Icons.save_outlined),
                      label: Text(
                        _saving ? 'جارٍ حفظ الإعدادات...' : 'حفظ إعدادات الجهة',
                      ),
                    ),
                  ],
                ),
              ],
            ),
    ),
  );
}
