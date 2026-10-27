/**
 * PCA9685 舵机驱动 — 控制双轴云台（非阻塞版本）
 *
 * 接线: ESP32 I2C (SDA=21, SCL=22) → PCA9685 → MG90S舵机 × 2
 *
 * 通道:
 *   0 = PAN  (水平旋转，左右摇头)
 *   1 = TILT (垂直俯仰，点头)
 *
 * 所有动作通过 update() 在主循环中驱动，不使用 delay()。
 */

#ifndef SERVO_DRIVER_H
#define SERVO_DRIVER_H

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>
#include "comm_protocol.h"

#define SERVO_MIN_PULSE  125   // 0°   对应脉宽
#define SERVO_MAX_PULSE  575   // 180° 对应脉宽

#define SEQ_MAX_STEPS    12

struct ServoStep {
    uint8_t channel;
    int targetAngle;
    int stepDelay;       // ms per degree
    unsigned long pause; // ms to wait after reaching target
};

class ServoDriver {
public:
    void begin();

    /** 设置单个舵机角度 (带通道限位保护) */
    void setAngle(uint8_t channel, int angle);

    int getAngle(uint8_t channel);

    /** 非阻塞：在主循环中调用，驱动平滑移动和序列 */
    void update();

    /** 启动平滑移动到目标角度（非阻塞） */
    void startSmoothMove(uint8_t channel, int targetAngle, int stepDelay = 15);

    /** 执行预定义动作序列（非阻塞） */
    void executeSequence(const char* seqName);

    /** 是否正在执行序列 */
    bool isBusy() const;

    void center();

private:
    Adafruit_PWMServoDriver _pca;
    int _currentAngle[16];
    uint16_t angleToPulse(int angle);

    int clampAngle(uint8_t channel, int angle);

    // 非阻塞平滑移动状态
    struct SmoothState {
        bool active = false;
        int targetAngle = 90;
        int stepDelay = 15;
        unsigned long lastStepTime = 0;
    };
    SmoothState _smooth[2]; // PAN and TILT

    // 序列播放状态
    ServoStep _seqSteps[SEQ_MAX_STEPS];
    int _seqLength = 0;
    int _seqIndex = 0;
    bool _seqActive = false;
    bool _seqWaitingPause = false;
    unsigned long _seqPauseStart = 0;

    void loadSeqNod();
    void loadSeqShake();
    void loadSeqTiltHead();
    void advanceSequence();
};

#endif // SERVO_DRIVER_H
