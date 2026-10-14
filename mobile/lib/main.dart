import 'dart:io';

import 'package:flutter/material.dart';

import 'api.dart';
import 'app_update_page.dart';
import 'mobile_pages.dart';
import 'native_operations_page.dart';
import 'native_user_management_page.dart';
import 'push_notifications.dart';
import 'telegram_actions.dart';
import 'telegram_csv_page.dart';
import 'telegram_edit_dialog.dart';

const navy = Color(0xFF101C35);
const gold = Color(0xFFC9A45C);
const canvas = Color(0xFFF5F7FA);

void main() => runApp(const PoliceTelegramsApp());

class PoliceTelegramsApp extends StatelessWidget {
  const PoliceTelegramsApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'برقيات الشرطة',
    theme: ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: canvas,
      colorScheme: ColorScheme.fromSeed(
        seedColor: navy,
        primary: navy,
        secondary: gold,
        surface: const Color(0xFFFFFEFC),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: navy,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: Colors.white,
          fontSize: 18,
          fontWeight: FontWeight.w800,
        ),
      ),
      cardTheme: CardThemeData(
        color: const Color(0xFFFFFEFC),
        elevation: 0,
        margin: const EdgeInsets.symmetric(vertical: 6),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: Color(0xFFE5E7EB)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0xFFFAFAF8),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFFD9DEE7)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFFD9DEE7)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: gold, width: 1.5),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: navy,
          foregroundColor: Colors.white,
          minimumSize: const Size(48, 48),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      navigationBarTheme: const NavigationBarThemeData(
        backgroundColor: Color(0xFFFFFEFC),
        indicatorColor: Color(0xFFF1E8D5),
        labelTextStyle: WidgetStatePropertyAll(
          TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: Color(0xFFE5E7EB),
        thickness: 1,
      ),
    ),
    home: const LoginPage(),
  );
}

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final username = TextEditingController();
  final password = TextEditingController();
  final api = PoliceApi();
  bool busy = false;
  String? error;

  Future<void> login() async {
    if (username.text.trim().isEmpty || password.text.isEmpty) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final account = await api.login(username.text.trim(), password.text);
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => DashboardPage(api: api, account: account),
        ),
      );
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(22),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    Container(
                      width: 78,
                      height: 78,
                      decoration: const BoxDecoration(
                        color: navy,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.shield_outlined,
                        color: gold,
                        size: 42,
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'برقيات الشرطة',
                      style: TextStyle(
                        color: navy,
                        fontSize: 27,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'منصة رسمية آمنة لإدارة البرقيات والعمليات',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 26),
                    TextField(
                      controller: username,
                      textDirection: TextDirection.ltr,
                      decoration: const InputDecoration(
                        labelText: 'اسم المستخدم',
                        prefixIcon: Icon(Icons.person_outline),
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 13),
                    TextField(
                      controller: password,
                      obscureText: true,
                      textDirection: TextDirection.ltr,
                      onSubmitted: (_) => login(),
                      decoration: const InputDecoration(
                        labelText: 'كلمة المرور',
                        prefixIcon: Icon(Icons.lock_outline),
                        border: OutlineInputBorder(),
                      ),
                    ),
                    if (error != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Text(
                          error!,
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Colors.red),
                        ),
                      ),
                    const SizedBox(height: 20),
                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: FilledButton.icon(
                        onPressed: busy ? null : login,
                        icon: busy
                            ? const SizedBox.square(
                                dimension: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.login),
                        label: Text(busy ? 'جارٍ التحقق...' : 'تسجيل الدخول'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key, required this.api, required this.account});
  final PoliceApi api;
  final Map<String, dynamic> account;
  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  bool loading = true;
  String? error;
  Map<String, dynamic> stats = {};
  List<dynamic> telegrams = [];
  int section = 0;
  String searchQuery = '';
  final push = PushNotificationService();

  @override
  void initState() {
    super.initState();
    refresh();
    push.initialize(
      onToken: _registerPushToken,
      onTelegramOpened: _openIncomingTelegram,
      onForegroundTelegram: (_) {
        refresh();
      },
    );
  }

  Future<void> _registerPushToken(String token) async {
    try {
      await widget.api.call(
        'notifications.registerMobileToken',
        input: {'token': token, 'platform': Platform.isIOS ? 'ios' : 'android'},
      );
    } catch (_) {
      // A temporary registration failure must not block the user interface.
    }
  }

  Future<void> _openIncomingTelegram(int telegramId) async {
    await refresh();
    if (!mounted) return;
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) =>
            TelegramDetailsPage(api: widget.api, telegramId: telegramId),
      ),
    );
    if (mounted) await refresh();
  }

  @override
  void dispose() {
    push.dispose();
    super.dispose();
  }

  Future<void> refresh() async {
    if (!mounted) return;
    setState(() => loading = true);
    try {
      final results = await Future.wait([
        widget.api.call('dashboard.stats'),
        widget.api.call('telegrams.list', input: {'page': 1, 'pageSize': 20}),
      ]);
      final list = results[1];
      if (mounted) {
        setState(() {
          stats = Map<String, dynamic>.from(results[0] as Map);
          telegrams = list is Map && list['items'] is List
              ? list['items'] as List
              : list is List
              ? list
              : [];
          error = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> create() async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => CreateTelegramSheet(api: widget.api),
    );
    if (result == true) refresh();
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(
        backgroundColor: navy,
        foregroundColor: Colors.white,
        title: const Text(
          'لوحة البرقيات',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
        actions: [
          IconButton(
            tooltip: 'تحديث التطبيق',
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const AppUpdatePage()),
            ),
            icon: const Icon(Icons.system_update_alt),
          ),
          IconButton(onPressed: refresh, icon: const Icon(Icons.refresh)),
          IconButton(
            onPressed: () async {
              final navigator = Navigator.of(context);

              // Remove the device token while the authenticated session is
              // still available. Logout must remain possible if push cleanup
              // fails because the device is offline or Firebase is unavailable.
              try {
                final token = await push.currentToken();
                if (token != null) {
                  await widget.api.call(
                    'notifications.unregisterMobileToken',
                    mutation: true,
                    input: {'token': token},
                  );
                }
              } catch (_) {
                // Continue with local logout even if remote token cleanup fails.
              }

              try {
                await widget.api.logout();
              } catch (_) {
                // PoliceApi.logout clears the locally stored session in finally.
              }
              if (!mounted) return;
              navigator.pushReplacement(
                MaterialPageRoute(builder: (_) => const LoginPage()),
              );
            },
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      drawer: Drawer(
        child: SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                color: navy,
                padding: const EdgeInsets.fromLTRB(20, 24, 20, 22),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.shield_outlined, color: gold, size: 36),
                    const SizedBox(height: 10),
                    const Text(
                      'برقيات الشرطة',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${widget.account['name'] ?? widget.account['username'] ?? ''}',
                      style: const TextStyle(color: Colors.white70),
                    ),
                  ],
                ),
              ),
              ListTile(
                leading: const Icon(Icons.dashboard_outlined),
                title: const Text('لوحة التحكم'),
                selected: section == 0,
                onTap: () {
                  Navigator.pop(context);
                  setState(() => section = 0);
                },
              ),
              ListTile(
                leading: const Icon(Icons.call_made_outlined),
                title: const Text('البرقيات الصادرة'),
                selected: section == 1,
                onTap: () {
                  Navigator.pop(context);
                  setState(() => section = 1);
                },
              ),
              ListTile(
                leading: const Icon(Icons.call_received_outlined),
                title: const Text('البرقيات الواردة'),
                selected: section == 2,
                onTap: () {
                  Navigator.pop(context);
                  setState(() => section = 2);
                },
              ),
              const Divider(),
              ListTile(
                leading: const Icon(Icons.map_outlined),
                title: const Text('المواقع والوحدات والموارد والأرشيف'),
                subtitle: const Text('متابعة العمل الميداني'),
                onTap: () {
                  Navigator.pop(context);
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => NativeOperationsPage(api: widget.api),
                    ),
                  );
                },
              ),
              if (widget.account['role'] == 'admin') ...[
                ListTile(
                  leading: const Icon(Icons.manage_accounts_outlined),
                  title: const Text('إدارة المستخدمين'),
                  subtitle: const Text('حسابات الجهات والصلاحيات'),
                  onTap: () {
                    Navigator.pop(context);
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) =>
                            NativeUserManagementPage(api: widget.api),
                      ),
                    );
                  },
                ),
              ],
              ListTile(
                leading: const Icon(Icons.notifications_none),
                title: const Text('الإشعارات'),
                onTap: () {
                  Navigator.pop(context);
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => NotificationsPage(api: widget.api),
                    ),
                  );
                },
              ),
              ListTile(
                leading: const Icon(Icons.assessment_outlined),
                title: const Text('التقارير'),
                onTap: () {
                  Navigator.pop(context);
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => ReportsPage(api: widget.api),
                    ),
                  );
                },
              ),
              ListTile(
                leading: const Icon(Icons.file_download_outlined),
                title: const Text('استيراد وتصدير السجل'),
                subtitle: const Text('ملفات CSV متوافقة مع سجل البرقيات'),
                onTap: () {
                  Navigator.pop(context);
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => TelegramCsvPage(api: widget.api),
                    ),
                  );
                },
              ),
              ListTile(
                leading: const Icon(Icons.settings_outlined),
                title: const Text('الإعدادات والملف الشخصي'),
                onTap: () {
                  Navigator.pop(context);
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => ProfileSettingsPage(api: widget.api),
                    ),
                  );
                },
              ),
            ],
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: gold,
        foregroundColor: navy,
        onPressed: create,
        icon: const Icon(Icons.add),
        label: const Text('برقية جديدة'),
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(onRefresh: refresh, child: _sectionBody()),
      bottomNavigationBar: NavigationBar(
        selectedIndex: section,
        onDestinationSelected: (index) {
          if (index < 3) {
            setState(() => section = index);
            return;
          }
          final page = switch (index) {
            3 => NotificationsPage(api: widget.api),
            4 => ReportsPage(api: widget.api),
            _ => ProfileSettingsPage(api: widget.api),
          };
          Navigator.push(context, MaterialPageRoute(builder: (_) => page));
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: 'الرئيسية',
          ),
          NavigationDestination(
            icon: Icon(Icons.call_made_outlined),
            selectedIcon: Icon(Icons.call_made),
            label: 'الصادرة',
          ),
          NavigationDestination(
            icon: Icon(Icons.call_received_outlined),
            selectedIcon: Icon(Icons.call_received),
            label: 'الواردة',
          ),
          NavigationDestination(
            icon: Icon(Icons.notifications_none),
            selectedIcon: Icon(Icons.notifications),
            label: 'الإشعارات',
          ),
          NavigationDestination(
            icon: Icon(Icons.assessment_outlined),
            selectedIcon: Icon(Icons.assessment),
            label: 'التقارير',
          ),
          NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings),
            label: 'الإعدادات',
          ),
        ],
      ),
    ),
  );

  Widget _sectionBody() {
    if (section == 0) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (error != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Text(error!, style: const TextStyle(color: Colors.red)),
              ),
            ),
          Text(
            'مرحبًا ${widget.account['name'] ?? widget.account['username'] ?? ''}',
            style: const TextStyle(
              color: navy,
              fontSize: 20,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 13),
          Row(
            children: [
              _stat(
                'الإجمالي',
                stats['total'] ?? stats['totalTelegrams'] ?? 0,
                Icons.description_outlined,
              ),
              _stat(
                'قيد المراجعة',
                stats['inReview'] ?? stats['pending'] ?? 0,
                Icons.pending_actions_outlined,
              ),
              _stat(
                'مكتملة',
                stats['completed'] ?? stats['approved'] ?? 0,
                Icons.verified_outlined,
              ),
            ],
          ),
          const SizedBox(height: 20),
          const Text(
            'آخر البرقيات',
            style: TextStyle(
              color: navy,
              fontSize: 18,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 8),
          _searchField(),
          const SizedBox(height: 10),
          _telegramCards(telegrams),
        ],
      );
    }
    final incoming = section == 2;
    final rows = telegrams
        .where(
          (item) =>
              _isIncoming(Map<String, dynamic>.from(item as Map)) == incoming,
        )
        .toList();
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          incoming ? 'البرقيات الواردة' : 'البرقيات الصادرة',
          style: const TextStyle(
            color: navy,
            fontSize: 22,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 5),
        Text(
          incoming
              ? 'البرقيات المحالة إلى جهتك الشرطية'
              : 'البرقيات التي أنشأتها جهتك الشرطية',
          style: const TextStyle(color: Colors.black54),
        ),
        const SizedBox(height: 14),
        _searchField(),
        const SizedBox(height: 10),
        _telegramCards(rows),
      ],
    );
  }

  bool _isIncoming(Map<String, dynamic> row) {
    final direction = '${row['direction'] ?? row['type'] ?? ''}'.toLowerCase();
    if (direction == 'incoming' || direction == 'واردة') return true;
    if (direction == 'outgoing' || direction == 'صادرة') return false;
    return row['organizationId'] != row['currentOrganizationId'];
  }

  Widget _searchField() => TextField(
    textInputAction: TextInputAction.search,
    onChanged: (value) =>
        setState(() => searchQuery = value.trim().toLowerCase()),
    decoration: InputDecoration(
      hintText: 'بحث بالرقم أو الموضوع أو الحالة أو الجهة...',
      prefixIcon: const Icon(Icons.search),
      suffixIcon: searchQuery.isEmpty
          ? null
          : IconButton(
              tooltip: 'مسح البحث',
              onPressed: () => setState(() => searchQuery = ''),
              icon: const Icon(Icons.close),
            ),
    ),
  );

  Widget _telegramCards(List<dynamic> rows) {
    final query = searchQuery.trim().toLowerCase();
    final filteredRows = query.isEmpty
        ? rows
        : rows.where((item) {
            final row = Map<String, dynamic>.from(item as Map);
            final searchable = [
              row['subject'],
              row['serialCode'],
              row['serialNumber'],
              row['status'],
              row['organizationName'],
              row['fromOrganizationName'],
              row['toOrganizationName'],
              row['senderName'],
            ].where((value) => value != null).join(' ').toLowerCase();
            return searchable.contains(query);
          }).toList();

    if (filteredRows.isEmpty) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Center(
            child: Text(
              query.isEmpty
                  ? 'لا توجد برقيات في هذا القسم'
                  : 'لا توجد نتائج مطابقة لعبارة البحث',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
    }
    return Column(
      children: filteredRows.map((item) {
        final row = Map<String, dynamic>.from(item as Map);
        return Card(
          child: ListTile(
            onTap: row['id'] == null
                ? null
                : () async {
                    await Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => TelegramDetailsPage(
                          api: widget.api,
                          telegramId: row['id'] as int,
                        ),
                      ),
                    );
                    if (mounted) await refresh();
                  },
            leading: CircleAvatar(
              backgroundColor: _isIncoming(row) ? navy : gold,
              child: Icon(
                _isIncoming(row) ? Icons.call_received : Icons.call_made,
                color: _isIncoming(row) ? gold : navy,
              ),
            ),
            title: Text(
              '${row['subject'] ?? 'برقية بدون موضوع'}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
            subtitle: Text(
              '${row['serialCode'] ?? row['serialNumber'] ?? '—'} · ${row['status'] ?? 'مسودة'}',
            ),
            trailing: const Icon(Icons.chevron_left),
          ),
        );
      }).toList(),
    );
  }

  Widget _stat(String title, dynamic value, IconData icon) => Expanded(
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            Icon(icon, color: gold),
            const SizedBox(height: 7),
            Text(
              '$value',
              style: const TextStyle(
                color: navy,
                fontSize: 21,
                fontWeight: FontWeight.w900,
              ),
            ),
            Text(title, style: const TextStyle(fontSize: 10)),
          ],
        ),
      ),
    ),
  );
}

