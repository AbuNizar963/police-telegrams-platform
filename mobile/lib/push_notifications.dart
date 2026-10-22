import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

class PushNotificationService {
  final _messaging = FirebaseMessaging.instance;
  StreamSubscription<RemoteMessage>? _foregroundSubscription;
  StreamSubscription<RemoteMessage>? _openedSubscription;

  Future<void> initialize({
    required void Function(int telegramId) onTelegramOpened,
    required void Function(String token) onToken,
  }) async {
    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
      await _messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
        provisional: false,
      );
      // Keep sending the FCM registration token expected by the current server.
      // register/onRegistered now exposes a Firebase Installation ID and needs
      // a matching backend delivery migration before it can replace this call.
      // ignore: deprecated_member_use
      final token = await _messaging.getToken();
      if (token != null && token.isNotEmpty) onToken(token);

      _foregroundSubscription = FirebaseMessaging.onMessage.listen((message) {
        final id = _telegramId(message);
        if (id != null) onTelegramOpened(id);
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

  Future<void> dispose() async {
    await _foregroundSubscription?.cancel();
    await _openedSubscription?.cancel();
  }
}
