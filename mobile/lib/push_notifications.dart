import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

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

  Future<void> initialize({
    required void Function(int telegramId) onTelegramOpened,
    required void Function(int telegramId) onForegroundTelegram,
    required void Function(String token) onToken,
  }) async {
    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
      final settings = await _messaging.getNotificationSettings();
      if (_isAuthorized(settings.authorizationStatus)) {
        final token = await _messaging.getToken();
        if (token != null && token.isNotEmpty) onToken(token);
      }

      // A foreground delivery is not a user tap. Refresh the inbox/dashboard
      // without navigating away from the screen the user is currently using.
      _foregroundSubscription = FirebaseMessaging.onMessage.listen((message) {
        final id = _telegramId(message);
        if (id != null) onForegroundTelegram(id);
      });
      _openedSubscription = FirebaseMessaging.onMessageOpenedApp.listen((
        message,
      ) {
        final id = _telegramId(message);
        if (id != null) onTelegramOpened(id);
      });
      final initial = await _messaging.getInitialMessage();
      final initialId = initial == null ? null : _telegramId(initial);
      if (initialId != null) onTelegramOpened(initialId);
    } on FirebaseException {
      // Firebase configuration is supplied per Android/iOS environment.
      // The app remains usable when a developer build has no Firebase files.
    }
  }

  int? _telegramId(RemoteMessage message) {
    final raw = message.data['telegramId'] ?? message.data['telegram_id'];
    return int.tryParse('$raw');
  }

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
      onToken(token);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> disableNotifications() async {
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
  }
}