class TelegramDetailsPage extends StatefulWidget {
  const TelegramDetailsPage({
    super.key,
    required this.api,
    required this.telegramId,
  });
  final PoliceApi api;
  final int telegramId;
  @override
  State<TelegramDetailsPage> createState() => _TelegramDetailsPageState();
}

class _TelegramDetailsPageState extends State<TelegramDetailsPage> {
  bool loading = true;
  String? error;
  Map<String, dynamic>? telegram;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final data = await widget.api.call(
        'telegrams.get',
        input: {'id': widget.telegramId},
      );
      if (mounted) {
        setState(() => telegram = Map<String, dynamic>.from(data as Map));
      }
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _editTelegram() async {
    final currentTelegram = telegram;
    if (currentTelegram == null) return;

    final saved = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => TelegramEditDialog(
        api: widget.api,
        telegramId: widget.telegramId,
        telegram: currentTelegram,
      ),
    );

    if (saved != true || !mounted) return;
    await load();
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('تم حفظ تعديلات البرقية.')));
  }

  Future<void> _deleteTelegram() async {
    final confirmed = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => Directionality(
        textDirection: TextDirection.rtl,
        child: AlertDialog(
          title: const Text('حذف البرقية نهائياً'),
          content: const Text(
            'سيتم حذف البرقية وسجلها والمرفقات المرتبطة بها نهائياً. '
            'لا يمكن التراجع عن هذا الإجراء.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('إلغاء'),
            ),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: Colors.red),
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: const Text('حذف نهائي'),
            ),
          ],
        ),
      ),
    );
    if (confirmed != true || !mounted) return;

    try {
      await widget.api.call(
        'telegrams.delete',
        mutation: true,
        input: {'id': widget.telegramId},
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (exception) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(exception.toString().replaceFirst('Exception: ', '')),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = telegram;
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(
          backgroundColor: navy,
          foregroundColor: Colors.white,
          title: const Text(
            'تفاصيل البرقية',
            style: TextStyle(fontWeight: FontWeight.w900),
          ),
          actions: [
            IconButton(
              tooltip: 'تعديل البرقية',
              onPressed: loading || data == null ? null : _editTelegram,
              icon: const Icon(Icons.edit_outlined),
            ),
            IconButton(
              tooltip: 'حذف البرقية نهائياً',
              onPressed: loading || data == null ? null : _deleteTelegram,
              icon: const Icon(Icons.delete_outline, color: Colors.redAccent),
            ),
          ],
        ),
        body: loading
            ? const Center(child: CircularProgressIndicator())
            : error != null
            ? Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    error!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.red),
                  ),
                ),
              )
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      color: navy,
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          '${data?['serialCode'] ?? data?['serialNumber'] ?? '—'}',
                          style: const TextStyle(
                            color: gold,
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          '${data?['subject'] ?? 'بدون موضوع'}',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Align(
                          alignment: Alignment.centerRight,
                          child: Chip(
                            label: Text('${data?['status'] ?? 'غير محددة'}'),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  _infoCard('بيانات البرقية', [
                    _infoRow(
                      'الجهة المرسلة',
                      data?['senderOrganizationName'] ??
                          data?['organizationName'] ??
                          '—',
                    ),
                    _infoRow('الجهة المستلمة', data?['recipient'] ?? '—'),
                    _infoRow('الأولوية', data?['priority'] ?? 'normal'),
                    _infoRow('التصنيف', data?['classification'] ?? 'normal'),
                    _infoRow('الفئة', data?['category'] ?? 'administrative'),
                    _infoRow('تاريخ الإنشاء', data?['createdAt'] ?? '—'),
                  ]),
                  const SizedBox(height: 12),
                  _infoCard('نص البرقية', [
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        '${data?['body'] ?? 'لا يوجد نص'}',
                        style: const TextStyle(fontSize: 15, height: 1.7),
                      ),
                    ),
                  ]),
                  const SizedBox(height: 12),
                  TelegramActionsPanel(
                    api: widget.api,
                    telegramId: widget.telegramId,
                    onChanged: load,
                  ),
                ],
              ),
      ),
    );
  }

  Widget _infoCard(String title, List<Widget> children) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: navy,
              fontSize: 17,
              fontWeight: FontWeight.w900,
            ),
          ),
          ...children,
        ],
      ),
    ),
  );
  Widget _infoRow(String label, dynamic value) => Padding(
    padding: const EdgeInsets.only(top: 10),
    child: Row(
      children: [
        SizedBox(
          width: 125,
          child: Text(
            label,
            style: const TextStyle(color: Colors.black54, fontSize: 12),
          ),
        ),
        Expanded(
          child: Text(
            '$value',
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
      ],
    ),
  );
}

class CreateTelegramSheet extends StatefulWidget {
  const CreateTelegramSheet({super.key, required this.api});
  final PoliceApi api;
  @override
  State<CreateTelegramSheet> createState() => _CreateTelegramSheetState();
}

class _CreateTelegramSheetState extends State<CreateTelegramSheet> {
  final subject = TextEditingController();
  final recipient = TextEditingController();
  final body = TextEditingController();
  bool busy = false;
  String priority = 'normal';
  String? error;

  Future<void> submit() async {
    if (subject.text.trim().length < 2 ||
        recipient.text.trim().length < 2 ||
        body.text.trim().length < 3) {
      setState(() => error = 'أكمل الموضوع والجهة ونص البرقية');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.api.call(
        'telegrams.create',
        mutation: true,
        input: {
          'subject': subject.text.trim(),
          'recipient': recipient.text.trim(),
          'body': body.text.trim(),
          'classification': 'normal',
          'priority': priority,
          'category': 'administrative',
        },
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Padding(
      padding: EdgeInsets.only(
        left: 18,
        right: 18,
        top: 18,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 18,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'إنشاء برقية جديدة',
                    style: TextStyle(
                      color: navy,
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            TextField(
              controller: subject,
              decoration: const InputDecoration(
                labelText: 'موضوع البرقية',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: recipient,
              decoration: const InputDecoration(
                labelText: 'الجهة المستلمة',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: priority,
              decoration: const InputDecoration(
                labelText: 'الأولوية',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(value: 'normal', child: Text('عادية')),
                DropdownMenuItem(value: 'urgent', child: Text('عاجلة')),
                DropdownMenuItem(value: 'slow', child: Text('بطيئة')),
              ],
              onChanged: (v) => setState(() => priority = v!),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: body,
              maxLines: 7,
              decoration: const InputDecoration(
                labelText: 'نص البرقية',
                alignLabelWithHint: true,
                border: OutlineInputBorder(),
              ),
            ),
            if (error != null)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(error!, style: const TextStyle(color: Colors.red)),
              ),
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: busy ? null : submit,
              icon: const Icon(Icons.send),
              label: Text(busy ? 'جارٍ الإرسال...' : 'إرسال البرقية'),
            ),
          ],
        ),
      ),
    ),
  );
}
