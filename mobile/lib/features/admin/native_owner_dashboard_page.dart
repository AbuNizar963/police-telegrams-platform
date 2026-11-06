import 'package:flutter/material.dart';

import '../../api.dart';

const _navy = Color(0xFF10233F);
const _gold = Color(0xFFD8C38E);
const _canvas = Color(0xFFF8F7F2);

class NativeOwnerDashboardPage extends StatefulWidget {
  const NativeOwnerDashboardPage({super.key, required this.api});

  final PoliceApi api;

  @override
  State<NativeOwnerDashboardPage> createState() => _NativeOwnerDashboardPageState();
}

class _NativeOwnerDashboardPageState extends State<NativeOwnerDashboardPage> {
  bool _loading = true;
  String? _error;
  int _days = 30;
  Map<String, dynamic> _summary = const {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await widget.api.call('dashboard.stats');
      if (!mounted) return;
      setState(() => _summary = result is Map ? Map<String, dynamic>.from(result) : {});
    } catch (error) {
      if (mounted) setState(() => _error = error.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
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

  List<Map<String, dynamic>> _rows(String key) {
    final value = _summary[key];
    if (value is! List) return const [];
    return value.whereType<Map>().map((row) => Map<String, dynamic>.from(row)).toList();
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      backgroundColor: _canvas,
      appBar: AppBar(
        title: const Text('مركز قيادة المنصة', style: TextStyle(fontWeight: FontWeight.w900)),
        actions: [
          IconButton(tooltip: 'تحديث البيانات', onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: _loading && _summary.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(onRefresh: _load, child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 28), children: [
              _hero(),
              const SizedBox(height: 14),
              _periodSelector(),
              const SizedBox(height: 14),
              if (_error != null) _errorCard(),
              _metrics(),
              const SizedBox(height: 14),
              _activityCard(),
              const SizedBox(height: 14),
              _distributionCard(),
              const SizedBox(height: 14),
              _recentOperationsCard(),
            ])),
    ),
  );

  Widget _hero() => Container(
    padding: const EdgeInsets.all(20),
    decoration: BoxDecoration(
      gradient: const LinearGradient(colors: [_navy, Color(0xFF24506A)], begin: Alignment.topRight, end: Alignment.bottomLeft),
      borderRadius: BorderRadius.circular(24),
      boxShadow: const [BoxShadow(color: Color(0x2410233F), blurRadius: 18, offset: Offset(0, 8))],
    ),
    child: Stack(children: [
      Positioned(left: -18, top: -30, child: Container(width: 130, height: 130, decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: _gold.withOpacity(.2), width: 1)))),
      Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [const Icon(Icons.workspace_premium_outlined, color: _gold, size: 19), const SizedBox(width: 7), Text('مالك النظام  ·  نظرة شاملة لآخر $_days يومًا', style: TextStyle(color: _gold, fontSize: 12, fontWeight: FontWeight.w800))]),
        const SizedBox(height: 12),
        const Text('كل الجهات ضمن صورة تشغيلية واحدة', style: TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w900)),
        const SizedBox(height: 6),
        const Text('مؤشرات موحّدة للنشاط، الجهات، الحسابات، وسجل الإجراءات الموثق.', style: TextStyle(color: Color(0xFFD3DDE7), height: 1.5, fontSize: 12)),
        const SizedBox(height: 14),
        Row(children: [const Icon(Icons.verified_outlined, color: Color(0xFF9AE0B8), size: 16), const SizedBox(width: 5), Text('النظام يعمل بشكل طبيعي', style: TextStyle(color: Color(0xFFBCEACB), fontSize: 11, fontWeight: FontWeight.w700))]),
      ]),
    ]),
  );

  Widget _periodSelector() => Card(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7), child: Row(children: [const Icon(Icons.calendar_today_outlined, color: _navy, size: 18), const SizedBox(width: 9), const Expanded(child: Text('الفترة الزمنية', style: TextStyle(fontWeight: FontWeight.w800))), DropdownButton<int>(value: _days, underline: const SizedBox.shrink(), items: const [DropdownMenuItem(value: 7, child: Text('آخر 7 أيام')), DropdownMenuItem(value: 30, child: Text('آخر 30 يومًا')), DropdownMenuItem(value: 90, child: Text('آخر 90 يومًا'))], onChanged: (value) { if (value == null) return; setState(() => _days = value); _load(); })])));

  Widget _metrics() => GridView.count(shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), crossAxisCount: 2, mainAxisSpacing: 8, crossAxisSpacing: 8, childAspectRatio: 1.45, children: [
    _metric('إجمالي العمليات', _number('totalOperations'), Icons.bolt_outlined, const Color(0xFFE9F2F7), const Color(0xFF24506A)),
    _metric('العمليات الحساسة', _number('sensitiveOperations'), Icons.shield_outlined, const Color(0xFFFAECEF), const Color(0xFF9A4458)),
    _metric('الجهات النشطة', _number('activeOrganizations'), Icons.account_tree_outlined, const Color(0xFFF7F1DF), const Color(0xFF8B6D22)),
    _metric('الحسابات النشطة', _number('activeUsers'), Icons.people_outline, const Color(0xFFE9F5F0), const Color(0xFF2B765C)),
  ]);

  Widget _metric(String label, int value, IconData icon, Color tint, Color color) => Card(child: Padding(padding: const EdgeInsets.all(13), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Container(width: 34, height: 34, decoration: BoxDecoration(color: tint, borderRadius: BorderRadius.circular(11)), child: Icon(icon, color: color, size: 18)), const Spacer(), Text('$value', style: const TextStyle(color: _navy, fontWeight: FontWeight.w900, fontSize: 23)), Text(label, style: const TextStyle(color: Color(0xFF718096), fontSize: 11, fontWeight: FontWeight.w700))])));

  Widget _activityCard() {
    final rows = _rows('operationsByDay');
    final values = rows.map((row) => int.tryParse('${row['count'] ?? 0}') ?? 0).toList();
    final max = values.fold<int>(0, (current, value) => value > current ? value : current);
    return Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [const _CardHeader(icon: Icons.show_chart_outlined, title: 'وتيرة العمليات اليومية', subtitle: 'النشاط المسجل خلال الفترة المحددة'), const SizedBox(height: 16), SizedBox(height: 125, child: rows.isEmpty ? const _EmptyState(text: 'لا توجد عمليات مسجلة في هذه الفترة.') : Row(crossAxisAlignment: CrossAxisAlignment.end, children: rows.take(14).map((row) { final count = int.tryParse('${row['count'] ?? 0}') ?? 0; final height = max == 0 ? 5.0 : (count / max * 94).clamp(5, 94).toDouble(); return Expanded(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 2), child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [Tooltip(message: '$count عملية', child: Container(height: height, decoration: BoxDecoration(color: _navy.withOpacity(.9), borderRadius: const BorderRadius.vertical(top: Radius.circular(5))))), const SizedBox(height: 5), Text(_text(row['date'], '').split('-').last, style: const TextStyle(fontSize: 9, color: Color(0xFF8B96A6)))])); }).toList()))])));
  }

  Widget _distributionCard() {
    final rows = _rows('operationsByCategory');
    final total = rows.fold<int>(0, (sum, row) => sum + (int.tryParse('${row['count'] ?? 0}') ?? 0));
    return Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [const _CardHeader(icon: Icons.donut_large_outlined, title: 'توزيع العمليات', subtitle: 'حسب مجال الإجراء'), const SizedBox(height: 13), if (rows.isEmpty) const _EmptyState(text: 'سيظهر التوزيع عند تسجيل عمليات جديدة.') else ...rows.take(5).toList().asMap().entries.map((entry) { final row = entry.value; final count = int.tryParse('${row['count'] ?? 0}') ?? 0; final ratio = total == 0 ? 0.0 : count / total; final color = [_navy, _gold, const Color(0xFF2C6C86), const Color(0xFF4F927F), const Color(0xFF9A6476)][entry.key % 5]; return Padding(padding: const EdgeInsets.only(bottom: 11), child: Column(children: [Row(children: [Container(width: 9, height: 9, decoration: BoxDecoration(color: color, shape: BoxShape.circle)), const SizedBox(width: 8), Expanded(child: Text(_text(row['category'], 'عمليات أخرى'), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700))), Text('$count', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: _navy))]), const SizedBox(height: 6), ClipRRect(borderRadius: BorderRadius.circular(8), child: LinearProgressIndicator(value: ratio, minHeight: 7, backgroundColor: const Color(0xFFE9EDF1), color: color))])); })])));
  }

  Widget _recentOperationsCard() {
    final rows = _rows('recentOperations');
    return Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [const _CardHeader(icon: Icons.history_outlined, title: 'أحدث العمليات', subtitle: 'لقطة مختصرة من سجل التدقيق'), const SizedBox(height: 8), if (rows.isEmpty) const _EmptyState(text: 'لا توجد عمليات مسجلة في هذه الفترة.') else ...rows.take(5).map((row) => ListTile(contentPadding: const EdgeInsets.symmetric(vertical: 4), leading: const CircleAvatar(backgroundColor: Color(0xFFEEF2F5), foregroundColor: _navy, child: Icon(Icons.person_outline, size: 18)), title: Text(_text(row['action'], 'عملية إدارية'), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800)), subtitle: Text('${_text(row['actorName'], 'النظام')} · ${_text(row['organizationName'], 'النظام')}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 10)), trailing: const Icon(Icons.chevron_left, color: Color(0xFF8B96A6)))])));
  }

  Widget _errorCard() => Card(color: const Color(0xFFFFF3F2), child: ListTile(leading: const Icon(Icons.error_outline, color: Colors.red), title: const Text('تعذر تحميل بعض البيانات'), subtitle: Text(_error!), trailing: TextButton(onPressed: _load, child: const Text('إعادة المحاولة'))));
}

class _CardHeader extends StatelessWidget {
  const _CardHeader({required this.icon, required this.title, required this.subtitle});
  final IconData icon;
  final String title;
  final String subtitle;
  @override
  Widget build(BuildContext context) => Row(children: [Container(width: 34, height: 34, decoration: BoxDecoration(color: const Color(0xFFEEF2F5), borderRadius: BorderRadius.circular(11)), child: Icon(icon, color: _navy, size: 18)), const SizedBox(width: 10), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: const TextStyle(color: _navy, fontWeight: FontWeight.w900)), const SizedBox(height: 2), Text(subtitle, style: const TextStyle(color: Color(0xFF7D8998), fontSize: 10))]))]);
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) => Container(padding: const EdgeInsets.all(18), decoration: BoxDecoration(color: const Color(0xFFF8FAFB), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFE1E5EB))), child: Text(text, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF7D8998), fontSize: 12)));
}
