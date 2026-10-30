import 'dart:async';

import 'package:flutter/material.dart';

/// Semantic, top-positioned feedback for the mobile app.
///
/// Place [ToastOverlayHost] above the app navigator (normally in
/// MaterialApp.builder) so notifications remain visible over routes and dialogs.
class Toast {
  Toast._();

  static final GlobalKey<ToastOverlayHostState> _hostKey =
      GlobalKey<ToastOverlayHostState>();
  static GlobalKey<ToastOverlayHostState> get hostKey => _hostKey;

  static void success(
    BuildContext context,
    String message, {
    Duration? duration,
  }) => _show(context, message, ToastKind.success, duration: duration);
  static void error(
    BuildContext context,
    String message, {
    Duration? duration,
  }) => _show(context, message, ToastKind.error, duration: duration);
  static void warning(
    BuildContext context,
    String message, {
    Duration? duration,
  }) => _show(context, message, ToastKind.warning, duration: duration);
  static void info(
    BuildContext context,
    String message, {
    Duration? duration,
  }) => _show(context, message, ToastKind.info, duration: duration);
  static void loading(BuildContext context, String message) =>
      _show(context, message, ToastKind.loading, duration: null);

  static void dismiss() => _hostKey.currentState?.dismiss();

  static void _show(
    BuildContext context,
    String message,
    ToastKind kind, {
    Duration? duration,
  }) {
    if (!context.mounted) return;
    final host = _hostKey.currentState;
    if (host != null) {
      host.show(message, kind, duration: duration);
      return;
    }
    final overlay = Overlay.maybeOf(context, rootOverlay: true);
    if (overlay == null) return;
    // Fallback permits use from standalone widget tests / embedders.
    _FallbackToast.show(overlay, message, kind, duration);
  }
}

enum ToastKind { success, error, warning, info, loading }

class ToastOverlayHost extends StatefulWidget {
  const ToastOverlayHost({required this.child, super.key});
  final Widget child;

  @override
  State<ToastOverlayHost> createState() => ToastOverlayHostState();
}

class ToastOverlayHostState extends State<ToastOverlayHost>
    with SingleTickerProviderStateMixin {
  String? _message;
  ToastKind _kind = ToastKind.info;
  Duration? _duration = const Duration(seconds: 4);
  Timer? _timer;
  bool _visible = false;
  bool _reduceMotion = false;

  void show(String message, ToastKind kind, {Duration? duration}) {
    _timer?.cancel();
    setState(() {
      _message = message;
      _kind = kind;
      _duration =
          duration ??
          (kind == ToastKind.loading ? null : const Duration(seconds: 4));
      _visible = true;
    });
    final timeout = _duration;
    if (timeout != null) _timer = Timer(timeout, dismiss);
  }

  void dismiss() {
    _timer?.cancel();
    if (!mounted || !_visible) return;
    setState(() => _visible = false);
    Future<void>.delayed(
      _reduceMotion ? Duration.zero : const Duration(milliseconds: 220),
      () {
        if (mounted && !_visible) setState(() => _message = null);
      },
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.maybeOf(context);
    _reduceMotion = media?.disableAnimations ?? false;
    return Stack(
      fit: StackFit.expand,
      children: [
        widget.child,
        if (_message != null)
          Positioned(
            top: 12,
            left: 16,
            right: 16,
            child: SafeArea(
              bottom: false,
              child: Align(
                alignment: Alignment.topCenter,
                heightFactor: 1,
                child: IgnorePointer(
                  ignoring: !_visible,
                  child: Semantics(
                    liveRegion: true,
                    label: _message,
                    child: AnimatedSlide(
                      duration: _reduceMotion
                          ? Duration.zero
                          : const Duration(milliseconds: 240),
                      curve: Curves.easeOutCubic,
                      offset: _visible ? Offset.zero : const Offset(0, -0.35),
                      child: AnimatedOpacity(
                        duration: _reduceMotion
                            ? Duration.zero
                            : const Duration(milliseconds: 180),
                        opacity: _visible ? 1 : 0,
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(
                            maxWidth: 520,
                            maxHeight: 160,
                          ),
                          child: _ToastCard(
                            message: _message!,
                            kind: _kind,
                            onClose: dismiss,
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
}

class _ToastCard extends StatelessWidget {
  const _ToastCard({
    required this.message,
    required this.kind,
    required this.onClose,
  });
  final String message;
  final ToastKind kind;
  final VoidCallback onClose;

  Color get _color => switch (kind) {
    ToastKind.success => const Color(0xFF16845B),
    ToastKind.error => const Color(0xFFBE3A3A),
    ToastKind.warning => const Color(0xFFB97712),
    ToastKind.info => const Color(0xFF2865A0),
    ToastKind.loading => const Color(0xFF53647A),
  };

  IconData get _icon => switch (kind) {
    ToastKind.success => Icons.check_circle_outline,
    ToastKind.error => Icons.error_outline,
    ToastKind.warning => Icons.warning_amber_rounded,
    ToastKind.info => Icons.info_outline,
    ToastKind.loading => Icons.hourglass_top_rounded,
  };

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Material(
      color: Colors.transparent,
      child: Container(
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: Theme.of(context).colorScheme.outlineVariant,
          ),
          boxShadow: const [
            BoxShadow(
              color: Color(0x260D1B2A),
              blurRadius: 24,
              offset: Offset(0, 8),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Row(
          children: [
            Container(width: 4, color: _color),
            const SizedBox(width: 14),
            Icon(_icon, color: _color, size: 23),
            const SizedBox(width: 10),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 15),
                child: Text(
                  message,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 14,
                    height: 1.45,
                    fontWeight: FontWeight.w600,
                  ),
                  textAlign: TextAlign.right,
                ),
              ),
            ),
            Semantics(
              label: 'إغلاق الإشعار',
              button: true,
              child: IconButton(
                visualDensity: VisualDensity.compact,
                onPressed: onClose,
                icon: const Icon(Icons.close_rounded, size: 19),
              ),
            ),
            const SizedBox(width: 4),
          ],
        ),
      ),
    ),
  );
}

class _FallbackToast {
  static OverlayEntry? _entry;
  static Timer? _timer;

  static void show(
    OverlayState overlay,
    String message,
    ToastKind kind,
    Duration? duration,
  ) {
    late OverlayEntry entry;
    _timer?.cancel();
    if (_entry?.mounted ?? false) _entry!.remove();
    entry = OverlayEntry(
      builder: (_) => _FallbackToastView(
        message: message,
        kind: kind,
        close: () {
          _timer?.cancel();
          if (entry.mounted) entry.remove();
          if (identical(_entry, entry)) _entry = null;
        },
      ),
    );
    _entry = entry;
    overlay.insert(entry);
    if (duration != null) {
      _timer = Timer(duration, () {
        if (entry.mounted) entry.remove();
        if (identical(_entry, entry)) _entry = null;
      });
    }
  }
}

class _FallbackToastView extends StatelessWidget {
  const _FallbackToastView({
    required this.message,
    required this.kind,
    required this.close,
  });
  final String message;
  final ToastKind kind;
  final VoidCallback close;

  @override
  Widget build(BuildContext context) => Positioned(
    top: 12,
    left: 16,
    right: 16,
    child: SafeArea(
      bottom: false,
      child: Align(
        alignment: Alignment.topCenter,
        heightFactor: 1,
        child: Material(
          color: Colors.transparent,
          child: Directionality(
            textDirection: TextDirection.rtl,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520, maxHeight: 160),
              child: _ToastCard(message: message, kind: kind, onClose: close),
            ),
          ),
        ),
      ),
    ),
  );
}
