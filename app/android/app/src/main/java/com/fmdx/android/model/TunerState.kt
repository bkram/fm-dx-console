package com.fmdx.android.model

import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.roundToInt

data class TunerState(
    val freqMHz: Double?,
    val signalDbf: Double?,
    val stereo: Boolean,
    val ims: Boolean,
    val eq: Boolean,
    val antennaIndex: Int?,
    val users: Int?,
    val ps: String?,
    val psErrors: List<Int>,
    val pi: String?,
    val ecc: String?,
    val countryName: String?,
    val countryIso: String?,
    val tp: Boolean,
    val ta: Boolean,
    val ms: Boolean,
    val pty: Int?,
    val ptyText: String?,
    val dynamicPty: Boolean?,
    val artificialHead: Boolean?,
    val compressed: Boolean?,
    val rt0: String?,
    val rt0Errors: List<Int>,
    val rt1: String?,
    val rt1Errors: List<Int>,
    val afList: List<Double>,
    val txInfo: TxInfo?
) {
    val freqKHz: Int?
        get() = freqMHz?.let { (it * 1000).roundToInt() }

    fun flags(): String {
        val parts = buildList {
            if (tp) add("TP")
            if (ta) add("TA")
            if (ms) add("MS")
        }
        return parts.joinToString(" ")
    }

    fun ptyDisplay(europeProgrammes: List<String>): String {
        val number = pty ?: 0
        val name = europeProgrammes.getOrNull(number) ?: "None"
        return "$number/$name"
    }

    fun diDisplay(): String? {
        if (dynamicPty == null && artificialHead == null && compressed == null) return null
        return buildString {
            dynamicPty?.let { append("DP:").append(if (it) "On" else "Off").append(' ') }
            artificialHead?.let { append("AH:").append(if (it) "On" else "Off").append(' ') }
            compressed?.let { append("C:").append(if (it) "On" else "Off").append(' ') }
            stereo.let { append("Stereo:").append(if (it) "Yes" else "No") }
        }.trim()
    }

    companion object {
        fun fromJson(json: String): TunerState {
            val obj = JSONObject(json)
            val freq = obj.optDoubleOrNull("freq")
            val sig = obj.optDoubleOrNull("sig")
            val txInfo = obj.optJSONObject("txInfo")?.let { TxInfo.fromJson(it) }
            return TunerState(
                freqMHz = freq,
                signalDbf = sig,
                stereo = obj.optBooleanFromInt("st"),
                ims = obj.optBooleanFromInt("ims"),
                eq = obj.optBooleanFromInt("eq"),
                antennaIndex = obj.optIntOrNull("ant"),
                users = obj.optIntOrNull("users"),
                ps = obj.optStringOrNull("ps"),
                psErrors = obj.optString("ps_errors", "").toErrorList(),
                pi = obj.optStringOrNull("pi"),
                ecc = obj.optStringOrNull("ecc"),
                countryName = obj.optStringOrNull("country_name"),
                countryIso = obj.optStringOrNull("country_iso"),
                tp = obj.optBooleanFromInt("tp"),
                ta = obj.optBooleanFromInt("ta"),
                ms = obj.optBooleanFromInt("ms"),
                pty = obj.optIntOrNull("pty"),
                ptyText = obj.optStringOrNull("pty_text"),
                dynamicPty = obj.optBooleanOrNull("dynamic_pty"),
                artificialHead = obj.optBooleanOrNull("artificial_head"),
                compressed = obj.optBooleanOrNull("compressed"),
                rt0 = obj.optStringOrNull("rt0"),
                rt0Errors = obj.optString("rt0_errors", "").toErrorList(),
                rt1 = obj.optStringOrNull("rt1"),
                rt1Errors = obj.optString("rt1_errors", "").toErrorList(),
                afList = obj.optJSONArray("af").toDoubleList(),
                txInfo = txInfo
            )
        }
    }
}

data class TxInfo(
    val name: String?,
    val city: String?,
    val countryCode: String?,
    val distanceKm: String?,
    val erpKw: String?,
    val polarization: String?,
    val azimuthDeg: String?
) {
    companion object {
        fun fromJson(obj: JSONObject): TxInfo {
            val tx = obj.optJSONObject("tx")
            val txName = tx?.optStringOrNull("tx") ?: obj.optStringOrNull("tx")
            return TxInfo(
                name = txName,
                city = obj.optStringOrNull("city"),
                countryCode = obj.optStringOrNull("itu"),
                distanceKm = obj.optStringOrNull("dist"),
                erpKw = obj.optStringOrNull("erp"),
                polarization = obj.optStringOrNull("pol"),
                azimuthDeg = obj.optStringOrNull("azi")
            )
        }
    }
}

private fun JSONObject.optDoubleOrNull(name: String): Double? =
    if (has(name) && !isNull(name)) optDouble(name) else null

private fun JSONObject.optIntOrNull(name: String): Int? =
    if (has(name) && !isNull(name)) optInt(name) else null

private fun JSONObject.optBooleanOrNull(name: String): Boolean? =
    if (has(name) && !isNull(name)) {
        val value = opt(name)
        when (value) {
            is Boolean -> value
            is Number -> value.toInt() != 0
            else -> null
        }
    } else null

private fun JSONObject.optBooleanFromInt(name: String): Boolean =
    when (val value = opt(name)) {
        is Boolean -> value
        is Number -> value.toInt() != 0
        else -> false
    }

private fun JSONObject.optStringOrNull(name: String): String? =
    if (has(name) && !isNull(name)) optString(name) else null

private fun JSONArray?.toDoubleList(): List<Double> {
    if (this == null) return emptyList()
    val result = mutableListOf<Double>()
    for (i in 0 until length()) {
        val value = opt(i)
        when (value) {
            is Number -> result.add(value.toDouble())
            is String -> value.toDoubleOrNull()?.let(result::add)
        }
    }
    return result
}

private fun String.toErrorList(): List<Int> {
    if (isBlank()) return emptyList()
    return split(',').mapNotNull { it.trim().toIntOrNull() }
}
