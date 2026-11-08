import 'dart:async';

import 'package:flutter/material.dart';

import '../../app_theme.dart';

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

  Color _color(BuildContext context) => switch (kind) {
    ToastKind.success => AppPalette.success,
    ToastKind.error => Theme.of(context).colorScheme.error,
    ToastKind.warning => AppPalette.warning,
    ToastKind.info => AppPalette.info,
    ToastKind.loading => Theme.of(context).colorScheme.onSurfaceVariant,
  };

  Color _tint(BuildContext context) => switch (kind) {
    ToastKind.error => Theme.of(context).colorScheme.errorContainer,
    ToastKind.success ||
    ToastKind.warning ||
    ToastKind.info ||
    ToastKind.loading => Theme.of(context).colorScheme.surfaceContainerHigh,
  };

  String get _title => _toastTitle(kind);

  IconData get _icon => switch (kind) {
    ToastKind.success => Icons.check_circle_outline,
    ToastKind.error => Icons.error_outline,
    ToastKind.warning => Icons.priority_high_rounded,
    ToastKind.info => Icons.lightbulb_rounded,
    ToastKind.loading => Icons.hourglass_top_rounded,
  };

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Material(
      color: Colors.transparent,
      child: Container(
        constraints: const BoxConstraints(minHeight: 96),
        decoration: BoxDecoration(
          color: _tint(context),
          borderRadius: BorderRadius.circular(19),
          border: Border.all(color: _color(context), width: 1.5),
          boxShadow: const [
            BoxShadow(
              color: Color(0x120D1B2A),
              blurRadius: 16,
              offset: Offset(0, 5),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        padding: const EdgeInsetsDirectional.only(
          start: 14,
          end: 12,
          top: 13,
          bottom: 13,
        ),
        child: Row(
          textDirection: TextDirection.rtl,
          children: [
            SizedBox.square(
              dimension: 52,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: _color(context),
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Icon(
                    _icon,
                    color: Colors.white,
                    size: 26,
                    opticalSize: 26,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (_title != message) ...[
                    Text(
                      _title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.right,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.onSurface,
                        fontSize: 18,
                        height: 1.3,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 2),
                  ],
                  Text(
                    message,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.right,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                      fontSize: 16,
                      height: 1.4,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Semantics(
              container: true,
              label: 'إغلاق الإشعار',
              button: true,
              child: IconButton(
                visualDensity: VisualDensity.standard,
                constraints: const BoxConstraints.tightFor(
                  width: 40,
                  height: 40,
                ),
                padding: EdgeInsets.zero,
                onPressed: onClose,
                icon: Icon(
                  Icons.close_rounded,
                  size: 23,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ),
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
