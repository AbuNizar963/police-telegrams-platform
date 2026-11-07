import 'dart:async';

import 'package:flutter/material.dart';

import '../../api.dart';

const _navy = Color(0xFF10233F);
const _gold = Color(0xFFD8C38E);
const _canvas = Color(0xFFF8F7F2);

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
      const Duration(seconds: 20),
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
      final result = await widget.api.call('dashboard.stats');
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
    final fallback = switch (key) {
      'totalOperations' => 'total',
      'sensitiveOperations' => 'secret',
      'activeOrganizations' => 'organizations',
      'activeUsers' => 'users',
      _ => key,
    };
    return int.tryParse('${_summary[key] ?? _summary[fallback] ?? 0}') ?? 0;
  }

  String _text(dynamic value, [String fallback = '—']) {
    final text = '$value'.trim();
    return text.isEmpty || text == 'null' ? fallback : text;
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      backgroundColor: _canvas,
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
              'مالك النظام  ·  نظرة شاملة لآخر $_days يومًا',
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
            subtitle: 'تتحدث تلقائيًا كل 20 ثانية',
            badge: '$_unreadCount جديدة',
          ),
          const SizedBox(height: 10),
          if (_notifications.isEmpty)
            const _EmptyState(text: 'لا توجد تنبيهات جديدة حاليًا.')
          else
            ..._notifications.map(
              (item) => ListTile(
                contentPadding: const EdgeInsets.symmetric(vertical: 2),
                leading: const CircleAvatar(
                  backgroundColor: Color(0xFFF7F1DF),
                  foregroundColor: Color(0xFF8B6D22),
                  child: Icon(Icons.priority_high, size: 17),
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
                  icon: const Icon(
                    Icons.done,
                    color: Color(0xFF2B765C),
                    size: 18,
                  ),
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
        const Color(0xFFE9F2F7),
        const Color(0xFF24506A),
      ),
      _metric(
        'العمليات الحساسة',
        _number('sensitiveOperations'),
        Icons.shield_outlined,
        const Color(0xFFFAECEF),
        const Color(0xFF9A4458),
      ),
      _metric(
        'الجهات النشطة',
        _number('activeOrganizations'),
        Icons.account_tree_outlined,
        const Color(0xFFF7F1DF),
        const Color(0xFF8B6D22),
      ),
      _metric(
        'الحسابات النشطة',
        _number('activeUsers'),
        Icons.people_outline,
        const Color(0xFFE9F5F0),
        const Color(0xFF2B765C),
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
            child: Icon(icon, color: color, size: 18),
          ),
          const Spacer(),
          Text(
            '$value',
            style: const TextStyle(
              color: _navy,
              fontWeight: FontWeight.w900,
              fontSize: 23,
            ),
          ),
          Text(
            label,
            style: const TextStyle(
              color: Color(0xFF718096),
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
    final rows = [
      {
        'label': 'معدل النشاط اليوم',
        'value': _number('today'),
        'ratio': _ratio(_number('today'), total),
      },
      {
        'label': 'قيد المتابعة',
        'value': _number('pending') + _number('inProgress'),
        'ratio': _ratio(_number('pending') + _number('inProgress'), total),
      },
      {
        'label': 'نسبة الإنجاز',
        'value': _number('resolved'),
        'ratio': _ratio(_number('resolved'), total),
      },
      {
        'label': 'أولوية عاجلة',
        'value': _number('urgent'),
        'ratio': _ratio(_number('urgent'), total),
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
              subtitle: 'قراءة تنفيذية لمؤشرات الكفاءة',
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
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF718096),
                            ),
                          ),
                        ),
                        Text(
                          '${row['value']}',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w900,
                            color: _navy,
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
                        backgroundColor: const Color(0xFFE9EDF1),
                        color: _navy,
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

  Widget _activityCard() => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: const [
          _CardHeader(
            icon: Icons.show_chart_outlined,
            title: 'وتيرة العمليات اليومية',
            subtitle: 'النشاط المسجل خلال الفترة المحددة',
          ),
          SizedBox(height: 14),
          _EmptyState(text: 'يظهر التفصيل اليومي الكامل في لوحة الويب.'),
        ],
      ),
    ),
  );

  Widget _distributionCard() => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: const [
          _CardHeader(
            icon: Icons.donut_large_outlined,
            title: 'توزيع العمليات',
            subtitle: 'حسب مجال الإجراء',
          ),
          SizedBox(height: 14),
          _EmptyState(text: 'يظهر التوزيع التفصيلي في لوحة الويب.'),
        ],
      ),
    ),
  );

  Widget _errorCard() => Card(
    color: const Color(0xFFFFF3F2),
    child: ListTile(
      leading: const Icon(Icons.error_outline, color: Colors.red),
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
          color: const Color(0xFFEEF2F5),
          borderRadius: BorderRadius.circular(11),
        ),
        child: Icon(icon, color: _navy, size: 18),
      ),
      const SizedBox(width: 10),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: const TextStyle(color: _navy, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 2),
            Text(
              subtitle,
              style: const TextStyle(color: Color(0xFF7D8998), fontSize: 10),
            ),
          ],
        ),
      ),
      if (badge != null)
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
          decoration: BoxDecoration(
            color: const Color(0xFFFAECEF),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            badge!,
            style: const TextStyle(
              color: Color(0xFF9A4458),
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
      color: const Color(0xFFF8FAFB),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: const Color(0xFFE1E5EB)),
    ),
    child: Text(
      text,
      textAlign: TextAlign.center,
      style: const TextStyle(color: Color(0xFF7D8998), fontSize: 12),
    ),
  );
}
