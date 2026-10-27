import 'package:flutter/material.dart';

import 'api.dart';

const _navy = Color(0xFF101C35);
const _gold = Color(0xFFC9A45C);

const statusLabels = <String, String>{
  'draft': 'مسودة',
  'submitted': 'مرسلة للمراجعة',
  'in_review': 'قيد المراجعة',
  'approved': 'معتمدة',
  'returned': 'معادة للتصحيح',
  'rejected': 'مرفوضة',
  'forwarded': 'محالة',
  'pending': 'قيد الانتظار',
  'in_progress': 'قيد الإجراء',
  'resolved': 'منجزة',
  'completed': 'مكتملة',
  'archived': 'مؤرشفة',
};

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
              '${_stringValue(row['serialCode'] ?? row['serialNumber'])} · ${statusLabels['${row['status']}'] ?? _stringValue(row['status'])}',
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
