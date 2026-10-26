/**
 * CyberPet OS - ESP32 Cerebellum Firmware (revised)
 *
 * Responsibilities:
 *   1. Receive commands from Orange Pi via USB-UART (Type-C) and drive
 *      motors / servos / eye LCDs.
 *   2. Read sensors and report events back to OPi.
 *   3. Local safety override: down-facing IR sensors detect table edge
 *      -> immediate soft emergency stop + lockout (don't wait for host).
 *
 * Hardware map (desktop pet, revised):
 *   TB6612FNG motors     : GPIO 16,17,5 (A) / 15,14,13 (B)
 *                          STBY is hard-tied HIGH, no software control.
 *   PCA9685 servos       : I2C SDA=21, SCL=22
 *   HC-SR04 ultrasonic   : TRIG=4, ECHO=19 (ECHO needs 1K/2K divider)
 *   IR x5  (4 fall + 1 bump) : 36,39 (front-down  FL/FR) /
 *                              35,32 (rear-down   RL/RR) /
 *                              34    (rear-bump,  horizontal facing back)
 *                              EDGE payload sensors[] = [FL, FR, RL, RR]
 *                              BUMP payload sensors[] = [BACK]
 *   TTP223 touch x2      : 2, 12 (STRAP pins; do not touch at boot)
 *   ST7789 LCD x2 (eyes) : SPI SCK=18, MOSI=23, DC=27, RES=33,
 *                          CS_L=25, CS_R=26, BLC=3V3
 *   Orange Pi link       : USB Type-C (CH340C on board -> Serial)
 */

// ─────────────────────────────────────────────────────────────────
//  Bench-test switches
//    Set to 0 to disable safety triggers (motors never auto-lock).
//    Set to 1 to re-enable when you want real safety on the desktop.
//
//  RE-ENABLED 2026-04-26: hardware re-verified, all five IRs and the
//  HC-SR04 are mounted and calibrated. EDGE will hardware-lockout the
//  motors until the host sends RESUME; BUMP just notifies (host-side
//  behavior_engine.on_bump backs off and turns away); OBSTACLE stops
//  motors when something is closer than cfgUltrasonicStopCm.
// ─────────────────────────────────────────────────────────────────
#define ENABLE_EDGE_SAFETY  1    // fall-prevention (down IR) -> emergencyStop
#define ENABLE_BUMP_DETECT  1    // side IR -> BUMP event only (non-blocking)
#define ENABLE_OBSTACLE     1    // ultrasonic -> motors.stop on close object

#include <Wire.h>
#include <ArduinoJson.h>
#include "comm_protocol.h"
#include "motor_driver.h"
#include "servo_driver.h"
#include "sensor_ultrasonic.h"
#include "sensor_linetrack.h"
#include "sensor_touch.h"
#include "eye_display.h"
#include "selftest.h"

// ── Global hardware objects ──
MotorDriver      motors;
ServoDriver      servos;
SensorUltrasonic ultrasonic;
SensorIR         irSensors;
SensorTouch      touchSensors;
EyeDisplay       eyes;

// ── Runtime configuration (mutable via SET_CONFIG) ──
float cfgUltrasonicWarnCm = 15.0f;
float cfgUltrasonicStopCm = 8.0f;

// ── Per-touch local reflex expression (mutable via SET_REFLEX) ──
// On touch-press edge, ESP32 IMMEDIATELY switches to this expression,
// bypassing the OPi round-trip for instant feedback. OPi still receives
// the TOUCH event and can override the expression afterwards (~150ms).
//
// Special syntaxes recognised by checkTouch():
//   "off" / "none" / ""   -> reflex disabled
//   "random:a,b,c"        -> pick one of a/b/c uniformly at random per
//                            press. Example: "random:happy,curious".
//                            (Mechanism kept available even though v4
//                             dropped the angry-or-dizzy roll for #1.)
// Plain expression name   -> applied as-is.
//
// Buffer is generously sized at 32 bytes so any reasonable random:
// expression list still fits.
#define REFLEX_EXPR_LEN 32

// Firmware-hardcoded defaults for each touchpad.
// Restorable at runtime via {"cmd":"SET_REFLEX","id":N,"expr":"default"}.
//
// REVISED 2026-04-27 (round 3, v4):
//   - bliss: smiling-arch eyes (∩∩). The hearts were dropped because
//     the user wanted the simpler "curved smile" look.
//   - angry: REMOVED entirely. Side-touch is now plain dizzy (spinning
//     spiral eyes) -- no more random pick because there's only one
//     option left after angry was deleted.
static const char* const TOUCH_REFLEX_DEFAULTS[TOUCH_SENSOR_COUNT] = {
    "bliss",      // #0 head top   -> smiling arch eyes
    "dizzy",      // #1 head side  -> spinning spiral eyes
};

