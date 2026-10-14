import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';

import 'api.dart';
import 'app_update_page.dart';
import 'app_update_service.dart';
import 'mobile_pages.dart';
import 'native_operations_page.dart';
import 'native_organization_management_page.dart';
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
  const PoliceTelegramsApp({super.key, this.api});

  final PoliceApi? api;

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'برقيات الشرطة',
    theme: ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: const Color(0xFFF8F7F2),
      colorScheme: ColorScheme.fromSeed(
        seedColor: navy,
        primary: navy,
        secondary: gold,
        surface: const Color(0xFFFFFEFC),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: Color(0xFFF8F7F2),
        foregroundColor: navy,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: navy,
          fontSize: 18,
          fontWeight: FontWeight.w800,
        ),
      ),
      cardTheme: CardThemeData(
        color: const Color(0xFFFFFEFC),
        elevation: 0,
        margin: const EdgeInsets.symmetric(vertical: 5),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: Color(0xFFE1E5EB)),
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
    home: SessionGate(api: api),
  );
}

class SessionGate extends StatefulWidget {
  const SessionGate({super.key, this.api});

  final PoliceApi? api;

  @override
  State<SessionGate> createState() => _SessionGateState();
}

class _SessionGateState extends State<SessionGate> {
  late final PoliceApi _api;
  late Future<Map<String, dynamic>?> _session;

  @override
  void initState() {
    super.initState();
    _api = widget.api ?? PoliceApi();
    _session = _api.restoreSession();
  }

  Future<void> _returnToLogin() async {
    try {
      await _api.logout();
    } catch (_) {
      // The local session must still be cleared when the server is unreachable.
    } finally {
      if (mounted) {
        setState(() => _session = Future<Map<String, dynamic>?>.value(null));
      }
    }
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>?>(
    future: _session,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) {
        return const Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(
            body: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircularProgressIndicator(color: navy),
                  SizedBox(height: 16),
                  Text('جارٍ التحقق من جلسة الدخول...'),
                ],
              ),
            ),
          ),
        );
      }

      final account = snapshot.data;
      if (account != null) {
        return DashboardPage(api: _api, account: account);
      }

      if (snapshot.hasError) {
        return Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(
            body: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.wifi_off_outlined, size: 42, color: navy),
                    const SizedBox(height: 12),
                    const Text(
                      'تعذر التحقق من جلسة الدخول بسبب مشكلة في الاتصال. تحقق من الإنترنت ثم أعد المحاولة.',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: () =>
                          setState(() => _session = _api.restoreSession()),
                      icon: const Icon(Icons.refresh),
                      label: const Text('إعادة المحاولة'),
                    ),
                    TextButton(
                      onPressed: _returnToLogin,
                      child: const Text('العودة إلى تسجيل الدخول'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      }

      return LoginPage(api: _api);
    },
  );
}

class LoginPage extends StatefulWidget {
  const LoginPage({super.key, this.api});

  final PoliceApi? api;
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final username = TextEditingController();
  final password = TextEditingController();
  late final PoliceApi api = widget.api ?? PoliceApi();
  bool busy = false;
  String? error;

