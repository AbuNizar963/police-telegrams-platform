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

String _toastTitle(ToastKind kind) => switch (kind) {
  ToastKind.success => 'تم بنجاح!',
  ToastKind.info => 'معلومة',
  ToastKind.warning => 'تحذير!',
  ToastKind.error => 'حدث خطأ!',
  ToastKind.loading => 'جارٍ التنفيذ',
};

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
            top: 16,
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
                    label: '${_toastTitle(_kind)}: $_message',
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
                            maxWidth: 650,
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

  String get _title => _toastTitle(kind);

  Color get _color => switch (kind) {
    ToastKind.success => const Color(0xFF45C776),
    ToastKind.error => const Color(0xFFE45355),
    ToastKind.warning => const Color(0xFFE7BD24),
    ToastKind.info => const Color(0xFF3488D8),
    ToastKind.loading => const Color(0xFF3488D8),
  };

  IconData get _icon => switch (kind) {
    ToastKind.success => Icons.check_rounded,
    ToastKind.error => Icons.close_rounded,
    ToastKind.warning => Icons.priority_high_rounded,
    ToastKind.info => Icons.lightbulb_outline_rounded,
    ToastKind.loading => Icons.hourglass_top_rounded,
  };

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Material(
      color: Colors.transparent,
      child: Container(
        constraints: const BoxConstraints(minHeight: 96, maxHeight: 160),
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: Color.alphaBlend(
            _color.withValues(alpha: 0.09),
            Colors.white,
          ),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: _color, width: 1.5),
          boxShadow: const [
            BoxShadow(
              color: Color(0x160D1B2A),
              blurRadius: 18,
              offset: Offset(0, 6),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Row(
          children: [
            const SizedBox(width: 16),
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(color: _color, shape: BoxShape.circle),
              alignment: Alignment.center,
              child: Icon(_icon, color: Colors.white, size: 26),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontFamily: 'Cairo',
                      color: Color(0xFF15171A),
                      fontSize: 20,
                      height: 1.25,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    message,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontFamily: 'Cairo',
                      color: Color(0xFF555B62),
                      fontSize: 18,
                      height: 1.3,
                      fontWeight: FontWeight.w400,
                    ),
                  ),
                ],
              ),
            ),
            Semantics(
              container: true,
              label: 'إغلاق الإشعار',
              button: true,
              child: IconButton(
                visualDensity: VisualDensity.compact,
                onPressed: onClose,
                icon: const Icon(
                  Icons.close_rounded,
                  color: Color(0xFF646A70),
                  size: 24,
                ),
              ),
            ),
            const SizedBox(width: 6),
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
    top: 16,
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
              constraints: const BoxConstraints(maxWidth: 650, maxHeight: 160),
              child: _ToastCard(message: message, kind: kind, onClose: close),
            ),
          ),
        ),
      ),
    ),
  );
}