// Mutable runtime copy. Initialized from TOUCH_REFLEX_DEFAULTS at boot
// (see resetTouchReflexToDefault() call in setup()).
char cfgTouchReflex[TOUCH_SENSOR_COUNT][REFLEX_EXPR_LEN];

static void resetTouchReflexToDefault(int id) {
    if (id < 0 || id >= TOUCH_SENSOR_COUNT) return;
    strncpy(cfgTouchReflex[id], TOUCH_REFLEX_DEFAULTS[id], REFLEX_EXPR_LEN - 1);
    cfgTouchReflex[id][REFLEX_EXPR_LEN - 1] = '\0';
}

// Resolve "random:a,b,c" to one of a/b/c picked uniformly. Returns a
// pointer into a static buffer (caller must use the result before the
// next call). For non-random names, returns the input pointer unchanged.
static const char* resolveReflexName(const char* expr) {
    if (strncmp(expr, "random:", 7) != 0) return expr;
    const char* opts = expr + 7;

    // Count comma-separated options.
    int n = 1;
    for (const char* p = opts; *p; p++) if (*p == ',') n++;
    if (n <= 0) return expr;

    int pick = (int)(random(n));
    const char* start = opts;
    while (pick > 0) {
        const char* c = strchr(start, ',');
        if (!c) break;
        start = c + 1;
        pick--;
    }
    const char* end = strchr(start, ',');
    size_t len = end ? (size_t)(end - start) : strlen(start);
    if (len >= REFLEX_EXPR_LEN) len = REFLEX_EXPR_LEN - 1;

    static char buf[REFLEX_EXPR_LEN];
    memcpy(buf, start, len);
    buf[len] = '\0';
    return buf;
}

// After a touch-reflex fires, how long to hold the reflex expression before
// fading back to neutral if nothing else happens. Set to 0 to disable.
// OPi can tune this via {"cmd":"SET_CONFIG","key":"idle_return_ms","val":N}.
uint32_t cfgIdleReturnMs = 4000;   // 4 s

// ── Safety / state flags ──
bool safetyLockout = false;       // latched edge-lockout
bool bumpNotified  = false;       // edge-trigger for BUMP event
bool obstacleNotified = false;    // edge-trigger for OBSTACLE event
bool selfTestActive = false;      // set true while runSelfTest() blocks loop()

// ── Timing ──
unsigned long lastHeartbeat = 0;
const unsigned long HEARTBEAT_INTERVAL = 5000;

unsigned long lastCmdTime = 0;
const unsigned long CMD_WATCHDOG_MS = 30000;
bool watchdogTriggered = false;

// ── Serial line buffer ──
char serialBuf[JSON_BUF_SIZE];
int  serialBufIdx = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────

void sendJsonToOPi(JsonDocument& doc) {
    serializeJson(doc, OPI_SERIAL);
    OPI_SERIAL.println();
}

void sendBoot() {
    OPI_SERIAL.println("{\"evt\":\"BOOT\",\"msg\":\"ESP32 cerebellum ready\"}");
}

// ═══════════════════════════════════════════════
//  Arduino lifecycle
// ═══════════════════════════════════════════════

