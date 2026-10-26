/**
 * HC-SR04 ultrasonic distance sensor
 *
 * Wiring:
 *   TRIG -> ESP32 GPIO 4
 *   ECHO -> ESP32 GPIO 19  (MUST use 1K/2K divider: HC-SR04 ECHO outputs 5V!)
 *
 * Mount: chest, forward-facing (primary obstacle avoidance)
 */

#ifndef SENSOR_ULTRASONIC_H
#define SENSOR_ULTRASONIC_H

#include <Arduino.h>

#define US_TRIG_PIN  4
#define US_ECHO_PIN  19
#define US_TIMEOUT   30000  // microseconds, ~5m max range

class SensorUltrasonic {
public:
    void begin();

    /** 读取距离（厘米），失败返回 -1 */
    float readDistanceCm();

private:
    unsigned long _lastReadTime = 0;
    float _lastDistance = 999.0;
};

#endif // SENSOR_ULTRASONIC_H
