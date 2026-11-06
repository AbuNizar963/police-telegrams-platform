import 'package:flutter/material.dart';

import '../../api.dart';

const _organizationTypes = <String, String>{
  'central': 'جهة مركزية',
  'governorate': 'محافظة',
  'region': 'منطقة',
  'police_department': 'قيادة شرطة',
  'command': 'قيادة',
  'department': 'إدارة',
  'station': 'مركز',
  'unit': 'وحدة',
};

class NativeOrganizationManagementPage extends StatefulWidget {
  const NativeOrganizationManagementPage({
    super.key,
    required this.api,
    required this.canEditStructure,
    required this.isPlatformOwner,
  });

  final PoliceApi api;
  final bool canEditStructure;
  final bool isPlatformOwner;

  @override
  State<NativeOrganizationManagementPage> createState() =>
      _NativeOrganizationManagementPageState();
}

class _NativeOrganizationManagementPageState
    extends State<NativeOrganizationManagementPage> {
  bool _loading = true;
  bool _saving = false;
  bool _isOwner = false;
  bool _showArchived = false;
  String? _error;
  String _search = '';
  List<Map<String, dynamic>> _organizations = [];

  @override
  void initState() {
    super.initState();
    load();
  }

  List<Map<String, dynamic>> _rows(dynamic value) {
    final source = value is List ? value : const [];
    return source
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  String _text(dynamic value, [String fallback = '—']) {
    final result = '$value'.trim();
    return result.isEmpty || result == 'null' ? fallback : result;
  }

  Future<void> load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        widget.api.call(
          'organizations.all',
          input: _showArchived ? {'includeDeleted': true} : null,
        ),
        widget.api.call('organizations.context'),
      ]);
      if (!mounted) return;
      final contextData = results[1];
      setState(() {
        _organizations = _rows(results[0]);
        _isOwner =
            widget.isPlatformOwner ||
            (contextData is Map && contextData['isOwner'] == true);
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

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await action();
      if (mounted) await load();
    } catch (exception) {
      if (mounted) {
        setState(() {
          _error = exception.toString().replaceFirst('Exception: ', '');
        });
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _editOrganization([Map<String, dynamic>? organization]) async {
    if (!widget.canEditStructure) return;
    final form = await showDialog<Map<String, dynamic>>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _OrganizationFormDialog(
        organizations: _organizations,
        organization: organization,
        isOwner: _isOwner,
      ),
    );
    if (form == null) return;
    await _run(() async {
      final id = organization?['id'];
      if (id == null) {
        final result = await widget.api.call(
          'organizations.create',
          mutation: true,
          input: form,
        );
        if (!mounted) return;
        final account = result is Map ? result['account'] : null;
        if (account is Map) {
          await showDialog<void>(
            context: context,
            builder: (dialogContext) => Directionality(
              textDirection: TextDirection.rtl,
              child: AlertDialog(
                title: const Text('تم إنشاء الجهة والحساب'),
                content: SelectableText(
                  'اسم المستخدم: ${_text(account['username'])}\n'
                  'كلمة المرور الأولية: ${_text(account['password'])}\n\n'
                  'احفظ بيانات الحساب الآن؛ لن تظهر كلمة المرور مرة أخرى.',
                ),
                actions: [
                  FilledButton(
                    onPressed: () => Navigator.pop(dialogContext),
                    child: const Text('تم'),
                  ),
                ],
              ),
            ),
          );
        }
      } else {
        await widget.api.call(
          'organizations.update',
          mutation: true,
          input: {
            'id': id,
            ...form,
            'accountUsername': '',
            'accountPassword': '',
          },
        );
      }
    });
  }

  Future<void> _archiveOrganization(Map<String, dynamic> organization) async {
    if (!_isOwner && !widget.isPlatformOwner) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => Directionality(
        textDirection: TextDirection.rtl,
        child: AlertDialog(
          title: const Text('إخفاء الجهة'),
          content: Text(
            'سيتم إخفاء «${_text(organization['name'])}» من القوائم النشطة وتعطيل حساباتها، مع الاحتفاظ بالبرقيات وسجل التدقيق. يمكن مراجعتها من قائمة الجهات المحذوفة.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('إلغاء'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text('إخفاء الجهة'),
            ),
          ],
        ),
      ),
    );
    if (confirmed != true) return;

    await _run(() async {
      await widget.api.call(
        'organizations.delete',
        mutation: true,
        input: {
          'id': organization['id'],
          'reason': 'إخفاء الجهة بطلب مالك النظام',
        },
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('تم إخفاء الجهة وتعطيل حساباتها مع حفظ السجلات'),
          ),
        );
      }
    });
  }

  Future<void> _purgeOrganization(Map<String, dynamic> organization) async {
    if (!_isOwner && !widget.isPlatformOwner) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => Directionality(
        textDirection: TextDirection.rtl,
        child: AlertDialog(
          title: const Text('تأكيد الحذف النهائي'),
          content: Text(
            'سيُحذف سجل «${_text(organization['name'])}» نهائياً فقط إذا لم توجد أي روابط تاريخية. '
            'إذا وُجدت برقيات أو حسابات أو إشعارات أو مرفقات مرتبطة فسيُمنع الحذف دون المساس بها.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('إلغاء'),
            ),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: Theme.of(context).colorScheme.error,
              ),
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text('تأكيد الحذف النهائي'),
            ),
          ],
        ),
      ),
    );
    if (confirmed != true) return;

    await _run(() async {
      final result = await widget.api.call(
        'organizations.purge',
        mutation: true,
        input: {
          'id': organization['id'],
          'reason': 'حذف نهائي بطلب مالك النظام بعد التأكيد',
        },
      );
      if (result is! Map || result['deleted'] != true) {
        final blockers = result is Map && result['blockers'] is List
            ? (result['blockers'] as List)
                .whereType<Map>()
                    .map(
                    (item) =>
                        '${_text(item['table'])} (${_text(item['count'], 'غير محدد')})',
                  )
                  .join('، ')
            : '';
        final reason = result is Map
            ? _text(result['reason'], 'توجد ارتباطات تمنع الحذف')
            : 'تعذر التحقق من الارتباطات';
        throw Exception(
          [
            reason,
            if (blockers.isNotEmpty) 'الارتباطات: $blockers',
          ].join(' — '),
        );
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('تم الحذف النهائي مع حفظ سجل التدقيق')),
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _organizations.where((organization) {
      final isArchived = organization['deletedAt'] != null;
      if (_showArchived != isArchived) return false;
      final query = _search.trim().toLowerCase();
      if (query.isEmpty) return true;
      return _text(organization['name'], '').toLowerCase().contains(query) ||
          _text(organization['code'], '').toLowerCase().contains(query);
    }).toList();

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('إدارة المناطق والأقسام والمخافر'),
          actions: [
            IconButton(
              tooltip: 'تحديث',
              onPressed: _loading || _saving ? null : load,
              icon: const Icon(Icons.refresh),
            ),
          ],
        ),
        floatingActionButton: widget.canEditStructure
            ? FloatingActionButton.extended(
                onPressed: _loading || _saving
                    ? null
                    : () => _editOrganization(),
                icon: const Icon(Icons.add_business_outlined),
                label: const Text('جهة جديدة'),
              )
            : null,
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: TextField(
                onChanged: (value) => setState(() => _search = value),
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search),
                  hintText: 'ابحث باسم الجهة أو رمزها',
                  suffixIcon: _search.isEmpty
                      ? null
                      : IconButton(
                          tooltip: 'مسح البحث',
                          onPressed: () => setState(() => _search = ''),
                          icon: const Icon(Icons.close),
                        ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                  isDense: true,
                ),
              ),
            ),
            if (_isOwner || widget.isPlatformOwner)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('عرض الجهات المحذوفة'),
                  subtitle: const Text(
                    'إظهار السجلات المحفوظة بدل الجهات النشطة والمعطلة.',
                  ),
                  value: _showArchived,
                  onChanged: _loading || _saving
                      ? null
                      : (value) {
                          setState(() => _showArchived = value);
                          load();
                        },
                ),
              ),
            if (!widget.canEditStructure)
              Padding(
                padding: EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: Align(
                  alignment: Alignment.centerRight,
                  child: Text(
                    'عرض الجهات ضمن نطاق صلاحيتك فقط؛ لا تتوفر أدوات تعديل الهيكل.',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
              ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Card(
                  color: Theme.of(context).colorScheme.errorContainer,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        const Icon(Icons.error_outline),
                        const SizedBox(width: 8),
                        Expanded(child: Text(_error!)),
                        IconButton(
                          onPressed: load,
                          icon: const Icon(Icons.refresh),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : filtered.isEmpty
                  ? const Center(child: Text('لا توجد جهات مطابقة للبحث.'))
                  : RefreshIndicator(
                      onRefresh: load,
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                        itemCount: filtered.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 8),
                        itemBuilder: (context, index) {
                          final organization = filtered[index];
                          final type = _text(
                            organization['type'],
                            'department',
                          );
                          final archived = organization['deletedAt'] != null;
                          final active =
                              !archived && organization['isActive'] != false;
                          return Card(
                            child: ListTile(
                              leading: CircleAvatar(
                                backgroundColor: active
                                    ? const Color(0xFFE8F2EA)
                                    : const Color(0xFFFBE9E7),
                                child: Icon(
                                  Icons.account_tree_outlined,
                                  color: active
                                      ? const Color(0xFF276749)
                                      : const Color(0xFFB42318),
                                ),
                              ),
                              title: Text(
                                _text(organization['name']),
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              subtitle: Padding(
                                padding: const EdgeInsets.only(top: 5),
                                child: Text(
                                  '${_text(organization['code'])} • '
                                  '${_organizationTypes[type] ?? type}\n'
                                  '${archived
                                      ? 'محذوفة — السجل محفوظ'
                                      : active
                                      ? 'نشطة'
                                      : 'معطلة'}',
                                ),
                              ),
                              isThreeLine: true,
                              trailing:
                                  (widget.canEditStructure && !archived) ||
                                      ((_isOwner || widget.isPlatformOwner) &&
                                          !archived &&
                                          organization['type'] != 'central' &&
                                          organization['parentOrganizationId'] !=
                                              null) ||
                                      ((_isOwner || widget.isPlatformOwner) &&
                                          archived)
                                  ? Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        if (widget.canEditStructure &&
                                            !archived)
                                          IconButton(
                                            tooltip: 'تعديل الجهة',
                                            onPressed: _loading || _saving
                                                ? null
                                                : () => _editOrganization(
                                                    organization,
                                                  ),
                                            icon: const Icon(
                                              Icons.edit_outlined,
                                            ),
                                          ),
                                        if ((_isOwner ||
                                                widget.isPlatformOwner) &&
                                            !archived &&
                                            organization['type'] != 'central' &&
                                          organization['parentOrganizationId'] != null)
                                          IconButton(
                                            tooltip:
                                                'إخفاء الجهة مع حفظ السجلات',
                                            onPressed: _loading || _saving
                                                ? null
                                                : () => _archiveOrganization(
                                                    organization,
                                                  ),
                                            icon: const Icon(
                                              Icons.archive_outlined,
                                            ),
                                          ),
                                        if ((_isOwner ||
                                                widget.isPlatformOwner) &&
                                            archived)
                                          IconButton(
                                            tooltip:
                                                'حذف نهائي بعد فحص الارتباطات',
                                            color: Theme.of(context)
                                                .colorScheme
                                                .error,
                                            onPressed: _loading || _saving
                                                ? null
                                                : () => _purgeOrganization(
                                                    organization,
                                                  ),
                                            icon: const Icon(
                                              Icons.delete_forever_outlined,
                                            ),
                                          ),
                                      ],
                                    )
                                  : null,
                            ),
                          );
                        },
                      ),
                    ),
            ),
            if (_saving) const LinearProgressIndicator(),
          ],
        ),
      ),
    );
  }
}

