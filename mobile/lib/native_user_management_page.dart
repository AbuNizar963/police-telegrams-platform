import 'dart:async';

import 'package:flutter/material.dart';

import 'api.dart';

const _userNavy = Color(0xFF10233F);
const _userGold = Color(0xFFD8C38E);

const _roles = <String, String>{
  'dispatcher': 'موظف تشغيل',
  'reviewer': 'مراجع',
  'reader': 'قارئ',
  'auditor': 'مدقق',
  'organization_supervisor': 'مشرف جهة',
  'organization_admin': 'مدير جهة',
  'regional_admin': 'مدير منطقة',
};

class NativeUserManagementPage extends StatefulWidget {
  const NativeUserManagementPage({super.key, required this.api});

  final PoliceApi api;

  @override
  State<NativeUserManagementPage> createState() =>
      _NativeUserManagementPageState();
}

class _NativeUserManagementPageState extends State<NativeUserManagementPage> {
  bool _loading = true;
  bool _saving = false;
  String? _error;
  String _search = '';
  int _page = 1;
  int _totalPages = 1;
  List<Map<String, dynamic>> _users = [];
  List<Map<String, dynamic>> _organizations = [];
  Timer? _searchDebounce;
  int _loadGeneration = 0;

  @override
  void initState() {
    super.initState();
    load();
  }

