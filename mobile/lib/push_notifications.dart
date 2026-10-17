import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

const MethodChannel _androidTelegramNotificationChannel = MethodChannel(
  'com.hadir.police.police_telegrams/telegram_notifications',
);

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

class PushNotificationService {
  // Resolve Firebase lazily: DashboardPage can be constructed before Firebase
  // is configured, and initialization errors must not crash the app at startup.
  FirebaseMessaging get _messaging => FirebaseMessaging.instance;

  StreamSubscription<RemoteMessage>? _foregroundSubscription;
  StreamSubscription<RemoteMessage>? _openedSubscription;
  StreamSubscription<String>? _tokenRefreshSubscription;
  void Function(int telegramId)? _onTelegramOpened;

  Future<void> initialize({
    required void Function(int telegramId) onTelegramOpened,
    required void Function(int telegramId) onForegroundTelegram,
    required void Function(String token) onToken,
    void Function()? onAppUpdate,
  }) async {
    _onTelegramOpened = onTelegramOpened;
    await _prepareAndroidNotificationBridge();
    await _foregroundSubscription?.cancel();
    await _openedSubscription?.cancel();
    await _tokenRefreshSubscription?.cancel();
    _tokenRefreshSubscription = null;

    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
      if (defaultTargetPlatform == TargetPlatform.iOS) {
        await _messaging.setForegroundNotificationPresentationOptions(
          alert: true,
          badge: true,
          sound: true,
        );
      }

      final settings = await _messaging.getNotificationSettings();
      if (_isAuthorized(settings.authorizationStatus)) {
        final token = await _messaging.getToken();
        if (token != null && token.isNotEmpty) onToken(token);
        _tokenRefreshSubscription = _messaging.onTokenRefresh.listen(onToken);
      }

      // Foreground FCM notifications are not displayed automatically on Android.
      // Post a native notification using the same sound channel, then refresh the
      // dashboard without navigating away from the screen currently in use.
      _foregroundSubscription = FirebaseMessaging.onMessage.listen((
        message,
      ) async {
        if (_isAppUpdate(message)) {
          onAppUpdate?.call();
          return;
        }
        final id = _telegramId(message);
        if (id == null) return;
        await _showForegroundTelegramNotification(message, id);
        onForegroundTelegram(id);
      });
      _openedSubscription = FirebaseMessaging.onMessageOpenedApp.listen((
        message,
      ) {
        if (_isAppUpdate(message)) {
          onAppUpdate?.call();
          return;
        }
        final id = _telegramId(message);
        if (id != null) onTelegramOpened(id);
      });
      final initial = await _messaging.getInitialMessage();
      if (initial != null && _isAppUpdate(initial)) {
        onAppUpdate?.call();
        return;
      }
      final initialId = initial == null ? null : _telegramId(initial);
      if (initialId != null) onTelegramOpened(initialId);
    } on FirebaseException {
      // Firebase configuration is supplied per Android/iOS environment.
      // The app remains usable when a developer build has no Firebase files.
    }
  }

  Future<void> _prepareAndroidNotificationBridge() async {
    if (defaultTargetPlatform != TargetPlatform.android) return;

    _androidTelegramNotificationChannel.setMethodCallHandler((call) async {
      if (call.method != 'onTelegramNotificationOpened') return;
      final telegramId = int.tryParse('${call.arguments}');
      if (telegramId != null && telegramId > 0) {
        _onTelegramOpened?.call(telegramId);
      }
    });

    try {
      final pendingId = await _androidTelegramNotificationChannel
          .invokeMethod<int>('markTelegramNotificationHandlerReady');
      if (pendingId != null && pendingId > 0) {
        _onTelegramOpened?.call(pendingId);
      }
    } on MissingPluginException {
      // Native notifications are unavailable in widget tests and unsupported
      // preview builds; this must not prevent Firebase from initializing.
    } on PlatformException {
      // A platform-specific notification bridge failure must not block login.
    }
  }

  Future<void> _showForegroundTelegramNotification(
    RemoteMessage message,
    int telegramId,
  ) async {
    if (defaultTargetPlatform != TargetPlatform.android) return;

    final data = message.data;
    final urgent = _isUrgentTelegram(data);
    final title = message.notification?.title ?? _fallbackTitle(data, urgent);
    final body = message.notification?.body ?? _fallbackBody(data);

    try {
      await _androidTelegramNotificationChannel.invokeMethod<bool>(
        'showTelegramNotification',
        <String, Object>{
          'telegramId': telegramId,
          'title': title,
          'body': body,
          'urgent': urgent,
        },
      );
    } on MissingPluginException {
      // Keep the dashboard refresh path working on non-Android test runtimes.
    } on PlatformException {
      // A notification can be blocked or disabled in system settings.
    }
  }

  bool _isUrgentTelegram(Map<String, dynamic> data) {
    final priority = '${data['priority'] ?? ''}'.toLowerCase();
    final category = '${data['category'] ?? ''}'.toLowerCase();
    return priority == 'urgent' || category == 'emergency';
  }

  String _fallbackTitle(Map<String, dynamic> data, bool urgent) {
    final category = '${data['category'] ?? ''}'.toLowerCase();
    final priority = '${data['priority'] ?? ''}'.toLowerCase();
    if (category == 'emergency' && priority == 'urgent') {
      return 'برقية طارئة عاجلة';
    }
    if (category == 'emergency') return 'برقية طارئة';
    if (urgent) return 'برقية عاجلة';
    return data['type'] == 'telegram.incoming'
        ? 'برقية واردة جديدة'
        : 'برقية جديدة';
  }

  String _fallbackBody(Map<String, dynamic> data) {
    final serial = '${data['serialCode'] ?? ''}'.trim();
    final subject = '${data['subject'] ?? ''}'.trim();
    final details = <String>[];
    if (serial.isNotEmpty) details.add('رقم البرقية: $serial');
    if (subject.isNotEmpty) details.add('الموضوع: $subject');
    return details.isEmpty ? 'وصلت برقية جديدة إلى جهتك.' : details.join('\n');
  }

  int? _telegramId(RemoteMessage message) {
    final raw = message.data['telegramId'] ?? message.data['telegram_id'];
    return int.tryParse('$raw');
  }

  bool _isAppUpdate(RemoteMessage message) =>
      message.data['type'] == 'app.update';

  Future<bool> notificationsEnabled() async {
    try {
      await Firebase.initializeApp();
      final settings = await _messaging.getNotificationSettings();
      return _isAuthorized(settings.authorizationStatus);
    } catch (_) {
      return false;
    }
  }

  Future<bool> enableNotifications({
    required void Function(String token) onToken,
  }) async {
    try {
      await Firebase.initializeApp();
      final settings = await _messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
        provisional: false,
      );
      if (!_isAuthorized(settings.authorizationStatus)) return false;
      final token = await _messaging.getToken();
      if (token == null || token.isEmpty) return false;
      await _tokenRefreshSubscription?.cancel();
      _tokenRefreshSubscription = _messaging.onTokenRefresh.listen(onToken);
      onToken(token);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> disableNotifications() async {
    await _tokenRefreshSubscription?.cancel();
    _tokenRefreshSubscription = null;
    try {
      await _messaging.deleteToken();
    } catch (_) {
      // The server registration is still removed if Firebase is unavailable.
    }
  }

  bool _isAuthorized(AuthorizationStatus status) =>
      status == AuthorizationStatus.authorized ||
      status == AuthorizationStatus.provisional;

  /// Returns the current device token when Firebase is configured.
  /// A missing or unavailable Firebase configuration must not block logout.
  Future<String?> currentToken() async {
    try {
      final token = await _messaging.getToken();
      return token == null || token.isEmpty ? null : token;
    } catch (_) {
      return null;
    }
  }

  Future<void> dispose() async {
    await _foregroundSubscription?.cancel();
    await _openedSubscription?.cancel();
    await _tokenRefreshSubscription?.cancel();
    _foregroundSubscription = null;
    _openedSubscription = null;
    _tokenRefreshSubscription = null;
    _onTelegramOpened = null;

    if (defaultTargetPlatform == TargetPlatform.android) {
      _androidTelegramNotificationChannel.setMethodCallHandler(null);
      try {
        await _androidTelegramNotificationChannel.invokeMethod<void>(
          'markTelegramNotificationHandlerNotReady',
        );
      } on MissingPluginException {
        // No native bridge is expected in widget tests or preview builds.
      } on PlatformException {
        // Logging out must remain possible if the bridge is unavailable.
      }
    }
  }
}