void setup() {
    // Single USB UART is used for BOTH protocol JSON and debug prints.
    // OPi-side parser must skip any line not starting with '{'.
    OPI_SERIAL.begin(SERIAL_BAUD);
    delay(50);

    Wire.begin(21, 22);

    // Initialize touch-reflex runtime table from firmware defaults.
    for (int i = 0; i < TOUCH_SENSOR_COUNT; i++) resetTouchReflexToDefault(i);

    motors.begin();

    // Boot-time I2C diagnostic: scan bus before servos.begin() to confirm
    // PCA9685 is actually reachable. Output visible in serial monitor.
    OPI_SERIAL.println("[DEBUG] Scanning I2C bus...");
    bool pca9685_found = false;
    for (uint8_t addr = 0x08; addr < 0x78; addr++) {
        Wire.beginTransmission(addr);
        if (Wire.endTransmission() == 0) {
            OPI_SERIAL.printf("[DEBUG]   Found I2C device at 0x%02X\n", addr);
            if (addr == 0x40) pca9685_found = true;
        }
    }
    if (pca9685_found) {
        OPI_SERIAL.println("[DEBUG]   PCA9685 detected at 0x40 -> OK");
    } else {
        OPI_SERIAL.println("[DEBUG]   *** PCA9685 NOT found! Check:");
        OPI_SERIAL.println("[DEBUG]     - SDA wire on GPIO 21, SCL wire on GPIO 22");
        OPI_SERIAL.println("[DEBUG]     - PCA9685 VCC (pin header) connected to 3.3V red rail");
        OPI_SERIAL.println("[DEBUG]     - PCA9685 GND connected to common ground");
    }

    servos.begin();
    ultrasonic.begin();
    irSensors.begin();
    eyes.begin();           // must run BEFORE touchSensors.begin() so that
    touchSensors.begin();   // any pin config done by Adafruit_ST7789 doesn't
                            // overwrite our touch INPUT configuration.

    lastCmdTime   = millis();
    lastHeartbeat = millis();

    OPI_SERIAL.println("[DEBUG] ESP32 cerebellum booting...");
    sendBoot();
}

void loop() {
    checkEdgeSafety();   // 1. highest priority: fall prevention
    checkBump();         // 2. rear bump sensor (soft response)
    checkObstacle();     // 3. ultrasonic
    checkTouch();        // 4. touchpads
    processSerial();     // 5. consume host commands
    motors.update();     // 6. soft-start ramp tick (5 ms self-throttle)
    servos.update();     // 7. non-blocking servo sequencer
    eyes.update();       // 8. non-blocking blink animation
    checkCmdWatchdog();  // 9. host communication watchdog
    sendHeartbeat();     // 10. periodic heartbeat
}

// ═══════════════════════════════════════════════
//  Safety checks
// ═══════════════════════════════════════════════

void checkEdgeSafety() {
#if !ENABLE_EDGE_SAFETY
    return;   // disabled for bench test
#endif
    if (!irSensors.isEdgeDetected()) return;
    if (safetyLockout) return;

    motors.emergencyStop();
    safetyLockout = true;

    int fall[FALL_SENSOR_COUNT];
    irSensors.getFallValues(fall);

    StaticJsonDocument<128> doc;
    doc["evt"] = EVT_EDGE;
    JsonArray sensors = doc.createNestedArray("sensors");
    for (int i = 0; i < FALL_SENSOR_COUNT; i++) sensors.add(fall[i]);
    sendJsonToOPi(doc);
    // Lockout is NOT auto-cleared; host must send RESUME.
}

void checkBump() {
#if !ENABLE_BUMP_DETECT
    return;   // disabled for bench test
#endif
    if (safetyLockout) return;

    bool detected = irSensors.isBumpDetected();
    if (detected && !bumpNotified) {
        bumpNotified = true;
        int flags[BUMP_SENSOR_COUNT];
        irSensors.getBumpFlags(flags);

        StaticJsonDocument<96> doc;
        doc["evt"] = EVT_BUMP;
        JsonArray sensors = doc.createNestedArray("sensors");
        for (int i = 0; i < BUMP_SENSOR_COUNT; i++) sensors.add(flags[i]);
        sendJsonToOPi(doc);
        // Soft response: do NOT force-stop the motors here. Host decides.
    } else if (!detected) {
        bumpNotified = false;
    }
}

void checkObstacle() {
#if !ENABLE_OBSTACLE
    return;   // disabled for bench test
#endif
    if (safetyLockout) return;

    float dist = ultrasonic.readDistanceCm();
    if (dist < 0) return;

    if (dist < cfgUltrasonicStopCm) {
        motors.stop();
        if (!obstacleNotified) {
            obstacleNotified = true;
            StaticJsonDocument<64> doc;
            doc["evt"] = EVT_OBSTACLE;
            doc["dist_cm"] = (int)dist;
            sendJsonToOPi(doc);
        }
    } else if (dist > cfgUltrasonicWarnCm) {
        obstacleNotified = false;
    }
}