  List<Map<String, dynamic>> _rows(dynamic value) {
    final source = value is Map && value['items'] is List
        ? value['items'] as List
        : value is List
        ? value
        : const [];
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
    final generation = ++_loadGeneration;
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final results = await Future.wait([
        widget.api.call(
          'userManagement.list',
          input: {'page': _page, 'pageSize': 25, 'search': _search.trim()},
        ),
        widget.api.call('organizations.all'),
      ]);
      if (!mounted || generation != _loadGeneration) return;
      final userResult = results[0];
      setState(() {
        _users = _rows(userResult);
        _organizations = _rows(results[1]);
        _totalPages = userResult is Map
            ? int.tryParse('${userResult['totalPages']}') ?? 1
            : 1;
      });
    } catch (exception) {
      if (mounted && generation == _loadGeneration) {
        setState(() {
          _error = exception.toString().replaceFirst('Exception: ', '');
        });
      }
    } finally {
      if (mounted && generation == _loadGeneration) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    setState(() {
      _search = value;
      _page = 1;
    });
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) load();
    });
  }

  Future<String?> _confirmPassword(String title) async {
    final controller = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) => Directionality(
        textDirection: TextDirection.rtl,
        child: AlertDialog(
          title: Text(title),
          content: TextField(
            controller: controller,
            obscureText: true,
            autofocus: true,
            decoration: const InputDecoration(labelText: 'كلمة المرور الحالية'),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('إلغاء'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, controller.text),
              child: const Text('تأكيد'),
            ),
          ],
        ),
      ),
    );
    controller.dispose();
    if (result == null || result.isEmpty) return null;
    return result;
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

  Future<void> _createUser() async {
    if (_organizations.isEmpty) {
      _showMessage('لا توجد جهات متاحة لإنشاء حساب.');
      return;
    }
    final form = await showDialog<Map<String, dynamic>>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _UserFormDialog(organizations: _organizations),
    );
    if (form == null) return;
    await _run(() async {
      await widget.api.call(
        'userManagement.create',
        mutation: true,
        input: form,
      );
      _showMessage('تم إنشاء الحساب بنجاح.');
    });
  }

  Future<void> _editUser(Map<String, dynamic> user) async {
    final form = await showDialog<Map<String, dynamic>>(
      context: context,
      barrierDismissible: false,
      builder: (_) =>
          _UserFormDialog(organizations: _organizations, user: user),
    );
    if (form == null) return;
    final password = form['password'] as String? ?? '';
    final role = form['role'] as String;
    final roleChanged = role != (user['membershipRole'] ?? 'dispatcher');
    String? confirmPassword;
    if (password.isNotEmpty || roleChanged) {
      confirmPassword = await _confirmPassword(
        'تأكيد تغيير الصلاحية أو كلمة المرور',
      );
      if (confirmPassword == null) return;
    }
    await _run(() async {
      await widget.api.call(
        'userManagement.update',
        mutation: true,
        input: {
          'id': user['id'],
          ...form,
          'password': password,
          'confirmPassword': ?confirmPassword,
        },
      );
      _showMessage('تم تحديث بيانات الحساب.');
    });
  }

  Future<void> _disableUser(Map<String, dynamic> user) async {
    final accepted = await _confirmAction(
      title: 'تعطيل الحساب',
      message:
          'سيتم تعطيل الحساب مع الاحتفاظ ببرقياته وسجلاته. '
          'يمكن إعادة تفعيله لاحقًا.',
    );
    if (!accepted) return;
    final password = await _confirmPassword('تأكيد تعطيل الحساب');
    if (password == null) return;
    await _run(() async {
      await widget.api.call(
        'userManagement.disable',
        mutation: true,
        input: {'id': user['id'], 'confirmPassword': password},
      );
      _showMessage('تم تعطيل الحساب مع الحفاظ على سجلاته.');
    });
  }

  Future<void> _enableUser(Map<String, dynamic> user) async {
    final form = await showDialog<Map<String, String>>(
      context: context,
      builder: (_) => const _EnableUserDialog(),
    );
    if (form == null) return;
    await _run(() async {
      await widget.api.call(
        'userManagement.enable',
        mutation: true,
        input: {
          'id': user['id'],
          'password': form['password'],
          'confirmPassword': form['confirmPassword'],
        },
      );
      _showMessage('تمت إعادة تفعيل الحساب.');
    });
  }

  Future<void> _deleteUser(Map<String, dynamic> user) async {
    final accepted = await _confirmAction(
      title: 'حذف الحساب نهائيًا',
      message:
          'قد يرفض الخادم الحذف إذا كان الحساب مرتبطًا ببرقيات أو سجلات تدقيق. '
          'لن تُحذف أي برقيات تلقائيًا.',
    );
    if (!accepted) return;
    final password = await _confirmPassword('تأكيد الحذف النهائي');
    if (password == null) return;
    await _run(() async {
      await widget.api.call(
        'userManagement.delete',
        mutation: true,
        input: {'id': user['id'], 'confirmPassword': password},
      );
      _showMessage('تم حذف الحساب.');
    });
  }

  Future<bool> _confirmAction({
    required String title,
    required String message,
  }) async =>
      await showDialog<bool>(
        context: context,
        builder: (dialogContext) => Directionality(
          textDirection: TextDirection.rtl,
          child: AlertDialog(
            title: Text(title),
            content: Text(message),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('إلغاء'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(dialogContext, true),
                child: const Text('متابعة'),
              ),
            ],
          ),
        ),
      ) ??
      false;

  void _showMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFFF8F7F2),
        foregroundColor: _userNavy,
        title: const Text(
          'إدارة المستخدمين',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
        actions: [
          IconButton(
            tooltip: 'تحديث',
            onPressed: _loading || _saving ? null : load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: _userGold,
        foregroundColor: _userNavy,
        onPressed: _loading || _saving ? null : _createUser,
        icon: const Icon(Icons.person_add_alt_1),
        label: const Text('إضافة حساب'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: TextField(
              onChanged: _onSearchChanged,
              decoration: InputDecoration(
                hintText: 'بحث بالاسم أو اسم المستخدم أو الرقم الوظيفي',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _search.isEmpty
                    ? null
                    : IconButton(
                        onPressed: () {
                          _searchDebounce?.cancel();
                          setState(() {
                            _search = '';
                            _page = 1;
                          });
                          load();
                        },
                        icon: const Icon(Icons.close),
                      ),
              ),
            ),
          ),
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
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : RefreshIndicator(
                    onRefresh: load,
                    child: _users.isEmpty
                        ? ListView(
                            children: const [
                              SizedBox(height: 90),
                              Icon(Icons.people_outline, size: 44),
                              SizedBox(height: 12),
                              Center(child: Text('لا توجد حسابات مطابقة.')),
                            ],
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.fromLTRB(12, 4, 12, 90),
                            itemCount: _users.length,
                            itemBuilder: (context, index) {
                              final user = _users[index];
                              return _userCard(user);
                            },
                          ),
                  ),
          ),
          if (!_loading && _totalPages > 1)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  OutlinedButton(
                    onPressed: _page > 1 && !_saving
                        ? () {
                            setState(() => _page--);
                            load();
                          }
                        : null,
                    child: const Text('السابق'),
                  ),
                  Text('صفحة $_page من $_totalPages'),
                  OutlinedButton(
                    onPressed: _page < _totalPages && !_saving
                        ? () {
                            setState(() => _page++);
                            load();
                          }
                        : null,
                    child: const Text('التالي'),
                  ),
                ],
              ),
            ),
        ],
      ),
    ),
  );

  Widget _userCard(Map<String, dynamic> user) {
    final disabled = user['loginMethod'] == 'disabled';
    final isOwner = user['role'] == 'admin';
    final id = int.tryParse('${user['id']}');
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CircleAvatar(
                  backgroundColor: disabled
                      ? Colors.grey.shade200
                      : const Color(0xFFF1E8D5),
                  child: Icon(
                    disabled ? Icons.person_off_outlined : Icons.person_outline,
                    color: _userNavy,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _text(user['name'], 'حساب بلا اسم'),
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                      Text(
                        '@${_text(user['username'])}',
                        textDirection: TextDirection.ltr,
                        textAlign: TextAlign.right,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _text(user['organizationName'], 'دون جهة محددة'),
                        style: const TextStyle(color: Colors.black54),
                      ),
                      Text(
                        '${_text(user['rank'])} · '
                        '${_text(user['badgeNumber'])}',
                        style: const TextStyle(
                          fontSize: 12,
                          color: Colors.black54,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 6),
                Chip(
                  label: Text(
                    isOwner
                        ? 'مالك النظام'
                        : disabled
                        ? 'معطّل'
                        : _roles[user['membershipRole']] ?? 'حساب جهة',
                  ),
                  backgroundColor: disabled
                      ? Colors.grey.shade200
                      : const Color(0xFFF1E8D5),
                ),
              ],
            ),
            if (!isOwner && id != null) ...[
              const Divider(height: 22),
              Wrap(
                spacing: 6,
                runSpacing: 4,
                alignment: WrapAlignment.end,
                children: [
                  OutlinedButton.icon(
                    onPressed: _saving ? null : () => _editUser(user),
                    icon: const Icon(Icons.edit_outlined, size: 18),
                    label: const Text('تعديل'),
                  ),
                  if (disabled)
                    OutlinedButton.icon(
                      onPressed: _saving ? null : () => _enableUser(user),
                      icon: const Icon(Icons.person_add_alt, size: 18),
                      label: const Text('إعادة تفعيل'),
                    )
                  else
                    OutlinedButton.icon(
                      onPressed: _saving ? null : () => _disableUser(user),
                      icon: const Icon(Icons.person_off_outlined, size: 18),
                      label: const Text('تعطيل'),
                    ),
                  TextButton.icon(
                    onPressed: _saving ? null : () => _deleteUser(user),
                    style: TextButton.styleFrom(foregroundColor: Colors.red),
                    icon: const Icon(Icons.delete_outline, size: 18),
                    label: const Text('حذف'),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _UserFormDialog extends StatefulWidget {
  const _UserFormDialog({required this.organizations, this.user});

  final List<Map<String, dynamic>> organizations;
  final Map<String, dynamic>? user;

  @override
  State<_UserFormDialog> createState() => _UserFormDialogState();
}

class _UserFormDialogState extends State<_UserFormDialog> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _username;
  late final TextEditingController _password;
  late final TextEditingController _badge;
  late final TextEditingController _phone;
  late final TextEditingController _rank;
  late final TextEditingController _unit;
  late String _organizationId;
  late String _role;

  bool get _editing => widget.user != null;

  @override
  void initState() {
    super.initState();
    final user = widget.user;
    _name = TextEditingController(text: '${user?['name'] ?? ''}');
    _username = TextEditingController(text: '${user?['username'] ?? ''}');
    _password = TextEditingController();
    _badge = TextEditingController(text: '${user?['badgeNumber'] ?? ''}');
    _phone = TextEditingController(text: '${user?['phone'] ?? ''}');
    _rank = TextEditingController(text: '${user?['rank'] ?? ''}');
    _unit = TextEditingController(text: '${user?['unit'] ?? ''}');
    _organizationId = '${user?['organizationId'] ?? ''}';
    _role = '${user?['membershipRole'] ?? 'dispatcher'}';
    if (!_roles.containsKey(_role)) _role = 'dispatcher';
    if (!_editing && widget.organizations.isNotEmpty) {
      final active = widget.organizations.where(
        (item) => item['isActive'] == true,
      );
      _organizationId = active.isNotEmpty ? '${active.first['id']}' : '';
    }
  }

  @override
  void dispose() {
    for (final controller in [
      _name,
      _username,
      _password,
      _badge,
      _phone,
      _rank,
      _unit,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  String? _required(String? value, int minimum, String label) {
    if ((value ?? '').trim().length < minimum) {
      return '$label يجب ألا يقل عن $minimum محارف.';
    }
    return null;
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: AlertDialog(
      title: Text(_editing ? 'تعديل بيانات الحساب' : 'إنشاء حساب جهة'),
      content: SizedBox(
        width: 460,
        child: SingleChildScrollView(
          child: Form(
            key: _formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (!_editing)
                  DropdownButtonFormField<String>(
                    initialValue: _organizationId.isEmpty
                        ? null
                        : _organizationId,
                    decoration: const InputDecoration(labelText: 'الجهة'),
                    items: widget.organizations
                        .where((item) => item['isActive'] == true)
                        .map(
                          (item) => DropdownMenuItem(
                            value: '${item['id']}',
                            child: Text('${item['name']}'),
                          ),
                        )
                        .toList(),
                    onChanged: (value) =>
                        setState(() => _organizationId = value ?? ''),
                    validator: (value) =>
                        value == null || value.isEmpty ? 'اختر الجهة.' : null,
                  ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _name,
                  decoration: const InputDecoration(labelText: 'الاسم الكامل'),
                  validator: (value) => _required(value, 2, 'الاسم'),
                ),
                TextFormField(
                  controller: _username,
                  textDirection: TextDirection.ltr,
                  decoration: const InputDecoration(labelText: 'اسم المستخدم'),
                  validator: (value) => _required(value, 3, 'اسم المستخدم'),
                ),
                if (!_editing)
                  TextFormField(
                    controller: _password,
                    obscureText: true,
                    decoration: const InputDecoration(
                      labelText: 'كلمة المرور المؤقتة (12 محرفًا على الأقل)',
                    ),
                    validator: (value) => _required(value, 12, 'كلمة المرور'),
                  )
                else
                  TextFormField(
                    controller: _password,
                    obscureText: true,
                    decoration: const InputDecoration(
                      labelText: 'كلمة مرور جديدة (اختياري)',
                    ),
                    validator: (value) => (value ?? '').isNotEmpty
                        ? _required(value, 12, 'كلمة المرور')
                        : null,
                  ),
                DropdownButtonFormField<String>(
                  initialValue: _role,
                  decoration: const InputDecoration(labelText: 'الصلاحية'),
                  items: _roles.entries
                      .map(
                        (entry) => DropdownMenuItem(
                          value: entry.key,
                          child: Text(entry.value),
                        ),
                      )
                      .toList(),
                  onChanged: (value) =>
                      setState(() => _role = value ?? 'dispatcher'),
                ),
                TextFormField(
                  controller: _badge,
                  decoration: const InputDecoration(labelText: 'الرقم الوظيفي'),
                ),
                TextFormField(
                  controller: _rank,
                  decoration: const InputDecoration(labelText: 'الرتبة'),
                ),
                TextFormField(
                  controller: _phone,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(labelText: 'رقم الهاتف'),
                ),
                TextFormField(
                  controller: _unit,
                  decoration: const InputDecoration(
                    labelText: 'القسم أو المخفر',
                  ),
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
          onPressed: () {
            if (!_formKey.currentState!.validate()) return;
            Navigator.pop(context, {
              if (!_editing) 'organizationId': _organizationId,
              'name': _name.text.trim(),
              'username': _username.text.trim().toLowerCase(),
              'password': _password.text,
              'badgeNumber': _badge.text.trim().isEmpty
                  ? null
                  : _badge.text.trim(),
              'phone': _phone.text.trim().isEmpty ? null : _phone.text.trim(),
              'rank': _rank.text.trim().isEmpty ? null : _rank.text.trim(),
              'unit': _unit.text.trim().isEmpty ? null : _unit.text.trim(),
              'role': _role,
            });
          },
          child: Text(_editing ? 'حفظ التعديلات' : 'إنشاء الحساب'),
        ),
      ],
    ),
  );
}

class _EnableUserDialog extends StatefulWidget {
  const _EnableUserDialog();

  @override
  State<_EnableUserDialog> createState() => _EnableUserDialogState();
}

class _EnableUserDialogState extends State<_EnableUserDialog> {
  final _password = TextEditingController();
  final _confirmPassword = TextEditingController();

  @override
  void dispose() {
    _password.dispose();
    _confirmPassword.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: AlertDialog(
      title: const Text('إعادة تفعيل الحساب'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _password,
            obscureText: true,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
              labelText: 'كلمة المرور الجديدة (12+)',
            ),
          ),
          TextField(
            controller: _confirmPassword,
            obscureText: true,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
              labelText: 'كلمة المرور الحالية للتأكيد',
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('إلغاء'),
        ),
        FilledButton(
          onPressed: _password.text.length < 12 || _confirmPassword.text.isEmpty
              ? null
              : () => Navigator.pop(context, {
                  'password': _password.text,
                  'confirmPassword': _confirmPassword.text,
                }),
          child: const Text('إعادة التفعيل'),
        ),
      ],
    ),
  );
}
