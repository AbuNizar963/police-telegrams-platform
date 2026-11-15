package android.print;

import android.print.PrintDocumentAdapter.LayoutResultCallback;
import android.print.PrintDocumentAdapter.WriteResultCallback;

/**
 * Creates Android print callbacks from the android.print package so the
 * framework's package-scoped callback constructors remain accessible.
 */
public final class TelegramPrintCallbackShim {
    private TelegramPrintCallbackShim() {}

    public interface LayoutCallback {
        void onLayoutFinished(PrintDocumentInfo info, boolean changed);
        void onLayoutFailed(CharSequence error);
        void onLayoutCancelled();
    }

    public interface WriteCallback {
        void onWriteFinished(PageRange[] pages);
        void onWriteFailed(CharSequence error);
        void onWriteCancelled();
    }

    public static LayoutResultCallback createLayoutResultCallback(
            final LayoutCallback callback
    ) {
        return new LayoutResultCallback() {
            @Override
            public void onLayoutFinished(PrintDocumentInfo info, boolean changed) {
                callback.onLayoutFinished(info, changed);
            }

            @Override
            public void onLayoutFailed(CharSequence error) {
                callback.onLayoutFailed(error);
            }

            @Override
            public void onLayoutCancelled() {
                callback.onLayoutCancelled();
            }
        };
    }

    public static WriteResultCallback createWriteResultCallback(
            final WriteCallback callback
    ) {
        return new WriteResultCallback() {
            @Override
            public void onWriteFinished(PageRange[] pages) {
                callback.onWriteFinished(pages);
            }

            @Override
            public void onWriteFailed(CharSequence error) {
                callback.onWriteFailed(error);
            }

            @Override
            public void onWriteCancelled() {
                callback.onWriteCancelled();
            }
        };
    }
}
