#include "servo_driver.h"

void ServoDriver::begin() {
    _pca = Adafruit_PWMServoDriver(0x40);
    _pca.begin();
    _pca.setPWMFreq(50);
    delay(10);

    for (int i = 0; i < 16; i++) {
        _currentAngle[i] = SERVO_CENTER;
    }
    _currentAngle[SERVO_PAN]  = SERVO_PAN_CENTER;
    _currentAngle[SERVO_TILT] = SERVO_TILT_CENTER;

    setAngle(SERVO_PAN,  SERVO_PAN_CENTER);
    setAngle(SERVO_TILT, SERVO_TILT_CENTER);
}

int ServoDriver::clampAngle(uint8_t channel, int angle) {
    if (channel == SERVO_PAN) {
        return constrain(angle, SERVO_PAN_MIN, SERVO_PAN_MAX);
    } else if (channel == SERVO_TILT) {
        return constrain(angle, SERVO_TILT_MIN, SERVO_TILT_MAX);
    }
    return constrain(angle, 0, 180);
}

void ServoDriver::setAngle(uint8_t channel, int angle) {
    if (channel >= 16) return;
    angle = clampAngle(channel, angle);
    _pca.setPWM(channel, 0, angleToPulse(angle));
    _currentAngle[channel] = angle;
}

int ServoDriver::getAngle(uint8_t channel) {
    if (channel < 16) return _currentAngle[channel];
    return SERVO_CENTER;
}

void ServoDriver::startSmoothMove(uint8_t channel, int targetAngle, int stepDelay) {
    if (channel > 1) return;
    targetAngle = clampAngle(channel, targetAngle);
    _smooth[channel].active = true;
    _smooth[channel].targetAngle = targetAngle;
    _smooth[channel].stepDelay = stepDelay;
    _smooth[channel].lastStepTime = millis();
}

void ServoDriver::update() {
    unsigned long now = millis();

    // 驱动平滑移动
    for (int ch = 0; ch < 2; ch++) {
        if (!_smooth[ch].active) continue;
        if (now - _smooth[ch].lastStepTime < (unsigned long)_smooth[ch].stepDelay) continue;

        _smooth[ch].lastStepTime = now;
        int current = _currentAngle[ch];
        int target = _smooth[ch].targetAngle;

        if (current == target) {
            _smooth[ch].active = false;
            continue;
        }

        int step = (target > current) ? 1 : -1;
        setAngle(ch, current + step);
    }

    // 驱动序列
    if (_seqActive) {
        advanceSequence();
    }
}

bool ServoDriver::isBusy() const {
    return _seqActive || _smooth[0].active || _smooth[1].active;
}

void ServoDriver::executeSequence(const char* seqName) {
    if (strcmp(seqName, SEQ_NOD) == 0) {
        loadSeqNod();
    } else if (strcmp(seqName, SEQ_SHAKE) == 0) {
        loadSeqShake();
    } else if (strcmp(seqName, SEQ_TILT_HEAD) == 0) {
        loadSeqTiltHead();
    } else {
        return;
    }
    _seqIndex = 0;
    _seqActive = true;
    _seqWaitingPause = false;

    if (_seqLength > 0) {
        startSmoothMove(_seqSteps[0].channel, _seqSteps[0].targetAngle, _seqSteps[0].stepDelay);
    }
}

void ServoDriver::advanceSequence() {
    if (_seqIndex >= _seqLength) {
        _seqActive = false;
        return;
    }

    ServoStep& step = _seqSteps[_seqIndex];

    if (_seqWaitingPause) {
        if (millis() - _seqPauseStart >= step.pause) {
            _seqWaitingPause = false;
            _seqIndex++;
            if (_seqIndex < _seqLength) {
                ServoStep& next = _seqSteps[_seqIndex];
                startSmoothMove(next.channel, next.targetAngle, next.stepDelay);
            } else {
                _seqActive = false;
            }
        }
        return;
    }

    // 等待当前通道的平滑移动完成
    if (!_smooth[step.channel].active) {
        if (step.pause > 0) {
            _seqWaitingPause = true;
            _seqPauseStart = millis();
        } else {
            _seqIndex++;
            if (_seqIndex < _seqLength) {
                ServoStep& next = _seqSteps[_seqIndex];
                startSmoothMove(next.channel, next.targetAngle, next.stepDelay);
            } else {
                _seqActive = false;
            }
        }
    }
}

void ServoDriver::center() {
    startSmoothMove(SERVO_PAN,  SERVO_PAN_CENTER,  10);
    startSmoothMove(SERVO_TILT, SERVO_TILT_CENTER, 10);
}

uint16_t ServoDriver::angleToPulse(int angle) {
    return map(angle, 0, 180, SERVO_MIN_PULSE, SERVO_MAX_PULSE);
}

// ── 序列定义 ──

void ServoDriver::loadSeqNod() {
    // TILT range is 60..95 (asymmetric, only +5° headroom above center 90°).
    // Use CENTER-15 / CENTER+5 so the up step doesn't get clamped at MAX.
    _seqLength = 5;
    _seqSteps[0] = {SERVO_TILT, SERVO_TILT_CENTER - 15, 12, 100};   // 75 (down)
    _seqSteps[1] = {SERVO_TILT, SERVO_TILT_CENTER + 5,  12, 100};   // 95 (up, == MAX)
    _seqSteps[2] = {SERVO_TILT, SERVO_TILT_CENTER - 15, 12, 100};   // 75
    _seqSteps[3] = {SERVO_TILT, SERVO_TILT_CENTER + 5,  12, 100};   // 95
    _seqSteps[4] = {SERVO_TILT, SERVO_TILT_CENTER,      12, 0};     // 90 (return)
}

void ServoDriver::loadSeqShake() {
    _seqLength = 5;
    _seqSteps[0] = {SERVO_PAN, SERVO_PAN_CENTER - 30, 10, 150};
    _seqSteps[1] = {SERVO_PAN, SERVO_PAN_CENTER + 30, 10, 150};
    _seqSteps[2] = {SERVO_PAN, SERVO_PAN_CENTER - 30, 10, 150};
    _seqSteps[3] = {SERVO_PAN, SERVO_PAN_CENTER + 30, 10, 150};
    _seqSteps[4] = {SERVO_PAN, SERVO_PAN_CENTER,       10, 0};
}

void ServoDriver::loadSeqTiltHead() {
    _seqLength = 4;
    _seqSteps[0] = {SERVO_PAN,  SERVO_PAN_CENTER + 25,  15, 0};
    _seqSteps[1] = {SERVO_TILT, SERVO_TILT_CENTER - 10, 15, 800};
    _seqSteps[2] = {SERVO_PAN,  SERVO_PAN_CENTER,       12, 0};
    _seqSteps[3] = {SERVO_TILT, SERVO_TILT_CENTER,      12, 0};
}
