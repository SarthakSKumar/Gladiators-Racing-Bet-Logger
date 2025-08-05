package com.sarthakskumar.read_bets

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import android.util.LruCache
import org.json.JSONObject
import java.net.URL
import javax.net.ssl.HttpsURLConnection

class NotificationListener : NotificationListenerService() {

    companion object {
        val processedMessages = LruCache<String, Boolean>(100)
        var messageCounter = 0
    }
    private val CLEAR_INTERVAL_MS = 5000L
    private var lastClearTime = System.currentTimeMillis()

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val sender = sbn.notification.extras.getString("android.title") ?: return
        val message = sbn.notification.extras.getCharSequence("android.text")?.toString() ?: return

        val messageId = "$sender::$message"
        if (processedMessages.get(messageId) != null) {
            Log.d("NotificationListener", "Skipping duplicate message: $messageId")
            return
        }

        val packageName = sbn.packageName

        if (packageName != "com.whatsapp") return

        Log.d("RawNotif", "Sender: $sender | Message: $message")

        // Get group name and start time from prefs
        val prefs = getSharedPreferences("race_prefs", Context.MODE_PRIVATE)
        val activeGroup = prefs.getString("group_name", null)
        val startTime = prefs.getLong("start_time", -1L)

        if (activeGroup.isNullOrBlank() || startTime == -1L) return

        val isSummary = message.matches(Regex("^\\d+ new messages$"))
        val hasColon = sender.contains(":")
        val isFromActiveGroup = sender.contains(activeGroup, ignoreCase = true) ||
                message.contains(activeGroup, ignoreCase = true)

        val shouldAllow = (hasColon && isFromActiveGroup && !isSummary)

        if (shouldAllow) {
            processedMessages.put(messageId, true)
            val id = ++messageCounter
            Log.d("NotificationListener", "Allowed -> Sender: $sender, Message: $message, ID: $id")

            val intent = Intent("com.sarthakskumar.read_bets.NOTIFICATION_DATA")
            intent.putExtra("id", id)
            intent.putExtra("sender", sender)
            intent.putExtra("message", message)
            sendBroadcast(intent)

            val raceNumber = prefs.getString("race_number", "1") ?: "1"
            sendToGoogleScript(id, sender, message, activeGroup, raceNumber)

            val currentTime = System.currentTimeMillis()
            if (currentTime - lastClearTime >= CLEAR_INTERVAL_MS) {
                cancelNotification(sbn)
                lastClearTime = currentTime
            }
        }
    }
    private fun sendToGoogleScript(id: Int, sender: String, message: String, groupName: String, raceNumber: String) {
        Thread {
            try {
                val url = URL("https://script.google.com/macros/s/AKfycbwm8Dffk5whDosDT4Vv6XzOGbHx3EwdQgD0cG63deoNkIvTwnc0trCbVAvMNbo75s7y/exec")

                val jsonBody = JSONObject()
                jsonBody.put("id", id)
                jsonBody.put("sender", sender.substringAfter(": ").trim())
                jsonBody.put("message", message)
                jsonBody.put("groupName", groupName)
                jsonBody.put("timestamp", System.currentTimeMillis())
                jsonBody.put("raceNumber", raceNumber)

                with(url.openConnection() as HttpsURLConnection) {
                    requestMethod = "POST"
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")

                    val outputBytes = jsonBody.toString().toByteArray(Charsets.UTF_8)
                    outputStream.write(outputBytes)
                    outputStream.flush()
                    outputStream.close()

                    val response = inputStream.bufferedReader().use { it.readText() }
                    Log.d("GoogleScriptResponse", response)
                }
            } catch (e: Exception) {
                Log.e("GoogleScriptError", "Failed to send data: ${e.message}")
            }
        }.start()
    }

    private fun cancelNotification(sbn: StatusBarNotification) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(sbn.tag, sbn.id)
    }
}
