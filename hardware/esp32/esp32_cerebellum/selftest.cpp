#include "selftest.h"

#include <Arduino.h>
#include <Wire.h>
#include <ArduinoJson.h>
#include "comm_protocol.h"
#include "motor_driver.h"
#include "servo_driver.h"
#include "sensor_ultrasonic.h"
#include "sensor_linetrack.h"
#include "sensor_touch.h"
#include "eye_display.h"

// Globals owned by the main .ino; we reach in to drive them directly.
extern MotorDriver      motors;
extern ServoDriver      servos;
extern SensorUltrasonic ultrasonic;
extern SensorIR         irSensors;
extern SensorTouch      touchSensors;
extern EyeDisplay       eyes;
extern bool             selfTestActive;
extern unsigned long    lastCmdTime;

namespace {

// ─── Tiny JSON helpers (one allocation per event, fits in 192 bytes) ──

void sendEvent(const char* evt) {
    StaticJsonDocument<48> doc;
    doc["evt"] = evt;
    serializeJson(doc, OPI_SERIAL);
    OPI_SERIAL.println();
    lastCmdTime = millis();   // keep the cmd watchdog from biting
}

void sendStageBegin(int stage, const char* name, const char* msg) {
    StaticJsonDocument<128> doc;
    doc["evt"]   = EVT_SELFTEST_STAGE;
    doc["stage"] = stage;
    doc["name"]  = name;
    if (msg) doc["msg"] = msg;
    serializeJson(doc, OPI_SERIAL);
    OPI_SERIAL.println();
    lastCmdTime = millis();
}

template <typename T>
void sendDataValue(int stage, const char* key, T val) {
    StaticJsonDocument<96> doc;
    doc["evt"]   = EVT_SELFTEST_DATA;
    doc["stage"] = stage;
    doc["key"]   = key;
    doc["val"]   = val;
    serializeJson(doc, OPI_SERIAL);
    OPI_SERIAL.println();
    lastCmdTime = millis();
}

void sendDataIntArray(int stage, const char* key, const int* vals, int n) {
    StaticJsonDocument<160> doc;
    doc["evt"]   = EVT_SELFTEST_DATA;
    doc["stage"] = stage;
    doc["key"]   = key;
    JsonArray arr = doc.createNestedArray("val");
    for (int i = 0; i < n; i++) arr.add(vals[i]);
    serializeJson(doc, OPI_SERIAL);
    OPI_SERIAL.println();
    lastCmdTime = millis();
}

// ─── Stage 1: bus + sensor sample ─────────────────────────────────────

void stageBus() {
    sendStageBegin(1, "bus", "I2C scan + sensor sample");

    // I2C scan (0x08..0x77)
    int devices[8];
    int devCount = 0;
    for (uint8_t addr = 0x08; addr < 0x78; addr++) {
        Wire.beginTransmission(addr);
        if (Wire.endTransmission() == 0) {
            if (devCount < 8) devices[devCount++] = addr;
        }
    }
    sendDataIntArray(1, "i2c_devices", devices, devCount);

    // PCA9685 ACK
    Wire.beginTransmission(0x40);
    bool pca_ack = (Wire.endTransmission() == 0);
    sendDataValue(1, "pca9685_ack", pca_ack);

    // PCA9685 register read: MODE1 (0x00). After Adafruit_PWMServoDriver::begin()
    // it should have AI=1, SLEEP=0 (typical 0x20 / 0x21). 0x00 or 0xFF means
    // the bus is wired but the chip is dead/bricked.
    int mode1 = -1;
    if (pca_ack) {
        Wire.beginTransmission(0x40);
        Wire.write((uint8_t)0x00);
        if (Wire.endTransmission() == 0) {
            Wire.requestFrom((uint8_t)0x40, (uint8_t)1);
            if (Wire.available()) mode1 = Wire.read();
        }
    }
    sendDataValue(1, "pca9685_mode1", mode1);

    // IR raw sample: [FL, FR, RL, RR, BACK_BUMP] (matches the order used
    // elsewhere in QUERY but with bump appended). Operator side knows the
    // contract and can flag a stuck-HIGH input.
    int fall[FALL_SENSOR_COUNT];
    irSensors.getFallValues(fall);
    int bump[BUMP_SENSOR_COUNT];
    irSensors.getBumpFlags(bump);
    int irAll[FALL_SENSOR_COUNT + BUMP_SENSOR_COUNT];
    for (int i = 0; i < FALL_SENSOR_COUNT; i++)        irAll[i] = fall[i];
    for (int i = 0; i < BUMP_SENSOR_COUNT; i++)        irAll[FALL_SENSOR_COUNT + i] = bump[i];
    sendDataIntArray(1, "ir_raw", irAll, FALL_SENSOR_COUNT + BUMP_SENSOR_COUNT);

    // Touch raw sample
    int touch[TOUCH_SENSOR_COUNT];
    for (int i = 0; i < TOUCH_SENSOR_COUNT; i++) {
        touch[i] = touchSensors.read(i) ? 1 : 0;
    }
    sendDataIntArray(1, "touch_raw", touch, TOUCH_SENSOR_COUNT);

    // Ultrasonic single ping
    float dist = ultrasonic.readDistanceCm();
    sendDataValue(1, "ultra_cm", dist);
}

// ─── Stage 2: LCD test patterns ───────────────────────────────────────

constexpr uint16_t COL_RED   = 0xF800;
constexpr uint16_t COL_GREEN = 0x07E0;
constexpr uint16_t COL_BLUE  = 0x001F;
constexpr uint16_t COL_BLACK = 0x0000;
constexpr uint16_t COL_WHITE = 0xFFFF;

void drawCheckerboard() {
    // 30 px squares -> 8 x 8 grid on a 240 x 240 panel. Vivid contrast,
    // also exposes any horizontal-only / vertical-only stripe corruption.
    for (int gy = 0; gy < 240; gy += 30) {
        for (int gx = 0; gx < 240; gx += 30) {
            bool dark = ((gx / 30 + gy / 30) % 2) == 0;
            eyes.left()->fillRect(gx, gy, 30, 30,
                                  dark ? COL_BLACK : COL_WHITE);
        }
    }
}

void stageLcd() {
    sendStageBegin(2, "lcd", "RED -> GREEN -> BLUE -> CHECKERBOARD, 2s each");

    // Both LCDs share SPI with CS hard-tied GND, so any draw call to
    // eyes.left() reaches both panels. We use that to broadcast the
    // test pattern and let the operator visually compare the two.
    sendDataValue(2, "pattern", "RED");
    eyes.left()->fillScreen(COL_RED);
    delay(2000); lastCmdTime = millis();

    sendDataValue(2, "pattern", "GREEN");
    eyes.left()->fillScreen(COL_GREEN);
    delay(2000); lastCmdTime = millis();

    sendDataValue(2, "pattern", "BLUE");
    eyes.left()->fillScreen(COL_BLUE);
    delay(2000); lastCmdTime = millis();

    sendDataValue(2, "pattern", "CHECKERBOARD");
    drawCheckerboard();
    delay(2000); lastCmdTime = millis();

    eyes.left()->fillScreen(COL_BLACK);
}

// ─── Stage 3: servo channel scan ──────────────────────────────────────

void wiggleChannel(uint8_t ch) {
    // Three pulses with delay so the operator has time to see motion.
    // setAngle clamps PAN/TILT to their gimbal-safe ranges; for ch>=2
    // it clamps generic 0..180 so 60/120/90 always pass through.
    servos.setAngle(ch, 60);  delay(400); lastCmdTime = millis();
    servos.setAngle(ch, 120); delay(400); lastCmdTime = millis();
    servos.setAngle(ch, 90);  delay(200); lastCmdTime = millis();
}

void stageServoScan() {
    sendStageBegin(3, "servo_scan",
                   "Pulsing PCA9685 channels 0..15, 1s each. "
                   "Watch which channels move the head.");

    for (uint8_t ch = 0; ch < 16; ch++) {
        sendDataValue(3, "channel", (int)ch);
        wiggleChannel(ch);
    }

    // Final centering: explicitly set PAN and TILT to their CONFIGURED
    // centers so the operator can visually confirm "the head returned
    // to neutral" -- this is the user-reported failure mode we're after.
    sendDataValue(3, "centering", "PAN_CENTER_75_THEN_TILT_CENTER_90");
    servos.setAngle(SERVO_PAN,  SERVO_PAN_CENTER);  delay(500);
    servos.setAngle(SERVO_TILT, SERVO_TILT_CENTER); delay(500);
    lastCmdTime = millis();
}

// ─── Stage 4: motor brief test ────────────────────────────────────────

void runMotorBurst(int speed, unsigned long duration_ms) {
    motors.setSpeed(speed, speed);
    unsigned long t0 = millis();
    while (millis() - t0 < duration_ms) {
        motors.update();   // drive the soft-start ramp; without this the
                           // PWM never advances toward target while we
                           // block loop().
        delay(5);
    }
    motors.setSpeed(0, 0);
    t0 = millis();
    while (millis() - t0 < 300) {
        motors.update();
        delay(5);
    }
    lastCmdTime = millis();
}

void stageMotor() {
    sendStageBegin(4, "motor", "FWD 0.6 s -> STOP 0.3 s -> REV 0.6 s -> STOP");

    sendDataValue(4, "phase", "FWD");
    runMotorBurst(120, 600);

    sendDataValue(4, "phase", "REV");
    runMotorBurst(-120, 600);

    motors.stop();
    sendDataValue(4, "phase", "STOPPED");
}

// ─── Stage 5: touch press detection ───────────────────────────────────

bool waitForTouch(uint8_t id, unsigned long timeout_ms) {
    unsigned long t0 = millis();
    while (millis() - t0 < timeout_ms) {
        if (touchSensors.read(id)) return true;
        delay(20);
        // Refresh watchdog occasionally so we don't trip after the test
        // returns, in case the operator delays the press.
        if ((millis() - t0) % 1000 < 20) lastCmdTime = millis();
    }
    return false;
}

void stageTouch() {
    sendStageBegin(5, "touch_top",
                   "Press HEAD TOP (sensor 0) within 5 s");
    bool top_ok = waitForTouch(0, 5000);
    sendDataValue(5, "touch_top", top_ok);

    sendStageBegin(5, "touch_side",
                   "Press HEAD SIDE (sensor 1) within 5 s");
    bool side_ok = waitForTouch(1, 5000);
    sendDataValue(5, "touch_side", side_ok);
}

}  // namespace

void runSelfTest() {
    selfTestActive = true;

    // Make sure nothing is moving when we start. emergencyStop also
    // disables the motor driver, so we resume() it before stage 4.
    motors.emergencyStop();

    sendEvent(EVT_SELFTEST_BEGIN);

    stageBus();
    stageLcd();
    stageServoScan();

    // Stage 4 needs the motor driver enabled. emergencyStop() at the top
    // disabled it; resume() here re-enables BEFORE the burst test.
    motors.resume();
    stageMotor();

    stageTouch();

    // Restore a calm idle state before handing control back to loop().
    motors.stop();
    eyes.applyExpression(EXPR_NEUTRAL, 0);    // priority 0 forces re-render
    servos.setAngle(SERVO_PAN,  SERVO_PAN_CENTER);
    servos.setAngle(SERVO_TILT, SERVO_TILT_CENTER);

    sendEvent(EVT_SELFTEST_END);
    selfTestActive = false;
    lastCmdTime    = millis();
}
