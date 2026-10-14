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

class MainActivity : FlutterActivity() {
    private val installerChannel = "com.hadir.police.police_telegrams/apk_installer"

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

                val apk = File(path)
                if (!apk.isFile || !apk.name.endsWith(".apk", ignoreCase = true)) {
                    result.error("APK_NOT_FOUND", "ملف التحديث غير موجود.", null)
                    return@setMethodCallHandler
                }

                try {
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
                        apk
                    )
                    val installIntent = Intent(Intent.ACTION_VIEW).apply {
                        setDataAndType(apkUri, "application/vnd.android.package-archive")
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
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
