#include "sensor_ultrasonic.h"

void SensorUltrasonic::begin() {
    pinMode(US_TRIG_PIN, OUTPUT);
    pinMode(US_ECHO_PIN, INPUT);
    digitalWrite(US_TRIG_PIN, LOW);
}

float SensorUltrasonic::readDistanceCm() {
    // 最小 60ms 间隔，避免串扰
    unsigned long now = millis();
    if (now - _lastReadTime < 60) {
        return _lastDistance;
    }
    _lastReadTime = now;

    digitalWrite(US_TRIG_PIN, LOW);
    delayMicroseconds(2);
    digitalWrite(US_TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(US_TRIG_PIN, LOW);

    long duration = pulseIn(US_ECHO_PIN, HIGH, US_TIMEOUT);

    if (duration == 0) {
        return -1.0;
    }

    // 声速 340m/s → 0.034 cm/μs，往返需除以2
    _lastDistance = duration * 0.034 / 2.0;
    return _lastDistance;
}
