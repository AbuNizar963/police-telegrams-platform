import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import 'app_lock.dart';

import 'api.dart';
import 'advanced_create_telegram_page.dart';
import 'app_update_page.dart';
import 'app_update_service.dart';
import 'mobile_access_policy.dart';
import 'mobile_pages.dart';
import 'native_operations_page.dart';
import 'native_organization_management_page.dart';
import 'native_user_management_page.dart';
import 'official_telegram_document.dart';
import 'push_notifications.dart';
import 'public_pages.dart';
import 'telegram_display.dart';
import 'telegram_actions.dart';
import 'telegram_report_labels.dart';
import 'telegram_excel_page.dart';
import 'telegram_edit_dialog.dart';
import 'telegram_outbox.dart';
import 'telegram_outbox_page.dart';

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
      builder: (context, child) =>
          AppLockOverlayHost(child: child ?? const SizedBox.shrink()),
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
        ).apply(fontFamily: 'Cairo'),
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
        listTileTheme: ListTileThemeData(
          contentPadding: const EdgeInsets.symmetric(horizontal: 16),
          minTileHeight: 48,
          iconColor: const Color(0xFFCBD4E1),
          textColor: const Color(0xFFF5F6F8),
          selectedColor: gold,
          selectedTileColor: const Color(0xFF263A55),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          titleTextStyle: const TextStyle(
            fontFamily: 'Cairo',
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: Color(0xFFF5F6F8),
          ),
        ),
        navigationBarTheme: const NavigationBarThemeData(
          backgroundColor: Color(0xFFFFFEFC),
          indicatorColor: Color(0xFFF1E8D5),
          labelTextStyle: WidgetStatePropertyAll(
            TextStyle(
              fontFamily: 'Cairo',
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
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
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: gold,
            foregroundColor: navy,
            minimumSize: const Size(48, 46),
            textStyle: const TextStyle(
              fontFamily: 'Cairo',
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: const Color(0xFFF5F6F8),
            side: const BorderSide(color: Color(0xFF52627A)),
            minimumSize: const Size(44, 44),
            textStyle: const TextStyle(
              fontFamily: 'Cairo',
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(
            foregroundColor: gold,
            textStyle: const TextStyle(
              fontFamily: 'Cairo',
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        chipTheme: ThemeData.dark().chipTheme.copyWith(
          backgroundColor: const Color(0xFF26364B),
          selectedColor: const Color(0xFF3B4658),
          labelStyle: const TextStyle(
            fontFamily: 'Cairo',
            fontSize: 11,
            fontWeight: FontWeight.w700,
          ),
        ),
        navigationBarTheme: const NavigationBarThemeData(
          backgroundColor: Color(0xFF182538),
          indicatorColor: Color(0xFF34445B),
          labelTextStyle: WidgetStatePropertyAll(
            TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
          ),
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
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(9),
            borderSide: const BorderSide(color: gold, width: 1.6),
          ),
          labelStyle: const TextStyle(color: Color(0xFFCBD4E1)),
          floatingLabelStyle: const TextStyle(color: gold),
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
    _session = _restoreSessionWithMandatoryPin();
    _session.then(
      (account) => AppLockRuntime.setSessionActive(account != null),
      onError: (_) => AppLockRuntime.setSessionActive(false),
    );
  }

  Future<Map<String, dynamic>?> _restoreSessionWithMandatoryPin() async {
    final account = await _api.restoreSession();
    if (account == null) return null;

    try {
      if (!await AppLockService.hasPin()) {
        await _api.logout();
        return null;
      }
      await AppLockService.setEnabled(true);
      return account;
    } catch (_) {
      // Do not expose authenticated screens when the mandatory PIN state
      // cannot be verified or enforced.
      try {
        await _api.logout();
      } catch (_) {
        // Keep the UI on the login screen even if the server is unreachable.
      }
      return null;
    }
  }

  Future<void> _returnToLogin() async {
    try {
      await _api.logout();
    } catch (_) {
      // The local session must still be cleared when the server is unreachable.
    } finally {
      AppLockRuntime.setSessionActive(false);
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
      final hasPin = await AppLockService.hasPin();
      if (!mounted) {
        await api.logout();
        return;
      }
      if (!hasPin) {
        final pinConfigured = await showMandatoryPinSetupDialog(context);
        if (!pinConfigured) {
          await api.logout();
          return;
        }
      } else {
        await AppLockService.setEnabled(true);
      }
      if (!mounted) return;
      AppLockRuntime.setSessionActive(true);
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

class _AnimatedWelcomeGreeting extends StatefulWidget {
  const _AnimatedWelcomeGreeting({required this.name});

  final String name;

  @override
  State<_AnimatedWelcomeGreeting> createState() =>
      _AnimatedWelcomeGreetingState();
}

class _AnimatedWelcomeGreetingState extends State<_AnimatedWelcomeGreeting> {
  static const _flipInterval = Duration(seconds: 7);
  static const _flipDuration = Duration(milliseconds: 1200);
  Timer? _flipTimer;
  bool _showTimeGreeting = false;

  String get _timeBasedGreeting {
    final hour = DateTime.now().hour;
    if (hour >= 5 && hour < 11) return 'صباح الخير';
    if (hour >= 11 && hour < 13) return 'نهار سعيد';
    if (hour >= 13 && hour < 17) return 'طاب يومك';
    if (hour >= 17 && hour < 22) return 'مساء الخير';
    return 'ليلة سعيدة';
  }

  @override
  void initState() {
    super.initState();
    _flipTimer = Timer.periodic(_flipInterval, (_) {
      if (mounted) setState(() => _showTimeGreeting = !_showTimeGreeting);
    });
  }

  @override
  void dispose() {
    _flipTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final greeting = _showTimeGreeting
        ? _timeBasedGreeting
        : 'مرحباً، يا ${widget.name}';
    return Semantics(
      liveRegion: true,
      label: greeting,
      child: AnimatedSwitcher(
        duration: _flipDuration,
        switchInCurve: Curves.easeOutCubic,
        switchOutCurve: Curves.easeInCubic,
        transitionBuilder: (child, animation) {
          // A gentle fade keeps the greeting calm and avoids the 3D flip.
          return FadeTransition(
            opacity: CurvedAnimation(
              parent: animation,
              curve: Curves.easeInOutCubic,
            ),
            child: child,
          );
        },
        child: Text(
          greeting,
          key: ValueKey(_showTimeGreeting),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: navy,
            fontSize: 17,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
    );
  }
}

class DashboardPage extends StatefulWidget {
  const DashboardPage({
    super.key,
    required this.api,
    required this.account,
    this.outbox,
    this.onToggleTheme,
    this.isDarkMode = false,
  });
  final PoliceApi api;
  final Map<String, dynamic> account;
  final TelegramOutbox? outbox;
  final VoidCallback? onToggleTheme;
  final bool isDarkMode;
  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

String _dashboardRefreshError(Object error) {
  final details = error.toString().toLowerCase();
  if (error is NetworkException ||
      error is SocketException ||
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
  static const _idleOutboxMessage = 'لا توجد برقيات معلقة محليًا.';
  String get _greetingName =>
      (_account['name'] ?? _account['username'] ?? 'أبو نزار').toString();

  late final Map<String, dynamic> _account;
  bool loading = true;
  String? error;
  bool _usingCachedData = false;
  bool _showOutboxInTopCard = false;
  double _outboxSwipeDistance = 0;
  Map<String, dynamic> stats = {};
  List<dynamic> telegrams = [];
  String? activeOrganizationId;
  String? activeOrganizationName;
  String? activeOrganizationRole;
  bool activeOrganizationIsOwner = false;
  String? _organizationLogoUrl;
  String? _loadedOrganizationLogoIdentity;
  String? _logoResolvedOrganizationId;
  DateTime? _logoResolvedAt;
  bool _logoLookupResolved = false;
  bool _lastLogoLookupSucceeded = false;
  DateTime? _lastLogoLoadAttemptAt;
  DateTime? _organizationLogoBytesLoadedAt;
  Uint8List? _organizationLogoBytes;
  String numberSystem = 'latin';
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
  late final TelegramOutbox _outbox;
  int _pendingOutbox = 0;
  bool _outboxSyncing = false;
  bool _outboxSyncInProgress = false;
  String _syncPhase = 'idle';
  String? _lastSyncMessage;
  DateTime? _lastSyncAt;
  bool? _serverReachable;
  DateTime? _serverCheckedAt;
  Timer? _syncMessageTimer;
  Timer? _refreshTimer;
  Timer? _searchDebounce;
  bool _refreshInProgress = false;
  bool _refreshQueued = false;
  bool _updateCheckInProgress = false;
  DateTime? _lastUpdateCheckAt;

  String get _currentOrganizationLabel {
    final value =
        activeOrganizationName ??
        _account['organizationName'] ??
        _account['organization_name'] ??
        (_account['organization'] is Map
            ? (_account['organization'] as Map)['name']
            : null) ??
        _account['departmentName'];
    final label = '$value'.trim();
    return label.isEmpty || label == 'null' ? 'الجهة الحالية غير محددة' : label;
  }

  String get _serverStatusMessage {
    if (_serverReachable == true) {
      final checkedAt = _serverCheckedAt;
      return checkedAt == null
          ? 'الخادم متصل.'
          : 'الخادم متصل • آخر تحقق ${_syncTime(checkedAt)}';
    }
    if (_serverReachable == false) {
      return _pendingOutbox > 0
          ? 'الخادم غير متصل؛ ستبقى البرقيات محفوظة محليًا حتى عودة الاتصال.'
          : 'الخادم غير متصل؛ لا توجد برقيات معلقة محليًا.';
    }
    return 'لم يُتحقق من اتصال الخادم بعد.';
  }

  Color get _serverStatusColor {
    if (_serverReachable == true) return const Color(0xFF16836B);
    if (_serverReachable == false) return const Color(0xFFB7791F);
    return const Color(0xFF667085);
  }

  void _recordServerCheck(bool reachable) {
    _serverReachable = reachable;
    _serverCheckedAt = DateTime.now();
  }

  @override
  void initState() {
    super.initState();
    _account = Map<String, dynamic>.from(widget.account);
    _outbox = widget.outbox ?? TelegramOutbox();
    WidgetsBinding.instance.addObserver(this);
    refresh();
    unawaited(_syncOutbox());
    _loadUnreadNotificationCount();
    _startRefreshTimer();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(_checkForAppUpdate());
    });
    push
        .initialize(
          onToken: _registerPushToken,
          onTelegramOpened: _openIncomingTelegram,
          onForegroundTelegram: (_) {
            refresh();
          },
          onAppUpdate: _openAppUpdate,
        )
        .then((_) async {
          final enabled = await push.notificationsEnabled();
          if (mounted) setState(() => _pushEnabled = enabled);
        });
  }

  Future<void> _loadOrganizationLogo(
    String? organizationIdValue,
    String? source,
  ) async {
    final organizationId = organizationIdValue?.trim() ?? '';
    final value = source?.trim();

    if (organizationId.isEmpty || value == null || value.isEmpty) {
      _loadedOrganizationLogoIdentity = null;
      _lastLogoLoadAttemptAt = null;
      _organizationLogoBytesLoadedAt = null;
      if (mounted && _organizationLogoBytes != null) {
        setState(() => _organizationLogoBytes = null);
      }
      return;
    }

    final sourceIdentity = widget.api.organizationLogoCacheIdentity(value);
    if (sourceIdentity.isEmpty) {
      _loadedOrganizationLogoIdentity = null;
      _lastLogoLoadAttemptAt = null;
      _organizationLogoBytesLoadedAt = null;
      if (mounted && _organizationLogoBytes != null) {
        setState(() => _organizationLogoBytes = null);
      }
      return;
    }

    final identity = '$organizationId\n$sourceIdentity';
    final now = DateTime.now();
    final isSameIdentity = _loadedOrganizationLogoIdentity == identity;
    final bytesLoadedAt = _organizationLogoBytesLoadedAt;

    // Revalidate periodically: an organization can replace its logo at the
    // same storage path, so a stable URL alone must not cache it forever.
    if (isSameIdentity &&
        _organizationLogoBytes != null &&
        bytesLoadedAt != null &&
        now.difference(bytesLoadedAt) < const Duration(minutes: 10)) {
      return;
    }

    final lastAttempt = _lastLogoLoadAttemptAt;
    if (isSameIdentity &&
        lastAttempt != null &&
        now.difference(lastAttempt) < const Duration(minutes: 5)) {
      return;
    }

    _loadedOrganizationLogoIdentity = identity;
    _lastLogoLoadAttemptAt = now;
    if (!isSameIdentity && mounted && _organizationLogoBytes != null) {
      setState(() {
        _organizationLogoBytes = null;
        _organizationLogoBytesLoadedAt = null;
      });
    }

    Uint8List? imageBytes;
    try {
      imageBytes = await widget.api.fetchOrganizationLogo(
        organizationId: organizationId,
        source: value,
      );
    } catch (_) {
      imageBytes = null;
    }

    if (!mounted || _loadedOrganizationLogoIdentity != identity) return;
    setState(() {
      if (imageBytes != null) {
        _organizationLogoBytes = imageBytes;
        _organizationLogoBytesLoadedAt = DateTime.now();
      } else if (!isSameIdentity) {
        _organizationLogoBytes = null;
        _organizationLogoBytesLoadedAt = null;
      }
      // If revalidation fails for the same logo, retain the last known-good
      // bytes and retry later rather than replacing a valid logo with a blank.
    });
  }

  Widget _organizationLogoWidget({
    required double size,
    required double borderRadius,
  }) {
    final bytes = _organizationLogoBytes;
    final fallback = Image.asset(
      'assets/police-telegrams-icon.png',
      fit: BoxFit.contain,
      semanticLabel: 'الصورة الافتراضية لنظام برقيات الشرطة',
    );

    return Container(
      width: size,
      height: size,
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(borderRadius),
        border: Border.all(color: const Color(0xFFE1E5EB)),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(
          borderRadius > 3.0 ? borderRadius - 3.0 : 0.0,
        ),
        child: bytes == null
            ? fallback
            : Image.memory(
                bytes,
                fit: BoxFit.contain,
                semanticLabel: 'شعار الجهة',
                errorBuilder: (context, error, stackTrace) => fallback,
              ),
      ),
    );
  }

  Future<void> _checkForAppUpdate() async {
    if (!mounted || _updateCheckInProgress) return;

    final now = DateTime.now();
    final lastCheck = _lastUpdateCheckAt;
    if (lastCheck != null &&
        now.difference(lastCheck) < const Duration(minutes: 2)) {
      return;
    }

    _updateCheckInProgress = true;
    _lastUpdateCheckAt = now;
    try {
      await checkAndPromptForAppUpdate(context);
    } finally {
      _updateCheckInProgress = false;
    }
  }

  void _startRefreshTimer() {
    _refreshTimer?.cancel();
    _refreshTimer = Timer.periodic(const Duration(minutes: 1), (_) {
      refresh(showLoading: false);
      unawaited(_syncOutbox(showProgress: false));
      _loadUnreadNotificationCount();
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _startRefreshTimer();
      refresh(showLoading: false);
      unawaited(_syncOutbox(showProgress: false));
      _loadUnreadNotificationCount();
      unawaited(_checkForAppUpdate());
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

  Future<void> _syncOutbox({bool showProgress = true}) async {
    if (_outboxSyncInProgress) return;
    _outboxSyncInProgress = true;
    _syncMessageTimer?.cancel();
    _syncMessageTimer = null;
    if (mounted) {
      setState(() {
        if (showProgress) {
          _outboxSyncing = true;
          _syncPhase = 'syncing';
          _lastSyncMessage =
              'جارٍ فحص صندوق الخروج وإرسال البرقيات بالترتيب...';
        }
      });
    }
    try {
      final result = await _outbox.sync(widget.api);
      final pending = await _outbox.pendingCount();
      if (!mounted) return;
      _syncMessageTimer?.cancel();
      setState(() {
        _pendingOutbox = pending;
        _lastSyncAt = DateTime.now();
        if (result.permanentFailures > 0) {
          _syncPhase = 'error';
          _lastSyncMessage = result.permanentErrorMessages.isEmpty
              ? 'تم رفض عملية من الخادم وتحتاج إلى مراجعة.'
              : result.permanentErrorMessages.first;
        } else if (result.synced > 0) {
          _syncPhase = pending == 0 ? 'success' : 'partial';
          _lastSyncMessage =
              'تمت مزامنة ${result.synced} برقية بنجاح${pending > 0 ? '، وبقيت $pending معلقة' : ''}.';
        } else if (pending == 0) {
          _syncPhase = 'idle';
          _lastSyncMessage = _idleOutboxMessage;
        } else {
          _syncPhase = 'waiting';
          _lastSyncMessage = 'تنتظر $pending برقية عودة الاتصال للمزامنة.';
        }
      });
      if (_syncPhase == 'success') {
        _syncMessageTimer = Timer(const Duration(seconds: 8), () {
          if (!mounted) return;
          setState(() {
            _syncPhase = 'idle';
            _lastSyncMessage = _pendingOutbox == 0
                ? _idleOutboxMessage
                : 'تنتظر $_pendingOutbox برقية عودة الاتصال للمزامنة.';
          });
        });
      }
      if (result.synced > 0) await refresh(showLoading: false);
      if (mounted && result.permanentFailures > 0) {
        final details = result.permanentErrorMessages.isEmpty
            ? 'تحقق أو صلاحيات'
            : result.permanentErrorMessages.join('، ');
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'تم رفض ${result.permanentFailures} عملية من الخادم: $details',
            ),
          ),
        );
      }
    } catch (_) {
      if (!mounted) return;
      final pending = await _outbox.pendingCount();
      setState(() {
        _pendingOutbox = pending;
        _syncPhase = pending > 0 ? 'waiting' : 'error';
        _lastSyncAt = DateTime.now();
        _lastSyncMessage = pending > 0
            ? 'تعذر الاتصال؛ ستتم إعادة المحاولة تلقائيًا.'
            : 'تعذر التحقق من حالة المزامنة.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _outboxSyncInProgress = false;
          _outboxSyncing = false;
        });
      } else {
        _outboxSyncInProgress = false;
        _outboxSyncing = false;
      }
    }
  }

  void _openOutbox() {
    _pushPage(TelegramOutboxPage(api: widget.api, outbox: _outbox));
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
        _pushPage(
          ProfileSettingsPage(
            api: widget.api,
            onLogout: _logout,
            onProfileUpdated: _updateAccountProfile,
          ),
        );
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
        if (_canManageOrganizationSettings) {
          _pushPage(DepartmentSettingsPage(api: widget.api));
        }
        break;
      case 'platform_document_settings':
        if (_isPlatformOwner) {
          _pushPage(PlatformDocumentSettingsPage(api: widget.api));
        }
        break;
      case 'organizations':
        _pushPage(
          NativeOrganizationManagementPage(
            api: widget.api,
            canEditStructure: hasMobileOrganizationStructureEditAccess(
              accountRole: _account['role']?.toString(),
            ),
            isPlatformOwner: _isPlatformOwner,
          ),
        );
        break;
      case 'users':
        if (_canManageUsers) {
          _pushPage(NativeUserManagementPage(api: widget.api));
        }
        break;
      case 'regions':
        _pushPage(NativeOperationsPage(api: widget.api, initialTab: 1));
        break;
      case 'terms':
        _pushPage(const TermsPage());
        break;
      case 'system_about':
        _pushPage(const AboutPage());
        break;
      case 'app_about_update':
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

  void _openAppUpdate() {
    if (!mounted) return;
    _pushPage(const AppUpdatePage());
  }

  void _updateAccountProfile(Map<String, dynamic> profile) {
    if (!mounted) return;
    setState(() {
      if (profile['name'] != null) _account['name'] = profile['name'];
      if (profile['mustChangePassword'] != null) {
        _account['mustChangePassword'] = profile['mustChangePassword'];
      }
    });
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
    AppLockRuntime.setSessionActive(false);
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
                            final telegramId = int.tryParse(
                              '${notification['telegramId'] ?? ''}',
                            );
                            final notificationId = int.tryParse(
                              '${notification['id'] ?? ''}',
                            );
                            final read = notification['readAt'] != null;
                            final requiresAction =
                                notification['type'] == 'route.approved' ||
                                notification['type'] == 'route.requested';
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
                              trailing: !read && requiresAction
                                  ? const Chip(
                                      label: Text(
                                        'إجراء مطلوب',
                                        style: TextStyle(fontSize: 9),
                                      ),
                                      visualDensity: VisualDensity.compact,
                                    )
                                  : null,
                              onTap: telegramId == null
                                  ? null
                                  : () async {
                                      if (!read &&
                                          !requiresAction &&
                                          notificationId != null) {
                                        try {
                                          await widget.api.call(
                                            'notifications.markRead',
                                            mutation: true,
                                            input: {'id': notificationId},
                                          );
                                        } catch (_) {
                                          // Opening the telegram still helps
                                          // the user recover from a mark-read
                                          // request failure.
                                        }
                                      }
                                      if (!dialogContext.mounted) return;
                                      Navigator.pop(dialogContext);
                                      await _openIncomingTelegram(telegramId);
                                    },
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
                        _pushPage(
                          NotificationsPage(
                            api: widget.api,
                            onOpenTelegram: (id) {
                              _openIncomingTelegram(id);
                            },
                          ),
                        );
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
          account: _account,
          organizationRole: activeOrganizationRole,
          organizationIsOwner: activeOrganizationIsOwner,
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
    _syncMessageTimer?.cancel();
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
      final canUseCachedDashboard =
          showLoading &&
          telegramPage == 1 &&
          section == 0 &&
          searchQuery.trim().isEmpty &&
          statusFilter == 'all' &&
          priorityFilter == 'all' &&
          classificationFilter == 'all' &&
          categoryFilter == 'all' &&
          _filterFrom == null &&
          _filterTo == null;
      if (canUseCachedDashboard) {
        final cached = await widget.api.readCachedDashboard();
        final cachedStats = cached?['stats'];
        final cachedTelegrams = cached?['telegrams'];
        if (mounted && cached != null && cachedTelegrams is List) {
          setState(() {
            if (cachedStats is Map) {
              stats = Map<String, dynamic>.from(cachedStats);
            }
            telegrams = List<dynamic>.from(cachedTelegrams);
            loading = false;
            error = null;
            _usingCachedData = true;
          });
        }
      }
      final results = await Future.wait([
        widget.api.call('dashboard.stats'),
        widget.api.call('organizations.context').catchError((_) => null),
        widget.api.call('settings.get').catchError((_) => null),
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
      var settings = results[2];
      final list = results[3];

      // Organization logos must come only from the verified active
      // organization. Never fall back to a legacy user-level logo.
      final contextOrganizationId = organizationContext is Map
          ? organizationContext['organizationId']?.toString().trim()
          : null;
      final settingsOrganizationId = settings is Map
          ? settings['organizationId']?.toString().trim()
          : null;
      final accountOrganization = _account['organization'];
      final accountOrganizationId =
          _account['organizationId'] ??
          _account['organization_id'] ??
          (accountOrganization is Map ? accountOrganization['id'] : null);
      final organizationId =
          (contextOrganizationId != null && contextOrganizationId.isNotEmpty)
          ? contextOrganizationId
          : settingsOrganizationId != null && settingsOrganizationId.isNotEmpty
          ? settingsOrganizationId
          : accountOrganizationId?.toString().trim();

      final mergedSettings = settings is Map
          ? Map<String, dynamic>.from(settings)
          : <String, dynamic>{};
      final savedOrganizationLogo = mergedSettings['logoUrl']
          ?.toString()
          .trim();
      // Use settings.get as a fallback only when its organization ID
      // matches the active organization. Missing metadata cannot prove that
      // a legacy logo belongs to this unit; the scoped endpoint may refresh it.
      mergedSettings['logoUrl'] =
          organizationId != null &&
              organizationId.isNotEmpty &&
              settingsOrganizationId == organizationId &&
              savedOrganizationLogo != null &&
              savedOrganizationLogo.isNotEmpty
          ? savedOrganizationLogo
          : null;
      final now = DateTime.now();
      final logoResolutionIsFresh =
          organizationId != null &&
          organizationId.isNotEmpty &&
          _logoLookupResolved &&
          _logoResolvedOrganizationId == organizationId &&
          _logoResolvedAt != null &&
          now.difference(_logoResolvedAt!) <
              (_lastLogoLookupSucceeded
                  ? const Duration(minutes: 10)
                  : const Duration(minutes: 2));
      var logoLookupSucceeded = false;
      if (logoResolutionIsFresh) {
        mergedSettings['logoUrl'] = _organizationLogoUrl;
      } else if (organizationId != null && organizationId.isNotEmpty) {
        try {
          final organizationSettings = await widget.api.call(
            'organizations.logo',
            input: {'organizationId': organizationId},
          );
          if (organizationSettings is Map &&
              organizationSettings['organizationId']?.toString() ==
                  organizationId) {
            final scopedLogo = organizationSettings['logoUrl']
                ?.toString()
                .trim();
            if (scopedLogo == null || scopedLogo.isEmpty) {
              mergedSettings['logoUrl'] = null;
            } else {
              mergedSettings['logoUrl'] = scopedLogo;
            }
            logoLookupSucceeded = true;
          }
        } catch (_) {
          // Preserve the verified account-scoped fallback if logo lookup is unavailable.
        }
      } else {
        mergedSettings['logoUrl'] = null;
      }
      if (organizationId != null && organizationId.isNotEmpty) {
        _logoLookupResolved = true;
        _logoResolvedOrganizationId = organizationId;
        _logoResolvedAt = now;
        _lastLogoLookupSucceeded =
            logoLookupSucceeded || mergedSettings['logoUrl'] != null;
      } else {
        _logoLookupResolved = false;
        _logoResolvedOrganizationId = null;
        _logoResolvedAt = null;
        _lastLogoLookupSucceeded = false;
      }
      settings = mergedSettings;

      final logoUrl = settings['logoUrl']?.toString().trim();
      final rows = list is Map && list['items'] is List
          ? list['items'] as List
          : list is List
          ? list
          : <dynamic>[];
      final hasMoreRows = rows.length > 20;
      final visibleRows = rows.take(20).toList(growable: false);
      if (mounted) {
        setState(() {
          _recordServerCheck(true);
          stats = Map<String, dynamic>.from(results[0] as Map);
          activeOrganizationId = organizationId;
          activeOrganizationName = organizationContext is Map
              ? (organizationContext['organizationName'] ??
                        organizationContext['name'])
                    ?.toString()
              : null;
          activeOrganizationRole = organizationContext is Map
              ? organizationContext['role']?.toString()
              : null;
          activeOrganizationIsOwner =
              organizationContext is Map &&
              organizationContext['isOwner'] == true;
          if (settings is Map) {
            numberSystem = settings['numberSystem'] == 'arabic'
                ? 'arabic'
                : 'latin';
            _organizationLogoUrl = logoUrl == null || logoUrl.isEmpty
                ? null
                : logoUrl;
          }
          telegrams = visibleRows;
          hasNextTelegramPage = hasMoreRows;
          error = null;
          _usingCachedData = false;
        });
      }
      unawaited(_loadOrganizationLogo(organizationId, _organizationLogoUrl));
      if (telegramPage == 1 &&
          section == 0 &&
          searchQuery.trim().isEmpty &&
          statusFilter == 'all' &&
          priorityFilter == 'all' &&
          classificationFilter == 'all' &&
          categoryFilter == 'all' &&
          _filterFrom == null &&
          _filterTo == null) {
        await widget.api.cacheDashboard(
          stats: Map<String, dynamic>.from(results[0] as Map),
          telegrams: visibleRows,
        );
      }
    } catch (e) {
      if (mounted) {
        final cached = await widget.api.readCachedDashboard();
        if (cached != null) {
          final cachedStats = cached['stats'];
          final cachedTelegrams = cached['telegrams'];
          setState(() {
            if (e is NetworkException) _recordServerCheck(false);
            if (e is ApiException) _recordServerCheck(true);
            if (cachedStats is Map) {
              stats = Map<String, dynamic>.from(cachedStats);
            }
            if (cachedTelegrams is List) telegrams = cachedTelegrams;
            error = 'وضع عدم الاتصال — تُعرض آخر نسخة محفوظة محليًا';
            _usingCachedData = true;
          });
        } else {
          setState(() {
            if (e is NetworkException) _recordServerCheck(false);
            if (e is ApiException) _recordServerCheck(true);
            error = _dashboardRefreshError(e);
            // No cached dashboard is available, so report the connection
            // failure instead of claiming that cached data is being shown.
            _usingCachedData = false;
          });
        }
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
      useSafeArea: true,
      builder: (sheetContext) {
        final keyboardInset = MediaQuery.viewInsetsOf(sheetContext).bottom;
        return AnimatedPadding(
          padding: EdgeInsets.only(bottom: keyboardInset),
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
          child: AdvancedCreateTelegramSheet(api: widget.api, outbox: _outbox),
        );
      },
    );
    if (result == true) {
      await _syncOutbox();
      refresh();
    }
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

  bool get _canViewReports => hasMobileTelegramReportAccess(
    accountRole: _account['role']?.toString(),
    organizationRole: activeOrganizationRole,
    isPlatformOwner: _isPlatformOwner,
  );

  bool get _canViewAuditLogs =>
      _account['role'] == 'admin' ||
      _isPlatformOwner ||
      activeOrganizationRole == 'system_admin';

  bool get _canManageUsers => hasMobileUserManagementAccess(
    accountRole: _account['role']?.toString(),
    organizationRole: activeOrganizationRole,
    isPlatformOwner: _isPlatformOwner,
  );

  bool get _canManageOrganizationSettings =>
      hasMobileOrganizationSettingsAccess(
        organizationRole: activeOrganizationRole,
        isPlatformOwner: _isPlatformOwner,
      );

  bool get _isPlatformOwner =>
      activeOrganizationIsOwner || _account['isPlatformOwner'] == true;

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
            icon: LucideIcons.fileText,
            label: 'تقرير البرقيات',
            onPressed: () => _pushPage(ReportsPage(api: widget.api)),
          ),
        ),
        const SizedBox(width: 7),
      ],
      Expanded(
        child: _dashboardActionButton(
          icon: LucideIcons.slidersHorizontal,
          label: 'تخصيص العرض',
          onPressed: _showDisplayCustomization,
        ),
      ),
      const SizedBox(width: 7),
      Expanded(
        child: _dashboardActionButton(
          icon: LucideIcons.listFilter,
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
                title: const Text('الأسبقية ودرجة السرية'),
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
            child: const Icon(LucideIcons.siren, color: Colors.white),
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

  Widget _outboxAlert() {
    final Color accent = switch (_syncPhase) {
      'error' => const Color(0xFFB42332),
      'success' => const Color(0xFF16836B),
      'idle' =>
        _serverReachable == true
            ? const Color(0xFF16836B)
            : _serverReachable == false
            ? const Color(0xFFB7791F)
            : const Color(0xFF667085),
      'syncing' => const Color(0xFF356AC3),
      _ => const Color(0xFFB7791F),
    };
    final IconData icon = switch (_syncPhase) {
      'error' => Icons.sync_problem_outlined,
      'success' => Icons.cloud_done_outlined,
      'idle' =>
        _serverReachable == true
            ? Icons.cloud_done_outlined
            : _serverReachable == false
            ? Icons.cloud_off_outlined
            : Icons.cloud_outlined,
      'syncing' => Icons.sync,
      _ => Icons.cloud_upload_outlined,
    };
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.fromLTRB(13, 12, 13, 10),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: accent.withValues(alpha: 0.22)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(icon, color: accent, size: 21),
              const SizedBox(width: 9),
              Expanded(
                child: Text(
                  _syncPhase == 'syncing'
                      ? 'المزامنة اللحظية قيد التنفيذ'
                      : _syncPhase == 'success'
                      ? 'اكتملت المزامنة بنجاح'
                      : _syncPhase == 'idle'
                      ? 'حالة صندوق الخروج'
                      : _pendingOutbox > 0
                      ? 'صندوق الخروج — $_pendingOutbox معلقة'
                      : 'حالة صندوق الخروج',
                  style: TextStyle(
                    color: accent,
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              if (_pendingOutbox > 0)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: accent.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: Text(
                    '$_pendingOutbox معلقة',
                    style: TextStyle(
                      color: accent,
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
            ],
          ),
          if (_lastSyncMessage != null ||
              (!_outboxSyncing && _pendingOutbox == 0)) ...[
            const SizedBox(height: 5),
            Text(
              _lastSyncMessage ?? _idleOutboxMessage,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Color(0xFF667085),
                fontSize: 10,
                height: 1.35,
              ),
            ),
          ],
          const SizedBox(height: 4),
          Text(
            _serverStatusMessage,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: _serverStatusColor,
              fontSize: 10,
              height: 1.35,
            ),
          ),
          if (_lastSyncAt != null && !_outboxSyncing)
            Padding(
              padding: const EdgeInsets.only(top: 3),
              child: Text(
                'آخر فحص للصندوق ${_syncTime(_lastSyncAt!)}',
                style: const TextStyle(color: Color(0xFF98A2B3), fontSize: 9),
              ),
            ),
          if (_outboxSyncing) ...[
            const SizedBox(height: 9),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: const LinearProgressIndicator(minHeight: 3),
            ),
          ],
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: Wrap(
              spacing: 2,
              children: [
                TextButton(
                  onPressed: _openOutbox,
                  child: const Text('التفاصيل'),
                ),
                TextButton(
                  onPressed: _outboxSyncInProgress ? null : () => _syncOutbox(),
                  child: const Text('مزامنة الآن'),
                ),
              ],
            ),
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
            icon: const Icon(LucideIcons.panelLeft),
          ),
        ),
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: Image.asset(
                'assets/police-telegrams-icon.png',
                width: 36,
                height: 36,
                fit: BoxFit.contain,
                semanticLabel: 'أيقونة نظام برقيات الشرطة',
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
                const Icon(LucideIcons.bell),
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
            icon: const Icon(LucideIcons.ellipsis),
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
              if (_canManageOrganizationSettings)
                const PopupMenuItem(
                  value: 'department',
                  child: _AccountMenuItem(
                    icon: Icons.settings_outlined,
                    title: 'إعدادات الجهة',
                  ),
                ),
              if (_canManageUsers) ...[
                PopupMenuItem<String>(
                  enabled: false,
                  height: 34,
                  child: Text(
                    getMobileManagementMenuHeading(
                      accountRole: _account['role']?.toString(),
                      isPlatformOwner: _isPlatformOwner,
                    ),
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF7A8493),
                    ),
                  ),
                ),
                if (_isPlatformOwner)
                  const PopupMenuItem(
                    value: 'platform_document_settings',
                    child: _AccountMenuItem(
                      icon: Icons.tune_rounded,
                      title: 'إعدادات النظام والوثائق',
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
                  value: 'organizations',
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
                value: 'system_about',
                child: _AccountMenuItem(
                  icon: Icons.account_tree_outlined,
                  title: 'حول النظام وميزاته',
                ),
              ),
              const PopupMenuItem(
                value: 'app_about_update',
                child: _AccountMenuItem(
                  icon: Icons.phone_android_rounded,
                  title: 'حول التطبيق والتحديثات',
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
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'نظام برقيات الشرطة',
                              style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w800,
                                fontSize: 13,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              _currentOrganizationLabel,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Color(0xFFD8C38E),
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        tooltip: 'إغلاق القائمة',
                        onPressed: () => Navigator.pop(context),
                        icon: const Icon(
                          LucideIcons.panelLeft,
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
                  leading: const Icon(LucideIcons.layoutDashboard),
                  title: const Text('لوحة التحكم'),
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
                  leading: const Icon(LucideIcons.plus),
                  title: const Text('إنشاء برقية'),
                  onTap: () {
                    Navigator.pop(context);
                    create();
                  },
                ),
                ListTile(
                  leading: const Icon(LucideIcons.fileSpreadsheet),
                  title: const Text('استيراد وتصدير السجل'),
                  onTap: () {
                    Navigator.pop(context);
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => TelegramExcelPage(api: widget.api),
                      ),
                    );
                  },
                ),
                if (_canManageUsers)
                  ListTile(
                    leading: const Icon(LucideIcons.users),
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
                if (_canViewAuditLogs)
                  ListTile(
                    leading: const Icon(Icons.history),
                    title: const Text('سجل الإجراءات'),
                    subtitle: const Text('سجل التدقيق المركزي'),
                    onTap: () {
                      Navigator.pop(context);
                      _pushPage(AuditLogPage(api: widget.api));
                    },
                  ),
                const Divider(color: Color(0xFF29415E)),
                ListTile(
                  leading: const Icon(LucideIcons.mapPinned),
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
                  leading: const Icon(LucideIcons.users),
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
                  leading: const Icon(LucideIcons.activity),
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
                  leading: const Icon(LucideIcons.archive),
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
        child: const Icon(LucideIcons.plus),
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(onRefresh: refresh, child: _sectionBody()),
    ),
  );

  Widget _swipeableWelcomeOutboxPanel() {
    final showingOutbox = _showOutboxInTopCard;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        GestureDetector(
          behavior: HitTestBehavior.opaque,
          onHorizontalDragStart: (_) {
            _outboxSwipeDistance = 0;
          },
          onHorizontalDragUpdate: (details) {
            _outboxSwipeDistance += details.delta.dx;
          },
          onHorizontalDragEnd: (details) {
            final velocity = details.primaryVelocity ?? 0;
            final distance = _outboxSwipeDistance;
            _outboxSwipeDistance = 0;
            if (velocity.abs() < 180 && distance.abs() < 40) return;
            setState(() => _showOutboxInTopCard = !_showOutboxInTopCard);
          },
          child: AnimatedSize(
            duration: const Duration(milliseconds: 360),
            curve: Curves.easeInOutCubic,
            alignment: Alignment.topCenter,
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 420),
              switchInCurve: Curves.easeOutCubic,
              switchOutCurve: Curves.easeInCubic,
              transitionBuilder: (child, animation) {
                final slide = Tween<Offset>(
                  begin: const Offset(0.045, 0),
                  end: Offset.zero,
                ).animate(animation);
                return FadeTransition(
                  opacity: animation,
                  child: SlideTransition(position: slide, child: child),
                );
              },
              child: KeyedSubtree(
                key: ValueKey<bool>(showingOutbox),
                child: showingOutbox ? _outboxAlert() : _welcomePanel(),
              ),
            ),
          ),
        ),
        const SizedBox(height: 2),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.swipe_rounded, size: 15, color: const Color(0xFF7A8493)),
            const SizedBox(width: 5),
            Flexible(
              child: Text(
                showingOutbox
                    ? 'اسحب للتبديل إلى لوحة الترحيب'
                    : 'اسحب لعرض بطاقة صندوق الخروج',
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Color(0xFF7A8493),
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(width: 9),
            _swipePageIndicator(active: !showingOutbox),
            const SizedBox(width: 4),
            _swipePageIndicator(active: showingOutbox),
          ],
        ),
        const SizedBox(height: 8),
      ],
    );
  }

  Widget _swipePageIndicator({required bool active}) => AnimatedContainer(
    duration: const Duration(milliseconds: 220),
    width: active ? 16 : 5,
    height: 5,
    decoration: BoxDecoration(
      color: active ? navy : const Color(0xFFD0D5DD),
      borderRadius: BorderRadius.circular(8),
    ),
  );

  Widget _welcomePanel() {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFEFC),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: const Color(0xFFE5E5DF)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0C10233F),
            blurRadius: 16,
            offset: Offset(0, 5),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              _organizationLogoWidget(size: 52, borderRadius: 16),
              const SizedBox(width: 10),
              Expanded(child: _AnimatedWelcomeGreeting(name: _greetingName)),
              const SizedBox(width: 8),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 112),
                child: _systemStatusIndicator(),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: const Color(0xFFF8F7F2),
              borderRadius: BorderRadius.circular(15),
              border: Border.all(color: const Color(0xFFE5E7EB)),
            ),
            child: Row(
              children: [
                const Icon(Icons.business_outlined, color: navy, size: 18),
                const SizedBox(width: 9),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'الجهة الحالية',
                        style: TextStyle(
                          color: Color(0xFF7A8493),
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        _currentOrganizationLabel,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: navy,
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                ),
                if (activeOrganizationIsOwner)
                  const Icon(
                    Icons.workspace_premium_outlined,
                    color: gold,
                    size: 17,
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _systemStatusIndicator() {
    final Color accent;
    final String title;
    if (loading) {
      accent = const Color(0xFF356AC3);
      title = 'جارٍ التحديث';
    } else if (_usingCachedData) {
      accent = const Color(0xFFB7791F);
      title = 'النظام غير متصل';
    } else if (error != null) {
      accent = const Color(0xFFB42332);
      // The detailed error card already contains the connection-error text.
      // Keep this compact indicator distinct to avoid duplicate announcements.
      title = 'النظام غير متصل';
    } else {
      accent = const Color(0xFF16836B);
      title = 'النظام متصل';
    }
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Flexible(
          child: Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: accent,
              fontSize: 10,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
        const SizedBox(width: 6),
        Semantics(
          label: title,
          child: Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: accent, shape: BoxShape.circle),
          ),
        ),
      ],
    );
  }

  String _syncTime(DateTime value) {
    final local = value.toLocal();
    return '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  }

  Widget _sectionBody() {
    final values = <(String, String, String, IconData, Color)>[
      (
        'إجمالي البرقيات',
        'total',
        'الرصيد التشغيلي',
        LucideIcons.fileText,
        const Color(0xFF687385),
      ),
      (
        'الصادرة اليوم',
        'today',
        'من بداية اليوم',
        LucideIcons.activity,
        const Color(0xFF356AC3),
      ),
      (
        'أولوية عاجلة اليوم',
        'todayUrgent',
        'من بداية اليوم',
        LucideIcons.siren,
        const Color(0xFFB54736),
      ),
      (
        'الواردة اليوم',
        'todayIncoming',
        'إلى جهتك منذ بداية اليوم',
        LucideIcons.inbox,
        const Color(0xFF16836B),
      ),
      (
        'قيد الإجراء',
        'inProgress',
        'قيد المعالجة',
        LucideIcons.radio,
        const Color(0xFF17899A),
      ),
      (
        'مكتملة نهائيًا',
        'resolved',
        'تم إغلاقها',
        LucideIcons.circleCheck,
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
        _swipeableWelcomeOutboxPanel(),
        _dashboardActions(),
        _urgentAlert(),
        const SizedBox(height: 12),
        LayoutBuilder(
          builder: (context, constraints) {
            final width = constraints.maxWidth;
            final columns = width >= 1100
                ? 4
                : width >= 700
                ? 3
                : width < 340
                ? 1
                : 2;
            final aspectRatio = columns == 1
                ? 3.1
                : width < 390
                ? 1.28
                : 1.48;
            return GridView.count(
              crossAxisCount: columns,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              childAspectRatio: aspectRatio,
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
            );
          },
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
                      LucideIcons.listFilter,
                      0,
                    ),
                    const SizedBox(width: 7),
                    _telegramViewButton(
                      'البرقيات الصادرة',
                      stats['outgoing'] ?? 0,
                      LucideIcons.send,
                      1,
                    ),
                    const SizedBox(width: 7),
                    _telegramViewButton(
                      'البرقيات الواردة',
                      stats['incoming'] ?? 0,
                      LucideIcons.inbox,
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
    'urgent' => 'أولوية عاجلة اليوم',
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
              const Icon(LucideIcons.listFilter, color: navy, size: 20),
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
                  ('submitted', 'مرسلة للمراجعة'),
                  ('in_review', 'قيد المراجعة'),
                  ('approved', 'معتمدة'),
                  ('returned', 'معادة للتصحيح'),
                  ('rejected', 'مرفوضة'),
                  ('forwarded', 'محالة'),
                  ('pending', 'قيد الانتظار'),
                  ('in_progress', 'قيد الإجراء'),
                  ('resolved', 'منجزة'),
                  ('completed', 'مكتملة'),
                  ('archived', 'مؤرشفة'),
                ], (value) => _setTelegramFilter(status: value)),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _filterDropdown('الأسبقية', priorityFilter, const [
                  ('all', 'كل الأولويات'),
                  ('urgent', 'عاجلة'),
                  ('normal', 'عادية'),
                  ('slow', 'بطيئة'),
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
                  ('normal', 'عادية'),
                  ('secret', 'سري'),
                ], (value) => _setTelegramFilter(classification: value)),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _filterDropdown('التصنيف', categoryFilter, const [
                  ('all', 'كل التصنيفات'),
                  ('administrative', 'إداري'),
                  ('criminal', 'جنائي'),
                  ('traffic', 'مروري'),
                  ('security', 'أمني'),
                  ('tactical', 'عملياتي'),
                  ('intelligence', 'استخباراتي'),
                  ('emergency', 'طوارئ'),
                  ('public_order', 'حفظ النظام'),
                  ('personnel', 'شؤون الأفراد'),
                  ('logistics', 'إمداد ودعم'),
                  ('training', 'تدريب وتأهيل'),
                  ('community', 'مجتمعي وشكاوى'),
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

    String statusLabel(dynamic raw) {
      final key = '$raw'.toLowerCase();
      return telegramStatusLabels[key] ?? (key == 'null' ? 'مسودة' : '$raw');
    }

    String categoryLabel(dynamic raw) {
      final key = '$raw'.toLowerCase();
      return telegramCategoryLabels[key] ?? '$raw';
    }

    String priorityLabel(dynamic raw) {
      final key = '$raw'.toLowerCase();
      return telegramPriorityLabels[key] ??
          switch (key) {
            'critical' || 'high' => 'عاجلة',
            'low' => 'منخفض',
            'standard' => 'عادية',
            _ => '$raw',
          };
    }

    String confidentialityLabel(dynamic raw) {
      final key = '$raw'.toLowerCase();
      return telegramClassificationLabels[key] ??
          switch (key) {
            'confidential' || 'restricted' => 'سري',
            'top_secret' || 'top secret' => 'سري للغاية',
            'public' => 'عادية',
            _ => '$raw',
          };
    }

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
    final telegramId = int.tryParse('${row['id']}');
    final serial = getTelegramDisplaySerial(row, numberSystem);
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
        _account['name'] ??
        _account['username'] ??
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
      onTap: telegramId == null
          ? null
          : () async {
              await Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => TelegramDetailsPage(
                    api: widget.api,
                    telegramId: telegramId,
                    initialTelegram: row,
                    account: _account,
                    organizationRole: activeOrganizationRole,
                    organizationIsOwner: activeOrganizationIsOwner,
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
                    'برقية رقم: $serial',
                    textAlign: TextAlign.right,
                    style: const TextStyle(
                      fontFamily: 'Cairo',
                      color: Color(0xFF182230),
                      fontSize: 16,
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
                    priority == 'عاجلة'
                        ? const Color(0xFFFFE9E9)
                        : const Color(0xFFEAF0FF),
                    priority == 'عاجلة'
                        ? const Color(0xFFB42332)
                        : const Color(0xFF356AC3),
                    icon: priority == 'عاجلة'
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
        fontFamily: 'Cairo',
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

  Widget _paginationControls() => LayoutBuilder(
    builder: (context, constraints) {
      final pageLabel = Text(
        'صفحة $telegramPage',
        style: const TextStyle(color: Colors.black54, fontSize: 12),
      );
      final controls = Wrap(
        spacing: 8,
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
      );

      if (constraints.maxWidth < 340) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            pageLabel,
            const SizedBox(height: 8),
            Align(alignment: AlignmentDirectional.centerEnd, child: controls),
          ],
        );
      }

      return Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [pageLabel, controls],
      );
    },
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
    this.initialTelegram,
    required this.account,
    required this.organizationRole,
    required this.organizationIsOwner,
    this.officialDocument = false,
  });
  final PoliceApi api;
  final int telegramId;
  final Map<String, dynamic>? initialTelegram;
  final Map<String, dynamic> account;
  final String? organizationRole;
  final bool organizationIsOwner;
  final bool officialDocument;
  @override
  State<TelegramDetailsPage> createState() => _TelegramDetailsPageState();
}

class _TelegramDetailsPageState extends State<TelegramDetailsPage> {
  bool loading = true;
  String? error;
  Map<String, dynamic>? telegram;

  bool get _isAdmin => widget.account['role'] == 'admin';
  bool get _canOperate =>
      _isAdmin ||
      const {
        'system_admin',
        'organization_admin',
        'regional_admin',
        'organization_supervisor',
        'reviewer',
        'dispatcher',
      }.contains(widget.organizationRole);

  bool get _managementExpired {
    final createdAt = DateTime.tryParse('${telegram?['createdAt'] ?? ''}');
    return !_isAdmin &&
        !widget.organizationIsOwner &&
        createdAt != null &&
        DateTime.now().difference(createdAt) > const Duration(hours: 48);
  }

  String _statusLabel(dynamic value) {
    final raw = '$value';
    return telegramStatusLabels[raw.toLowerCase()] ?? raw;
  }

  String _priorityLabel(dynamic value) {
    final raw = '$value';
    return telegramPriorityLabels[raw.toLowerCase()] ?? raw;
  }

  String _classificationLabel(dynamic value) {
    final raw = '$value';
    final normalized = raw.toLowerCase();
    return telegramClassificationLabels[normalized] ??
        switch (normalized) {
          'confidential' || 'restricted' => 'سري',
          'top_secret' || 'top secret' => 'سري للغاية',
          'public' => 'عادية',
          _ => raw,
        };
  }

  String _categoryLabel(dynamic value) {
    final raw = '$value';
    return telegramCategoryLabels[raw.toLowerCase()] ?? raw;
  }

  String _formatDate(dynamic value) {
    final date = DateTime.tryParse('$value');
    if (date == null) return '$value';
    final local = date.toLocal();
    return '${local.year}/${local.month.toString().padLeft(2, '0')}/${local.day.toString().padLeft(2, '0')} ${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  }

  @override
  void initState() {
    super.initState();
    telegram = widget.initialTelegram;
    loading = widget.initialTelegram == null;
    load();
  }

  Future<void> load() async {
    final input = {'id': widget.telegramId};
    try {
      final cached = await widget.api.readCachedResponse(
        'telegrams.get',
        input: input,
      );
      if (mounted && cached is Map) {
        setState(() {
          telegram = Map<String, dynamic>.from(cached);
          loading = false;
          error = null;
        });
      }
    } catch (_) {
      // A corrupt cache must never block the authoritative request.
    }
    try {
      final data = await widget.api.call('telegrams.get', input: input);
      if (mounted) {
        setState(() {
          telegram = Map<String, dynamic>.from(data as Map);
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

  Future<void> _editTelegram() async {
    if (telegram == null) await load();
    if (!mounted) return;
    final currentTelegram = telegram;
    if (currentTelegram == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error ?? 'تعذر تحميل بيانات البرقية للتعديل.')),
      );
      return;
    }
    if (_managementExpired) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'انتهت مهلة تعديل البرقية البالغة 48 ساعة؛ الصلاحية الدائمة للمالك فقط.',
          ),
        ),
      );
      return;
    }

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
    if (telegram == null) await load();
    if (!mounted) return;
    if (telegram == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error ?? 'تعذر تحميل بيانات البرقية للحذف.')),
      );
      return;
    }
    if (_managementExpired) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'انتهت مهلة حذف البرقية البالغة 48 ساعة؛ الصلاحية الدائمة للمالك فقط.',
          ),
        ),
      );
      return;
    }
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
    if (widget.officialDocument) {
      return OfficialTelegramDocumentPage(
        api: widget.api,
        telegramId: widget.telegramId,
        onEdit: _editTelegram,
        onDelete: _deleteTelegram,
        onSubmitForReview: _canOperate && data?['status'] == 'draft'
            ? () async {
                await widget.api.call(
                  'telegrams.transition',
                  mutation: true,
                  input: {'id': widget.telegramId, 'toStatus': 'submitted'},
                );
                await load();
              }
            : null,
      );
    }
    final displaySerial = getTelegramDisplaySerial(data ?? const {}, null);
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
            : error != null && data == null
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
                          'برقية رقم: $displaySerial',
                          style: const TextStyle(
                            fontFamily: 'Cairo',
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
                            label: Text(
                              _statusLabel(data?['status'] ?? 'draft'),
                            ),
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
                    _infoRow(
                      'الأسبقية',
                      _priorityLabel(data?['priority'] ?? 'normal'),
                    ),
                    _infoRow(
                      'درجة السرية',
                      _classificationLabel(data?['classification'] ?? 'normal'),
                    ),
                    _infoRow(
                      'التصنيف',
                      _categoryLabel(data?['category'] ?? 'administrative'),
                    ),
                    _infoRow(
                      'تاريخ الإنشاء',
                      _formatDate(data?['createdAt'] ?? '—'),
                    ),
                    if (data?['creatorName'] != null)
                      _infoRow('منشئ البرقية', data?['creatorName']),
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
                    telegramStatus: '${data?['status'] ?? 'draft'}',
                    canOperate: _canOperate,
                    isAdmin: _isAdmin,
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
  String classification = 'normal';
  String category = 'administrative';
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
          'classification': classification,
          'priority': priority,
          'category': category,
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
                labelText: 'الأسبقية',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(value: 'urgent', child: Text('عاجلة')),
                DropdownMenuItem(value: 'normal', child: Text('عادية')),
                DropdownMenuItem(value: 'slow', child: Text('بطيئة')),
              ],
              onChanged: (value) {
                if (value != null) setState(() => priority = value);
              },
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: classification,
              decoration: const InputDecoration(
                labelText: 'درجة السرية',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(value: 'normal', child: Text('عادية')),
                DropdownMenuItem(value: 'secret', child: Text('سري')),
              ],
              onChanged: (value) {
                if (value != null) setState(() => classification = value);
              },
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: category,
              decoration: const InputDecoration(
                labelText: 'تصنيف البرقية',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(value: 'administrative', child: Text('إداري')),
                DropdownMenuItem(value: 'criminal', child: Text('جنائي')),
                DropdownMenuItem(value: 'traffic', child: Text('مروري')),
                DropdownMenuItem(value: 'security', child: Text('أمني')),
                DropdownMenuItem(value: 'tactical', child: Text('عملياتي')),
                DropdownMenuItem(
                  value: 'intelligence',
                  child: Text('استخباراتي'),
                ),
                DropdownMenuItem(value: 'emergency', child: Text('طوارئ')),
                DropdownMenuItem(
                  value: 'public_order',
                  child: Text('حفظ النظام'),
                ),
                DropdownMenuItem(
                  value: 'personnel',
                  child: Text('شؤون الأفراد'),
                ),
                DropdownMenuItem(value: 'logistics', child: Text('إمداد ودعم')),
                DropdownMenuItem(
                  value: 'training',
                  child: Text('تدريب وتأهيل'),
                ),
                DropdownMenuItem(
                  value: 'community',
                  child: Text('مجتمعي وشكاوى'),
                ),
                DropdownMenuItem(value: 'other', child: Text('أخرى')),
              ],
              onChanged: (value) {
                if (value != null) setState(() => category = value);
              },
            ),
            const SizedBox(height: 10),
            TextField(
              controller: body,
              minLines: 5,
              maxLines: null,
              keyboardType: TextInputType.multiline,
              textInputAction: TextInputAction.newline,
              textDirection: TextDirection.rtl,
              textAlignVertical: TextAlignVertical.top,
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
