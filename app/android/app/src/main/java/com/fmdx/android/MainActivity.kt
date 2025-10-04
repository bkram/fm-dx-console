package com.fmdx.android

import android.os.Bundle
import android.widget.NumberPicker
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.draw.clip
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fmdx.android.model.SignalUnit
import com.fmdx.android.model.SpectrumPoint
import com.fmdx.android.model.TunerState
import com.fmdx.android.ui.theme.FmDxTheme
import java.util.Locale
import kotlin.math.roundToInt

class MainActivity : ComponentActivity() {
    private val viewModel: MainViewModel by viewModels()

    @OptIn(ExperimentalMaterial3Api::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val state by viewModel.uiState.collectAsStateWithLifecycle()
            val snackbarHostState = remember { SnackbarHostState() }
            LaunchedEffect(state.errorMessage) {
                state.errorMessage?.let { message ->
                    snackbarHostState.showSnackbar(message)
                }
            }
            FmDxTheme {
                FmDxApp(
                    state = state,
                    snackbarHostState = snackbarHostState,
                    onUpdateUrl = viewModel::updateServerUrl,
                    onConnect = viewModel::connect,
                    onDisconnect = viewModel::disconnect,
                    onToggleAudio = viewModel::toggleAudio,
                    onTuneDirect = viewModel::tuneToFrequency,
                    onToggleEq = viewModel::toggleEq,
                    onToggleIms = viewModel::toggleIms,
                    onCycleAntenna = viewModel::cycleAntenna,
                    onRefresh = viewModel::refresh,
                    onScan = viewModel::requestSpectrumScan,
                    onRefreshSpectrum = viewModel::refreshSpectrum,
                    onSignalUnitChange = viewModel::setSignalUnit,
                    formatSignal = { s, unit -> viewModel.formatSignal(s, unit) },
                    currentPty = viewModel::currentPty,
                    antennaLabel = viewModel::antennaLabel
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FmDxApp(
    state: UiState,
    snackbarHostState: SnackbarHostState,
    onUpdateUrl: (String) -> Unit,
    onConnect: () -> Unit,
    onDisconnect: () -> Unit,
    onToggleAudio: () -> Unit,
    onTuneDirect: (Double) -> Unit,
    onToggleEq: () -> Unit,
    onToggleIms: () -> Unit,
    onCycleAntenna: () -> Unit,
    onRefresh: () -> Unit,
    onScan: () -> Unit,
    onRefreshSpectrum: () -> Unit,
    onSignalUnitChange: (SignalUnit) -> Unit,
    formatSignal: (TunerState?, SignalUnit) -> String,
    currentPty: (TunerState?) -> String,
    antennaLabel: () -> String
) {
    var selectedTab by rememberSaveable { mutableIntStateOf(0) }
    val tabs = listOf(
        SectionTab(R.string.server) { ServerSection(state, onUpdateUrl, onConnect, onDisconnect) },
        SectionTab(R.string.frequency) { FrequencySection(state, onTuneDirect, onRefresh) },
        SectionTab(R.string.status) { StatusSection(state, formatSignal, onSignalUnitChange) },
        SectionTab(R.string.controls) { ControlButtons(state, onToggleEq, onToggleIms, onCycleAntenna, antennaLabel) },
        SectionTab(R.string.rds) { RdsSection(state, currentPty) },
        SectionTab(R.string.station) { StationSection(state) },
        SectionTab(R.string.spectrum) { SpectrumSection(state, onScan, onRefreshSpectrum) }
    )
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(text = "FMDX Android", fontWeight = FontWeight.Bold)
                        val serverTitle = state.tunerInfo?.tunerName
                        if (!serverTitle.isNullOrBlank()) {
                            Text(
                                text = serverTitle,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                            )
                        }
                    }
                },
                actions = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        ConnectionStatusIndicator(
                            isConnected = state.isConnected,
                            isConnecting = state.isConnecting
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        IconButton(onClick = onToggleAudio) {
                            val playing = state.audioPlaying
                            val icon = if (playing) Icons.Filled.Pause else Icons.Filled.PlayArrow
                            Icon(
                                imageVector = icon,
                                contentDescription = if (playing) stringResource(id = R.string.stop_audio) else stringResource(id = R.string.play_audio)
                            )
                        }
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) }
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
        ) {
            ScrollableTabRow(selectedTabIndex = selectedTab) {
                tabs.forEachIndexed { index, tab ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        text = { Text(text = stringResource(id = tab.titleRes)) }
                    )
                }
            }
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(16.dp)
            ) {
                val scrollState = rememberScrollState()
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .verticalScroll(scrollState),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    tabs[selectedTab].content()
                }
            }
        }
    }
}

