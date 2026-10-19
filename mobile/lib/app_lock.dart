import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';

class AppLockService {
  AppLockService._();

  static const FlutterSecureStorage _storage = FlutterSecureStorage();
  static const String _enabledKey = 'mobile_app_lock_enabled';
  static const String _pinKey = 'mobile_app_lock_pin';
  static const String _biometricKey = 'mobile_app_lock_biometric';
  static final LocalAuthentication _authentication = LocalAuthentication();

  static Future<bool> isEnabled() async {
    final enabled = await _storage.read(key: _enabledKey) == 'true';
    if (enabled) return true;

    // A saved PIN always implies an enabled lock. This also repairs older or
    // partially written settings that would otherwise bypass the lock screen.
    return hasPin();
  }

  static Future<bool> hasPin() async =>
      (await _storage.read(key: _pinKey))?.isNotEmpty ?? false;

  static Future<bool> isBiometricEnabled() async =>
      await _storage.read(key: _biometricKey) == 'true';

  static Future<bool> hasLegacyPin() async {
    final pin = await _storage.read(key: _pinKey);
    return pin != null && !RegExp(r'^\d{4}$').hasMatch(pin);
  }

  static Future<void> savePin(String pin) async {
    if (!RegExp(r'^\d{4}$').hasMatch(pin)) {
      throw const FormatException('يجب أن يتكون رمز PIN من 4 أرقام بالضبط.');
    }
    try {
      await _storage.write(key: _pinKey, value: pin);
      await _storage.write(key: _enabledKey, value: 'true');
    } finally {
      // Refresh the overlay even if the second write fails. Since a stored PIN
      // itself enforces the lock, a partial settings write must fail closed.
      AppLockRuntime.notifySettingsChanged();
    }
  }

  static Future<bool> verifyPin(String pin) async =>
      pin == await _storage.read(key: _pinKey);

  static Future<void> setEnabled(bool enabled) async {
    if (!enabled) {
      throw StateError('رمز PIN إلزامي لحماية التطبيق ولا يمكن تعطيل القفل.');
    }
    if (!await hasPin()) {
      throw StateError('أنشئ رمز PIN أولاً قبل فتح التطبيق.');
    }
    await _storage.write(key: _enabledKey, value: 'true');
    AppLockRuntime.notifySettingsChanged();
  }

  static Future<bool> canUseBiometrics() async {
    try {
      final supported = await _authentication.isDeviceSupported();
      final canCheck = await _authentication.canCheckBiometrics;
      return supported && canCheck;
    } on MissingPluginException {
      // Biometric authentication is unavailable when the platform plugin is
      // not registered (for example, on unsupported platforms or in tests).
      return false;
    } on PlatformException {
      return false;
    }
  }

  static Future<void> setBiometricEnabled(bool enabled) async {
    if (enabled && !await hasPin()) {
      throw StateError('أنشئ رمز PIN أولاً قبل تفعيل المصادقة بالبصمة.');
    }
    if (enabled && !await canUseBiometrics()) {
      throw StateError('لا تتوفر مصادقة بالبصمة على هذا الجهاز.');
    }
    if (enabled && !await authenticateBiometric()) {
      throw StateError('تعذر التحقق بالبصمة؛ لم يتم تفعيل الخيار.');
    }
    await _storage.write(key: _biometricKey, value: enabled ? 'true' : 'false');
    AppLockRuntime.notifySettingsChanged();
  }

  static Future<bool> authenticateBiometric() async {
    try {
      return await _authentication.authenticate(
        localizedReason: 'تحقق من هويتك لفتح تطبيق برقيات الشرطة',
        options: const AuthenticationOptions(
          biometricOnly: true,
          stickyAuth: true,
          useErrorDialogs: true,
        ),
      );
    } on MissingPluginException {
      return false;
    } on PlatformException {
      return false;
    }
  }
}

Future<bool> showMandatoryPinSetupDialog(BuildContext context) async =>
    await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const _MandatoryPinSetupDialog(),
    ) ??
    false;

class _MandatoryPinSetupDialog extends StatefulWidget {
  const _MandatoryPinSetupDialog();

