#include "motor_driver.h"

void MotorDriver::begin() {
    pinMode(MOTOR_AIN1, OUTPUT);
    pinMode(MOTOR_AIN2, OUTPUT);
    pinMode(MOTOR_BIN1, OUTPUT);
    pinMode(MOTOR_BIN2, OUTPUT);

    digitalWrite(MOTOR_AIN1, LOW);
    digitalWrite(MOTOR_AIN2, LOW);
    digitalWrite(MOTOR_BIN1, LOW);
    digitalWrite(MOTOR_BIN2, LOW);

#if ESP_ARDUINO_VERSION_MAJOR >= 3
    ledcDetach(MOTOR_PWMA);
    ledcDetach(MOTOR_PWMB);
    bool okA = ledcAttachChannel(MOTOR_PWMA,
                                 PWM_FREQ,
                                 PWM_RESOLUTION,
                                 PWM_CHANNEL_A);
    bool okB = ledcAttachChannel(MOTOR_PWMB,
                                 PWM_FREQ,
                                 PWM_RESOLUTION,
                                 PWM_CHANNEL_B);
    Serial.printf("[motor] PWMA ledcAttachChannel(pin=%d, ch=%d) = %d\n",
                  MOTOR_PWMA, PWM_CHANNEL_A, okA);
    Serial.printf("[motor] PWMB ledcAttachChannel(pin=%d, ch=%d) = %d\n",
                  MOTOR_PWMB, PWM_CHANNEL_B, okB);
    ledcWrite(MOTOR_PWMA, 0);
    ledcWrite(MOTOR_PWMB, 0);
#else
    ledcSetup(PWM_CHANNEL_A, PWM_FREQ, PWM_RESOLUTION);
    ledcSetup(PWM_CHANNEL_B, PWM_FREQ, PWM_RESOLUTION);
    ledcAttachPin(MOTOR_PWMA, PWM_CHANNEL_A);
    ledcAttachPin(MOTOR_PWMB, PWM_CHANNEL_B);
    ledcWrite(PWM_CHANNEL_A, 0);
    ledcWrite(PWM_CHANNEL_B, 0);
#endif

    _enabled = true;
}

void MotorDriver::setSpeed(int left, int right) {
    if (!_enabled) return;
#if MOTOR_TB6612_A_DEAD
    // Both motors are wired in parallel on BO1/BO2. The "left" parameter
    // can no longer be honoured independently — average the two so the
    // command "m 100 100" → forward at 100, "m 100 -100" → stop, etc.
    int combined = (left + right) / 2;
    _targetA = 0;          // hold A pins LOW so the dead channel can't latch up
    _targetB = constrain(combined, -255, 255);
#else
    _targetA = constrain(left,  -255, 255);
    _targetB = constrain(right, -255, 255);
#endif
    // Note: physical PWM update happens in update() so the inrush is
    // ramped, not stepped. The first ramp tick fires within
    // MOTOR_RAMP_TICK_MS (5 ms), imperceptible.
}

void MotorDriver::stop() {
    // Coast to a halt via the ramp. emergencyStop() is the hard variant.
    _targetA = 0;
    _targetB = 0;
}

void MotorDriver::emergencyStop() {
    _enabled = false;
    // STBY is hard-tied to 3V3; we can only soft-stop.
    digitalWrite(MOTOR_AIN1, LOW);
    digitalWrite(MOTOR_AIN2, LOW);
    digitalWrite(MOTOR_BIN1, LOW);
    digitalWrite(MOTOR_BIN2, LOW);
    writePWM(MOTOR_PWMA, 0);
    writePWM(MOTOR_PWMB, 0);
    // Force the ramp state to 0 too, otherwise resume() would silently
    // re-accelerate to whatever the previous target was.
    _targetA = _currentA = 0;
    _targetB = _currentB = 0;
}

void MotorDriver::resume() {
    _enabled = true;
    // Belt-and-braces: always restart from a known-zero state.
    _targetA = _currentA = 0;
    _targetB = _currentB = 0;
}

void MotorDriver::update() {
    if (!_enabled) return;

    unsigned long now = millis();
    if (now - _lastRampMs < MOTOR_RAMP_TICK_MS) return;
    _lastRampMs = now;

    auto stepToward = [](int& current, int target) {
        if (current == target) return false;
        if (current < target) {
            current = min(current + MOTOR_RAMP_PWM_STEP, target);
        } else {
            current = max(current - MOTOR_RAMP_PWM_STEP, target);
        }
        return true;
    };

    bool changedA = stepToward(_currentA, _targetA);
    bool changedB = stepToward(_currentB, _targetB);

    // Only push to hardware on actual change to keep the I/O traffic and
    // the LEDC peripheral writes minimal at steady state.
    if (changedA) setMotorA(_currentA);
    if (changedB) setMotorB(_currentB);
}

void MotorDriver::writePWM(uint8_t pin, uint8_t duty) {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
    // core 3.x: ledcWrite takes the GPIO pin number; the framework looks
    // up the channel internally (set via ledcAttachChannel above).
    ledcWrite(pin, duty);
#else
    uint8_t channel = (pin == MOTOR_PWMA) ? PWM_CHANNEL_A : PWM_CHANNEL_B;
    ledcWrite(channel, duty);
#endif
}

void MotorDriver::setMotorA(int speed) {
    speed = constrain(speed, -255, 255);
    if (speed > 0) {
        digitalWrite(MOTOR_AIN1, HIGH);
        digitalWrite(MOTOR_AIN2, LOW);
        writePWM(MOTOR_PWMA, speed);
    } else if (speed < 0) {
        digitalWrite(MOTOR_AIN1, LOW);
        digitalWrite(MOTOR_AIN2, HIGH);
        writePWM(MOTOR_PWMA, -speed);
    } else {
        digitalWrite(MOTOR_AIN1, LOW);
        digitalWrite(MOTOR_AIN2, LOW);
        writePWM(MOTOR_PWMA, 0);
    }
}

void MotorDriver::setMotorB(int speed) {
    speed = constrain(speed, -255, 255);
    if (speed > 0) {
        digitalWrite(MOTOR_BIN1, HIGH);
        digitalWrite(MOTOR_BIN2, LOW);
        writePWM(MOTOR_PWMB, speed);
    } else if (speed < 0) {
        digitalWrite(MOTOR_BIN1, LOW);
        digitalWrite(MOTOR_BIN2, HIGH);
        writePWM(MOTOR_PWMB, -speed);
    } else {
        digitalWrite(MOTOR_BIN1, LOW);
        digitalWrite(MOTOR_BIN2, LOW);
        writePWM(MOTOR_PWMB, 0);
    }
}
