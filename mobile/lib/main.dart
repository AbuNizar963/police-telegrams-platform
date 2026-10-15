import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';

import 'api.dart';
import 'advanced_create_telegram_page.dart';
import 'app_update_page.dart';
import 'app_update_service.dart';
import 'mobile_pages.dart';
import 'native_operations_page.dart';
import 'native_organization_management_page.dart';
import 'native_user_management_page.dart';
import 'official_telegram_document.dart';
import 'push_notifications.dart';
import 'public_pages.dart';
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
      fontFamily: 'Cairo',
      scaffoldBackgroundColor: const Color(0xFFF8F7F2),
      colorScheme: ColorScheme.fromSeed(
        seedColor: navy,
        primary: navy,
        secondary: gold,
        surface: const Color(0xFFFFFEFC),
      ),
      textTheme: const TextTheme(
        bodyLarge: TextStyle(fontSize: 14, height: 1.55),
        bodyMedium: TextStyle(fontSize: 13, height: 1.5),
        titleLarge: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
        titleMedium: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
        labelLarge: TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: const Color(0xFFF8F7F2),
        foregroundColor: navy,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        centerTitle: false,
        toolbarHeight: 58,
        titleSpacing: 8,
        iconTheme: const IconThemeData(color: navy, size: 22),
        actionsIconTheme: const IconThemeData(color: navy, size: 21),
        shape: const Border(bottom: BorderSide(color: Color(0xFFE4E6EA))),
        titleTextStyle: const TextStyle(
          color: navy,
          fontFamily: 'Cairo',
          fontSize: 16,
          fontWeight: FontWeight.w800,
        ),
      ),
      cardTheme: CardThemeData(
        color: const Color(0xFFFFFEFC),
        elevation: 0,
        margin: const EdgeInsets.symmetric(vertical: 5),
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
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
          minimumSize: const Size(48, 46),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
          textStyle: const TextStyle(
            fontFamily: 'Cairo',
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: navy,
          minimumSize: const Size(44, 44),
          padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 10),
          side: const BorderSide(color: Color(0xFFD5DAE2)),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
          textStyle: const TextStyle(
            fontFamily: 'Cairo',
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: navy,
          textStyle: const TextStyle(
            fontFamily: 'Cairo',
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: const Color(0xFFEFF1F4),
        selectedColor: const Color(0xFFE8F0FF),
        secondarySelectedColor: const Color(0xFFE7F6F7),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        labelStyle: const TextStyle(
          fontFamily: 'Cairo',
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide.none,
        ),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: const Color(0xFFFFFEFC),
        elevation: 4,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: Color(0xFFE1E5EB)),
        ),
        textStyle: const TextStyle(fontFamily: 'Cairo', fontSize: 13),
      ),
      drawerTheme: const DrawerThemeData(
        backgroundColor: navy,
        width: 306,
        elevation: 8,
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

String _dashboardRefreshError(Object error) {
  final details = error.toString().toLowerCase();
  if (error is SocketException ||
      details.contains('socketfailed host lookup') ||
      details.contains('failed host lookup') ||
      details.contains('no address associated with hostname') ||
      details.contains('network is unreachable') ||
      details.contains('connection refused') ||
      details.contains('connection timed out')) {
    return 'تعذر الاتصال بالخادم حاليًا. تحقق من اتصال الإنترنت أو إعدادات DNS، ثم أعد المحاولة. ستبقى هذه الصفحة متاحة، ولم يتم تسجيل خروجك.';
  }
  return 'تعذر تحديث بيانات لوحة التحكم. تحقق من الاتصال ثم أعد المحاولة.';
}

class _DashboardPageState extends State<DashboardPage> {
  bool loading = true;
  String? error;
  Map<String, dynamic> stats = {};
  List<dynamic> telegrams = [];
  String? activeOrganizationId;
  String? activeOrganizationName;
  int unreadNotificationCount = 0;
  int section = 0;
  int telegramPage = 1;
  bool hasNextTelegramPage = false;
  String searchQuery = '';
  String statusFilter = 'all';
  String priorityFilter = 'all';
  String classificationFilter = 'all';
  String categoryFilter = 'all';
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
    _loadUnreadNotificationCount();
    _refreshTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      refresh(showLoading: false);
      _loadUnreadNotificationCount();
    });
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

  void _handleAccountAction(String action) {
    switch (action) {
      case 'profile':
        _pushPage(ProfileSettingsPage(api: widget.api));
        break;
      case 'theme':
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('الوضع الليلي قيد الإعداد للحساب.')),
        );
        break;
      case 'notifications':
        _pushPage(NotificationsPage(api: widget.api));
        break;
      case 'refresh':
        refresh();
        break;
      case 'department':
        _pushPage(DepartmentSettingsPage(api: widget.api));
        break;
      case 'organizations':
        _pushPage(NativeOrganizationManagementPage(api: widget.api));
        break;
      case 'users':
        _pushPage(NativeUserManagementPage(api: widget.api));
        break;
      case 'owner':
        _pushPage(NativeOrganizationManagementPage(api: widget.api));
        break;
      case 'regions':
        _pushPage(NativeOperationsPage(api: widget.api, initialTab: 1));
        break;
      case 'terms':
        _pushPage(const TermsPage());
        break;
      case 'about':
        _pushPage(const AboutPage());
        break;
      case 'logout':
        _logout();
        break;
    }
  }

  void _pushPage(Widget page) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => page));
  }

  Future<void> _loadUnreadNotificationCount() async {
    try {
      final result = await widget.api.call('notifications.inbox');
      final rows = result is List
          ? result
          : result is Map && result['items'] is List
          ? result['items'] as List
          : const <dynamic>[];
      final unread = rows.where((item) {
        return item is Map && item['readAt'] == null;
      }).length;
      if (mounted) setState(() => unreadNotificationCount = unread);
    } catch (_) {
      // The badge is optional and must never block the dashboard.
    }
  }

  Future<void> _logout() async {
    final navigator = Navigator.of(context);
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
      // Continue with local logout if push cleanup cannot reach the server.
    }
    try {
      await widget.api.logout();
    } catch (_) {
      // PoliceApi.logout clears the local session in its finally block.
    }
    if (!mounted) return;
    navigator.pushReplacement(
      MaterialPageRoute(builder: (_) => const LoginPage()),
    );
  }

  Future<void> _showNotificationsPreview() async {
    final notifications = widget.api.call('notifications.inbox');
    await showDialog<void>(
      context: context,
      barrierDismissible: true,
      builder: (dialogContext) {
        final screenWidth = MediaQuery.sizeOf(dialogContext).width;
        final panelWidth = screenWidth < 440 ? screenWidth - 32 : 408.0;
        return Dialog(
          alignment: AlignmentDirectional.topEnd,
          insetPadding: const EdgeInsets.fromLTRB(12, 76, 12, 12),
          child: SizedBox(
            width: panelWidth,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.notifications_none_rounded, color: navy),
                      const SizedBox(width: 8),
                      const Expanded(
                        child: Text(
                          'الإشعارات',
                          style: TextStyle(fontWeight: FontWeight.w900),
                        ),
                      ),
                      IconButton(
                        tooltip: 'إغلاق',
                        onPressed: () => Navigator.pop(dialogContext),
                        icon: const Icon(Icons.close_rounded),
                      ),
                    ],
                  ),
                  const Divider(height: 1),
                  SizedBox(
                    height: 236,
                    child: FutureBuilder<dynamic>(
                      future: notifications,
                      builder: (context, snapshot) {
                        if (snapshot.connectionState != ConnectionState.done) {
                          return const Center(
                            child: CircularProgressIndicator(color: navy),
                          );
                        }
                        if (snapshot.hasError) {
                          return Center(
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(
                                    Icons.cloud_off_outlined,
                                    color: Color(0xFF7A8493),
                                    size: 30,
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    _dashboardRefreshError(snapshot.error!),
                                    textAlign: TextAlign.center,
                                  ),
                                  TextButton.icon(
                                    onPressed: () {
                                      Navigator.pop(dialogContext);
                                      if (mounted) _showNotificationsPreview();
                                    },
                                    icon: const Icon(Icons.refresh_rounded),
                                    label: const Text('إعادة المحاولة'),
                                  ),
                                ],
                              ),
                            ),
                          );
                        }
                        final rows = snapshot.data is List
                            ? snapshot.data as List
                            : const <dynamic>[];
                        if (rows.isEmpty) {
                          return const Center(
                            child: Padding(
                              padding: EdgeInsets.all(20),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    Icons.notifications_none_rounded,
                                    size: 34,
                                    color: Color(0xFF7A8493),
                                  ),
                                  SizedBox(height: 8),
                                  Text(
                                    'لا توجد تنبيهات جديدة',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                  SizedBox(height: 4),
                                  Text(
                                    'ستظهر هنا طلبات الإحالة وقرارات الجهات.',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      color: Color(0xFF7A8493),
                                      fontSize: 12,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        }
                        final visibleRows = rows.take(4).toList();
                        return ListView.separated(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          itemCount: visibleRows.length,
                          separatorBuilder: (_, _) => const Divider(height: 1),
                          itemBuilder: (context, index) {
                            final notification = Map<String, dynamic>.from(
                              visibleRows[index] as Map,
                            );
                            return ListTile(
                              dense: true,
                              leading: const CircleAvatar(
                                radius: 17,
                                backgroundColor: Color(0xFFF1E8D5),
                                child: Icon(
                                  Icons.notifications_active_outlined,
                                  color: navy,
                                  size: 18,
                                ),
                              ),
                              title: Text(
                                '${notification['title'] ?? 'إشعار جديد'}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 13,
                                ),
                              ),
                              subtitle: Text(
                                '${notification['body'] ?? notification['content'] ?? ''}',
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                            );
                          },
                        );
                      },
                    ),
                  ),
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: TextButton(
                      onPressed: () {
                        Navigator.pop(dialogContext);
                        if (!mounted) return;
                        _pushPage(NotificationsPage(api: widget.api));
                      },
                      child: const Text('عرض جميع الإشعارات'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Future<void> _openIncomingTelegram(int telegramId) async {
    await refresh();
    if (!mounted) return;
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => TelegramDetailsPage(
          api: widget.api,
          telegramId: telegramId,
          officialDocument: true,
        ),
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
            // Fetch one look-ahead row so the Next button is enabled only
            // when another page actually exists.
            'pageSize': 21,
            if (section == 1) 'direction': 'outgoing',
            if (section == 2) 'direction': 'incoming',
            if (searchQuery.trim().isNotEmpty) 'search': searchQuery.trim(),
            if (statusFilter != 'all') 'status': statusFilter,
            if (priorityFilter != 'all') 'priority': priorityFilter,
            if (classificationFilter != 'all')
              'classification': classificationFilter,
            if (categoryFilter != 'all') 'category': categoryFilter,
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
      final hasMoreRows = rows.length > 20;
      final visibleRows = rows.take(20).toList(growable: false);
      if (mounted) {
        setState(() {
          stats = Map<String, dynamic>.from(results[0] as Map);
          activeOrganizationId = organizationContext is Map
              ? organizationContext['organizationId']?.toString()
              : null;
          activeOrganizationName = organizationContext is Map
              ? (organizationContext['organizationName'] ??
                        organizationContext['name'])
                    ?.toString()
              : null;
          telegrams = visibleRows;
          hasNextTelegramPage = hasMoreRows;
          error = null;
        });
      }
    } catch (e) {
      if (mounted) {
        final message = _dashboardRefreshError(e);
        setState(() => error = message);
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
      builder: (_) => AdvancedCreateTelegramSheet(api: widget.api),
    );
    if (result == true) refresh();
  }

  Widget _dashboardWelcomeCard() {
    final accountName =
        '${widget.account['name'] ?? widget.account['username'] ?? 'المستخدم'}';
    final organization = activeOrganizationName?.trim();
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 15, 16, 14),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFEFC),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFE1E5EB)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0A101C35),
            blurRadius: 18,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: navy,
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Icon(Icons.shield_outlined, color: gold, size: 25),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'مرحبًا $accountName',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: navy,
                    fontSize: 17,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  organization?.isNotEmpty == true
                      ? organization!
                      : 'مركز البرقيات',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Color(0xFF667085),
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          _statusPill('النظام متصل', const Color(0xFF16836B)),
        ],
      ),
    );
  }

  Widget _statusPill(String label, Color color) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(20),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 7,
          height: 7,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 5),
        Text(
          label,
          style: TextStyle(
            color: color,
            fontSize: 10,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    ),
  );

  Widget _urgentAlert() {
    final count = stats['urgentAwaitingReceipt'] ?? stats['todayUrgent'] ?? 0;
    final numericCount = count is num
        ? count.toInt()
        : int.tryParse('$count') ?? 0;
    if (numericCount <= 0) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 11),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF1F1),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFF1C5C8)),
      ),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: const Color(0xFFB42332),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.priority_high_rounded, color: Colors.white),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'تنبيه أمني: توجد $numericCount برقية عاجلة تحتاج إلى متابعة.',
              style: const TextStyle(
                color: Color(0xFF8A1C28),
                fontSize: 12,
                fontWeight: FontWeight.w700,
                height: 1.4,
              ),
            ),
          ),
          TextButton(
            onPressed: () {
              setState(() {
                section = 0;
                priorityFilter = 'urgent';
                telegramPage = 1;
              });
              refresh(showLoading: false);
            },
            child: const Text('عرض'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFFF8F7F2),
        foregroundColor: navy,
        automaticallyImplyLeading: false,
        titleSpacing: 0,
        leading: Builder(
          builder: (context) => IconButton(
            tooltip: 'فتح القائمة الجانبية',
            onPressed: () => Scaffold.of(context).openDrawer(),
            icon: const Icon(Icons.menu_rounded),
          ),
        ),
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            ClipOval(
              child: Image.asset(
                'assets/police-telegrams-icon.png',
                width: 36,
                height: 36,
                fit: BoxFit.cover,
              ),
            ),
            const SizedBox(width: 8),
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
            onPressed: _showNotificationsPreview,
            icon: Stack(
              clipBehavior: Clip.none,
              children: [
                const Icon(Icons.notifications_none_rounded),
                if (unreadNotificationCount > 0)
                  Positioned(
                    top: -5,
                    right: -6,
                    child: Container(
                      constraints: const BoxConstraints(minWidth: 17),
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      height: 17,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: const Color(0xFFB42332),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: const Color(0xFFF8F7F2),
                          width: 2,
                        ),
                      ),
                      child: Text(
                        unreadNotificationCount > 99
                            ? '99+'
                            : '$unreadNotificationCount',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 9,
                          fontWeight: FontWeight.w900,
                          height: 1,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          PopupMenuButton<String>(
            tooltip: 'إعدادات الحساب',
            onSelected: _handleAccountAction,
            icon: const Icon(Icons.person_outline_rounded),
            itemBuilder: (context) => [
              const PopupMenuItem(
                value: 'profile',
                child: _AccountMenuItem(
                  icon: Icons.person_outline_rounded,
                  title: 'الملف الشخصي',
                ),
              ),
              const PopupMenuItem(
                value: 'theme',
                child: _AccountMenuItem(
                  icon: Icons.dark_mode_outlined,
                  title: 'تفعيل الوضع الليلي',
                ),
              ),
              const PopupMenuItem(
                value: 'notifications',
                child: _AccountMenuItem(
                  icon: Icons.notifications_none_rounded,
                  title: 'تفعيل إشعارات البرقيات',
                ),
              ),
              const PopupMenuDivider(),
              const PopupMenuItem(
                value: 'refresh',
                child: _AccountMenuItem(
                  icon: Icons.refresh_rounded,
                  title: 'تحديث البيانات',
                ),
              ),
              const PopupMenuDivider(),
              if (widget.account['role'] == 'admin') ...[
                const PopupMenuItem(
                  value: 'department',
                  child: _AccountMenuItem(
                    icon: Icons.settings_outlined,
                    title: 'إعدادات الجهة',
                  ),
                ),
                if (widget.account['isPlatformOwner'] == true)
                  const PopupMenuItem(
                    value: 'owner',
                    child: _AccountMenuItem(
                      icon: Icons.admin_panel_settings_outlined,
                      title: 'إعدادات المالك',
                    ),
                  ),
                const PopupMenuItem(
                  value: 'organizations',
                  child: _AccountMenuItem(
                    icon: Icons.account_tree_outlined,
                    title: 'إدارة الجهات وإضافة الحسابات',
                  ),
                ),
                const PopupMenuItem(
                  value: 'users',
                  child: _AccountMenuItem(
                    icon: Icons.manage_accounts_outlined,
                    title: 'إدارة المستخدمين',
                  ),
                ),
                const PopupMenuItem(
                  value: 'regions',
                  child: _AccountMenuItem(
                    icon: Icons.account_tree_outlined,
                    title: 'إدارة المناطق والأقسام والمحاضر',
                  ),
                ),
                const PopupMenuDivider(),
              ],
              const PopupMenuItem(
                value: 'terms',
                child: _AccountMenuItem(
                  icon: Icons.gavel_outlined,
                  title: 'الشروط والأحكام',
                ),
              ),
              const PopupMenuItem(
                value: 'about',
                child: _AccountMenuItem(
                  icon: Icons.info_outline,
                  title: 'حول النظام وميزاته',
                ),
              ),
              const PopupMenuItem(
                value: 'logout',
                child: _AccountMenuItem(
                  icon: Icons.logout_rounded,
                  title: 'تسجيل الخروج',
                  color: Color(0xFFB42332),
                ),
              ),
            ],
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
                Padding(
                  padding: const EdgeInsets.fromLTRB(8, 4, 8, 12),
                  child: Row(
                    children: [
                      ClipOval(
                        child: Image.asset(
                          'assets/police-telegrams-icon.png',
                          width: 34,
                          height: 34,
                          fit: BoxFit.cover,
                        ),
                      ),
                      const SizedBox(width: 10),
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'القائمة الجانبية',
                              style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            Text(
                              'إدارة نظام البرقيات الشرطية',
                              style: TextStyle(
                                color: Color(0xFFB8C5D6),
                                fontSize: 11,
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        tooltip: 'إغلاق القائمة',
                        onPressed: () => Navigator.pop(context),
                        icon: const Icon(
                          Icons.close_rounded,
                          color: Colors.white70,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                const Divider(color: Color(0xFF29415E)),
                const Padding(
                  padding: EdgeInsets.fromLTRB(12, 4, 12, 4),
                  child: Text(
                    'التنقل الرئيسي',
                    style: TextStyle(
                      color: Color(0xFF7F9AB8),
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                ListTile(
                  leading: const Icon(Icons.dashboard_outlined),
                  title: const Text('لوحة التحكم'),
                  selected: section == 0,
                  onTap: () {
                    Navigator.pop(context);
                    setState(() {
                      section = 0;
                      telegramPage = 1;
                    });
                    refresh(showLoading: false);
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.add_outlined),
                  title: const Text('إنشاء برقية'),
                  onTap: () {
                    Navigator.pop(context);
                    create();
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.file_download_outlined),
                  title: const Text('استيراد وتصدير السجل'),
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
                  leading: const Icon(Icons.call_made_outlined),
                  title: const Text('البرقيات الصادرة'),
                  selected: section == 1,
                  onTap: () {
                    Navigator.pop(context);
                    setState(() {
                      section = 1;
                      telegramPage = 1;
                    });
                    refresh(showLoading: false);
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.call_received_outlined),
                  title: const Text('البرقيات الواردة'),
                  selected: section == 2,
                  onTap: () {
                    Navigator.pop(context);
                    setState(() {
                      section = 2;
                      telegramPage = 1;
                    });
                    refresh(showLoading: false);
                  },
                ),
                const Divider(),
                ListTile(
                  leading: const Icon(Icons.map_outlined),
                  title: const Text('خريطة البلاغات والمواقع الجغرافية'),
                  onTap: () {
                    Navigator.pop(context);
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => NativeOperationsPage(
                          api: widget.api,
                          initialTab: 0,
                        ),
                      ),
                    );
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.groups_outlined),
                  title: const Text('الوحدات الميدانية'),
                  onTap: () {
                    Navigator.pop(context);
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => NativeOperationsPage(
                          api: widget.api,
                          initialTab: 1,
                        ),
                      ),
                    );
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.query_stats_outlined),
                  title: const Text('إدارة الموارد'),
                  onTap: () {
                    Navigator.pop(context);
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => NativeOperationsPage(
                          api: widget.api,
                          initialTab: 2,
                        ),
                      ),
                    );
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.archive_outlined),
                  title: const Text('الأرشيف والسجلات المغلقة'),
                  onTap: () {
                    Navigator.pop(context);
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => NativeOperationsPage(
                          api: widget.api,
                          initialTab: 3,
                        ),
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
                          builder: (_) =>
                              DepartmentSettingsPage(api: widget.api),
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
                  leading: const Icon(Icons.info_outline),
                  title: const Text('حول النظام وميزاته'),
                  onTap: () {
                    Navigator.pop(context);
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const AboutPage()),
                    );
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.gavel_outlined),
                  title: const Text('الشروط والأحكام'),
                  onTap: () {
                    Navigator.pop(context);
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const TermsPage()),
                    );
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.verified_outlined),
                  title: const Text('التحقق من البرقية'),
                  onTap: () {
                    Navigator.pop(context);
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => VerifyTelegramPage(api: widget.api),
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
                      MaterialPageRoute(builder: (_) => const AppUpdatePage()),
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
      floatingActionButton: FloatingActionButton(
        tooltip: 'إنشاء برقية',
        backgroundColor: navy,
        foregroundColor: Colors.white,
        elevation: 4,
        onPressed: create,
        child: const Icon(Icons.add_comment_outlined),
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(onRefresh: refresh, child: _sectionBody()),
    ),
  );

  Widget _sectionBody() {
    if (section == 0) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (error != null)
            Card(
              color: const Color(0xFFFFF4E5),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      Icons.cloud_off_outlined,
                      color: Color(0xFF8A5A00),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            error!,
                            style: const TextStyle(color: Color(0xFF704800)),
                          ),
                          const SizedBox(height: 8),
                          Align(
                            alignment: AlignmentDirectional.centerStart,
                            child: TextButton.icon(
                              onPressed: loading
                                  ? null
                                  : () => refresh(showLoading: false),
                              icon: const Icon(Icons.refresh, size: 18),
                              label: const Text('إعادة المحاولة'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          _dashboardWelcomeCard(),
          _urgentAlert(),
          const SizedBox(height: 14),
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
            'سجل البرقيات الكامل',
            style: TextStyle(
              color: navy,
              fontSize: 18,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'متابعة البرقيات الواردة والصادرة وحالتها',
            style: TextStyle(color: Color(0xFF7A8493), fontSize: 12),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              ChoiceChip(
                label: const Text('كل البرقيات'),
                selected: section == 0,
                onSelected: (selected) {
                  if (!selected || section == 0) return;
                  setState(() {
                    section = 0;
                    telegramPage = 1;
                  });
                  refresh(showLoading: false);
                },
              ),
              ChoiceChip(
                label: const Text('الصادرة'),
                selected: section == 1,
                onSelected: (selected) {
                  if (!selected || section == 1) return;
                  setState(() {
                    section = 1;
                    telegramPage = 1;
                  });
                  refresh(showLoading: false);
                },
              ),
              ChoiceChip(
                label: const Text('الواردة'),
                selected: section == 2,
                onSelected: (selected) {
                  if (!selected || section == 2) return;
                  setState(() {
                    section = 2;
                    telegramPage = 1;
                  });
                  refresh(showLoading: false);
                },
              ),
            ],
          ),
          const SizedBox(height: 10),
          _searchField(),
          const SizedBox(height: 10),
          _filterControls(),
          const SizedBox(height: 10),
          _telegramCards(telegrams),
          const SizedBox(height: 12),
          _paginationControls(),
        ],
      );
    }
    final incoming = section == 2;
    // The server applies direction and organization-scope filters before
    // pagination; do not re-filter one page locally and hide valid results.
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
        _filterControls(),
        const SizedBox(height: 10),
        _telegramCards(telegrams),
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

  void _setTelegramFilter({
    String? status,
    String? priority,
    String? classification,
    String? category,
  }) {
    setState(() {
      if (status != null) statusFilter = status;
      if (priority != null) priorityFilter = priority;
      if (classification != null) classificationFilter = classification;
      if (category != null) categoryFilter = category;
      telegramPage = 1;
    });
    refresh(showLoading: false);
  }

  Widget _filterControls() {
    final hasFilters =
        statusFilter != 'all' ||
        priorityFilter != 'all' ||
        classificationFilter != 'all' ||
        categoryFilter != 'all';
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(Icons.filter_list_rounded, color: navy, size: 20),
                const SizedBox(width: 6),
                const Expanded(
                  child: Text(
                    'تصفية سجل البرقيات',
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
                  ),
                ),
                if (hasFilters)
                  TextButton(
                    onPressed: () => _setTelegramFilter(
                      status: 'all',
                      priority: 'all',
                      classification: 'all',
                      category: 'all',
                    ),
                    child: const Text('مسح الفلاتر'),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _filterDropdown('الحالة', statusFilter, const [
                    ('all', 'كل الحالات'),
                    ('draft', 'مسودة'),
                    ('submitted', 'مرسلة'),
                    ('in_review', 'قيد المراجعة'),
                    ('approved', 'معتمدة'),
                    ('returned', 'معادة'),
                    ('rejected', 'مرفوضة'),
                    ('forwarded', 'محالة'),
                    ('pending', 'معلقة'),
                    ('in_progress', 'قيد التنفيذ'),
                    ('resolved', 'تمت المعالجة'),
                    ('completed', 'مكتملة'),
                    ('archived', 'مؤرشفة'),
                  ], (value) => _setTelegramFilter(status: value)),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _filterDropdown('الأولوية', priorityFilter, const [
                    ('all', 'كل الأولويات'),
                    ('urgent', 'عاجل'),
                    ('normal', 'عادي'),
                    ('slow', 'بطيء'),
                  ], (value) => _setTelegramFilter(priority: value)),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _filterDropdown('السرية', classificationFilter, const [
                    ('all', 'كل المستويات'),
                    ('normal', 'عادي'),
                    ('secret', 'سري'),
                  ], (value) => _setTelegramFilter(classification: value)),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _filterDropdown('التصنيف', categoryFilter, const [
                    ('all', 'كل التصنيفات'),
                    ('criminal', 'جنائي'),
                    ('administrative', 'إداري'),
                    ('traffic', 'مروري'),
                    ('security', 'أمني'),
                    ('tactical', 'تكتيكي'),
                    ('intelligence', 'استخباراتي'),
                    ('emergency', 'طوارئ'),
                    ('public_order', 'حفظ النظام'),
                    ('personnel', 'شؤون الأفراد'),
                    ('logistics', 'إمداد ودعم'),
                    ('training', 'تدريب'),
                    ('community', 'مجتمعي'),
                    ('other', 'أخرى'),
                  ], (value) => _setTelegramFilter(category: value)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _filterDropdown(
    String label,
    String value,
    List<(String, String)> options,
    ValueChanged<String> onChanged,
  ) => DropdownButtonFormField<String>(
    key: ValueKey<String>(value),
    initialValue: value,
    isExpanded: true,
    decoration: InputDecoration(
      labelText: label,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
    ),
    items: options
        .map(
          (option) => DropdownMenuItem<String>(
            value: option.$1,
            child: Text(
              option.$2,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        )
        .toList(),
    onChanged: (selected) {
      if (selected != null) onChanged(selected);
    },
  );

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
        final sender =
            row['fromOrganizationName'] ??
            row['senderOrganizationName'] ??
            row['senderName'] ??
            row['organizationName'];
        final receiver =
            row['toOrganizationName'] ??
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
                          officialDocument: true,
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
                      if (priority != null && priority.trim().isNotEmpty)
                        _telegramChip(
                          priority,
                          const Color(0xFFFFE9E9),
                          const Color(0xFFB42332),
                          icon: Icons.priority_high_rounded,
                        ),
                      if (confidentiality != null &&
                          confidentiality.trim().isNotEmpty)
                        _telegramChip(
                          confidentiality,
                          const Color(0xFFEAF0FF),
                          const Color(0xFF315FC4),
                          icon: Icons.shield_outlined,
                        ),
                      if (category != null && category.trim().isNotEmpty)
                        _telegramChip(
                          category,
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
  }) => RichText(
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
            color: strong ? const Color(0xFF626E7D) : const Color(0xFF263243),
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
  }) => Container(
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

  Widget _stat(String title, dynamic value, IconData icon) {
    final accent = switch (icon) {
      Icons.call_received_outlined => const Color(0xFF16836B),
      Icons.call_made_outlined => const Color(0xFF356AC3),
      Icons.priority_high_rounded => const Color(0xFFB54736),
      Icons.pending_actions_outlined => const Color(0xFF9A6700),
      Icons.task_alt_outlined => const Color(0xFF6B56B3),
      _ => navy,
    };

    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: accent.withValues(alpha: 0.18)),
      ),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: accent.withValues(alpha: 0.035),
          border: Border(top: BorderSide(color: accent, width: 3)),
        ),
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
                        height: 1.35,
                        color: Color(0xFF667085),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  CircleAvatar(
                    radius: 16,
                    backgroundColor: accent.withValues(alpha: 0.11),
                    child: Icon(icon, color: accent, size: 18),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: AlignmentDirectional.centerStart,
                child: Text(
                  '$value',
                  maxLines: 1,
                  style: TextStyle(
                    color: accent,
                    fontSize: 25,
                    fontWeight: FontWeight.w900,
                    height: 1.1,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AccountMenuItem extends StatelessWidget {
  const _AccountMenuItem({required this.icon, required this.title, this.color});

  final IconData icon;
  final String title;
  final Color? color;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 216,
    child: Row(
      children: [
        Icon(icon, size: 18, color: color ?? const Color(0xFF667085)),
        const SizedBox(width: 10),
        Expanded(
          child: Text(title, style: TextStyle(color: color, fontSize: 13)),
        ),
      ],
    ),
  );
}

class TelegramDetailsPage extends StatefulWidget {
  const TelegramDetailsPage({
    super.key,
    required this.api,
    required this.telegramId,
    this.officialDocument = false,
  });
  final PoliceApi api;
  final int telegramId;
  final bool officialDocument;
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
    if (widget.officialDocument && !loading && error == null && data != null) {
      return OfficialTelegramDocumentPage(
        api: widget.api,
        telegramId: widget.telegramId,
        onEdit: _editTelegram,
        onDelete: _deleteTelegram,
        onSubmitForReview: () async {
          await widget.api.call(
            'telegrams.transition',
            mutation: true,
            input: {'id': widget.telegramId, 'toStatus': 'submitted'},
          );
          await load();
        },
      );
    }
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(
          backgroundColor: const Color(0xFFF8F7F2),
          foregroundColor: navy,
          title: const Text(
            'تفاصيل البرقية',
            style: TextStyle(fontWeight: FontWeight.w900),
          ),
          actions: [
            IconButton(
              tooltip: 'معاينة وطباعة الوثيقة الرسمية',
              onPressed: loading || data == null
                  ? null
                  : () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => OfficialTelegramDocumentPage(
                          api: widget.api,
                          telegramId: widget.telegramId,
                        ),
                      ),
                    ),
              icon: const Icon(Icons.print_outlined),
            ),
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