  @override
  State<_MandatoryPinSetupDialog> createState() =>
      _MandatoryPinSetupDialogState();
}

class _MandatoryPinSetupDialogState extends State<_MandatoryPinSetupDialog> {
  final _pinController = TextEditingController();
  final _confirmationController = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _pinController.dispose();
    _confirmationController.dispose();
    super.dispose();
  }

  Future<void> _savePin() async {
    final pin = _pinController.text;
    if (!RegExp(r'^\d{4}$').hasMatch(pin)) {
      setState(() => _error = 'يجب أن يتكون الرمز من 4 أرقام بالضبط.');
      return;
    }
    if (pin != _confirmationController.text) {
      setState(() => _error = 'تأكيد الرمز غير مطابق.');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await AppLockService.savePin(pin);
      if (mounted) Navigator.of(context).pop(true);
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'تعذر حفظ الرمز في التخزين الآمن. حاول مجددًا.';
          _saving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: false,
    child: Directionality(
      textDirection: TextDirection.rtl,
      child: AlertDialog(
        title: const Text('إنشاء رمز PIN إلزامي'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'للمتابعة إلى التطبيق، أنشئ رمز PIN من 4 أرقام بالضبط وأكّده. سيُحفظ الرمز في التخزين الآمن للجهاز.',
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _pinController,
              autofocus: true,
              keyboardType: TextInputType.number,
              obscureText: true,
              maxLength: 4,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(labelText: 'رمز PIN الجديد'),
            ),
            TextField(
              controller: _confirmationController,
              keyboardType: TextInputType.number,
              obscureText: true,
              maxLength: 4,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(labelText: 'تأكيد رمز PIN'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
          ],
        ),
        actions: [
          FilledButton(
            onPressed: _saving ? null : _savePin,
            child: Text(_saving ? 'جارٍ الحفظ...' : 'حفظ ومتابعة'),
          ),
        ],
      ),
    ),
  );
}

class AppLockRuntime {
  AppLockRuntime._();

  static final ValueNotifier<bool> sessionActive = ValueNotifier<bool>(false);
  static final ValueNotifier<int> settingsChanged = ValueNotifier<int>(0);

  static void setSessionActive(bool active) {
    sessionActive.value = active;
  }

  static void notifySettingsChanged() {
    settingsChanged.value++;
  }
}

class AppLockOverlayHost extends StatefulWidget {
  const AppLockOverlayHost({super.key, required this.child});

  final Widget child;

  @override
  State<AppLockOverlayHost> createState() => _AppLockOverlayHostState();
}

class _AppLockOverlayHostState extends State<AppLockOverlayHost> {
  late final OverlayEntry _entry = OverlayEntry(
    builder: (_) => AppLockOverlay(child: widget.child),
  );

  @override
  void didUpdateWidget(covariant AppLockOverlayHost oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.child != widget.child) _entry.markNeedsBuild();
  }

  @override
  Widget build(BuildContext context) => Overlay(initialEntries: [_entry]);

  @override
  void dispose() {
    _entry.remove();
    _entry.dispose();
    super.dispose();
  }
}

class AppLockOverlay extends StatefulWidget {
  const AppLockOverlay({super.key, required this.child});

  final Widget child;

  @override
  State<AppLockOverlay> createState() => _AppLockOverlayState();
}

