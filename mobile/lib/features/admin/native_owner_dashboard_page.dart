import 'dart:async';

import 'package:flutter/material.dart';

import '../../api.dart';
import '../../app_theme.dart';

const _navy = Color(0xFF10233F);
const _gold = Color(0xFFD8C38E);

class NativeOwnerDashboardPage extends StatefulWidget {
  const NativeOwnerDashboardPage({super.key, required this.api});

  final PoliceApi api;

  @override
  State<NativeOwnerDashboardPage> createState() =>
      _NativeOwnerDashboardPageState();
}

class _NativeOwnerDashboardPageState extends State<NativeOwnerDashboardPage> {
  bool _loading = true;
  String? _error;
  int _days = 30;
  Map<String, dynamic> _summary = const {};
  List<Map<String, dynamic>> _notifications = const [];
  int _unreadCount = 0;
  Timer? _notificationTimer;

  @override
  void initState() {
    super.initState();
    _load();
    _notificationTimer = Timer.periodic(
      const Duration(seconds: 15),
      (_) => _loadNotifications(),
    );
  }

  @override
  void dispose() {
    _notificationTimer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await widget.api.call(
        'ownerDashboard.summary',
        input: {'days': _days},
      );
      if (!mounted) return;
      setState(() {
        _summary = result is Map ? Map<String, dynamic>.from(result) : {};
      });
      await _loadNotifications();
    } catch (error) {
      if (mounted) {
        setState(
          () => _error = error.toString().replaceFirst('Exception: ', ''),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadNotifications() async {
    try {
      final result = await widget.api.call('notifications.inbox');
      if (!mounted || result is! Map) return;
      final raw = result['items'];
      setState(() {
        _notifications = raw is List
            ? raw
                  .whereType<Map>()
                  .map((row) => Map<String, dynamic>.from(row))
                  .take(4)
                  .toList()
            : const [];
        _unreadCount = int.tryParse('${result['unreadCount'] ?? 0}') ?? 0;
      });
    } catch (_) {
      // The dashboard remains usable when the inbox is temporarily unavailable.
    }
  }

  Future<void> _markNotificationRead(Map<String, dynamic> item) async {
    final id = int.tryParse('${item['id']}');
    if (id == null) return;
    try {
      await widget.api.call(
        'notifications.markRead',
        mutation: true,
        input: {'id': id},
      );
      await _loadNotifications();
    } catch (_) {
      // Keep the notification visible if the read request fails.
    }
  }

  int _number(String key) {
    return int.tryParse('${_summary[key] ?? 0}') ?? 0;
  }

  List<Map<String, dynamic>> _rows(String key) {
    final value = _summary[key];
    if (value is! List) return const [];
    return value
        .whereType<Map>()
        .map((row) => Map<String, dynamic>.from(row))
        .toList();
  }

  String _actionLabel(dynamic value) {
    const labels = {
      'telegram.create': 'إنشاء برقية',
      'telegram.update': 'تعديل برقية',
      'telegram.delete': 'حذف برقية',
      'telegram.route': 'إحالة برقية',
      'telegram.status.transition': 'تغيير حالة برقية',
      'telegram.document.print': 'طباعة وثيقة برقية',
      'telegram.document.download': 'تنزيل أو مشاركة وثيقة برقية',
      'user.create': 'إنشاء حساب مستخدم',
      'user.update': 'تعديل بيانات مستخدم',
      'user.disable': 'تعطيل حساب مستخدم',
      'user.enable': 'تفعيل حساب مستخدم',
      'organization.create': 'إنشاء جهة',
      'organization.update': 'تعديل جهة',
      'organization.purge_archived': 'حذف نهائي لجهة مؤرشفة',
      'settings.update': 'تحديث الإعدادات',
      'platform.document_settings.update': 'تحديث إعدادات الوثائق',
    };
    return labels['$value'] ?? 'إجراء مسجل';
  }

  String _text(dynamic value, [String fallback = '—']) {
    final text = '$value'.trim();
    return text.isEmpty || text == 'null' ? fallback : text;
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      backgroundColor: Theme.of(context).colorScheme.surface,
      appBar: AppBar(
        title: const Text(
          'مركز قيادة المنصة',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
        actions: [
          IconButton(
            tooltip: 'تحديث البيانات',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _loading && _summary.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
                children: [
                  _hero(),
                  const SizedBox(height: 14),
                  _notificationsCard(),
                  const SizedBox(height: 14),
                  _periodSelector(),
                  const SizedBox(height: 14),
                  if (_error != null) _errorCard(),
                  _metrics(),
                  const SizedBox(height: 14),
                  _performanceCard(),
                  const SizedBox(height: 14),
                  _activityCard(),
                  const SizedBox(height: 14),
                  _distributionCard(),
                  const SizedBox(height: 14),
                  _organizationsCard(),
                  const SizedBox(height: 14),
                  _recentOperationsCard(),
                ],
              ),
            ),
    ),
  );

  Widget _hero() => Container(
    padding: const EdgeInsets.all(20),
    decoration: BoxDecoration(
      gradient: const LinearGradient(
        colors: [_navy, Color(0xFF24506A)],
        begin: Alignment.topRight,
        end: Alignment.bottomLeft,
      ),
      borderRadius: BorderRadius.circular(24),
      boxShadow: const [
        BoxShadow(
          color: Color(0x2410233F),
          blurRadius: 18,
          offset: Offset(0, 8),
        ),
      ],
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const Icon(
              Icons.workspace_premium_outlined,
              color: _gold,
              size: 19,
            ),
            const SizedBox(width: 7),
            Text(
              'مالك المنصة  ·  نظرة شاملة لآخر $_days يومًا',
              style: const TextStyle(
                color: _gold,
                fontSize: 12,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        const Text(
          'كل الجهات ضمن صورة تشغيلية واحدة',
          style: TextStyle(
            color: Colors.white,
            fontSize: 19,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'مؤشرات موحّدة للنشاط، الجهات، الحسابات، والتنبيهات التشغيلية.',
          style: TextStyle(color: Color(0xFFD3DDE7), height: 1.5, fontSize: 12),
        ),
        const SizedBox(height: 14),
        const Row(
          children: [
            Icon(Icons.verified_outlined, color: Color(0xFF9AE0B8), size: 16),
            SizedBox(width: 5),
            Text(
              'النظام يعمل بشكل طبيعي',
              style: TextStyle(
                color: Color(0xFFBCEACB),
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ],
    ),
  );

  Widget _periodSelector() => Card(
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
      child: Row(
        children: [
          const Icon(Icons.calendar_today_outlined, color: _navy, size: 18),
          const SizedBox(width: 9),
          const Expanded(
            child: Text(
              'الفترة الزمنية',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
          DropdownButton<int>(
            value: _days,
            underline: const SizedBox.shrink(),
            items: const [
              DropdownMenuItem(value: 7, child: Text('آخر 7 أيام')),
              DropdownMenuItem(value: 30, child: Text('آخر 30 يومًا')),
              DropdownMenuItem(value: 90, child: Text('آخر 90 يومًا')),
            ],
            onChanged: (value) {
              if (value == null) return;
              setState(() => _days = value);
              _load();
            },
          ),
        ],
      ),
    ),
  );

  Widget _notificationsCard() => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _CardHeader(
            icon: Icons.notifications_active_outlined,
            title: 'التنبيهات الفورية',
            subtitle: 'تتحدث تلقائيًا كل 15 ثانية',
            badge: '$_unreadCount جديدة',
          ),
          const SizedBox(height: 10),
          if (_notifications.isEmpty)
            const _EmptyState(text: 'لا توجد تنبيهات جديدة حاليًا.')
          else
            ..._notifications.map(
              (item) => ListTile(
                contentPadding: const EdgeInsets.symmetric(vertical: 2),
                leading: CircleAvatar(
                  backgroundColor: context.appWarningContainer,
                  foregroundColor: context.appWarning,
                  child: const Icon(Icons.priority_high, size: 17),
                ),
                title: Text(
                  _text(item['title'], 'تنبيه إداري'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                subtitle: Text(
                  _text(item['body'], 'يوجد تحديث جديد على مستوى المنصة.'),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 10),
                ),
                trailing: IconButton(
                  tooltip: 'تحديد كمقروء',
                  onPressed: () => _markNotificationRead(item),
                  icon: Icon(Icons.done, color: context.appSuccess, size: 18),
                ),
              ),
            ),
        ],
      ),
    ),
  );

  Widget _metrics() => GridView.count(
    shrinkWrap: true,
    physics: const NeverScrollableScrollPhysics(),
    crossAxisCount: 2,
    mainAxisSpacing: 8,
    crossAxisSpacing: 8,
    childAspectRatio: 1.45,
    children: [
      _metric(
        'إجمالي العمليات',
        _number('totalOperations'),
        Icons.bolt_outlined,
        context.appInfoContainer,
        context.appInfo,
      ),
      _metric(
        'العمليات الحساسة',
        _number('sensitiveOperations'),
        Icons.shield_rounded,
        context.appDangerContainer,
        context.appDangerText,
      ),
      _metric(
        'الجهات النشطة',
        _number('activeOrganizations'),
        Icons.account_tree_outlined,
        context.appWarningContainer,
        context.appWarning,
      ),
      _metric(
        'الحسابات النشطة',
        _number('activeUsers'),
        Icons.people_outline,
        context.appSuccessContainer,
        context.appSuccess,
      ),
    ],
  );

  Widget _metric(
    String label,
    int value,
    IconData icon,
    Color tint,
    Color color,
  ) => Card(
    child: Padding(
      padding: const EdgeInsets.all(13),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: tint,
              borderRadius: BorderRadius.circular(11),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const Spacer(),
          Text(
            '$value',
            style: TextStyle(
              color: Theme.of(context).colorScheme.onSurface,
              fontWeight: FontWeight.w900,
              fontSize: 23,
            ),
          ),
          Text(
            label,
            style: TextStyle(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    ),
  );

  Widget _performanceCard() {
    final total = _number('totalOperations');
    final sensitive = _number('sensitiveOperations');
    final points = _rows('operationsByDay');
    final organizations = _rows('topOrganizations');
    final average = points.isEmpty ? 0 : (total / points.length).round();
    final sensitiveRate = total == 0 ? 0 : (sensitive / total * 100).round();
    final topOrganization = organizations.isEmpty ? null : organizations.first;
    final rows = [
      {
        'label': 'متوسط العمليات اليومي',
        'value': average,
        'ratio': _ratio(average, total),
      },
      {
        'label': 'نسبة العمليات الحساسة',
        'value': sensitiveRate,
        'ratio': sensitiveRate / 100,
        'suffix': '%',
      },
      {
        'label': 'عمليات الجهة الأعلى نشاطًا',
        'value': int.tryParse('${topOrganization?['count'] ?? 0}') ?? 0,
        'ratio': _ratio(
          int.tryParse('${topOrganization?['count'] ?? 0}') ?? 0,
          total,
        ),
      },
    ];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const _CardHeader(
              icon: Icons.insert_chart_outlined,
              title: 'تقرير الأداء التفصيلي',
              subtitle: 'مؤشرات مستمدة من سجل المنصة الموحد',
            ),
            const SizedBox(height: 14),
            ...rows.map(
              (row) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            '${row['label']}',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: Theme.of(context)
                                  .colorScheme
                                  .onSurfaceVariant,
                            ),
                          ),
                        ),
                        Text(
                          '${row['value']}${row['suffix'] ?? ''}',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w900,
                            color: Theme.of(context).colorScheme.onSurface,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: LinearProgressIndicator(
                        value: row['ratio'] as double,
                        minHeight: 7,
                        backgroundColor: Theme.of(context)
                            .colorScheme
                            .surfaceContainerHighest,
                        color: Theme.of(context).colorScheme.primary,
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

  double _ratio(int value, int total) =>
      total == 0 ? 0.08 : (value / total).clamp(0.08, 1.0).toDouble();

  Widget _activityCard() {
    final points = _rows('operationsByDay').reversed
        .take(14)
        .toList()
        .reversed
        .toList();
    final maximum = points.fold<int>(
      0,
      (current, point) =>
          current > (int.tryParse('${point['count'] ?? 0}') ?? 0)
          ? current
          : (int.tryParse('${point['count'] ?? 0}') ?? 0),
    );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const _CardHeader(
              icon: Icons.show_chart_outlined,
              title: 'وتيرة العمليات اليومية',
              subtitle: 'آخر 14 يومًا من الفترة المحددة',
            ),
            const SizedBox(height: 16),
            if (points.isEmpty)
              const _EmptyState(text: 'لا توجد بيانات نشاط متاحة لهذه الفترة.')
            else
              SizedBox(
                height: 154,
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: points.map((point) {
                    final count = int.tryParse('${point['count'] ?? 0}') ?? 0;
                    final height = maximum == 0 ? 4.0 : 104 * count / maximum;
                    return Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 2),
                        child: Tooltip(
                          message: '${point['date'] ?? ''} · $count عملية',
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              Container(
                                height: height.clamp(4.0, 104.0).toDouble(),
                                decoration: BoxDecoration(
                                  color: Theme.of(context).colorScheme.primary,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                              ),
                              const SizedBox(height: 7),
                              Text(
                                (point['date'] ?? '').toString().length >= 10
                                    ? (point['date'] as String).substring(8, 10)
                                    : '',
                                style: TextStyle(
                                  fontSize: 9,
                                  color: Theme.of(context)
                                      .colorScheme
                                      .onSurfaceVariant,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _distributionCard() {
    const labels = {
      'telegram': 'البرقيات',
      'user': 'الحسابات',
      'organization': 'الجهات',
      'platform': 'المنصة والإعدادات',
      'other': 'عمليات أخرى',
    };
    final colors = [
      Theme.of(context).colorScheme.primary,
      Theme.of(context).colorScheme.secondary,
      Theme.of(context).colorScheme.tertiary,
      Theme.of(context).colorScheme.error,
      Theme.of(context).colorScheme.primaryContainer,
    ];
    final rows = _rows('operationsByCategory');
    final total = rows.fold<int>(
      0,
      (sum, row) => sum + (int.tryParse('${row['count'] ?? 0}') ?? 0),
    );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const _CardHeader(
              icon: Icons.donut_large_outlined,
              title: 'توزيع العمليات',
              subtitle: 'حسب مجال الإجراء',
            ),
            const SizedBox(height: 14),
            if (rows.isEmpty)
              const _EmptyState(text: 'لا توجد بيانات توزيع متاحة لهذه الفترة.')
            else
              ...rows.asMap().entries.map((entry) {
                final row = entry.value;
                final count = int.tryParse('${row['count'] ?? 0}') ?? 0;
                final ratio = total == 0 ? 0.0 : count / total;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              labels[row['category']] ?? 'عمليات أخرى',
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          Text(
                            '$count',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: LinearProgressIndicator(
                          value: ratio,
                          minHeight: 8,
                          backgroundColor: Theme.of(context)
                              .colorScheme
                              .surfaceContainerHighest,
                          color: colors[entry.key % colors.length],
                        ),
                      ),
                    ],
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }

  Widget _organizationsCard() {
    final organizations = _rows('topOrganizations');
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const _CardHeader(
              icon: Icons.apartment_outlined,
              title: 'الجهات الأعلى نشاطًا',
              subtitle: 'بحسب عدد الإجراءات خلال الفترة المحددة',
            ),
            const SizedBox(height: 10),
            if (organizations.isEmpty)
              const _EmptyState(
                text: 'لا توجد عمليات مرتبطة بالجهات في هذه الفترة.',
              )
            else
              ...organizations
                  .take(5)
                  .map(
                    (row) => ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      leading: CircleAvatar(
                        radius: 17,
                        backgroundColor: Theme.of(context)
                            .colorScheme
                            .secondaryContainer,
                        foregroundColor: Theme.of(context)
                            .colorScheme
                            .onSecondaryContainer,
                        child: Icon(Icons.account_balance_outlined, size: 17),
                      ),
                      title: Text(
                        _text(row['organizationName'], 'جهة غير محددة'),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      trailing: Text(
                        '${row['count'] ?? 0}',
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                    ),
                  ),
          ],
        ),
      ),
    );
  }

  Widget _recentOperationsCard() {
    final operations = _rows('recentOperations');
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const _CardHeader(
              icon: Icons.history_outlined,
              title: 'أحدث العمليات',
              subtitle: 'آخر الإجراءات المسجلة على مستوى المنصة',
            ),
            const SizedBox(height: 10),
            if (operations.isEmpty)
              const _EmptyState(text: 'لا توجد عمليات مسجلة حديثًا.')
            else
              ...operations
                  .take(5)
                  .map(
                    (row) => ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      leading: CircleAvatar(
                        radius: 17,
                        backgroundColor: Theme.of(context)
                            .colorScheme
                            .primaryContainer,
                        foregroundColor: Theme.of(context)
                            .colorScheme
                            .onPrimaryContainer,
                        child: Icon(Icons.manage_history_outlined, size: 17),
                      ),
                      title: Text(
                        _actionLabel(row['action']),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      subtitle: Text(
                        [
                          _text(row['actorName'], 'مستخدم'),
                          _text(row['organizationName'], 'النظام'),
                        ].join(' · '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 10),
                      ),
                      trailing: const Icon(Icons.chevron_left, size: 18),
                    ),
                  ),
          ],
        ),
      ),
    );
  }

  Widget _errorCard() => Card(
    color: Theme.of(context).colorScheme.errorContainer,
    child: ListTile(
      leading: Icon(
        Icons.error_outline,
        color: Theme.of(context).colorScheme.error,
      ),
      title: const Text('تعذر تحميل بعض البيانات'),
      subtitle: Text(_error!),
      trailing: TextButton(
        onPressed: _load,
        child: const Text('إعادة المحاولة'),
      ),
    ),
  );
}

class _CardHeader extends StatelessWidget {
  const _CardHeader({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.badge,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final String? badge;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Container(
        width: 34,
        height: 34,
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(11),
        ),
        child: Icon(
          icon,
          color: Theme.of(context).colorScheme.primary,
          size: 18,
        ),
      ),
      const SizedBox(width: 10),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: TextStyle(
                color: Theme.of(context).colorScheme.onSurface,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              subtitle,
              style: TextStyle(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                fontSize: 10,
              ),
            ),
          ],
        ),
      ),
      if (badge != null)
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.errorContainer,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            badge!,
            style: TextStyle(
              color: Theme.of(context).colorScheme.onErrorContainer,
              fontSize: 10,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
    ],
  );
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.surfaceContainerLow,
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
    ),
    child: Text(
      text,
      textAlign: TextAlign.center,
      style: TextStyle(
        color: Theme.of(context).colorScheme.onSurfaceVariant,
        fontSize: 12,
      ),
    ),
  );
}
