import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

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

const navy = Color(0xFF10233F);
const gold = Color(0xFFD8C38E);
const canvas = Color(0xFFF5F7FA);

void main() {
  PoliceTelegramsApp.restoreThemeMode();
  runApp(const PoliceTelegramsApp());
}

class PoliceTelegramsApp extends StatelessWidget {
  const PoliceTelegramsApp({super.key, this.api});

  static final ValueNotifier<ThemeMode> _themeMode = ValueNotifier<ThemeMode>(
    ThemeMode.light,
  );
  static const _preferences = FlutterSecureStorage();

  static Future<void> restoreThemeMode() async {
    try {
      final saved = await _preferences.read(key: 'mobile_theme_mode');
      _themeMode.value = saved == 'dark' ? ThemeMode.dark : ThemeMode.light;
    } catch (_) {
      // A preference read failure should not prevent the app from starting.
    }
  }

  static Future<void> toggleTheme() async {
    final next = _themeMode.value == ThemeMode.dark
        ? ThemeMode.light
        : ThemeMode.dark;
    _themeMode.value = next;
    try {
      await _preferences.write(
        key: 'mobile_theme_mode',
        value: next == ThemeMode.dark ? 'dark' : 'light',
      );
    } catch (_) {
      // Keep the selected theme for this session if storage is unavailable.
    }
  }

  final PoliceApi? api;

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<ThemeMode>(
    valueListenable: _themeMode,
    builder: (context, mode, _) => MaterialApp(
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
          width: 280,
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
      darkTheme: ThemeData.dark(useMaterial3: true).copyWith(
        textTheme: ThemeData.dark().textTheme.apply(fontFamily: 'Cairo'),
        scaffoldBackgroundColor: const Color(0xFF101925),
        colorScheme: ColorScheme.fromSeed(
          seedColor: gold,
          brightness: Brightness.dark,
          primary: gold,
          secondary: gold,
          surface: const Color(0xFF182538),
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF111D2D),
          foregroundColor: Color(0xFFF5F6F8),
          elevation: 0,
          scrolledUnderElevation: 0,
          surfaceTintColor: Colors.transparent,
          toolbarHeight: 58,
          shape: Border(bottom: BorderSide(color: Color(0xFF2A384B))),
        ),
        cardTheme: CardThemeData(
          color: const Color(0xFF182538),
          elevation: 0,
          margin: const EdgeInsets.symmetric(vertical: 5),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: const BorderSide(color: Color(0xFF2A384B)),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xFF182538),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 12,
            vertical: 10,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(9),
            borderSide: const BorderSide(color: Color(0xFF34445B)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(9),
            borderSide: const BorderSide(color: Color(0xFF34445B)),
          ),
        ),
        popupMenuTheme: const PopupMenuThemeData(
          color: Color(0xFF182538),
          textStyle: TextStyle(fontFamily: 'Cairo', fontSize: 13),
        ),
        drawerTheme: const DrawerThemeData(backgroundColor: navy, width: 280),
        dividerTheme: const DividerThemeData(color: Color(0xFF2A384B)),
      ),
      themeMode: mode,
      home: SessionGate(
        api: api,
        onToggleTheme: toggleTheme,
        isDarkMode: mode == ThemeMode.dark,
      ),
    ),
  );
}

class SessionGate extends StatefulWidget {
  const SessionGate({
    super.key,
    this.api,
    this.onToggleTheme,
    this.isDarkMode = false,
  });

  final PoliceApi? api;
  final VoidCallback? onToggleTheme;
  final bool isDarkMode;

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
        return DashboardPage(
          api: _api,
          account: account,
          onToggleTheme: widget.onToggleTheme,
          isDarkMode: widget.isDarkMode,
        );
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

      return LoginPage(
        api: _api,
        onToggleTheme: widget.onToggleTheme,
        isDarkMode: widget.isDarkMode,
      );
    },
  );
}

class LoginPage extends StatefulWidget {
  const LoginPage({
    super.key,
    this.api,
    this.onToggleTheme,
    this.isDarkMode = false,
  });