void checkTouch() {
    bool newState = false;
    int changedId = touchSensors.checkChange(newState);
    if (changedId < 0) return;

    // Local reflex (only on touch-press edge, not release) for instant feel.
    // OPi still receives the TOUCH event below and can override afterwards.
    //
    // Reflex is dispatched at priority 2 (medium) — same as LLM-suggested
    // expressions. Safety-critical P0 (scared) or host-attentive P1 will NOT
    // be preempted by touch during their hold window.
    if (newState && changedId < TOUCH_SENSOR_COUNT) {
        // Resolve any "random:a,b,c" syntax to one chosen name. Plain
        // names pass through. Empty / "off" / "none" still disable.
        const char* expr = resolveReflexName(cfgTouchReflex[changedId]);
        if (expr[0] != '\0'
            && strcmp(expr, "off")  != 0
            && strcmp(expr, "none") != 0) {
            bool accepted = eyes.applyExpression(expr, 2);
            if (accepted) {
                eyes.armIdleReturn(cfgIdleReturnMs);
            }
            // Rejected case (e.g. P0 scared still holding): we silently
            // drop the reflex. OPi still receives the TOUCH event so
            // behavior_engine can react as it sees fit.
        }
    }

    // Always report the event to the host
    StaticJsonDocument<64> doc;
    doc["evt"] = EVT_TOUCH;
    doc["id"] = changedId;
    doc["state"] = newState ? 1 : 0;
    sendJsonToOPi(doc);
}

// ═══════════════════════════════════════════════
//  Serial / command dispatch
// ═══════════════════════════════════════════════

void processSerial() {
    while (OPI_SERIAL.available()) {
        char c = OPI_SERIAL.read();
        if (c == '\n' || c == '\r') {
            if (serialBufIdx > 0) {
                serialBuf[serialBufIdx] = '\0';
                handleCommand(serialBuf);
                serialBufIdx = 0;
            }
        } else if (serialBufIdx < JSON_BUF_SIZE - 1) {
            serialBuf[serialBufIdx++] = c;
        }
    }
}

