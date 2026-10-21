import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import 'app_lock.dart';

import 'api.dart';

const _navy = Color(0xFF10233F);
const _gold = Color(0xFFD8C38E);

String _errorMessage(Object error) =>
    error.toString().replaceFirst('Exception: ', '');

bool _requiresNotificationAction(dynamic type) =>
    type == 'route.approved' || type == 'route.requested';

String _stringValue(dynamic value, [String fallback = '—']) {
  final text = '$value'.trim();
  return text.isEmpty || text == 'null' ? fallback : text;
}

class NotificationsPage extends StatefulWidget {
  const NotificationsPage({super.key, required this.api, this.onOpenTelegram});
  final PoliceApi api;
  final ValueChanged<int>? onOpenTelegram;

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
      if (!mounted) return;
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
                  if (notifications.isEmpty && error == null)
                    const _EmptyCard(message: 'لا توجد إشعارات جديدة')
                  else
                    ...notifications.map((item) {
                      final notification = Map<String, dynamic>.from(
                        item as Map,
                      );
                      final id = int.tryParse('${notification['id']}');
                      final telegramId = int.tryParse(
                        '${notification['telegramId'] ?? ''}',
                      );
                      final read = notification['readAt'] != null;
                      final requiresAction = _requiresNotificationAction(
                        notification['type'],
                      );
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
                            '${_stringValue(notification['body'] ?? notification['content'])}\n${_stringValue(notification['createdAt'])}${requiresAction && !read ? '\nبانتظار تأكيد الاستلام أو الرفض' : ''}',
                          ),
                          isThreeLine: true,
                          onTap:
                              telegramId != null &&
                                  widget.onOpenTelegram != null
                              ? () {
                                  if (!read && !requiresAction && id != null) {
                                    markRead(id);
                                  }
                                  widget.onOpenTelegram!(telegramId);
                                }
                              : null,
                          trailing: !read && id != null && !requiresAction
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
  final _searchController = TextEditingController();
  String _status = 'all';
  DateTime? _from;
  DateTime? _to;

  static const _statuses = <String, String>{
    'draft': 'مسودة',
    'submitted': 'مرسلة',
    'in_review': 'قيد المراجعة',
    'approved': 'معتمدة',
    'returned': 'معادة',
    'rejected': 'مرفوضة',
    'forwarded': 'محالة',
    'pending': 'معلقة',
    'in_progress': 'قيد التنفيذ',
    'resolved': 'تمت المعالجة',
    'completed': 'مكتملة',
    'archived': 'مؤرشفة',
  };

  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  String _dateValue(DateTime value, {bool endOfDay = false}) {
    final date = DateTime(
      value.year,
      value.month,
      value.day,
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0,
    );
    return date.toUtc().toIso8601String();
  }

  Future<void> _chooseDate({required bool from}) async {
    final now = DateTime.now();
    final selected = await showDatePicker(
      context: context,
      initialDate: (from ? _from : _to) ?? now,
      firstDate: DateTime(2000),
      lastDate: DateTime(now.year + 10),
      helpText: from ? 'اختر تاريخ البداية' : 'اختر تاريخ النهاية',
      cancelText: 'إلغاء',
      confirmText: 'اختيار',
    );
    if (selected == null || !mounted) return;

    final nextFrom = from ? selected : _from;
    final nextTo = from ? _to : selected;
    if (nextFrom != null &&
        nextTo != null &&
        DateTime(
          nextFrom.year,
          nextFrom.month,
          nextFrom.day,
        ).isAfter(DateTime(nextTo.year, nextTo.month, nextTo.day))) {
      setState(() => error = 'تاريخ البداية يجب ألا يتجاوز تاريخ النهاية.');
      return;
    }

    setState(() {
      if (from) {
        _from = selected;
      } else {
        _to = selected;
      }
    });
    await load();
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final input = <String, dynamic>{'page': 1, 'pageSize': 100};
      final search = _searchController.text.trim();
      if (search.isNotEmpty) input['search'] = search;
      if (_status != 'all') input['status'] = _status;
      if (_from != null) input['from'] = _dateValue(_from!);
      if (_to != null) input['to'] = _dateValue(_to!, endOfDay: true);

      final result = await widget.api.call('reports.telegrams', input: input);
      if (!mounted) return;
      setState(() {
        report = result is Map ? Map<String, dynamic>.from(result) : {};
        error = null;
      });
    } catch (exception) {
      if (mounted) {
        setState(() {
          report = null;
          error = _errorMessage(exception);
        });
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  String _formatDate(DateTime? date) {
    if (date == null) return 'كل المدة';
    return '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
  }

  Future<void> _exportCsv() async {
    final raw = report?['rows'] ?? report?['items'] ?? report?['telegrams'];
    if (raw is! List || raw.isEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('لا توجد سجلات لتصديرها.')));
      return;
    }

    String cell(dynamic value) {
      var text = value == null || value == 'null' ? '' : '$value';
      if (RegExp(r'^[=+\-@]').hasMatch(text)) text = "'$text";
      return '"${text.replaceAll('"', '""')}"';
    }

    final rows = <List<String>>[
      [
        'رقم البرقية',
        'الموضوع',
        'الجهة',
        'الحالة',
        'السرية',
        'الأولوية',
        'تاريخ الإنشاء',
      ],
      ...raw.whereType<Map>().map((item) {
        final row = Map<String, dynamic>.from(item);
        return [
          '${row['serialCode'] ?? row['serialNumber'] ?? ''}',
          '${row['subject'] ?? ''}',
          '${row['recipient'] ?? row['organizationName'] ?? ''}',
          _statuses['${row['status']}'] ?? '${row['status'] ?? ''}',
          '${row['classification'] ?? ''}',
          '${row['priority'] ?? ''}',
          '${row['createdAt'] ?? ''}',
        ];
      }),
    ];
    final csv =
        '\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n';

    try {
      final date = DateTime.now().toIso8601String().substring(0, 10);
      await FilePicker.saveFile(
        dialogTitle: 'تصدير تقرير البرقيات',
        fileName: 'telegram-report-$date.csv',
        type: FileType.custom,
        allowedExtensions: const ['csv'],
        bytes: Uint8List.fromList(utf8.encode(csv)),
      );
    } catch (exception) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('تعذر تصدير التقرير: ${_errorMessage(exception)}'),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(
        title: const Text(
          'التقارير',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
        actions: [
          IconButton(
            tooltip: 'تصدير التقرير CSV',
            onPressed: loading || report == null ? null : _exportCsv,
            icon: const Icon(Icons.file_download_outlined),
          ),
          IconButton(
            tooltip: 'تحديث التقرير',
            onPressed: loading ? null : load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: loading && report == null
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Text(
                            'تصفية التقرير',
                            style: TextStyle(
                              color: _navy,
                              fontSize: 16,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          const SizedBox(height: 10),
                          TextField(
                            controller: _searchController,
                            textInputAction: TextInputAction.search,
                            onSubmitted: (_) => load(),
                            decoration: InputDecoration(
                              labelText: 'بحث بالرقم أو الموضوع',
                              prefixIcon: const Icon(Icons.search),
                              suffixIcon: _searchController.text.isEmpty
                                  ? null
                                  : IconButton(
                                      tooltip: 'مسح البحث',
                                      onPressed: () {
                                        _searchController.clear();
                                        load();
                                      },
                                      icon: const Icon(Icons.close),
                                    ),
                            ),
                          ),
                          const SizedBox(height: 10),
                          DropdownButtonFormField<String>(
                            initialValue: _status,
                            decoration: const InputDecoration(
                              labelText: 'حالة البرقية',
                            ),
                            items: [
                              const DropdownMenuItem(
                                value: 'all',
                                child: Text('كل الحالات'),
                              ),
                              ..._statuses.entries.map(
                                (entry) => DropdownMenuItem(
                                  value: entry.key,
                                  child: Text(entry.value),
                                ),
                              ),
                            ],
                            onChanged: (value) {
                              if (value == null) return;
                              setState(() => _status = value);
                              load();
                            },
                          ),
                          const SizedBox(height: 10),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              OutlinedButton.icon(
                                onPressed: () => _chooseDate(from: true),
                                icon: const Icon(Icons.calendar_today_outlined),
                                label: Text('من: ${_formatDate(_from)}'),
                              ),
                              OutlinedButton.icon(
                                onPressed: () => _chooseDate(from: false),
                                icon: const Icon(Icons.event_outlined),
                                label: Text('إلى: ${_formatDate(_to)}'),
                              ),
                              if (_from != null || _to != null)
                                TextButton.icon(
                                  onPressed: () {
                                    setState(() {
                                      _from = null;
                                      _to = null;
                                    });
                                    load();
                                  },
                                  icon: const Icon(Icons.filter_alt_off),
                                  label: const Text('مسح التاريخ'),
                                ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          FilledButton.icon(
                            onPressed: loading ? null : load,
                            icon: const Icon(Icons.filter_alt),
                            label: const Text('تطبيق الفلاتر'),
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (error != null) _ErrorCard(message: error!),
                  if (loading && report != null)
                    const LinearProgressIndicator(),
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
        Text(
          'ملخص البرقيات',
          style: TextStyle(
            color: Theme.of(context).colorScheme.primary,
            fontSize: 20,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            _metric(context, 'الإجمالي', total, Icons.description_outlined),
            _metric(
              context,
              'قيد المراجعة',
              pending,
              Icons.pending_actions_outlined,
            ),
            _metric(context, 'مكتملة', completed, Icons.verified_outlined),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          'السجلات المعروضة: ${items is List ? items.length : '—'}',
          style: TextStyle(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }

  Widget _metric(
    BuildContext context,
    String label,
    dynamic value,
    IconData icon,
  ) => Expanded(
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            Icon(icon, color: Theme.of(context).colorScheme.secondary),
            const SizedBox(height: 5),
            Text(
              '$value',
              style: TextStyle(
                color: Theme.of(context).colorScheme.primary,
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
            leading: Icon(
              Icons.description_outlined,
              color: Theme.of(context).colorScheme.primary,
            ),
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
  const ProfileSettingsPage({
    super.key,
    required this.api,
    required this.onLogout,
    required this.onProfileUpdated,
  });
  final PoliceApi api;
  final Future<void> Function() onLogout;
  final ValueChanged<Map<String, dynamic>> onProfileUpdated;

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
  final confirmPassword = TextEditingController();
  bool loading = true;
  bool saving = false;
  bool mustChangePassword = false;
  bool _profileLoadFailed = false;
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
      confirmPassword,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> load() async {
    if (mounted) {
      setState(() {
        loading = true;
        _profileLoadFailed = false;
        error = null;
      });
    }
    try {
      final result = await widget.api.call('profile.get');
      final profile = Map<String, dynamic>.from(result as Map);
      name.text = _stringValue(profile['name'], '');
      badge.text = _stringValue(profile['badgeNumber'], '');
      phone.text = _stringValue(profile['phone'], '');
      rank.text = _stringValue(profile['rank'], '');
      unit.text = _stringValue(profile['unit'], '');
      bio.text = _stringValue(profile['bio'], '');
      mustChangePassword = profile['mustChangePassword'] == true;
    } catch (exception) {
      if (mounted) {
        setState(() {
          _profileLoadFailed = true;
          error = _errorMessage(exception);
        });
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> saveProfile() async {
    if (name.text.trim().length < 2) {
      setState(() => error = 'الاسم الكامل يجب ألا يقل عن محرفين.');
      return;
    }
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
      widget.onProfileUpdated({'name': name.text.trim()});
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
      setState(() => error = 'كلمة المرور الجديدة يجب ألا تقل عن 12 محرفًا.');
      return;
    }
    if (newPassword.text != confirmPassword.text) {
      setState(() => error = 'تأكيد كلمة المرور غير مطابق.');
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
      confirmPassword.clear();
      mustChangePassword = false;
      widget.onProfileUpdated({
        'name': name.text.trim(),
        'mustChangePassword': false,
      });
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
        title: const Text(
          'الإعدادات والملف الشخصي',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : _profileLoadFailed
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.person_off_outlined,
                      size: 48,
                      color: Theme.of(context).colorScheme.error,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'تعذر تحميل بيانات الملف الشخصي',
                      style: Theme.of(context).textTheme.titleMedium,
                      textAlign: TextAlign.center,
                    ),
                    if (error != null) ...[
                      const SizedBox(height: 8),
                      Text(error!, textAlign: TextAlign.center),
                    ],
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: load,
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
                if (mustChangePassword)
                  Card(
                    color: Theme.of(context).colorScheme.tertiaryContainer,
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Text(
                        'هذه كلمة مرور مؤقتة للحساب الرئيسي للجهة. يجب تغييرها قبل متابعة العمل.',
                        style: TextStyle(
                          color: Theme.of(context)
                              .colorScheme
                              .onTertiaryContainer,
                          fontWeight: FontWeight.w700,
                          height: 1.5,
                        ),
                      ),
                    ),
                  ),
                if (mustChangePassword) const SizedBox(height: 14),
                if (error != null) _ErrorCard(message: error!),
                const AppLockSettingsSection(),
                const SizedBox(height: 14),
                _FormCard(
                  title: 'المعلومات الشخصية',
                  children: [
                    _input(name, 'الاسم الكامل', maxLength: 255),
                    _input(badge, 'الرقم الوظيفي', maxLength: 80),
                    _input(
                      phone,
                      'رقم الهاتف',
                      maxLength: 32,
                      keyboardType: TextInputType.phone,
                    ),
                    _input(rank, 'الرتبة', maxLength: 120),
                    _input(unit, 'القسم أو الوحدة', maxLength: 255),
                    _input(bio, 'نبذة تعريفية', maxLines: 4, maxLength: 1000),
                    const SizedBox(height: 8),
                    FilledButton.icon(
                      onPressed: saving || name.text.trim().length < 2
                          ? null
                          : saveProfile,
                      icon: const Icon(Icons.save_outlined),
                      label: const Text('حفظ البيانات'),
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
                      maxLength: 256,
                    ),
                    _input(
                      newPassword,
                      'كلمة المرور الجديدة',
                      obscure: true,
                      maxLength: 256,
                    ),
                    _input(
                      confirmPassword,
                      'تأكيد كلمة المرور',
                      obscure: true,
                      maxLength: 256,
                    ),
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(
                        '12 محرفًا على الأقل.',
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                          fontSize: 12,
                        ),
                      ),
                    ),
                    OutlinedButton.icon(
                      onPressed: saving ? null : changePassword,
                      icon: const Icon(Icons.lock_reset),
                      label: const Text('تغيير كلمة المرور'),
                    ),
                    const Divider(height: 28),
                    const ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                        'إنهاء الجلسة',
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: Text(
                        'يُسجّل خروجك من هذا الجهاز فورًا حتى قبل انتهاء مدة الشهر.',
                      ),
                    ),
                    OutlinedButton.icon(
                      onPressed: saving ? null : widget.onLogout,
                      icon: const Icon(Icons.logout, color: Colors.red),
                      label: const Text(
                        'تسجيل الخروج',
                        style: TextStyle(color: Colors.red),
                      ),
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
    int? maxLength,
    TextInputType? keyboardType,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: TextField(
      controller: controller,
      obscureText: obscure,
      maxLines: obscure ? 1 : maxLines,
      maxLength: maxLength,
      keyboardType: keyboardType,
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
  Uint8List? _pendingLogoPreviewBytes;
  Uint8List? _savedLogoPreviewBytes;
  String _timezone = 'Asia/Riyadh';
  String _dateFormat = 'yyyy/MM/dd HH:mm:ss';
  String _timeFormat = '24';
  String _numberSystem = 'latin';
  bool _showVerificationQr = true;
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
      final logo = _text(settings['logoUrl']);
      final savedLogoBytes = logo.isEmpty
          ? null
          : await widget.api.fetchImageAsset(logo);
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
        _incomingSerialStart.text = _text(settings['incomingSerialStart'], '1');
        _timezone = _text(settings['timezone'], 'Asia/Riyadh');
        _dateFormat = _text(settings['dateFormat'], 'yyyy/MM/dd HH:mm:ss');
        _timeFormat = _text(settings['timeFormat'], '24') == '12' ? '12' : '24';
        _numberSystem = _text(settings['numberSystem'], 'latin') == 'arabic'
            ? 'arabic'
            : 'latin';
        _showVerificationQr = settings['showVerificationQr'] != false;
        _logoUrl = logo.isEmpty ? null : logo;
        _pendingLogoPreviewBytes = null;
        _savedLogoPreviewBytes = savedLogoBytes;
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
        () => _error = 'بادئتا الصادر والوارد يجب أن تكونا أحرفًا لاتينية كبيرة أو أرقامًا أو شرطة.',
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
        'showVerificationQr': _showVerificationQr,
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
        final savedLogo = _text(saved['logoUrl']);
        final savedLogoBytes = savedLogo.isEmpty
            ? null
            : await widget.api.fetchImageAsset(savedLogo);
        if (!mounted) return;
        setState(() {
          _settings = saved;
          if (saved.containsKey('logoUrl')) {
            _logoUrl = savedLogo.isEmpty ? null : savedLogo;
            _savedLogoPreviewBytes = savedLogoBytes;
            // Keep the local image visible if the remote preview cannot yet
            // be fetched; a fresh signed URL is loaded when settings reopen.
            if (savedLogoBytes != null || savedLogo.isEmpty) {
              _pendingLogoPreviewBytes = null;
            }
          }
        });
      }
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('تم حفظ إعدادات الجهة.')));
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
    final selection = await FilePicker.pickFiles(
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
      setState(() {
        _logoUrl = logo;
        // The upload endpoint returns an internal storage URL, not a public
        // image URL. Preview the selected bytes until settings are saved and
        // the server returns the authorized signed URL.
        _pendingLogoPreviewBytes = Uint8List.fromList(bytes);
      });
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
      isExpanded: true,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
      items: options
          .map(
            (option) => DropdownMenuItem(
              value: option.key,
              child: Text(
                option.value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
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
                              child: _pendingLogoPreviewBytes != null
                                  ? ClipRRect(
                                      borderRadius: BorderRadius.circular(12),
                                      child: Image.memory(
                                        _pendingLogoPreviewBytes!,
                                        width: 64,
                                        height: 64,
                                        fit: BoxFit.contain,
                                        errorBuilder: (_, _, _) =>
                                            const SizedBox.shrink(),
                                      ),
                                    )
                                  : _savedLogoPreviewBytes != null
                                  ? ClipRRect(
                                      borderRadius: BorderRadius.circular(12),
                                      child: Image.memory(
                                        _savedLogoPreviewBytes!,
                                        width: 64,
                                        height: 64,
                                        fit: BoxFit.contain,
                                        errorBuilder: (_, _, _) =>
                                            const SizedBox.shrink(),
                                      ),
                                    )
                                  : const SizedBox.shrink(),
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
                                  : () => setState(() {
                                      _logoUrl = null;
                                      _pendingLogoPreviewBytes = null;
                                      _savedLogoPreviewBytes = null;
                                    }),
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
                        if (value != null) {
                          setState(() => _numberSystem = value);
                        }
                      },
                    ),
                    SwitchListTile.adaptive(
                      contentPadding: EdgeInsets.zero,
                      title: const Text(
                        'إظهار رمز QR للتحقق في البرقية',
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: const Text(
                        'إخفاء الرمز من الوثيقة لا يعطّل التحقق الإلكتروني أو رمز البرقية.',
                      ),
                      value: _showVerificationQr,
                      onChanged: _saving
                          ? null
                          : (value) =>
                                setState(() => _showVerificationQr = value),
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