class _OrganizationFormDialog extends StatefulWidget {
  const _OrganizationFormDialog({
    required this.organizations,
    required this.organization,
    required this.isOwner,
  });

  final List<Map<String, dynamic>> organizations;
  final Map<String, dynamic>? organization;
  final bool isOwner;

  @override
  State<_OrganizationFormDialog> createState() =>
      _OrganizationFormDialogState();
}

class _OrganizationFormDialogState extends State<_OrganizationFormDialog> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _code;
  late final TextEditingController _name;
  late String _type;
  late String _parentId;
  late String _destinationId;
  late bool _active;
  late bool _overrideHierarchy;
  late bool _createAccount;

  bool get _editing => widget.organization != null;

  @override
  void initState() {
    super.initState();
    final organization = widget.organization;
    _code = TextEditingController(text: '${organization?['code'] ?? ''}');
    _name = TextEditingController(text: '${organization?['name'] ?? ''}');
    _type = _organizationTypes.containsKey(organization?['type'])
        ? organization!['type'] as String
        : 'department';
    final parentId = organization?['parentOrganizationId']?.toString() ?? '';
    _parentId =
        widget.organizations.any(
          (item) =>
              item['id']?.toString() == parentId &&
              parentId != organization?['id']?.toString(),
        )
        ? parentId
        : '';
    final destinationId =
        organization?['telegramDestinationOrganizationId']?.toString() ?? '';
    _destinationId =
        widget.organizations.any(
          (item) => item['id']?.toString() == destinationId,
        )
        ? destinationId
        : '';
    _active = organization?['isActive'] != false;
    _overrideHierarchy = false;
    _createAccount = true;
  }

  @override
  void dispose() {
    _code.dispose();
    _name.dispose();
    super.dispose();
  }

  String? _requiredText(String? value, String label, {int min = 2}) {
    if (value == null || value.trim().length < min) {
      return 'أدخل $label (حرفان على الأقل).';
    }
    return null;
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    final payload = <String, dynamic>{
      'code': _code.text.trim().toUpperCase(),
      'name': _name.text.trim(),
      'type': _type,
      'parentOrganizationId': _parentId.isEmpty ? null : _parentId,
      'telegramDestinationOrganizationId': _destinationId.isEmpty
          ? null
          : _destinationId,
      'allowHierarchyOverride': widget.isOwner && _overrideHierarchy,
    };
    if (_editing) {
      payload['isActive'] = _active;
    } else {
      payload['createAccount'] = _createAccount;
    }
    Navigator.pop(context, payload);
  }

  @override
  Widget build(BuildContext context) {
    final organizationId = widget.organization?['id']?.toString();
    final parentOptions = widget.organizations
        .where((item) => item['id']?.toString() != organizationId)
        .toList();
    return Directionality(
      textDirection: TextDirection.rtl,
      child: AlertDialog(
        title: Text(_editing ? 'تعديل الجهة' : 'إنشاء جهة جديدة'),
        content: SizedBox(
          width: (MediaQuery.sizeOf(context).width - 64).clamp(0.0, 480.0),
          child: SingleChildScrollView(
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextFormField(
                    controller: _code,
                    textCapitalization: TextCapitalization.characters,
                    decoration: const InputDecoration(
                      labelText: 'رمز الجهة',
                      hintText: 'POLICE-01',
                    ),
                    validator: (value) => _requiredText(value, 'رمز الجهة'),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _name,
                    decoration: const InputDecoration(labelText: 'اسم الجهة'),
                    validator: (value) => _requiredText(value, 'اسم الجهة'),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: _type,
                    decoration: const InputDecoration(labelText: 'نوع الجهة'),
                    items: _organizationTypes.entries
                        .map(
                          (entry) => DropdownMenuItem(
                            value: entry.key,
                            child: Text(entry.value),
                          ),
                        )
                        .toList(),
                    onChanged: (value) {
                      if (value != null) setState(() => _type = value);
                    },
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: _parentId,
                    decoration: const InputDecoration(labelText: 'الجهة الأب'),
                    items: [
                      const DropdownMenuItem(
                        value: '',
                        child: Text('بدون جهة أب'),
                      ),
                      ...parentOptions.map(
                        (item) => DropdownMenuItem(
                          value: '${item['id']}',
                          child: Text(
                            '${item['name']} (${item['code']})',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                    ],
                    onChanged: (value) {
                      if (value != null) setState(() => _parentId = value);
                    },
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: _destinationId,
                    decoration: const InputDecoration(
                      labelText: 'جهة استلام البرقيات (اختياري)',
                    ),
                    items: [
                      const DropdownMenuItem(
                        value: '',
                        child: Text('استخدم الجهة الأب الافتراضية'),
                      ),
                      ...widget.organizations.map(
                        (item) => DropdownMenuItem(
                          value: '${item['id']}',
                          child: Text(
                            '${item['name']} (${item['code']})',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                    ],
                    onChanged: (value) {
                      if (value != null) {
                        setState(() => _destinationId = value);
                      }
                    },
                  ),
                  if (_editing) ...[
                    const SizedBox(height: 8),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('الجهة نشطة'),
                      value: _active,
                      onChanged: (value) => setState(() => _active = value),
                    ),
                  ] else ...[
                    const SizedBox(height: 8),
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('إنشاء حساب للجهة'),
                      subtitle: const Text(
                        'ستظهر بيانات الدخول مرة واحدة بعد الإنشاء.',
                      ),
                      value: _createAccount,
                      onChanged: (value) {
                        setState(() => _createAccount = value ?? false);
                      },
                    ),
                  ],
                  if (widget.isOwner)
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('السماح بتجاوز التسلسل التنظيمي'),
                      subtitle: const Text(
                        'فعّله فقط عند الحاجة إلى ربط تنظيمي استثنائي.',
                      ),
                      value: _overrideHierarchy,
                      onChanged: (value) {
                        setState(() => _overrideHierarchy = value ?? false);
                      },
                    ),
                ],
              ),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: _submit,
            child: Text(_editing ? 'حفظ التعديلات' : 'إنشاء الجهة'),
          ),
        ],
      ),
    );
  }
}