  @override
  void dispose() {
    username.dispose();
    password.dispose();
    super.dispose();
  }

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
                      child: ClipOval(
                        child: Image.asset(
                          'assets/police-telegrams-icon.png',
                          width: 78,
                          height: 78,
                          fit: BoxFit.cover,
                        ),
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
  String? activeOrganizationId;
  int section = 0;
  int telegramPage = 1;
  bool hasNextTelegramPage = false;
  String searchQuery = '';
  final searchController = TextEditingController();
  final push = PushNotificationService();
  Timer? _refreshTimer;
  Timer? _searchDebounce;
  bool _refreshInProgress = false;
  bool _refreshQueued = false;

  @override
  void initState() {
    super.initState();
    refresh();
    _refreshTimer = Timer.periodic(
      const Duration(seconds: 15),
      (_) => refresh(showLoading: false),
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) checkAndPromptForAppUpdate(context);
    });
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
        mutation: true,
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
    _refreshTimer?.cancel();
    _searchDebounce?.cancel();
    searchController.dispose();
    push.dispose();
    super.dispose();
  }

  Future<void> refresh({bool showLoading = true}) async {
    if (!mounted) return;
    if (_refreshInProgress) {
      _refreshQueued = true;
      return;
    }
    _refreshInProgress = true;
    if (showLoading) setState(() => loading = true);
    try {
      final results = await Future.wait([
        widget.api.call('dashboard.stats'),
        widget.api.call('organizations.context').catchError((_) => null),
        widget.api.call(
          'telegrams.list',
          input: {
            'page': telegramPage,
            'pageSize': 20,
            if (searchQuery.trim().isNotEmpty) 'search': searchQuery.trim(),
          },
        ),
      ]);
      final organizationContext = results[1];
      final list = results[2];
      final rows = list is Map && list['items'] is List
          ? list['items'] as List
          : list is List
          ? list
          : <dynamic>[];
      if (mounted) {
        setState(() {
          stats = Map<String, dynamic>.from(results[0] as Map);
          activeOrganizationId = organizationContext is Map
              ? organizationContext['organizationId']?.toString()
              : null;
          telegrams = rows;
          hasNextTelegramPage = rows.length >= 20;
          error = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      _refreshInProgress = false;
      if (mounted && showLoading) setState(() => loading = false);
      if (mounted && _refreshQueued) {
        _refreshQueued = false;
        refresh(showLoading: false);
      }
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
        backgroundColor: const Color(0xFFF8F7F2),
        foregroundColor: navy,
        titleSpacing: 4,
        title: Row(
          children: [
            ClipOval(
              child: Image.asset(
                'assets/police-telegrams-icon.png',
                width: 36,
                height: 36,
                fit: BoxFit.cover,
              ),
            ),
            const SizedBox(width: 9),
            const Flexible(
              child: Text(
                'مركز البرقيات',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontWeight: FontWeight.w900, fontSize: 17),
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'الإشعارات',
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => NotificationsPage(api: widget.api),
              ),
            ),
            icon: const Icon(Icons.notifications_none_rounded),
          ),
          IconButton(
            tooltip: 'تحديث البيانات',
            onPressed: refresh,
            icon: const Icon(Icons.refresh_rounded),
          ),
          IconButton(
            tooltip: 'تسجيل الخروج',
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
        backgroundColor: navy,
        child: SafeArea(
          child: ListTileTheme(
            data: const ListTileThemeData(
              textColor: Colors.white,
              iconColor: Color(0xFFB8C5D6),
              selectedColor: Colors.white,
              selectedTileColor: Color(0xFF12385D),
              subtitleTextStyle: TextStyle(color: Color(0xFFB8C5D6)),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.all(Radius.circular(12)),
              ),
            ),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              children: [
                Container(
                  decoration: const BoxDecoration(
                    color: Color(0xFF07152B),
                    borderRadius: BorderRadius.all(Radius.circular(16)),
                  ),
                  padding: const EdgeInsets.fromLTRB(20, 24, 20, 22),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Image.asset(
                          'assets/police-telegrams-icon.png',
                          width: 48,
                          height: 48,
                          fit: BoxFit.cover,
                        ),
                      ),
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
                    leading: const Icon(Icons.account_tree_outlined),
                    title: const Text('إدارة الجهات'),
                    subtitle: const Text('الهيكل التنظيمي وإنشاء الجهات'),
                    onTap: () {
                      Navigator.pop(context);
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) =>
                              NativeOrganizationManagementPage(api: widget.api),
                        ),
                      );
                    },
                  ),
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
                  ListTile(
                    leading: const Icon(Icons.tune_outlined),
                    title: const Text('إعدادات الجهة'),
                    subtitle: const Text('هوية الجهة والترقيم والتوقيت'),
                    onTap: () {
                      Navigator.pop(context);
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => DepartmentSettingsPage(api: widget.api),
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
                  leading: const Icon(Icons.system_update_alt),
                  title: const Text('تحديث التطبيق'),
                  onTap: () {
                    Navigator.pop(context);
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => const AppUpdatePage(),
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
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: navy,
        foregroundColor: Colors.white,
        elevation: 4,
        onPressed: create,
        icon: const Icon(Icons.add_comment_outlined),
        label: const Text('إنشاء برقية'),
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
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisSpacing: 10,
            mainAxisSpacing: 10,
            childAspectRatio: 1.45,
            children: [
              _stat(
                'إجمالي البرقيات',
                stats['total'] ?? 0,
                Icons.description_outlined,
              ),
              _stat(
                'البرقيات الواردة',
                stats['incoming'] ?? 0,
                Icons.call_received_outlined,
              ),
              _stat(
                'البرقيات الصادرة',
                stats['outgoing'] ?? 0,
                Icons.call_made_outlined,
              ),
              _stat(
                'البرقيات العاجلة',
                stats['urgent'] ?? 0,
                Icons.priority_high_rounded,
              ),
              _stat(
                'قيد المراجعة',
                stats['pending'] ?? 0,
                Icons.pending_actions_outlined,
              ),
              _stat(
                'البرقيات المنجزة',
                stats['resolved'] ?? 0,
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
          const SizedBox(height: 12),
          _paginationControls(),
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
        const SizedBox(height: 12),
        _paginationControls(),
      ],
    );
  }

  bool _isIncoming(Map<String, dynamic> row) {
    final direction = '${row['direction'] ?? row['type'] ?? ''}'
        .trim()
        .toLowerCase();
    if (direction == 'incoming' || direction == 'واردة') return true;
    if (direction == 'outgoing' || direction == 'صادرة') return false;

    final organizationId = activeOrganizationId;
    if (organizationId == null || organizationId.isEmpty) return false;

    final senderOrganizationId = row['organizationId']?.toString();
    final receiverOrganizationId = row['currentOrganizationId']?.toString();
    if (senderOrganizationId == organizationId) return false;
    if (receiverOrganizationId == organizationId) return true;
    return false;
  }

  Widget _searchField() => TextField(
    controller: searchController,
    textInputAction: TextInputAction.search,
    onChanged: (value) {
      setState(() {
        searchQuery = value.trim().toLowerCase();
        telegramPage = 1;
      });
      _searchDebounce?.cancel();
      _searchDebounce = Timer(
        const Duration(milliseconds: 350),
        () => refresh(showLoading: false),
      );
    },
    decoration: InputDecoration(
      hintText: 'بحث بالرقم أو الموضوع أو الحالة أو الجهة...',
      prefixIcon: const Icon(Icons.search),
      suffixIcon: searchQuery.isEmpty
          ? null
          : IconButton(
              tooltip: 'مسح البحث',
              onPressed: () {
                searchController.clear();
                _searchDebounce?.cancel();
                setState(() {
                  searchQuery = '';
                  telegramPage = 1;
                });
                refresh(showLoading: false);
              },
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
              query.isNotEmpty
                  ? 'لا توجد نتائج مطابقة لعبارة البحث في الصفحة الحالية'
                  : section == 0
                  ? 'لا توجد برقيات في هذه الصفحة'
                  : hasNextTelegramPage
                  ? 'لا توجد برقيات مطابقة في هذه الصفحة. انتقل إلى الصفحة التالية للتحقق من بقية النتائج.'
                  : 'لا توجد برقيات في هذا القسم',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
    }
    return Column(
      children: filteredRows.map((item) {
        final row = Map<String, dynamic>.from(item as Map);
        final incoming = _isIncoming(row);
        final serial =
            row['serialCode'] ?? row['serialNumber'] ?? row['number'];
        final rawStatus = '${row['status'] ?? 'draft'}'.toLowerCase();
        final status = switch (rawStatus) {
          'pending' || 'in_review' => 'قيد المراجعة',
          'in_progress' => 'قيد التنفيذ',
          'resolved' || 'completed' => 'منجزة',
          'submitted' => 'مرسلة',
          'forwarded' => 'محالة',
          'returned' => 'معادة',
          'approved' => 'معتمدة',
          'rejected' => 'مرفوضة',
          'archived' => 'مؤرشفة',
          'draft' => 'مسودة',
          _ => rawStatus == 'null' ? 'مسودة' : rawStatus,
        };
        final sender = row['fromOrganizationName'] ??
            row['senderOrganizationName'] ??
            row['senderName'] ??
            row['organizationName'];
        final receiver = row['toOrganizationName'] ??
            row['receiverOrganizationName'] ??
            row['currentOrganizationName'] ??
            row['recipient'];
        final subject = '${row['subject'] ?? 'برقية بدون موضوع'}';
        final creator =
            row['senderName'] ??
            row['creatorName'] ??
            row['createdByName'] ??
            widget.account['name'] ??
            widget.account['username'] ??
            '';
        final rawCategory = row['category'];
        final category = rawCategory == null
            ? null
            : switch ('$rawCategory'.toLowerCase()) {
                'criminal' => 'جنائي',
                'administrative' => 'إداري',
                'traffic' => 'مروري',
                'security' => 'أمني',
                'tactical' => 'تكتيكي',
                'intelligence' => 'استخباراتي',
                'emergency' => 'طوارئ',
                'public_order' => 'حفظ النظام',
                'personnel' => 'شؤون الأفراد',
                'logistics' => 'إمداد ودعم',
                'training' => 'تدريب',
                'community' => 'مجتمعي',
                'other' => 'أخرى',
                _ => '$rawCategory',
              };
        final rawPriority = row['priority'] ?? row['urgency'];
        final priority = rawPriority == null
            ? null
            : switch ('$rawPriority'.toLowerCase()) {
                'urgent' || 'critical' || 'high' => 'عاجل',
                'normal' || 'standard' || 'slow' => 'عادي',
                'low' => 'منخفض',
                _ => '$rawPriority',
              };
        final rawConfidentiality =
            row['confidentiality'] ?? row['classification'];
        final confidentiality = rawConfidentiality == null
            ? null
            : switch ('$rawConfidentiality'.toLowerCase()) {
                'secret' => 'سري',
                'top_secret' || 'top secret' => 'سري للغاية',
                'confidential' || 'restricted' => 'سري',
                'normal' || 'public' => 'عادي',
                _ => '$rawConfidentiality',
              };
        return Card(
          clipBehavior: Clip.antiAlias,
          margin: const EdgeInsets.symmetric(vertical: 5),
          child: InkWell(
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
            child: Padding(
              padding: const EdgeInsets.fromLTRB(13, 12, 13, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Expanded(
                        child: Text(
                          'برقية رقم: ${serial ?? '—'}',
                          textAlign: TextAlign.right,
                          style: const TextStyle(
                            color: Color(0xFF182230),
                            fontSize: 16,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      _telegramChip(
                        incoming ? 'واردة' : 'صادرة',
                        const Color(0xFFE8F0FF),
                        const Color(0xFF2458C6),
                        icon: incoming
                            ? Icons.south_west_rounded
                            : Icons.north_east_rounded,
                      ),
                    ],
                  ),
                  const SizedBox(height: 11),
                  if (sender != null && '$sender'.trim().isNotEmpty)
                    _telegramDetailLine('من:', '$sender'),
                  if (receiver != null && '$receiver'.trim().isNotEmpty) ...[
                    const SizedBox(height: 5),
                    _telegramDetailLine('إلى:', '$receiver'),
                  ],
                  const SizedBox(height: 8),
                  _telegramDetailLine('الموضوع:', subject, strong: false),
                  const SizedBox(height: 10),
                  Wrap(
                    alignment: WrapAlignment.start,
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      if (priority != null && '$priority'.trim().isNotEmpty)
                        _telegramChip(
                          '$priority',
                          const Color(0xFFFFE9E9),
                          const Color(0xFFB42332),
                          icon: Icons.priority_high_rounded,
                        ),
                      if (confidentiality != null &&
                          '$confidentiality'.trim().isNotEmpty)
                        _telegramChip(
                          '$confidentiality',
                          const Color(0xFFEAF0FF),
                          const Color(0xFF315FC4),
                          icon: Icons.shield_outlined,
                        ),
                      if (category != null && '$category'.trim().isNotEmpty)
                        _telegramChip(
                          '$category',
                          const Color(0xFFE7F6F7),
                          const Color(0xFF17899A),
                          icon: Icons.category_outlined,
                        ),
                      _telegramChip(
                        status,
                        const Color(0xFFEFF1F4),
                        const Color(0xFF4B5565),
                        icon: Icons.description_outlined,
                      ),
                    ],
                  ),
                  const SizedBox(height: 9),
                  Row(
                    children: [
                      const Icon(
                        Icons.person_outline,
                        size: 15,
                        color: Color(0xFF87909D),
                      ),
                      const SizedBox(width: 5),
                      Expanded(
                        child: Text(
                          '$creator',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Color(0xFF7A8493),
                            fontSize: 12,
                          ),
                        ),
                      ),
                      const Icon(
                        Icons.chevron_left_rounded,
                        color: Color(0xFF9AA3AF),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _telegramDetailLine(
    String label,
    String value, {
    bool strong = true,
  }) =>
      RichText(
        textAlign: TextAlign.right,
        text: TextSpan(
          style: TextStyle(
            color: strong ? const Color(0xFF626E7D) : const Color(0xFF414B59),
            fontSize: 14,
            height: 1.45,
            fontWeight: strong ? FontWeight.w600 : FontWeight.w500,
          ),
          children: [
            TextSpan(text: '$label '),
            TextSpan(
              text: value,
              style: TextStyle(
                color: strong
                    ? const Color(0xFF626E7D)
                    : const Color(0xFF263243),
                fontWeight: strong ? FontWeight.w600 : FontWeight.w500,
              ),
            ),
          ],
        ),
      );

  Widget _telegramChip(
    String label,
    Color background,
    Color foreground, {
    IconData? icon,
  }) =>
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 13, color: foreground),
              const SizedBox(width: 4),
            ],
            Text(
              label,
              style: TextStyle(
                color: foreground,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      );

  Widget _paginationControls() => Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      Text(
        'صفحة $telegramPage',
        style: const TextStyle(color: Colors.black54, fontSize: 12),
      ),
      Row(
        children: [
          OutlinedButton(
            onPressed: telegramPage <= 1 || loading
                ? null
                : () {
                    if (_refreshInProgress) return;
                    setState(() => telegramPage--);
                    refresh();
                  },
            child: const Text('السابق'),
          ),
          const SizedBox(width: 8),
          OutlinedButton(
            onPressed: !hasNextTelegramPage || loading
                ? null
                : () {
                    if (_refreshInProgress) return;
                    setState(() => telegramPage++);
                    refresh();
                  },
            child: const Text('التالي'),
          ),
        ],
      ),
    ],
  );

  Widget _stat(String title, dynamic value, IconData icon) => Card(
    margin: EdgeInsets.zero,
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xFF667085),
                  ),
                ),
              ),
              CircleAvatar(
                radius: 15,
                backgroundColor: const Color(0xFFEAF0FA),
                child: Icon(icon, color: navy, size: 17),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            '$value',
            style: const TextStyle(
              color: navy,
              fontSize: 23,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
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