private data class SectionTab(
    @StringRes val titleRes: Int,
    val content: @Composable () -> Unit
)

@Composable
private fun ConnectionStatusIndicator(
    isConnected: Boolean,
    isConnecting: Boolean
) {
    val label = when {
        isConnecting -> stringResource(id = R.string.connecting)
        isConnected -> stringResource(id = R.string.connected)
        else -> stringResource(id = R.string.disconnected)
    }
    val indicatorColor = when {
        isConnecting -> MaterialTheme.colorScheme.secondary
        isConnected -> MaterialTheme.colorScheme.tertiary
        else -> MaterialTheme.colorScheme.error
    }
    Row(
        modifier = Modifier
            .background(indicatorColor.copy(alpha = 0.15f), CircleShape)
            .padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (isConnecting) {
            CircularProgressIndicator(
                modifier = Modifier.size(14.dp),
                strokeWidth = 2.dp,
                color = indicatorColor
            )
        } else {
            Box(
                modifier = Modifier
                    .size(10.dp)
                    .clip(CircleShape)
                    .background(indicatorColor)
            )
        }
        Spacer(modifier = Modifier.width(6.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
private fun ServerSection(
    state: UiState,
    onUpdateUrl: (String) -> Unit,
    onConnect: () -> Unit,
    onDisconnect: () -> Unit
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(text = stringResource(id = R.string.server), style = MaterialTheme.typography.titleLarge)
            OutlinedTextField(
                value = state.serverUrl,
                onValueChange = onUpdateUrl,
                label = { Text("Server URL") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done, keyboardType = KeyboardType.Uri),
                keyboardActions = KeyboardActions(onDone = { onConnect() })
            )
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = onConnect, enabled = !state.isConnecting) {
                    Text(text = stringResource(id = R.string.connect))
                }
                OutlinedButton(onClick = onDisconnect, enabled = state.isConnected || state.isConnecting) {
                    Text(text = stringResource(id = R.string.disconnect))
                }
            }
            if (state.isConnecting) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }
            state.tunerInfo?.let { info ->
                Text(text = info.tunerDescription, style = MaterialTheme.typography.bodyMedium)
            }
            state.statusMessage?.let { message ->
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun FrequencySection(
    state: UiState,
    onTuneDirect: (Double) -> Unit,
    onRefresh: () -> Unit
) {
    val minFreqTenth = 875
    val maxFreqTenth = 1080
    val displayValues = remember {
        (minFreqTenth..maxFreqTenth).map { freqValue ->
            String.format(Locale.getDefault(), "%.1f", freqValue / 10.0)
        }.toTypedArray()
    }
    val rangeSize = maxFreqTenth - minFreqTenth
    val currentIndex = state.tunerState?.freqMHz?.times(10)?.roundToInt()?.minus(minFreqTenth)
    var selectedIndex by rememberSaveable { mutableIntStateOf(currentIndex?.coerceIn(0, rangeSize) ?: 0) }
    LaunchedEffect(currentIndex) {
        currentIndex?.let {
            val bounded = it.coerceIn(0, rangeSize)
            if (bounded != selectedIndex) {
                selectedIndex = bounded
            }
        }
    }
    val selectedFrequency = (minFreqTenth + selectedIndex) / 10.0
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(text = stringResource(id = R.string.frequency), style = MaterialTheme.typography.titleLarge)
            Text(
                text = stringResource(
                    id = R.string.selected_frequency_label,
                    String.format(Locale.getDefault(), "%.1f", selectedFrequency)
                )
            )
            AndroidView(
                modifier = Modifier.fillMaxWidth(),
                factory = { context ->
                    NumberPicker(context).apply {
                        descendantFocusability = NumberPicker.FOCUS_BLOCK_DESCENDANTS
                        wrapSelectorWheel = false
                        minValue = 0
                        maxValue = rangeSize
                        value = selectedIndex
                        displayedValues = displayValues
                        setOnValueChangedListener { _, _, newVal ->
                            selectedIndex = newVal
                        }
                    }
                },
                update = { picker ->
                    if (picker.displayedValues?.contentEquals(displayValues) != true) {
                        picker.displayedValues = displayValues
                    }
                    if (picker.value != selectedIndex) {
                        picker.value = selectedIndex
                    }
                }
            )
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = { onTuneDirect(selectedFrequency) }) {
                    Text(text = stringResource(id = R.string.tune))
                }
                OutlinedButton(onClick = onRefresh, enabled = state.isConnected) {
                    Text(text = stringResource(id = R.string.refresh))
                }
            }
        }
    }
}