class _AppLockOverlayState extends State<AppLockOverlay>
    with WidgetsBindingObserver {
  bool _settingsLoaded = false;
  bool _enabled = false;
  bool _biometricEnabled = false;
  bool _legacyPin = false;
  bool _settingsLoadFailed = false;
  bool _locked = false;
  bool _busy = false;
  int _unlockGeneration = 0;
  String _pin = '';
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    AppLockRuntime.sessionActive.addListener(_onSessionChanged);
    AppLockRuntime.settingsChanged.addListener(_onSettingsChanged);
    _loadSettings();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    AppLockRuntime.sessionActive.removeListener(_onSessionChanged);
    AppLockRuntime.settingsChanged.removeListener(_onSettingsChanged);
    super.dispose();
  }

  Future<void> _loadSettings({bool forceLock = false}) async {
    final unlockGenerationAtStart = _unlockGeneration;
    try {
      final values = await Future.wait([
        AppLockService.isEnabled(),
        AppLockService.isBiometricEnabled(),
        AppLockService.hasLegacyPin(),
      ]);
      if (!mounted) return;
      final wasLoaded = _settingsLoaded;
      final wasEnabled = _enabled;
      final enabled = values[0];
      setState(() {
        _enabled = enabled;
        _biometricEnabled = values[1];
        _legacyPin = values[2];
        _settingsLoadFailed = false;
        _settingsLoaded = true;
        _locked =
            enabled &&
            AppLockRuntime.sessionActive.value &&
            ((forceLock && unlockGenerationAtStart == _unlockGeneration) ||
                !wasLoaded ||
                (!wasEnabled && enabled) ||
                _locked);
      });
    } catch (error) {
      if (!mounted) return;

      // Fail closed for every storage error, including an unregistered
      // platform plugin. Never disable an existing lock because its settings
      // could not be read; tests should mock secure storage explicitly.
      setState(() {
        _enabled = true;
        _biometricEnabled = false;
        // Do not permit PIN or biometric authentication against incomplete
        // settings: in particular, that could skip legacy-PIN migration.
        _legacyPin = false;
        _settingsLoadFailed = true;
        _settingsLoaded = true;
        _locked = AppLockRuntime.sessionActive.value;
        _error =
            'تعذر الوصول إلى التخزين الآمن. أعد تشغيل التطبيق وحاول مجددًا.';
      });
    }
  }

  void _onSettingsChanged() {
    _loadSettings();
  }

  void _onSessionChanged() {
    if (!mounted) return;
    setState(() {
      _locked = _enabled && AppLockRuntime.sessionActive.value;
      _pin = '';
      _error = null;
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Android may briefly report inactive while showing system UI. Relocking
    // then can erase the PIN during entry; only background transitions relock.
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden) {
      if (_enabled && AppLockRuntime.sessionActive.value && mounted) {
        setState(() {
          _locked = true;
          _pin = '';
          _error = null;
        });
      }
    } else if (state == AppLifecycleState.resumed) {
      _loadSettings(forceLock: true);
    }
  }

  Future<void> _submitPin() async {
    if (_settingsLoadFailed) {
      setState(() {
        _error = 'تعذر تحميل إعدادات الحماية. أعد المحاولة قبل فتح التطبيق.';
      });
      return;
    }
    if (_busy || _pin.length < 4) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (await AppLockService.verifyPin(_pin)) {
        if (!mounted) return;
        if (_legacyPin) {
          final pinUpdated = await showMandatoryPinSetupDialog(context);
          if (!pinUpdated) {
            if (mounted) {
              setState(() {
                _pin = '';
                _error = 'يجب تحديث الرمز السابق إلى PIN من 4 أرقام للمتابعة.';
              });
            }
            return;
          }
          _legacyPin = false;
        }
        _unlockGeneration++;
        if (mounted) {
          setState(() {
            _locked = false;
            _pin = '';
            _error = null;
          });
        }
      } else if (mounted) {
        setState(() {
          _pin = '';
          _error = 'رمز PIN غير صحيح. حاول مرة أخرى.';
        });
      }
    } catch (_) {
      if (mounted) setState(() => _error = 'تعذر التحقق من الرمز الآمن.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submitBiometric() async {
    if (_settingsLoadFailed || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final authenticated = await AppLockService.authenticateBiometric();
      if (!authenticated) {
        if (mounted) {
          setState(() => _error = 'لم تكتمل المصادقة بالبصمة.');
        }
        return;
      }

      if (!mounted) return;

      // Biometric unlock must not bypass migration of a legacy PIN.
      if (_legacyPin) {
        final pinUpdated = await showMandatoryPinSetupDialog(context);
        if (!pinUpdated) {
          if (mounted) {
            setState(() {
              _error = 'يجب تحديث الرمز السابق إلى PIN من 4 أرقام للمتابعة.';
            });
          }
          return;
        }
        _legacyPin = false;
      }

      _unlockGeneration++;
      if (mounted) {
        setState(() {
          _locked = false;
          _pin = '';
          _error = null;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'تعذر إكمال المصادقة الآمنة. حاول مجددًا.');
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.expand,
    children: [
      widget.child,
      if (!_settingsLoaded && AppLockRuntime.sessionActive.value)
        Positioned.fill(
          child: Material(
            color: Theme.of(context).colorScheme.surface,
            child: Center(
              child: CircularProgressIndicator(
                color: Theme.of(context).colorScheme.primary,
              ),
            ),
          ),
        ),
      if (_settingsLoaded &&
          _enabled &&
          AppLockRuntime.sessionActive.value &&
          _locked)
        Positioned.fill(
          child: Material(
            color: Theme.of(context).colorScheme.surface,
            child: Directionality(
              textDirection: TextDirection.rtl,
              child: SafeArea(
                child: Center(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(24),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 380),
                      child: Card(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.shield_outlined,
                                size: 54,
                                color: Theme.of(context).colorScheme.primary,
                              ),
                              const SizedBox(height: 12),
                              const Text(
                                'التطبيق مقفل',
                                style: TextStyle(
                                  fontSize: 21,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              const SizedBox(height: 6),
                              const Text(
                                'أدخل رمز PIN من 4 أرقام أو أكمل المصادقة بالبصمة.',
                                textAlign: TextAlign.center,
                              ),
                              const SizedBox(height: 20),
                              TextField(
                                autofocus: true,
                                keyboardType: TextInputType.number,
                                obscureText: true,
                                maxLength: _legacyPin ? 8 : 4,
                                enableInteractiveSelection: false,
                                enableSuggestions: false,
                                autocorrect: false,
                                inputFormatters: [
                                  FilteringTextInputFormatter.digitsOnly,
                                ],
                                onChanged: (value) {
                                  setState(() {
                                    _pin = value;
                                    _error = null;
                                  });
                                },
                                onSubmitted: (_) => _submitPin(),
                                decoration: InputDecoration(
                                  labelText: _legacyPin
                                      ? 'رمز PIN السابق'
                                      : 'رمز PIN (4 أرقام)',
                                  counterText: '',
                                  prefixIcon: Icon(Icons.password),
                                ),
                              ),
                              if (_error != null) ...[
                                const SizedBox(height: 8),
                                Text(
                                  _error!,
                                  style: TextStyle(
                                    color: Theme.of(context).colorScheme.error,
                                  ),
                                ),
                              ],
                              if (_settingsLoadFailed) ...[
                                const SizedBox(height: 12),
                                SizedBox(
                                  width: double.infinity,
                                  child: OutlinedButton.icon(
                                    onPressed: _busy
                                        ? null
                                        : () => _loadSettings(forceLock: true),
                                    icon: const Icon(Icons.refresh),
                                    label: const Text(
                                      'إعادة تحميل إعدادات الحماية',
                                    ),
                                  ),
                                ),
                              ],
                              const SizedBox(height: 12),
                              SizedBox(
                                width: double.infinity,
                                child: FilledButton.icon(
                                  onPressed: _busy || _pin.length < 4
                                      ? null
                                      : _submitPin,
                                  icon: const Icon(Icons.lock_open),
                                  label: Text(
                                    _busy
                                        ? 'جارٍ التحقق...'
                                        : _legacyPin
                                        ? 'التحقق من الرمز السابق'
                                        : 'فتح التطبيق',
                                  ),
                                ),
                              ),
                              if (_biometricEnabled)
                                Padding(
                                  padding: const EdgeInsets.only(top: 8),
                                  child: SizedBox(
                                    width: double.infinity,
                                    child: OutlinedButton.icon(
                                      onPressed: _busy
                                          ? null
                                          : _submitBiometric,
                                      icon: const Icon(Icons.fingerprint),
                                      label: const Text('المصادقة بالبصمة'),
                                    ),
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
            ),
          ),
        ),
    ],
  );
}

class AppLockSettingsSection extends StatefulWidget {
  const AppLockSettingsSection({super.key});

  @override
  State<AppLockSettingsSection> createState() => _AppLockSettingsSectionState();
}

class _AppLockSettingsSectionState extends State<AppLockSettingsSection> {
  bool _loading = true;
  bool _hasPin = false;
  bool _biometric = false;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final values = await Future.wait([
        AppLockService.hasPin(),
        AppLockService.isBiometricEnabled(),
      ]);
      if (!mounted) return;
      setState(() {
        _hasPin = values[0];
        _biometric = values[1];
        _loading = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'تعذر قراءة إعدادات القفل الآمن.';
        });
      }
    }
  }

  Future<String?> _requestPin({required bool confirm}) async {
    final controller = TextEditingController();
    final confirmController = TextEditingController();
    try {
      return await showDialog<String>(
        context: context,
        barrierDismissible: false,
        builder: (dialogContext) => Directionality(
          textDirection: TextDirection.rtl,
          child: AlertDialog(
            title: Text(confirm ? 'تغيير رمز PIN' : 'إعداد رمز PIN'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'استخدم 4 أرقام بالضبط. سيُحفظ الرمز في التخزين الآمن للجهاز.',
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: controller,
                  autofocus: true,
                  keyboardType: TextInputType.number,
                  obscureText: true,
                  maxLength: 4,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  decoration: const InputDecoration(labelText: 'رمز PIN'),
                ),
                TextField(
                  controller: confirmController,
                  keyboardType: TextInputType.number,
                  obscureText: true,
                  maxLength: 4,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  decoration: const InputDecoration(labelText: 'تأكيد رمز PIN'),
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
                  if (!RegExp(r'^\d{4}$').hasMatch(controller.text)) {
                    ScaffoldMessenger.of(dialogContext).showSnackBar(
                      const SnackBar(
                        content: Text('يجب أن يتكون الرمز من 4 أرقام بالضبط.'),
                      ),
                    );
                    return;
                  }
                  if (controller.text != confirmController.text) {
                    ScaffoldMessenger.of(dialogContext).showSnackBar(
                      const SnackBar(content: Text('تأكيد الرمز غير مطابق.')),
                    );
                    return;
                  }
                  Navigator.pop(dialogContext, controller.text);
                },
                child: const Text('حفظ الرمز'),
              ),
            ],
          ),
        ),
      );
    } finally {
      controller.dispose();
      confirmController.dispose();
    }
  }

  Future<void> _setPin() async {
    final pin = await _requestPin(confirm: _hasPin);
    if (pin == null || !mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await AppLockService.savePin(pin);
      await _load();
      await _refreshOverlay();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('تم حفظ رمز PIN وتفعيل قفل التطبيق.')),
        );
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'تعذر حفظ رمز PIN في التخزين الآمن.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _toggleBiometric(bool value) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await AppLockService.setBiometricEnabled(value);
      if (mounted) setState(() => _biometric = value);
    } catch (exception) {
      if (mounted) {
        setState(
          () => _error = exception.toString().replaceFirst('Bad state: ', ''),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _refreshOverlay() async {
    AppLockRuntime.notifySettingsChanged();
  }

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      Icons.phonelink_lock_outlined,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                    SizedBox(width: 8),
                    Text(
                      'قفل التطبيق',
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 16,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                const Text(
                  'قفل PIN إلزامي دائمًا. يمكنك تفعيل البصمة اختياريًا كوسيلة فتح إضافية.',
                ),
                const Divider(height: 24),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.password),
                  title: Text(_hasPin ? 'تغيير رمز PIN' : 'إعداد رمز PIN'),
                  subtitle: const Text('4 أرقام بالضبط'),
                  trailing: const Icon(Icons.chevron_left),
                  onTap: _busy ? null : _setPin,
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _biometric,
                  onChanged: _busy || !_hasPin ? null : _toggleBiometric,
                  title: const Text('فتح التطبيق بالبصمة'),
                  subtitle: const Text(
                    'اختياري؛ يتطلب PIN مُعدًّا ومصادقة مدعومة على الجهاز.',
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    _error!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ],
                if (_busy) const LinearProgressIndicator(),
              ],
            ),
    ),
  );
}
