import 'package:flutter/material.dart';

import 'api.dart';

const _navy = Color(0xFF101C35);
const _gold = Color(0xFFC9A45C);

class NativeOperationsPage extends StatefulWidget {
  const NativeOperationsPage({super.key, required this.api});

  final PoliceApi api;

  @override
  State<NativeOperationsPage> createState() => _NativeOperationsPageState();
}

class _NativeOperationsPageState extends State<NativeOperationsPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  bool _loading = true;
  String? _error;
  String _archiveSearch = '';
  List<Map<String, dynamic>> _telegrams = [];
  List<Map<String, dynamic>> _archived = [];
  List<Map<String, dynamic>> _units = [];
  String? _currentOrganizationId;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 4, vsync: this);
    load();
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  List<Map<String, dynamic>> _asRows(dynamic value) {
    final raw = value is Map && value['items'] is List
        ? value['items'] as List
        : value is List
        ? value
        : const [];
    return raw
        .whereType<Map>()
        .map((row) => Map<String, dynamic>.from(row))
        .toList();
  }

  Future<void> load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final results = await Future.wait([
        widget.api.call('telegrams.list', input: {'page': 1, 'pageSize': 100}),
        widget.api.call(
          'telegrams.list',
          input: {'page': 1, 'pageSize': 100, 'status': 'archived'},
        ),
        widget.api.call('organizations.routingTargets'),
        widget.api.call('organizations.context'),
      ]);
      if (!mounted) return;
      setState(() {
        _telegrams = _asRows(results[0]);
        _archived = _asRows(results[1]);
        _units = _asRows(results[2]);
        final context = results[3];
        _currentOrganizationId = context is Map
            ? context['organizationId']?.toString()
            : null;
      });
    } catch (exception) {
      if (mounted) {
        setState(() {
          _error = exception.toString().replaceFirst('Exception: ', '');
        });
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _value(dynamic value, [String fallback = '—']) {
    final text = '$value'.trim();
    return text.isEmpty || text == 'null' ? fallback : text;
  }

  bool _isOpen(Map<String, dynamic> row) =>
      _value(row['status']).toLowerCase() != 'archived';

  int _workloadFor(Map<String, dynamic> unit) {
    final id = unit['id']?.toString();
    return _telegrams.where((row) {
      return _isOpen(row) &&
          (row['currentOrganizationId']?.toString() == id ||
              row['organizationId']?.toString() == id);
    }).length;
  }

  List<Map<String, dynamic>> get _locations => _telegrams.where((row) {
    return row['gpsLatitude'] != null && row['gpsLongitude'] != null;
  }).toList();

  List<Map<String, dynamic>> get _filteredArchive {
    final query = _archiveSearch.trim().toLowerCase();
    if (query.isEmpty) return _archived;
    return _archived.where((row) {
      final searchable = [
        row['serialCode'],
        row['serialNumber'],
        row['subject'],
        row['recipient'],
        row['status'],
      ].whereType<Object>().join(' ').toLowerCase();
      return searchable.contains(query);
    }).toList();
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(
        backgroundColor: _navy,
        foregroundColor: Colors.white,
        title: const Text(
          'متابعة العمل الميداني',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
        actions: [
          IconButton(
            tooltip: 'تحديث البيانات',
            onPressed: _loading ? null : load,
            icon: const Icon(Icons.refresh),
          ),
        ],
        bottom: TabBar(
          controller: _tabs,
          isScrollable: true,
          indicatorColor: _gold,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white70,
          tabs: const [
            Tab(icon: Icon(Icons.map_outlined), text: 'المواقع'),
            Tab(icon: Icon(Icons.groups_outlined), text: 'الوحدات'),
            Tab(icon: Icon(Icons.query_stats_outlined), text: 'الموارد'),
            Tab(icon: Icon(Icons.archive_outlined), text: 'الأرشيف'),
          ],
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                if (_error != null)
                  MaterialBanner(
                    content: Text(_error!),
                    leading: const Icon(Icons.error_outline, color: Colors.red),
                    actions: [
                      TextButton(
                        onPressed: load,
                        child: const Text('إعادة المحاولة'),
                      ),
                    ],
                  ),
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: load,
                    child: TabBarView(
                      controller: _tabs,
                      children: [
                        _locationsTab(),
                        _unitsTab(),
                        _resourcesTab(),
                        _archiveTab(),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    ),
  );

  Widget _locationsTab() {
    final urgent = _locations
        .where((row) => row['priority'] == 'urgent')
        .length;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            _metric(
              'مواقع مسجلة',
              _locations.length,
              Icons.location_on_outlined,
            ),
            const SizedBox(width: 8),
            _metric('مواقع عاجلة', urgent, Icons.priority_high),
          ],
        ),
        const SizedBox(height: 12),
        const Text(
          'مواقع البرقيات',
          style: TextStyle(
            color: _navy,
            fontSize: 18,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 8),
        if (_locations.isEmpty)
          const _InfoCard(
            icon: Icons.location_off_outlined,
            title: 'لا توجد إحداثيات مسجلة',
            detail: 'تظهر هنا البرقيات التي تحتوي على خط العرض وخط الطول.',
          )
        else
          ..._locations.map((row) {
            final lat = row['gpsLatitude'];
            final lng = row['gpsLongitude'];
            return Card(
              child: ListTile(
                leading: const CircleAvatar(
                  backgroundColor: Color(0xFFF1E8D5),
                  child: Icon(Icons.location_on_outlined, color: _navy),
                ),
                title: Text(
                  _value(row['subject'], 'برقية بدون موضوع'),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                subtitle: Text(
                  '${_value(row['serialCode'] ?? row['serialNumber'])}\\n'
                  'خط العرض: $lat · خط الطول: $lng',
                ),
                isThreeLine: true,
                trailing: row['priority'] == 'urgent'
                    ? const Icon(Icons.priority_high, color: Colors.red)
                    : null,
              ),
            );
          }),
      ],
    );
  }

  Widget _unitsTab() => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      Text(
        'الجهة الحالية: ${_value(_currentOrganizationId)}',
        style: const TextStyle(color: Colors.black54),
      ),
      const SizedBox(height: 8),
      if (_units.isEmpty)
        const _InfoCard(
          icon: Icons.groups_outlined,
          title: 'لا توجد جهات توجيه متاحة',
          detail: 'تعرض هذه القائمة الجهات التي يسمح الخادم بالتوجيه إليها.',
        )
      else
        ..._units.map((unit) {
          final count = _workloadFor(unit);
          return Card(
            child: ListTile(
              leading: const CircleAvatar(
                backgroundColor: _navy,
                child: Icon(Icons.account_tree_outlined, color: _gold),
              ),
              title: Text(_value(unit['name'], 'جهة بدون اسم')),
              subtitle: Text(
                '${_value(unit['code'], 'بدون رمز')} · '
                '${_value(unit['type'], 'نوع غير محدد')}',
              ),
              trailing: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    '$count',
                    style: const TextStyle(
                      color: _navy,
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const Text('مفتوحة', style: TextStyle(fontSize: 10)),
                ],
              ),
            ),
          );
        }),
    ],
  );

  Widget _resourcesTab() {
    final openRows = _telegrams.where(_isOpen).toList();
    final unassigned = openRows.where((row) {
      final id = row['currentOrganizationId'] ?? row['organizationId'];
      return id == null || id.toString().isEmpty;
    }).length;
    final located = _locations.length;
    final maxCount = _units
        .map(_workloadFor)
        .fold<int>(0, (max, value) => value > max ? value : max);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'ملخص توزيع العمل',
          style: TextStyle(
            color: _navy,
            fontSize: 20,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            _metric(
              'برقيات مفتوحة',
              openRows.length,
              Icons.pending_actions_outlined,
            ),
            const SizedBox(width: 8),
            _metric('بلا جهة', unassigned, Icons.assignment_late_outlined),
          ],
        ),
        Row(
          children: [
            _metric('بإحداثيات', located, Icons.location_on_outlined),
            const SizedBox(width: 8),
            _metric('جهات التوجيه', _units.length, Icons.groups_outlined),
          ],
        ),
        const SizedBox(height: 14),
        const Text(
          'العمل المفتوح حسب الجهة',
          style: TextStyle(fontWeight: FontWeight.w900, fontSize: 17),
        ),
        const SizedBox(height: 8),
        if (_units.isEmpty)
          const _InfoCard(
            icon: Icons.bar_chart_outlined,
            title: 'لا تتوفر بيانات توزيع',
            detail: 'تحقق من صلاحية الحساب واتصال الخادم.',
          )
        else
          ..._units.map((unit) {
            final count = _workloadFor(unit);
            final progress = maxCount == 0 ? 0.0 : count / maxCount;
            return Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            _value(unit['name']),
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ),
                        Text('$count'),
                      ],
                    ),
                    const SizedBox(height: 8),
                    LinearProgressIndicator(
                      value: progress,
                      minHeight: 7,
                      borderRadius: BorderRadius.circular(8),
                      backgroundColor: const Color(0xFFE5E7EB),
                      color: _gold,
                    ),
                  ],
                ),
              ),
            );
          }),
      ],
    );
  }

  Widget _archiveTab() {
    final rows = _filteredArchive;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        TextField(
          onChanged: (value) => setState(() => _archiveSearch = value),
          decoration: InputDecoration(
            hintText: 'البحث في الأرشيف بالرقم أو الموضوع أو الجهة',
            prefixIcon: const Icon(Icons.search),
            suffixIcon: _archiveSearch.isEmpty
                ? null
                : IconButton(
                    tooltip: 'مسح البحث',
                    onPressed: () => setState(() => _archiveSearch = ''),
                    icon: const Icon(Icons.close),
                  ),
          ),
        ),
        const SizedBox(height: 10),
        Text(
          'السجلات المعروضة: ${rows.length}',
          style: const TextStyle(color: Colors.black54),
        ),
        const SizedBox(height: 6),
        if (rows.isEmpty)
          _InfoCard(
            icon: Icons.archive_outlined,
            title: _archiveSearch.isEmpty
                ? 'الأرشيف فارغ'
                : 'لا توجد نتائج مطابقة',
            detail: _archiveSearch.isEmpty
                ? 'لا توجد برقيات مؤرشفة متاحة لهذا الحساب.'
                : 'جرّب البحث برقم البرقية أو جزء من الموضوع.',
          )
        else
          ...rows.map(
            (row) => Card(
              child: ListTile(
                leading: const Icon(Icons.description_outlined, color: _gold),
                title: Text(_value(row['subject'], 'برقية بدون موضوع')),
                subtitle: Text(
                  '${_value(row['serialCode'] ?? row['serialNumber'])} · '
                  '${_value(row['recipient'])}',
                ),
                isThreeLine: true,
              ),
            ),
          ),
      ],
    );
  }

  Widget _metric(String label, int value, IconData icon) => Expanded(
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            Icon(icon, color: _gold),
            const SizedBox(height: 6),
            Text(
              '$value',
              style: const TextStyle(
                color: _navy,
                fontSize: 22,
                fontWeight: FontWeight.w900,
              ),
            ),
            Text(
              label,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 11),
            ),
          ],
        ),
      ),
    ),
  );
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({
    required this.icon,
    required this.title,
    required this.detail,
  });

  final IconData icon;
  final String title;
  final String detail;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          Icon(icon, color: _gold, size: 34),
          const SizedBox(height: 10),
          Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
          const SizedBox(height: 5),
          Text(
            detail,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.black54),
          ),
        ],
      ),
    ),
  );
}
