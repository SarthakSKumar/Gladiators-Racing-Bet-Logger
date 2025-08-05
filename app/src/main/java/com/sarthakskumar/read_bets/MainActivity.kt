package com.sarthakskumar.read_bets

import android.content.*
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sarthakskumar.read_bets.ui.theme.ReadbetsTheme
import java.text.SimpleDateFormat
import java.util.*

data class MessageItem(
    val id: Int,
    val sender: String,
    val message: String,
    val timestamp: Long = System.currentTimeMillis()
)

class MainActivity : ComponentActivity() {
    private val messageList = mutableStateOf<List<MessageItem>>(emptyList())

    private val notificationReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val id = intent.getIntExtra("id", 0)
            val sender = intent.getStringExtra("sender") ?: "Unknown"
            val message = intent.getStringExtra("message") ?: "No message"

            val currentList = messageList.value.toMutableList()
            currentList.add(0, MessageItem(id, sender, message))
            messageList.value = currentList
        }
    }

    private lateinit var prefs: SharedPreferences

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        prefs = getSharedPreferences("race_prefs", Context.MODE_PRIVATE)

        val initialGroup = prefs.getString("group_name", "") ?: ""
        val initialStartTime = prefs.getLong("start_time", -1L)

        registerReceiver(
            notificationReceiver,
            IntentFilter("com.sarthakskumar.read_bets.NOTIFICATION_DATA"),
            Context.RECEIVER_EXPORTED
        )

        setContent {
            ReadbetsTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    RaceScreen(
                        messages = messageList.value,
                        messageList = messageList,
                        initialGroupName = initialGroup,
                        initialStartTime = initialStartTime,
                        prefs = prefs
                    )
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        unregisterReceiver(notificationReceiver)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RaceScreen(
    messages: List<MessageItem>,
    messageList: MutableState<List<MessageItem>>,
    initialGroupName: String,
    initialStartTime: Long,
    prefs: SharedPreferences
) {
    val groupNames = listOf("Gladiators Indian Racing 🏇", "Gladiators International Racing 🏇")
    val (selectedGroup, onGroupSelected) = remember { mutableStateOf(initialGroupName.ifBlank { groupNames[0] }) }

    val raceNumbers = (1..10).map { it.toString() }
    var expanded by remember { mutableStateOf(false) }
    val initialRaceNumber = prefs.getString("race_number", "1") ?: "1"
    var selectedRaceNumber by remember { mutableStateOf(initialRaceNumber) }

    val isRecording = remember { mutableStateOf(initialStartTime != -1L) }
    val raceStartTime = remember { mutableStateOf(if (initialStartTime != -1L) initialStartTime else null) }

    Column(modifier = Modifier.padding(16.dp)) {
        Text(
            text = "Gladiators Bet Reader",
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(bottom = 8.dp)
        )

        if (isRecording.value && raceStartTime.value != null) {
            val time = SimpleDateFormat("HH:mm:ss", Locale.getDefault())
                .format(Date(raceStartTime.value!!))
            Text(
                text = "Recording: $selectedGroup - Race $selectedRaceNumber - $time",
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(bottom = 8.dp)
            )
        }

        if (!isRecording.value) {
            Text("Select Group", fontWeight = FontWeight.Medium)
            groupNames.forEach { groupName ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp)
                ) {
                    RadioButton(
                        selected = (groupName == selectedGroup),
                        onClick = { onGroupSelected(groupName) }
                    )
                    Text(
                        text = groupName,
                        modifier = Modifier.padding(start = 8.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Text("Select Race Number", fontWeight = FontWeight.Medium)
            ExposedDropdownMenuBox(
                expanded = expanded,
                onExpandedChange = { expanded = !expanded }
            ) {
                OutlinedTextField(
                    value = selectedRaceNumber,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Race Number") },
                    trailingIcon = {
                        ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded)
                    },
                    modifier = Modifier
                        .menuAnchor()
                        .fillMaxWidth()
                )
                ExposedDropdownMenu(
                    expanded = expanded,
                    onDismissRequest = { expanded = false }
                ) {
                    raceNumbers.forEach { number ->
                        DropdownMenuItem(
                            text = { Text(number) },
                            onClick = {
                                selectedRaceNumber = number
                                expanded = false
                            }
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Button(onClick = {
                if (selectedGroup.isNotBlank()) {
                    messageList.value = emptyList() // Clear previous messages
                    NotificationListener.messageCounter = 0 // Reset counter
                    NotificationListener.processedMessages.evictAll() // Clear cache
                    isRecording.value = true
                    val startTime = System.currentTimeMillis()
                    raceStartTime.value = startTime
                    prefs.edit()
                        .putString("group_name", selectedGroup)
                        .putString("race_number", selectedRaceNumber)
                        .putLong("start_time", startTime)
                        .apply()
                }
            }) {
                Text("Start Bet Logging")
            }
        } else {
            Button(
                onClick = {
                    isRecording.value = false
                    raceStartTime.value = null
                    prefs.edit().clear().apply()
                },
                colors = ButtonDefaults.buttonColors(MaterialTheme.colorScheme.error),
                modifier = Modifier.padding(bottom = 8.dp)
            ) {
                Text("End Bet Logging")
            }
        }

        if (isRecording.value) {
            MessageList(messages)
        }
    }
}

@Composable
fun MessageList(messages: List<MessageItem>) {
    Row(modifier = Modifier
        .fillMaxWidth()
        .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text("No", fontWeight = FontWeight.Bold, modifier = Modifier.weight(0.1f))
        Text("Sender", fontWeight = FontWeight.Bold, modifier = Modifier.weight(0.3f))
        Text("Message", fontWeight = FontWeight.Bold, modifier = Modifier.weight(0.4f))
        Text("Time", fontWeight = FontWeight.Bold, modifier = Modifier.weight(0.2f))
    }

    Divider()

    LazyColumn {
        items(messages) { item ->
            TableRow(item)
            Divider()
        }
    }
}

@Composable
fun TableRow(item: MessageItem) {
    val time = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date(item.timestamp))
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(text = item.id.toString(), modifier = Modifier.weight(0.1f))
        Text(text = item.sender.substringAfter(": ").trim(), modifier = Modifier.weight(0.3f), maxLines = 1)
        Text(text = item.message, modifier = Modifier.weight(0.4f), maxLines = 2)
        Text(text = time, modifier = Modifier.weight(0.2f), fontSize = 12.sp)
    }
}