@Composable
private fun StatusSection(
    state: UiState,
    formatSignal: (TunerState?, SignalUnit) -> String,
    onSignalUnitChange: (SignalUnit) -> Unit
) {
    val signalValue = state.tunerState?.signalDbf ?: 0.0
    val progress = (signalValue.coerceIn(0.0, 130.0) / 130.0).toFloat()
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(text = stringResource(id = R.string.status), style = MaterialTheme.typography.titleLarge)
            if (state.isConnecting) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            } else {
                LinearProgressIndicator(
                    progress = { progress },
                    modifier = Modifier.fillMaxWidth()
                )
            }
            Text(text = stringResource(id = R.string.signal_label, formatSignal(state.tunerState, state.signalUnit)))
            Text(text = stringResource(id = R.string.ping_label, state.pingMs?.let { "$it ms" } ?: "--"))
            Text(text = stringResource(id = R.string.users_label, state.tunerState?.users?.toString() ?: "--"))
            val audioStatus = if (state.audioPlaying) stringResource(id = R.string.audio_playing) else stringResource(id = R.string.audio_stopped)
            Text(text = stringResource(id = R.string.audio_label, audioStatus))
            SignalUnitSelector(state.signalUnit, onSignalUnitSelected = onSignalUnitChange)
        }
    }
}

@Composable
private fun SignalUnitSelector(
    selected: SignalUnit,
    onSignalUnitSelected: (SignalUnit) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(text = stringResource(id = R.string.signal_unit), style = MaterialTheme.typography.labelLarge)
        OutlinedButton(onClick = { expanded = true }) {
            Text(text = selected.displayName)
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            SignalUnit.entries.forEach { unit ->
                DropdownMenuItem(
                    text = { Text(unit.displayName) },
                    onClick = {
                        onSignalUnitSelected(unit)
                        expanded = false
                    }
                )
            }
        }
    }
}

@Composable
private fun ControlButtons(
    state: UiState,
    onToggleEq: () -> Unit,
    onToggleIms: () -> Unit,
    onCycleAntenna: () -> Unit,
    antennaLabel: () -> String
) {
    val canSwitchAntenna = state.tunerInfo?.canSwitchAntenna() == true
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(text = stringResource(id = R.string.controls), style = MaterialTheme.typography.titleLarge)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Button(
                    onClick = onToggleIms,
                    modifier = Modifier.weight(1f),
                    enabled = state.isConnected
                ) {
                    Text(text = stringResource(id = R.string.toggle_ims))
                }
                Button(
                    onClick = onToggleEq,
                    modifier = Modifier.weight(1f),
                    enabled = state.isConnected
                ) {
                    Text(text = stringResource(id = R.string.toggle_eq))
                }
            }
            Button(
                onClick = onCycleAntenna,
                modifier = Modifier.fillMaxWidth(),
                enabled = state.isConnected && canSwitchAntenna
            ) {
                Text(text = stringResource(id = R.string.antenna_switch))
            }
            Text(
                text = stringResource(id = R.string.antenna_current, antennaLabel()),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun RdsSection(
    state: UiState,
    currentPty: (TunerState?) -> String
) {
    val tuner = state.tunerState
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(text = stringResource(id = R.string.rds), style = MaterialTheme.typography.titleLarge)
            Text(text = "PS: ", style = MaterialTheme.typography.labelLarge)
            AnnotatedErrorText(tuner?.ps ?: "", tuner?.psErrors ?: emptyList())
            Text(text = "PI: ${tuner?.pi ?: "--"}")
            tuner?.ecc?.let { Text(text = "ECC: $it") }
            val country = tuner?.countryName ?: tuner?.countryIso
            if (!country.isNullOrBlank()) {
                Text(text = "Country: $country")
            }
            val flags = tuner?.flags()
            if (!flags.isNullOrBlank()) {
                Text(text = "Flags: $flags")
            }
            Text(text = "PTY: ${currentPty(tuner)}")
            tuner?.diDisplay()?.let { Text(text = "DI: $it") }
            val afText = if (tuner?.afList.isNullOrEmpty()) "None" else "${tuner?.afList?.size} frequencies"
            Text(text = "AF: $afText")
            Text(text = "RadioText:", style = MaterialTheme.typography.labelLarge)
            AnnotatedErrorText(tuner?.rt0 ?: "", tuner?.rt0Errors ?: emptyList())
            AnnotatedErrorText(tuner?.rt1 ?: "", tuner?.rt1Errors ?: emptyList())
        }
    }
}