void handleCommand(const char* json) {
    StaticJsonDocument<JSON_BUF_SIZE> doc;
    if (deserializeJson(doc, json)) return;

    const char* cmd = doc["cmd"];
    if (!cmd) return;

    lastCmdTime = millis();
    if (watchdogTriggered) {
        watchdogTriggered = false;
        OPI_SERIAL.println("[DEBUG] Watchdog reset by host command");
    }

    if (strcmp(cmd, CMD_SET_MOTOR) == 0) {
        if (safetyLockout) return;
        int left  = doc["left"]  | 0;
        int right = doc["right"] | 0;
        motors.setSpeed(left, right);
    }
    else if (strcmp(cmd, CMD_SET_SERVO) == 0) {
        int id    = doc["id"]    | 0;
        int angle = doc["angle"] | 90;
        servos.setAngle(id, angle);
    }
    else if (strcmp(cmd, CMD_SERVO_SEQ) == 0) {
        const char* seq = doc["seq"];
        if (seq) servos.executeSequence(seq);
    }
    else if (strcmp(cmd, CMD_STOP_ALL) == 0) {
        motors.stop();
        servos.center();
    }
    else if (strcmp(cmd, CMD_RESUME) == 0) {
        if (safetyLockout && !irSensors.isEdgeDetected()) {
            safetyLockout = false;
            motors.resume();
        }
    }
    else if (strcmp(cmd, CMD_SET_CONFIG) == 0) {
        const char* key = doc["key"];
        float val = doc["val"] | 0.0f;
        if (key) {
            if (strcmp(key, "ultrasonic_stop_cm") == 0) {
                cfgUltrasonicStopCm = constrain(val, 2.0f, 100.0f);
            } else if (strcmp(key, "ultrasonic_warn_cm") == 0) {
                cfgUltrasonicWarnCm = constrain(val, 5.0f, 200.0f);
            } else if (strcmp(key, "idle_return_ms") == 0) {
                cfgIdleReturnMs = (uint32_t)constrain(val, 0.0f, 60000.0f);
            }
        }
    }
    else if (strcmp(cmd, CMD_PING) == 0) {
        StaticJsonDocument<64> resp;
        resp["evt"] = EVT_PONG;
        resp["uptime_ms"] = millis();
        sendJsonToOPi(resp);
    }
    else if (strcmp(cmd, CMD_QUERY) == 0) {
        StaticJsonDocument<224> resp;
        resp["evt"] = EVT_SENSOR_DATA;
        resp["ultra_cm"]    = (int)ultrasonic.readDistanceCm();
        resp["safety_lock"] = safetyLockout;

        int fall[FALL_SENSOR_COUNT];
        irSensors.getFallValues(fall);
        JsonArray fa = resp.createNestedArray("fall");
        for (int i = 0; i < FALL_SENSOR_COUNT; i++) fa.add(fall[i]);

        int bump[BUMP_SENSOR_COUNT];
        irSensors.getBumpFlags(bump);
        JsonArray ba = resp.createNestedArray("bump");
        for (int i = 0; i < BUMP_SENSOR_COUNT; i++) ba.add(bump[i]);

        JsonArray ta = resp.createNestedArray("touch");
        for (int i = 0; i < TOUCH_SENSOR_COUNT; i++) {
            ta.add(touchSensors.read(i) ? 1 : 0);
        }
        sendJsonToOPi(resp);
    }
    else if (strcmp(cmd, CMD_SET_EXPR) == 0 || strcmp(cmd, CMD_SET_EYES) == 0) {
        // Priority is enforced LOCALLY on ESP32 via applyExpression guards.
        // Default 3 (lowest) when absent so naive callers can't accidentally
        // preempt higher-urgency expressions.
        const char* expr = doc["expr"] | EXPR_NEUTRAL;
        uint8_t prio = (uint8_t)(int)(doc["priority"] | 3);
        if (doc.containsKey("eye")) {
            int eyeIdx = doc["eye"] | 0;
            if (eyeIdx == 0 || eyeIdx == 1) {
                eyes.setExpressionSingle((uint8_t)eyeIdx, expr);
            }
        } else {
            eyes.applyExpression(expr, prio);
        }
    }
    else if (strcmp(cmd, CMD_EYE_BLINK) == 0) {
        eyes.blink();
    }
    else if (strcmp(cmd, CMD_SELFTEST) == 0) {
        // Blocks loop() for ~35 s. The host (cpet_cli.py selftest)
        // suppresses other traffic and listens for SELFTEST_* events.
        // No-op if a self-test is somehow already running (shouldn't
        // happen because loop() is blocked, but be defensive).
        if (!selfTestActive) {
            runSelfTest();
        }
    }
    else if (strcmp(cmd, CMD_I2C_SCAN) == 0) {
        // Probe every valid 7-bit I2C address (0x08..0x77) and report
        // which ones ACK. PCA9685 lives at 0x40 by default.
        StaticJsonDocument<192> resp;
        resp["evt"] = "I2C_SCAN";
        JsonArray arr = resp.createNestedArray("devices");
        for (uint8_t addr = 0x08; addr < 0x78; addr++) {
            Wire.beginTransmission(addr);
            if (Wire.endTransmission() == 0) {
                arr.add(addr);
            }
        }
        sendJsonToOPi(resp);
    }
    else if (strcmp(cmd, CMD_SET_REFLEX) == 0) {
        // {"cmd":"SET_REFLEX","id":0|1,"expr":"<name>|off|default"}
        //   "<name>"   -> store that expression name; touch will apply it
        //   "off"      -> disable reflex for that pad (touch still reports
        //                 TOUCH event to OPi but no local expression change)
        //   "default"  -> restore this pad's firmware-hardcoded default
        //                 (see TOUCH_REFLEX_DEFAULTS[] above)
        int id = doc["id"] | -1;
        const char* expr = doc["expr"] | "";
        if (id < 0 || id >= TOUCH_SENSOR_COUNT) return;

        if (strcmp(expr, "default") == 0) {
            resetTouchReflexToDefault(id);
        } else {
            strncpy(cfgTouchReflex[id], expr, REFLEX_EXPR_LEN - 1);
            cfgTouchReflex[id][REFLEX_EXPR_LEN - 1] = '\0';
        }
    }
}

// ═══════════════════════════════════════════════
//  Watchdog + heartbeat
// ═══════════════════════════════════════════════

void checkCmdWatchdog() {
    if (safetyLockout) return;
    if (millis() - lastCmdTime > CMD_WATCHDOG_MS) {
        if (!watchdogTriggered) {
            watchdogTriggered = true;
            motors.stop();
            OPI_SERIAL.println("[DEBUG] Watchdog: no host cmd for 30s, motors stopped");
        }
    }
}

void sendHeartbeat() {
    unsigned long now = millis();
    if (now - lastHeartbeat < HEARTBEAT_INTERVAL) return;
    lastHeartbeat = now;

    StaticJsonDocument<128> doc;
    doc["evt"]         = EVT_HEARTBEAT;
    doc["uptime_ms"]   = now;
    doc["safety_lock"] = safetyLockout;
    doc["wdog"]        = watchdogTriggered;
    sendJsonToOPi(doc);
}
