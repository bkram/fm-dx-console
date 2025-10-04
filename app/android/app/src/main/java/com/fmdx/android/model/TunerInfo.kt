package com.fmdx.android.model

data class TunerInfo(
    val tunerName: String,
    val tunerDescription: String,
    val antennaNames: List<String>,
    val activeAntenna: Int
) {
    fun canSwitchAntenna(): Boolean {
        return antennaNames.size > 1
    }
}
