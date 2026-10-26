/**
 * TTP223 capacitive touch sensors x 2
 *
 * Mount:
 *   #0 head top
 *   #1 head side
 *
 * Output: HIGH = touching, LOW = not touching
 *
 * ─────────────────────────────────────────────────────────────────
 *  Both pins are NON-STRAP — completely safe to touch at any time,
 *  including during power-on. No boot risk.
 *
 *    GPIO 26 : non-strap  (was reserved for LCD CS_R, unused on this
 *                          board because CS is hard-tied to GND)
 *    GPIO 25 : non-strap  (was reserved for LCD CS_L, unused for the
 *                          same reason)
 *
 *  GPIO 2 and GPIO 12 are INTENTIONALLY NOT USED for touch here — they
 *  are strapping pins and would cause boot issues if touched at power-on.
 * ─────────────────────────────────────────────────────────────────
 */

#ifndef SENSOR_TOUCH_H
#define SENSOR_TOUCH_H

#include <Arduino.h>

#define TOUCH_SENSOR_COUNT  2
#define TOUCH_PIN_0         26   // head top    (non-strap, safe)
#define TOUCH_PIN_1         25   // head side   (non-strap, safe)
#define TOUCH_DEBOUNCE_MS   200

class SensorTouch {
public:
    void begin();

    /** Check for touch state change. Returns the sensor id whose state
     *  changed (-1 if none). Fills `newState` with the latest value. */
    int checkChange(bool &newState);

    /** Read current raw state of a specific sensor. */
    bool read(uint8_t id);

private:
    const uint8_t _pins[TOUCH_SENSOR_COUNT] = {TOUCH_PIN_0, TOUCH_PIN_1};
    bool _lastState[TOUCH_SENSOR_COUNT] = {false, false};
    unsigned long _lastChangeTime[TOUCH_SENSOR_COUNT] = {0, 0};
};

#endif // SENSOR_TOUCH_H
