package com.hadir.police.police_telegrams

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.IOException

class MainActivity : FlutterActivity() {
    private val installerChannel =
        "com.hadir.police.police_telegrams/apk_installer"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, installerChannel)
            .setMethodCallHandler { call, result ->
                if (call.method != "installApk") {
                    result.notImplemented()
                    return@setMethodCallHandler
                }

                val path = call.argument<String>("path")
                if (path.isNullOrBlank()) {
                    result.error("INVALID_PATH", "مسار ملف التحديث غير صالح.", null)
                    return@setMethodCallHandler
                }

                val downloadedApk = File(path)
                if (!downloadedApk.isFile || !downloadedApk.name.endsWith(".apk", true)) {
                    result.error("APK_NOT_FOUND", "ملف التحديث غير موجود.", null)
                    return@setMethodCallHandler
                }
                if (downloadedApk.length() <= 0L) {
                    result.error("APK_EMPTY", "ملف التحديث فارغ؛ أعد تنزيله.", null)
                    return@setMethodCallHandler
                }

                try {
                    // FileProvider only shares files beneath its configured cache path.
                    // Copy the completed download into that exact directory instead of
                    // assuming Dart's systemTemp directory always maps to cacheDir.
                    val updateDirectory = File(cacheDir, "updates")
                    if (!updateDirectory.exists() && !updateDirectory.mkdirs()) {
                        throw IOException("تعذر تجهيز مجلد تثبيت التحديث.")
                    }
                    val installApk = File(updateDirectory, "police-telegrams-update.apk")
                    if (downloadedApk.canonicalFile != installApk.canonicalFile) {
                        downloadedApk.inputStream().use { input ->
                            installApk.outputStream().use { output ->
                                input.copyTo(output)
                                output.fd.sync()
                            }
                        }
                    }
                    if (!installApk.isFile || installApk.length() != downloadedApk.length()) {
                        installApk.delete()
                        throw IOException("تعذر تجهيز ملف التحديث للتثبيت.")
                    }

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                        !packageManager.canRequestPackageInstalls()
                    ) {
                        val settingsIntent = Intent(
                            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:$packageName")
                        )
                        startActivity(settingsIntent)
                        result.success("permission_required")
                        return@setMethodCallHandler
                    }

                    val apkUri = FileProvider.getUriForFile(
                        this,
                        "$packageName.fileprovider",
                        installApk
                    )
                    val installIntent = Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
                        setData(apkUri)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        putExtra(Intent.EXTRA_RETURN_RESULT, true)
                    }
                    if (installIntent.resolveActivity(packageManager) == null) {
                        throw IOException("لم يعثر Android على مُثبّت حزم متاح.")
                    }
                    startActivity(installIntent)
                    result.success("launched")
                } catch (error: Exception) {
                    result.error(
                        "INSTALL_FAILED",
                        error.message ?: "تعذر بدء تثبيت التحديث.",
                        null
                    )
                }
            }
    }
}