@Composable
private fun AnnotatedErrorText(text: String, errors: List<Int>) {
    val annotated = buildAnnotatedString {
        text.forEachIndexed { index, c ->
            val hasError = errors.getOrNull(index)?.let { it > 0 } ?: false
            if (hasError) {
                withStyle(style = SpanStyle(color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))) {
                    append(c)
                }
            } else {
                append(c)
            }
        }
    }
    Text(text = annotated)
}

@Composable
private fun StationSection(state: UiState) {
    val tx = state.tunerState?.txInfo
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(text = stringResource(id = R.string.station), style = MaterialTheme.typography.titleLarge)
            Text(text = "Name: ${tx?.name ?: "--"}")
            Text(text = "Location: ${tx?.city ?: "--"}")
            Text(text = "Country: ${tx?.countryCode ?: "--"}")
            Text(text = "Distance: ${tx?.distanceKm?.let { "$it km" } ?: "--"}")
            Text(text = "Power: ${tx?.erpKw?.let { "$it kW" } ?: "--"}")
            Text(text = "Polarization: ${tx?.polarization ?: "--"}")
            Text(text = "Azimuth: ${tx?.azimuthDeg?.let { "$it°" } ?: "--"}")
        }
    }
}

@Composable
private fun SpectrumSection(
    state: UiState,
    onScan: () -> Unit,
    onRefreshSpectrum: () -> Unit
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(text = stringResource(id = R.string.spectrum), style = MaterialTheme.typography.titleLarge)
                if (state.isScanning) {
                    LinearProgressIndicator()
                }
            }
            SpectrumGraph(points = state.spectrum, highlightFreq = state.tunerState?.freqMHz ?: 0.0)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = onScan, enabled = !state.isScanning) {
                    Text(text = stringResource(id = R.string.start_scan))
                }
                OutlinedButton(onClick = onRefreshSpectrum) {
                    Text(text = stringResource(id = R.string.refresh_spectrum))
                }
            }
        }
    }
}

@Composable
private fun SpectrumGraph(points: List<SpectrumPoint>, highlightFreq: Double) {
    if (points.isEmpty()) {
        Text(text = stringResource(id = R.string.spectrum_unavailable))
        return
    }
    val minFreq = points.first().frequencyMHz
    val maxFreq = points.last().frequencyMHz
    val freqSpan = (maxFreq - minFreq).coerceAtLeast(0.01)
    val maxSig = points.maxOfOrNull { it.signalDbf }?.coerceAtLeast(130.0) ?: 130.0
    val primaryColor = MaterialTheme.colorScheme.primary
    val secondaryColor = MaterialTheme.colorScheme.secondary
    val surfaceColor = MaterialTheme.colorScheme.surface
    val strokeWidthPx = with(LocalDensity.current) { 2.dp.toPx() }

    Card {
        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .height(220.dp)
        ) { 
            val width = size.width
            val height = size.height

            drawRect(color = surfaceColor)
            val path = Path()
            points.forEachIndexed { index, point ->
                val x = ((point.frequencyMHz - minFreq) / freqSpan).toFloat().coerceIn(0f, 1f) * width
                val normalized = point.signalDbf.coerceIn(0.0, maxSig).toFloat() / maxSig.toFloat()
                val y = height - (normalized * height)
                if (index == 0) {
                    path.moveTo(x, y)
                } else {
                    path.lineTo(x, y)
                }
            }
            drawPath(path, color = secondaryColor, style = Stroke(width = strokeWidthPx))
            if (highlightFreq in minFreq..maxFreq) {
                val x = ((highlightFreq - minFreq) / freqSpan).toFloat().coerceIn(0f, 1f) * width
                drawLine(
                    color = primaryColor,
                    start = androidx.compose.ui.geometry.Offset(x, 0f),
                    end = androidx.compose.ui.geometry.Offset(x, height),
                    strokeWidth = strokeWidthPx
                )
            }
        }
    }
}
