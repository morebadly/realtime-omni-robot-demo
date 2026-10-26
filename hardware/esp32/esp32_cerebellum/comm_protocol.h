/**
 * CyberPet OS - Serial Communication Protocol
 *
 * JSON-line protocol between Orange Pi and ESP32.
 * Each message ends with '\n', single-line JSON.
 *
 * Transport: USB Type-C (board USB-UART via CH340C -> ESP32 Serial/UART0)
 *   Orange Pi sees /dev/ttyUSB0, ESP32 firmware uses `Serial`
 *
 * Commands (OPi -> ESP32):
 *   {"cmd":"SET_MOTOR","left":100,"right":-80}
 *   {"cmd":"SET_SERVO","id":0,"angle":90}
 *   {"cmd":"SERVO_SEQ","seq":"nod"}            // nod / shake / tilt_head
 *   {"cmd":"STOP_ALL"}
 *   {"cmd":"RESUME"}                           // unlock after edge lockout
 *   {"cmd":"SET_CONFIG","key":"ultrasonic_stop_cm","val":8}
 *   {"cmd":"PING"}
 *   {"cmd":"QUERY"}                            // request all sensor data
 *   {"cmd":"SET_EXPR","expr":"happy","priority":2}    // priority 0(high)..3(low)
 *   {"cmd":"SET_EXPR","expr":"blink"}                 // runs one blink animation
 *   {"cmd":"SET_EXPR","expr":"happy","eye":0}         // single eye: 0=left, 1=right
 *   (legacy equivalents: SET_EYES, EYE_BLINK still accepted)
 *
 *   {"cmd":"SET_REFLEX","id":<0|1>,"expr":"<name|off|default>"}
 *       expr values:
 *         <name>     one of the 14 expressions (neutral, happy, sad, angry,
 *                    surprise, sympathy, worried, confused, curious, bliss,
 *                    scared, attentive, sleepy, blink)
 *         "off"      disable local reflex for that pad (touch still reports
 *                    TOUCH event, but no local expression change)
 *         "default"  restore firmware-hardcoded default for that pad
 *   Defaults at boot:  #0 -> "bliss",  #1 -> "curious"
 *
 * Events (ESP32 -> OPi):
 *   {"evt":"BOOT","msg":"ESP32 cerebellum ready"}
 *   {"evt":"TOUCH","id":1,"state":1}
 *   {"evt":"EDGE","sensors":[0,0,1]}           // 3 down-pointing fall sensors
 *   {"evt":"BUMP","sensors":[1,0]}             // 2 out-pointing bump sensors
 *   {"evt":"OBSTACLE","dist_cm":12}            // HC-SR04 ultrasonic
 *   {"evt":"HEARTBEAT","uptime_ms":123456,"safety_lock":false,"wdog":false}
 *   {"evt":"PONG","uptime_ms":123456}
 *   {"evt":"SENSOR_DATA","ultra_cm":25,"safety_lock":false,
 *          "fall":[0,0,0],"bump":[0,0],"touch":[0,0,0]}
 *
 * IMPORTANT: Debug lines printed with `Serial.println("[DEBUG]...")` share the
 * same USB UART stream. The OPi-side JSON parser MUST tolerate and skip any
 * line that does not start with '{'.
 */

#ifndef COMM_PROTOCOL_H
#define COMM_PROTOCOL_H

// ── Commands (OPi -> ESP32) ──
#define CMD_SET_MOTOR   "SET_MOTOR"
#define CMD_SET_SERVO   "SET_SERVO"
#define CMD_SERVO_SEQ   "SERVO_SEQ"
#define CMD_STOP_ALL    "STOP_ALL"
#define CMD_RESUME      "RESUME"
#define CMD_SET_CONFIG  "SET_CONFIG"
#define CMD_PING        "PING"
#define CMD_QUERY       "QUERY"
#define CMD_SET_EYES    "SET_EYES"     // legacy, still accepted
#define CMD_SET_EXPR    "SET_EXPR"     // new preferred name (matches OPi spec)
#define CMD_EYE_BLINK   "EYE_BLINK"    // legacy; use SET_EXPR expr="blink" instead
#define CMD_SET_REFLEX  "SET_REFLEX"   // configure per-touch local reflex expression
#define CMD_I2C_SCAN    "I2C_SCAN"     // diagnostic: scan I2C bus for devices
#define CMD_SELFTEST    "SELFTEST"     // run the full hardware self-test (~35 s,
                                       // blocks loop(); host should not send
                                       // other commands until SELFTEST_END)