  final PoliceApi? api;
  final VoidCallback? onToggleTheme;
  final bool isDarkMode;
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
          builder: (_) => DashboardPage(
            api: api,
            account: account,
            onToggleTheme: widget.onToggleTheme,
            isDarkMode: widget.isDarkMode,
          ),
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
  const DashboardPage({
    super.key,
    required this.api,
    required this.account,
    this.onToggleTheme,
    this.isDarkMode = false,
  });
  final PoliceApi api;
  final Map<String, dynamic> account;
  final VoidCallback? onToggleTheme;
  final bool isDarkMode;
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

class _DashboardPageState extends State<DashboardPage>
    with WidgetsBindingObserver {
  bool loading = true;
  String? error;
  Map<String, dynamic> stats = {};
  List<dynamic> telegrams = [];
  String? activeOrganizationId;
  String? activeOrganizationName;
  String? activeOrganizationRole;
  int unreadNotificationCount = 0;
  bool _pushEnabled = false;
  bool _pushBusy = false;
  int section = 0;
  int telegramPage = 1;
  bool hasNextTelegramPage = false;
  String searchQuery = '';
  DateTime? _filterFrom;
  DateTime? _filterTo;
  String? _activeKpi;
  bool _filtersOpen = false;
  bool _showPriority = true;
  bool _showCategory = true;
  bool _showCreator = true;
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
    WidgetsBinding.instance.addObserver(this);
    refresh();
    _loadUnreadNotificationCount();
    _startRefreshTimer();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) checkAndPromptForAppUpdate(context);
    });
    push
        .initialize(
          onToken: _registerPushToken,
          onTelegramOpened: _openIncomingTelegram,
          onForegroundTelegram: (_) {
            refresh();
          },
        )
        .then((_) async {
          final enabled = await push.notificationsEnabled();
          if (mounted) setState(() => _pushEnabled = enabled);
        });
  }

  void _startRefreshTimer() {
    _refreshTimer?.cancel();
    _refreshTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      refresh(showLoading: false);
      _loadUnreadNotificationCount();
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _startRefreshTimer();
      refresh(showLoading: false);
      _loadUnreadNotificationCount();
    } else if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached ||
        state == AppLifecycleState.hidden) {
      _refreshTimer?.cancel();
      _refreshTimer = null;
    }
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

  Future<void> _togglePushNotifications() async {
    if (_pushBusy) return;
    setState(() => _pushBusy = true);
    try {
      if (_pushEnabled) {
        final token = await push.currentToken();
        if (token != null) {
          await widget.api.call(
            'notifications.unregisterMobileToken',
            mutation: true,
            input: {'token': token},
          );
        }
        await push.disableNotifications();
        if (mounted) {
          setState(() => _pushEnabled = false);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('تم إيقاف إشعارات هذا الجهاز')),
          );
        }
      } else {
        final enabled = await push.enableNotifications(
          onToken: (token) => _registerPushToken(token),
        );
        if (mounted) {
          setState(() => _pushEnabled = enabled);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                enabled
                    ? 'تم تفعيل إشعارات البرقيات على هذا الجهاز'
                    : 'اسمح بالإشعارات من إعدادات الجهاز ثم أعد المحاولة',
              ),
            ),
          );
        }
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('تعذر تحديث إعداد الإشعارات الآن')),
        );
      }
    } finally {
      if (mounted) setState(() => _pushBusy = false);
    }
  }

  void _handleAccountAction(String action) {
    switch (action) {
      case 'profile':
        _pushPage(ProfileSettingsPage(api: widget.api));
        break;
      case 'theme':
        widget.onToggleTheme?.call();
        break;
      case 'notifications':
        _togglePushNotifications();
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
      case 'regions':
        _pushPage(NativeOperationsPage(api: widget.api, initialTab: 1));
        break;
      case 'terms':
        _pushPage(const TermsPage());
        break;
      case 'about':
        _pushPage(const AppUpdatePage());
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
    WidgetsBinding.instance.removeObserver(this);
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
            if (_filterFrom != null)
              'from': _filterFrom!.toUtc().toIso8601String(),
            if (_filterTo != null) 'to': _filterTo!.toUtc().toIso8601String(),
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
          activeOrganizationRole = organizationContext is Map
              ? organizationContext['role']?.toString()
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

  void _applyStatFilter(String filter) {
    final clearSelection = _activeKpi == filter;
    setState(() {
      telegramPage = 1;
      searchQuery = '';
      searchController.clear();
      _filterFrom = null;
      _filterTo = null;
      statusFilter = 'all';
      priorityFilter = 'all';
      classificationFilter = 'all';
      categoryFilter = 'all';
      _activeKpi = clearSelection ? null : filter;
      if (clearSelection || filter == 'total') {
        section = 0;
      } else if (filter == 'today' ||
          filter == 'urgent' ||
          filter == 'incoming') {
        section = filter == 'incoming' ? 2 : 0;
        final start = DateTime.now();
        final today = DateTime(start.year, start.month, start.day);
        _filterFrom = today;
        _filterTo = today.add(const Duration(days: 1));
        if (filter == 'urgent') priorityFilter = 'urgent';
      } else if (filter == 'in-progress') {
        section = 0;
        statusFilter = 'in_progress';
      } else if (filter == 'resolved') {
        section = 0;
        statusFilter = 'resolved';
      }
    });
    refresh(showLoading: false);
  }

  bool get _canViewReports =>
      widget.account['role'] == 'admin' ||
      const {
        'system_admin',
        'organization_admin',
        'regional_admin',
        'organization_supervisor',
        'reviewer',
        'reader',
        'auditor',
      }.contains(activeOrganizationRole);

  Widget _dashboardActionButton({
    required IconData icon,
    required String label,
    required VoidCallback onPressed,
    Widget? trailing,
  }) => OutlinedButton(
    onPressed: onPressed,
    style: OutlinedButton.styleFrom(
      minimumSize: const Size(0, 38),
      padding: const EdgeInsets.symmetric(horizontal: 6),
      side: const BorderSide(color: Color(0xFFE1E5EB)),
      backgroundColor: const Color(0xFFFFFEFC),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.center,
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 15),
        const SizedBox(width: 4),
        Flexible(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700),
          ),
        ),
        if (trailing != null) ...[const SizedBox(width: 3), trailing],
      ],
    ),
  );

  Widget _dashboardActions() => Row(
    children: [
      if (_canViewReports) ...[
        Expanded(
          child: _dashboardActionButton(
            icon: Icons.description_outlined,
            label: 'تقرير البرقيات',
            onPressed: () => _pushPage(ReportsPage(api: widget.api)),
          ),
        ),
        const SizedBox(width: 7),
      ],
      Expanded(
        child: _dashboardActionButton(
          icon: Icons.tune_rounded,
          label: 'تخصيص العرض',
          onPressed: _showDisplayCustomization,
        ),
      ),
      const SizedBox(width: 7),
      Expanded(
        child: _dashboardActionButton(
          icon: Icons.filter_list_rounded,
          label: 'الفلاتر',
          trailing: _activeFilterCount == 0
              ? null
              : Container(
                  padding: const EdgeInsets.symmetric(horizontal: 5),
                  decoration: BoxDecoration(
                    color: navy,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    '$_activeFilterCount',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
          onPressed: () => setState(() => _filtersOpen = !_filtersOpen),
        ),
      ),
    ],
  );

  int get _activeFilterCount => [
    statusFilter != 'all',
    priorityFilter != 'all',
    classificationFilter != 'all',
    categoryFilter != 'all',
    _filterFrom != null,
  ].where((active) => active).length;

  Future<void> _showDisplayCustomization() async {
    var priority = _showPriority;
    var category = _showCategory;
    var creator = _showCreator;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('تخصيص عرض سجل البرقيات'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('الأولوية ودرجة السرية'),
                value: priority,
                onChanged: (value) => setDialogState(() => priority = value),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('تصنيف البرقية'),
                value: category,
                onChanged: (value) => setDialogState(() => category = value),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('اسم منشئ البرقية'),
                value: creator,
                onChanged: (value) => setDialogState(() => creator = value),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('إلغاء'),
            ),
            FilledButton(
              onPressed: () {
                setState(() {
                  _showPriority = priority;
                  _showCategory = category;
                  _showCreator = creator;
                });
                Navigator.pop(dialogContext);
              },
              child: const Text('حفظ'),
            ),
          ],
        ),
      ),
    );
  }

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
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
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
            icon: const Icon(Icons.more_vert_rounded),
            itemBuilder: (context) => [
              const PopupMenuItem(
                value: 'profile',
                child: _AccountMenuItem(
                  icon: Icons.person_outline_rounded,
                  title: 'الملف الشخصي',
                ),
              ),
              PopupMenuItem(
                value: 'theme',
                child: _AccountMenuItem(
                  icon: widget.isDarkMode
                      ? Icons.light_mode_outlined
                      : Icons.dark_mode_outlined,
                  title: widget.isDarkMode
                      ? 'تفعيل الوضع الفاتح'
                      : 'تفعيل الوضع الليلي',
                ),
              ),
              PopupMenuItem(
                value: 'notifications',
                enabled: !_pushBusy,
                child: _AccountMenuItem(
                  icon: _pushEnabled
                      ? Icons.notifications_off_outlined
                      : Icons.notifications_active_outlined,
                  title: _pushBusy
                      ? 'جارٍ تحديث الإشعارات...'
                      : _pushEnabled
                      ? 'إيقاف إشعارات البرقيات'
                      : 'تفعيل إشعارات البرقيات',
                ),
              ),
              const PopupMenuDivider(),
              const PopupMenuItem<String>(
                enabled: false,
                height: 34,
                child: Text(
                  'إعدادات الجهة',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF7A8493),
                  ),
                ),
              ),
              if (widget.account['role'] == 'admin' || _canViewReports)
                const PopupMenuItem(
                  value: 'department',
                  child: _AccountMenuItem(
                    icon: Icons.settings_outlined,
                    title: 'إعدادات الجهة',
                  ),
                ),
              if (widget.account['role'] == 'admin') ...[
                const PopupMenuItem<String>(
                  enabled: false,
                  height: 34,
                  child: Text(
                    'إعدادات المالك',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF7A8493),
                    ),
                  ),
                ),
                const PopupMenuItem(
                  value: 'users',
                  child: _AccountMenuItem(
                    icon: Icons.manage_accounts_outlined,
                    title: 'إدارة المستخدمين وإضافة الحسابات',
                  ),
                ),
                const PopupMenuItem(
                  value: 'regions',
                  child: _AccountMenuItem(
                    icon: Icons.account_tree_outlined,
                    title: 'إدارة المناطق والأقسام والمخافر',
                  ),
                ),
              ],
              const PopupMenuDivider(),
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
                  title: 'حول التطبيق وتحديثاته',
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
              visualDensity: VisualDensity(vertical: -1),
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
                      ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Image.asset(
                          'assets/police-telegrams-icon.png',
                          width: 38,
                          height: 38,
                          fit: BoxFit.cover,
                        ),
                      ),
                      const SizedBox(width: 10),
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'نظام برقيات الشرطة',
                              style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w800,
                                fontSize: 13,
                              ),
                            ),
                            Text(
                              'القائمة الجانبية',
                              style: TextStyle(
                                color: Color(0xFFB8C5D6),
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        tooltip: 'إغلاق القائمة',
                        onPressed: () => Navigator.pop(context),
                        icon: const Icon(
                          Icons.view_sidebar_outlined,
                          color: Colors.white70,
                        ),
                      ),
                    ],
                  ),
                ),
                const Divider(color: Color(0xFF29415E)),
                const Padding(
                  padding: EdgeInsets.fromLTRB(12, 7, 12, 5),
                  child: Text(
                    'التنقل الرئيسي',
                    style: TextStyle(
                      color: Color(0xFF8FA4BD),
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                ListTile(
                  leading: const Icon(Icons.dashboard_outlined),
                  title: const Text('لوحة التحكم'),
                  selected: true,
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
                  leading: const Icon(Icons.add_comment_outlined),
                  title: const Text('إنشاء برقية'),
                  onTap: () {
                    Navigator.pop(context);
                    create();
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.file_download_outlined),
                  title: const Text('استيراد وتصدير سجل البرقيات'),
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
                if (widget.account['role'] == 'admin' || _canViewReports)
                  ListTile(
                    leading: const Icon(Icons.manage_accounts_outlined),
                    title: const Text('إدارة المستخدمين'),
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
                const Divider(color: Color(0xFF29415E)),
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
    final values = <(String, String, String, IconData, Color)>[
      (
        'إجمالي البرقيات',
        'total',
        'الرصيد التشغيلي',
        Icons.description_outlined,
        const Color(0xFF687385),
      ),
      (
        'الصادرة اليوم',
        'today',
        'من بداية اليوم',
        Icons.bolt_outlined,
        const Color(0xFF356AC3),
      ),
      (
        'أولوية عاجل اليوم',
        'todayUrgent',
        'من بداية اليوم',
        Icons.priority_high_rounded,
        const Color(0xFFB54736),
      ),
      (
        'الواردة اليوم',
        'todayIncoming',
        'إلى جهتك منذ بداية اليوم',
        Icons.inbox_outlined,
        const Color(0xFF16836B),
      ),
      (
        'قيد الإجراء',
        'inProgress',
        'قيد المعالجة',
        Icons.radio_button_checked_outlined,
        const Color(0xFF17899A),
      ),
      (
        'مكتملة نهائيًا',
        'resolved',
        'تم إغلاقها',
        Icons.task_alt_outlined,
        const Color(0xFF16836B),
      ),
    ];
    return ListView(
      padding: const EdgeInsets.all(12),
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
        _dashboardActions(),
        _urgentAlert(),
        const SizedBox(height: 12),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisSpacing: 10,
          mainAxisSpacing: 10,
          childAspectRatio: 1.48,
          children: [
            for (final item in values)
              _stat(
                item.$1,
                stats[item.$2] ?? 0,
                item.$4,
                detail: item.$3,
                accent: item.$5,
                active:
                    _activeKpi ==
                    switch (item.$2) {
                      'total' => 'total',
                      'today' => 'today',
                      'todayUrgent' => 'urgent',
                      'todayIncoming' => 'incoming',
                      'inProgress' => 'in-progress',
                      'resolved' => 'resolved',
                      _ => null,
                    },
                onTap: () => _applyStatFilter(switch (item.$2) {
                  'today' => 'today',
                  'todayUrgent' => 'urgent',
                  'todayIncoming' => 'incoming',
                  'inProgress' => 'in-progress',
                  'resolved' => 'resolved',
                  _ => 'total',
                }),
              ),
          ],
        ),
        const SizedBox(height: 14),
        Card(
          margin: EdgeInsets.zero,
          clipBehavior: Clip.antiAlias,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: Color(0xFFE1E5EB)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'سجل البرقيات الكامل',
                            style: TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 9,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF1F2F5),
                            borderRadius: BorderRadius.circular(18),
                          ),
                          child: Text(
                            '${telegrams.length} نتيجة',
                            style: const TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF667085),
                            ),
                          ),
                        ),
                      ],
                    ),
                    if (_activeKpi != null) ...[
                      const SizedBox(height: 6),
                      Align(
                        alignment: AlignmentDirectional.centerStart,
                        child: InputChip(
                          label: Text(_activeKpiLabel),
                          onDeleted: () => _applyStatFilter(_activeKpi!),
                          deleteIcon: const Icon(Icons.close_rounded, size: 15),
                          materialTapTargetSize:
                              MaterialTapTargetSize.shrinkWrap,
                          visualDensity: VisualDensity.compact,
                        ),
                      ),
                    ],
                    const SizedBox(height: 5),
                    const Text(
                      'جميع السجلات مرتبة تنازليًا حسب الرقم التسلسلي مع ختم الهوية الرقمية وسجل تدقيق كامل. البحث والتصفية يشملان كامل السجل المتاح لك قبل تقسيم النتائج إلى صفحات.',
                      style: TextStyle(
                        fontSize: 10,
                        height: 1.55,
                        color: Color(0xFF667085),
                      ),
                    ),
                    const SizedBox(height: 12),
                    _searchField(),
                  ],
                ),
              ),
              const Divider(height: 1),
              SizedBox(
                height: 47,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 6,
                  ),
                  children: [
                    _telegramViewButton(
                      'كل البرقيات',
                      stats['total'] ?? 0,
                      Icons.list_alt_rounded,
                      0,
                    ),
                    const SizedBox(width: 7),
                    _telegramViewButton(
                      'البرقيات الصادرة',
                      stats['outgoing'] ?? 0,
                      Icons.call_made_rounded,
                      1,
                    ),
                    const SizedBox(width: 7),
                    _telegramViewButton(
                      'البرقيات الواردة',
                      stats['incoming'] ?? 0,
                      Icons.call_received_rounded,
                      2,
                    ),
                  ],
                ),
              ),
              if (_filtersOpen) _filterControls(),
              _telegramCards(telegrams),
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
                child: _paginationControls(),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
      ],
    );
  }

  String get _activeKpiLabel => switch (_activeKpi) {
    'total' => 'إجمالي البرقيات',
    'today' => 'الصادرة اليوم',
    'urgent' => 'أولوية عاجل اليوم',
    'incoming' => 'الواردة اليوم',
    'in-progress' => 'قيد الإجراء',
    'resolved' => 'مكتملة نهائيًا',
    _ => '',
  };

  Widget _telegramViewButton(
    String label,
    dynamic count,
    IconData icon,
    int value,
  ) {
    final selected = section == value;
    return Material(
      color: selected ? navy : const Color(0xFFFFFEFC),
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: () {
          if (selected) return;
          setState(() {
            section = value;
            telegramPage = 1;
          });
          refresh(showLoading: false);
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: selected ? navy : const Color(0xFFD9DEE7),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: 14,
                color: selected ? Colors.white : const Color(0xFF667085),
              ),
              const SizedBox(width: 4),
              Text(
                label,
                style: TextStyle(
                  color: selected ? Colors.white : const Color(0xFF344054),
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(width: 4),
              Text(
                '$count',
                style: TextStyle(
                  color: selected ? Colors.white70 : const Color(0xFF667085),
                  fontSize: 9,
                ),
              ),
            ],
          ),
        ),
      ),
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
      _filterFrom = null;
      _filterTo = null;
      _activeKpi = null;
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
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: const BoxDecoration(
        color: Color(0xFFF8F9FB),
        border: Border(bottom: BorderSide(color: Color(0xFFE1E5EB))),
      ),
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
      hintText: 'بحث بالرقم، الموضوع، الاسم...',
      prefixIcon: const Icon(Icons.search),
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(9)),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(9),
        borderSide: const BorderSide(color: Color(0xFFE1E5EB)),
      ),
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
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 34),
        child: Column(
          children: [
            const Icon(
              Icons.description_outlined,
              size: 36,
              color: Color(0xFFB8C0CA),
            ),
            const SizedBox(height: 8),
            const Text(
              'لا توجد نتائج',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 3),
            Text(
              query.isNotEmpty
                  ? 'غيّر عبارة البحث أو الفلاتر.'
                  : 'غيّر الفلاتر أو أنشئ برقية جديدة.',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 11, color: Color(0xFF7A8493)),
            ),
          ],
        ),
      );
    }

    String statusLabel(dynamic raw) => switch ('$raw'.toLowerCase()) {
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
      _ => '$raw' == 'null' ? 'مسودة' : '$raw',
    };

    String categoryLabel(dynamic raw) => switch ('$raw'.toLowerCase()) {
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
      _ => '$raw',
    };

    String priorityLabel(dynamic raw) => switch ('$raw'.toLowerCase()) {
      'urgent' || 'critical' || 'high' => 'عاجل',
      'slow' => 'بطيء',
      'low' => 'منخفض',
      'normal' || 'standard' => 'عادي',
      _ => '$raw',
    };

    String confidentialityLabel(dynamic raw) => switch ('$raw'.toLowerCase()) {
      'secret' || 'confidential' || 'restricted' => 'سري',
      'top_secret' || 'top secret' => 'سري للغاية',
      'normal' || 'public' => 'عادي',
      _ => '$raw',
    };

    return Column(
      children: [
        for (var index = 0; index < filteredRows.length; index++) ...[
          if (index > 0) const Divider(height: 1),
          _telegramRow(
            Map<String, dynamic>.from(filteredRows[index] as Map),
            statusLabel,
            categoryLabel,
            priorityLabel,
            confidentialityLabel,
          ),
        ],
      ],
    );
  }

  Widget _telegramRow(
    Map<String, dynamic> row,
    String Function(dynamic) statusLabel,
    String Function(dynamic) categoryLabel,
    String Function(dynamic) priorityLabel,
    String Function(dynamic) confidentialityLabel,
  ) {
    final incoming = _isIncoming(row);
    final serial = row['serialCode'] ?? row['serialNumber'] ?? row['number'];
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
        row['creatorName'] ??
        row['senderName'] ??
        row['createdByName'] ??
        widget.account['name'] ??
        widget.account['username'] ??
        '';
    final rawPriority = row['priority'] ?? row['urgency'];
    final rawConfidentiality = row['confidentiality'] ?? row['classification'];
    final rawCategory = row['category'];
    final status = statusLabel(row['status'] ?? 'draft');
    final priority = rawPriority == null ? null : priorityLabel(rawPriority);
    final confidentiality = rawConfidentiality == null
        ? null
        : confidentialityLabel(rawConfidentiality);
    final category = rawCategory == null ? null : categoryLabel(rawCategory);

    return InkWell(
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
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 13),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'برقية رقم: ${serial ?? '—'}',
                    textAlign: TextAlign.right,
                    style: const TextStyle(
                      color: Color(0xFF182230),
                      fontSize: 15,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                _telegramChip(
                  incoming ? 'واردة' : 'صادرة',
                  incoming ? const Color(0xFFEAF8F4) : const Color(0xFFEAF0FF),
                  incoming ? const Color(0xFF16836B) : const Color(0xFF2458C6),
                  icon: incoming
                      ? Icons.south_west_rounded
                      : Icons.north_east_rounded,
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (sender != null && '$sender'.trim().isNotEmpty)
              _telegramDetailLine('من:', '$sender'),
            if (receiver != null && '$receiver'.trim().isNotEmpty) ...[
              const SizedBox(height: 3),
              _telegramDetailLine('إلى:', '$receiver'),
            ],
            const SizedBox(height: 5),
            _telegramDetailLine('الموضوع:', subject, strong: false),
            const SizedBox(height: 8),
            Wrap(
              alignment: WrapAlignment.start,
              spacing: 5,
              runSpacing: 5,
              children: [
                if (_showPriority && priority != null && priority.isNotEmpty)
                  _telegramChip(
                    priority,
                    priority == 'عاجل'
                        ? const Color(0xFFFFE9E9)
                        : const Color(0xFFEAF0FF),
                    priority == 'عاجل'
                        ? const Color(0xFFB42332)
                        : const Color(0xFF356AC3),
                    icon: priority == 'عاجل'
                        ? Icons.priority_high_rounded
                        : Icons.shield_outlined,
                  ),
                if (_showCategory && category != null && category.isNotEmpty)
                  _telegramChip(
                    category,
                    const Color(0xFFF0F1F4),
                    const Color(0xFF4B5565),
                    icon: Icons.description_outlined,
                  ),
                if (_showPriority &&
                    confidentiality != null &&
                    confidentiality.isNotEmpty)
                  _telegramChip(
                    confidentiality,
                    const Color(0xFFEAF8F4),
                    const Color(0xFF16836B),
                    icon: Icons.verified_outlined,
                  ),
                _telegramChip(
                  status,
                  const Color(0xFFEAF8F4),
                  const Color(0xFF16836B),
                  icon: Icons.check_circle_outline_rounded,
                ),
              ],
            ),
            if (_showCreator) ...[
              const SizedBox(height: 6),
              Row(
                children: [
                  const Icon(
                    Icons.person_outline,
                    size: 13,
                    color: Color(0xFF87909D),
                  ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      '$creator',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Color(0xFF7A8493),
                        fontSize: 10,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
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
    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
    decoration: BoxDecoration(
      color: background,
      borderRadius: BorderRadius.circular(14),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon != null) ...[
          Icon(icon, size: 11, color: foreground),
          const SizedBox(width: 3),
        ],
        Text(
          label,
          style: TextStyle(
            color: foreground,
            fontSize: 9,
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

  Widget _stat(
    String title,
    dynamic value,
    IconData icon, {
    required String detail,
    required Color accent,
    required VoidCallback onTap,
    bool active = false,
  }) => Material(
    color: Colors.transparent,
    borderRadius: BorderRadius.circular(15),
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(15),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: active ? const Color(0xFFF4F6FA) : const Color(0xFFFFFEFC),
          borderRadius: BorderRadius.circular(15),
          border: Border.all(
            color: active
                ? navy.withValues(alpha: 0.45)
                : const Color(0xFFE1E5EB),
            width: active ? 1.4 : 1,
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Color(0xFF667085),
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      height: 1.35,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '$value',
                    maxLines: 1,
                    style: const TextStyle(
                      color: Color(0xFF182230),
                      fontSize: 23,
                      fontWeight: FontWeight.w900,
                      height: 1.1,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    detail,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Color(0xFF7A8493),
                      fontSize: 9,
                      height: 1.25,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: accent.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(11),
              ),
              child: Icon(icon, color: accent, size: 17),
            ),
          ],
        ),
      ),
    ),
  );
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
