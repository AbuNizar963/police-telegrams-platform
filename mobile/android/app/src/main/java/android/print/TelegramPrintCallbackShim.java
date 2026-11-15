/*
 * Adapted from PrintCallbackShim in native_pdf_engine.
 * Copyright (c) 2026 Ali Hassan.
 *
 * Licensed under the MIT License:
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 */
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
