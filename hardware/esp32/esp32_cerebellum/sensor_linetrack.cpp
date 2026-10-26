#include "sensor_linetrack.h"

void SensorIR::begin() {
    for (int i = 0; i < FALL_SENSOR_COUNT; i++) {
        pinMode(_fallPins[i], INPUT);
    }
    for (int i = 0; i < BUMP_SENSOR_COUNT; i++) {
        pinMode(_bumpPins[i], INPUT);
    }
}

bool SensorIR::isEdgeDetected() {
    // 4 fall sensors (FL/FR/RL/RR). Any HIGH = no floor under that corner =
    // EDGE. The host's on_edge_alert decodes the full sensors[] array to
    // pick a safe escape direction. G34 is no longer in the fall set --
    // it was relocated to BUMP_BACK precisely so its known boot-glitch
    // failure mode (floating HIGH on bad solder) becomes harmless.
    for (int i = 0; i < FALL_SENSOR_COUNT; i++) {
        if (digitalRead(_fallPins[i]) == HIGH) return true;
    }
    return false;
}

void SensorIR::getFallValues(int values[FALL_SENSOR_COUNT]) {
    for (int i = 0; i < FALL_SENSOR_COUNT; i++) {
        values[i] = digitalRead(_fallPins[i]);
    }
}

bool SensorIR::isBumpDetected() {
    for (int i = 0; i < BUMP_SENSOR_COUNT; i++) {
        // LOW = reflection = obstacle close
        if (digitalRead(_bumpPins[i]) == LOW) return true;
    }
    return false;
}

void SensorIR::getBumpFlags(int flags[BUMP_SENSOR_COUNT]) {
    for (int i = 0; i < BUMP_SENSOR_COUNT; i++) {
        flags[i] = (digitalRead(_bumpPins[i]) == LOW) ? 1 : 0;
    }
}