// ── Events (ESP32 -> OPi) ──
#define EVT_TOUCH       "TOUCH"
#define EVT_EDGE        "EDGE"
#define EVT_BUMP        "BUMP"
#define EVT_OBSTACLE    "OBSTACLE"
#define EVT_HEARTBEAT   "HEARTBEAT"
#define EVT_PONG        "PONG"
#define EVT_SENSOR_DATA "SENSOR_DATA"

// ── SELFTEST events (sub-protocol; host streams them to a CLI report) ──
//   {"evt":"SELFTEST_BEGIN"}
//   {"evt":"SELFTEST_STAGE","stage":1..5,"name":"bus|lcd|servo_scan|motor|touch","msg":"..."}
//   {"evt":"SELFTEST_DATA","stage":N,"key":"<name>","val":<json>}
//   {"evt":"SELFTEST_END"}
#define EVT_SELFTEST_BEGIN "SELFTEST_BEGIN"
#define EVT_SELFTEST_STAGE "SELFTEST_STAGE"
#define EVT_SELFTEST_DATA  "SELFTEST_DATA"
#define EVT_SELFTEST_END   "SELFTEST_END"

// ── Servo sequence names ──
#define SEQ_NOD         "nod"
#define SEQ_SHAKE       "shake"
#define SEQ_TILT_HEAD   "tilt_head"

// ── Expression names (LCD eyes) — 14 total per OPi behavior_engine ──
#define EXPR_NEUTRAL    "neutral"
#define EXPR_HAPPY      "happy"
#define EXPR_SAD        "sad"
#define EXPR_ANGRY      "angry"
#define EXPR_SURPRISE   "surprise"    // note: no trailing 'd'
#define EXPR_SYMPATHY   "sympathy"
#define EXPR_WORRIED    "worried"
#define EXPR_CONFUSED   "confused"
#define EXPR_CURIOUS    "curious"
#define EXPR_BLISS      "bliss"
#define EXPR_SCARED     "scared"
#define EXPR_ATTENTIVE  "attentive"
#define EXPR_SLEEPY     "sleepy"
#define EXPR_DIZZY      "dizzy"       // spinning spiral eyes, Eilik-style
#define EXPR_BLINK      "blink"       // also a one-shot animation

// ── Serial config ──
#define SERIAL_BAUD     115200
#define JSON_BUF_SIZE   256

// ── OPi link: USB Type-C through board USB-UART (UART0 = Serial) ──
#define OPI_SERIAL      Serial

// ── PCA9685 servo channels ──
#define SERVO_PAN       0    // horizontal (yaw / shake)
#define SERVO_TILT      1    // vertical   (pitch / nod)

// ── Servo angle limits ──
// SERVO_CENTER is the generic / TILT center; PAN has its own center because
// the gimbal was assembled with the PAN servo not at 90°. Adjust
// SERVO_PAN_CENTER / SERVO_TILT_CENTER if the gimbal physical center drifts.
//
// MIN/MAX are calibrated for the actual gimbal range (PAN 160° / TILT 140°
// on the spec sheet) with conservative safety margins so commands never push
// the servo into the gimbal's hard limit (which causes loud buzz / coil burn).
//
//   PAN  : center 75°, swing ±40°       → 35° .. 115°  (80° total, well inside 160°)
//   TILT : center 90°, swing -30°/+5°   → 60° .. 95°   (35° total, asymmetric:
//          tightened on the up side because the gimbal hits a mechanical stop
//          around 100°; down side is the comfortable look-down range)
#define SERVO_CENTER       90
#define SERVO_PAN_CENTER   75
#define SERVO_TILT_CENTER  90
#define SERVO_PAN_MIN      35
#define SERVO_PAN_MAX      115
#define SERVO_TILT_MIN     60
#define SERVO_TILT_MAX     95

#endif // COMM_PROTOCOL_H
