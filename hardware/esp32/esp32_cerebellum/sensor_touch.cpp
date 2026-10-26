#include "sensor_touch.h"

void SensorTouch::begin() {
    for (int i = 0; i < TOUCH_SENSOR_COUNT; i++) {
        pinMode(_pins[i], INPUT);
        _lastState[i] = false;
        _lastChangeTime[i] = 0;
    }
}

int SensorTouch::checkChange(bool &newState) {
    unsigned long now = millis();
    for (int i = 0; i < TOUCH_SENSOR_COUNT; i++) {
        if (now - _lastChangeTime[i] < TOUCH_DEBOUNCE_MS) {
            continue;
        }

        bool current = (digitalRead(_pins[i]) == HIGH);
        if (current != _lastState[i]) {
            _lastState[i] = current;
            _lastChangeTime[i] = now;
            newState = current;
            return i;
        }
    }
    return -1;
}

bool SensorTouch::read(uint8_t id) {
    if (id < TOUCH_SENSOR_COUNT) {
        return (digitalRead(_pins[id]) == HIGH);
    }
    return false;
}
