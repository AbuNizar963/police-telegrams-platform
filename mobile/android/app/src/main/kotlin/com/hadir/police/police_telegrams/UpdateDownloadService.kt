package com.police_telegrams

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Owns the APK transfer independently of the Flutter Activity/task UI.
 *
 * A sticky restart starts the same release again from the beginning if Android
 * kills the process. Force-stop by the user or the OS can still stop any service.
 */
class UpdateDownloadService : Service() {
    companion object {
        const val ACTION_START = "com.police_telegrams.action.START_UPDATE_DOWNLOAD"
        const val EXTRA_URL = "update_url"
        const val EXTRA_SIZE = "update_size"
        const val EXTRA_SHA256 = "update_sha256"
        const val EXTRA_VERSION = "update_version"
        const val EXTRA_BUILD = "update_build"

        private const val PREFS_NAME = "internal_update_download"
        private const val KEY_URL = "url"
        private const val KEY_SIZE = "size"
        private const val KEY_SHA256 = "sha256"
        private const val KEY_VERSION = "version"
        private const val KEY_BUILD = "build"
        private const val KEY_STATUS = "status"
        private const val CHANNEL_NAME = "تحديث التطبيق"
    }

    @Volatile
    private var downloadStarted = false

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val preferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        if (intent?.action == ACTION_START) {
            preferences.edit()
                .putString(KEY_URL, intent.getStringExtra(EXTRA_URL))
                .putLong(KEY_SIZE, intent.getLongExtra(EXTRA_SIZE, 0L))
                .putString(KEY_SHA256, intent.getStringExtra(EXTRA_SHA256))
                .putString(KEY_VERSION, intent.getStringExtra(EXTRA_VERSION))
                .putLong(KEY_BUILD, intent.getLongExtra(EXTRA_BUILD, 0L))
                .putString(KEY_STATUS, "starting")
                .commit()
        }

        val savedStatus = preferences.getString(KEY_STATUS, null)
        if (intent == null && (savedStatus == "completed" || savedStatus == "failed")) {
            stopSelf(startId)
            return START_NOT_STICKY
        }

        val url = preferences.getString(KEY_URL, null)
        val size = preferences.getLong(KEY_SIZE, 0L)
        val sha256 = preferences.getString(KEY_SHA256, null)
        val version = preferences.getString(KEY_VERSION, null)
        val build = preferences.getLong(KEY_BUILD, 0L)

        if (url.isNullOrBlank() || sha256.isNullOrBlank() ||
            version.isNullOrBlank() || size <= 0L || build <= 0L
        ) {
            stopSelf(startId)
            return START_NOT_STICKY
        }

        startForegroundCompat()
        if (downloadStarted) return START_STICKY

        downloadStarted = true
        preferences.edit().putString(KEY_STATUS, "downloading").apply()
        try {
            UpdateInstaller(applicationContext).startDownload(
                downloadUrl = url,
                expectedSize = size,
                expectedSha256 = sha256,
                expectedVersionName = version,
                expectedVersionCode = build
            ) { success, apkPath ->
                preferences.edit()
                    .putString(KEY_STATUS, if (success) "completed" else "failed")
                    .putString("apk_path", apkPath)
                    .apply()
                downloadStarted = false
                stopForeground(false)
                stopSelf()
            }
        } catch (failure: Exception) {
            preferences.edit().putString(KEY_STATUS, "failed").apply()
            showFailureNotification(
                failure.message ?: "تعذر بدء تنزيل التحديث. افتح التطبيق وحاول مجددًا."
            )
            downloadStarted = false
            stopForeground(false)
            stopSelf()
        }
        return START_STICKY
    }

    private fun showFailureNotification(message: String) {
        val notification = NotificationCompat.Builder(
            this,
            UpdateInstaller.NOTIFICATION_CHANNEL_ID
        )
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("تعذر تنزيل التحديث")
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setAutoCancel(true)
            .setOngoing(false)
            .setOnlyAlertOnce(true)
            .setProgress(0, 0, false)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .build()
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(UpdateInstaller.NOTIFICATION_ID, notification)
    }

    private fun startForegroundCompat() {
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            manager.getNotificationChannel(UpdateInstaller.NOTIFICATION_CHANNEL_ID) == null
        ) {
            manager.createNotificationChannel(
                NotificationChannel(
                    UpdateInstaller.NOTIFICATION_CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_LOW
                ).apply {
                    description = "تقدم تنزيل تحديثات تطبيق برقيات الشرطة"
                    setShowBadge(false)
                }
            )
        }

        val notification = NotificationCompat.Builder(
            this,
            UpdateInstaller.NOTIFICATION_CHANNEL_ID
        )
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("جارٍ تنزيل تحديث برقيات الشرطة")
            .setContentText("سيستمر التنزيل في الخلفية حتى بعد إغلاق واجهة التطبيق.")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setProgress(100, 0, false)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                UpdateInstaller.NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            startForeground(UpdateInstaller.NOTIFICATION_ID, notification)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
