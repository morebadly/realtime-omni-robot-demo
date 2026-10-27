/**
 * IR sensor array (5 modules total)
 *
 * Desktop-pet configuration (REVISED 2026-04-26 round 2):
 *   4 down-facing fall sensors (2 front + 2 REAR) + 1 OUT-facing rear bump.
 *
 *   Earlier rounds placed the sensors as 3 fall (FL/FC/RC) + 2 side bump
 *   (L/R). With the new chassis -- a long rectangular body where the head
 *   overhangs the front -- the user prefers symmetric corner cliff guards
 *   (FL/FR + RL/RR) and a single rear-facing bump IR. Front-facing
 *   short-range avoidance is already handled by the HC-SR04 ultrasonic
 *   on G4/G19. Side bump is intentionally dropped.
 *
 * GPIO assignment rationale (electrical, not just convenience):
 *   - G34/G35/G36/G39 are input-only ADC1 pins with NO internal pull-up,
 *     so a floating wire reads HIGH. For a fall sensor that's catastrophic:
 *     boot-time HIGH = "no floor" = instant EDGE lockout, OR worse, the
 *     direction-aware on_edge_alert tries to escape a phantom rear cliff
 *     and drives off a real front one.
 *   - G32 is a normal bidirectional GPIO with internal pull-up available.
 *     It is the ONLY safe pin among the five for cliff use, so we give it
 *     to one of the fall positions (RR).
 *   - G34 (the worst of the four input-only pins, also the one we know
 *     glitches at boot from earlier debugging) is moved to BUMP_BACK.
 *     Floating HIGH on a bump pin reads as "no obstacle" -- harmless --
 *     so a bad solder joint here can never cause a runaway escape.
 *
 * Physical layout:
 *   Index 0 (G36)  - DOWN, FRONT-LEFT       (fall)        input-only, solder firm
 *   Index 1 (G39)  - DOWN, FRONT-RIGHT      (fall)        input-only, solder firm
 *   Index 2 (G35)  - DOWN, REAR-LEFT        (fall)        input-only, solder firm
 *   Index 3 (G32)  - DOWN, REAR-RIGHT       (fall)        BIDIR + pull-up, safest
 *   Index 0 (G34)  - OUT,  REAR-CENTER      (bump, rear)  input-only, fail-safe role
 *
 * IR module output semantics:
 *   - Reflection detected (surface/obstacle nearby) => OUT goes LOW
 *   - No reflection       (empty space / cliff)     => OUT goes HIGH
 *
 * Therefore:
 *   - Fall (DOWN sensor): HIGH = no floor below => DANGER => emergency stop
 *   - Bump (OUT  sensor): LOW  = obstacle near  => slow/avoid, NOT emergency
 *
 * EDGE event payload contract (must stay in sync with behavior_engine.py):
 *   {"evt":"EDGE","sensors":[FL, FR, RL, RR]}    1 = cliff, 0 = floor seen
 * Pi-side on_edge_alert reads the array directly to choose escape direction:
 *   - any FL/FR = 1, no rear   -> reverse  (away from front cliff)
 *   - any RL/RR = 1, no front  -> forward  (away from rear  cliff)
 *   - both ends = 1            -> emergency stop (no safe direction)
 *
 * BUMP event payload contract:
 *   {"evt":"BUMP","sensors":[BACK]}              1 = something behind, 0 = clear
 * Pi-side on_bump:
 *   - sensors[0] = 1 -> short forward + small turn (drive away from rear obstacle)
 */

#ifndef SENSOR_LINETRACK_H
#define SENSOR_LINETRACK_H

#include <Arduino.h>

#define FALL_SENSOR_COUNT  4
#define BUMP_SENSOR_COUNT  1
#define IR_SENSOR_COUNT    (FALL_SENSOR_COUNT + BUMP_SENSOR_COUNT)

// Indices into the fall array (also used by host to interpret EDGE payload).
#define FALL_IDX_FL  0   // front-left
#define FALL_IDX_FR  1   // front-right
#define FALL_IDX_RL  2   // rear-left
#define FALL_IDX_RR  3   // rear-right

// Indices into the bump array.
#define BUMP_IDX_BACK 0  // rear-center, horizontal-facing

// Down-facing (fall prevention)
#define IR_PIN_FALL_FL 36   // front-left   (input-only, no pull-up)
#define IR_PIN_FALL_FR 39   // front-right  (input-only, no pull-up)
#define IR_PIN_FALL_RL 35   // rear-left    (input-only, no pull-up)
#define IR_PIN_FALL_RR 32   // rear-right   (BIDIR, has pull-up -- safest pin)
// Rear-facing horizontal (bump / close-range obstacle behind)
#define IR_PIN_BUMP_BACK 34 // rear-center  (input-only; floating = no-obstacle, fail-safe)

class SensorIR {
public:
    void begin();

    // ── Fall (down) sensors ──────────────────────────────────────────

    /** Any fall sensor reports HIGH (no floor) => edge detected. */
    bool isEdgeDetected();

    /** Write raw digital values (0/1) of the 4 down-facing sensors,
     *  in [FL, FR, RL, RR] order (FALL_IDX_*). */
    void getFallValues(int values[FALL_SENSOR_COUNT]);

    // ── Bump (outward) sensors ───────────────────────────────────────

    /** Any bump sensor reports LOW (object close) => bump detected. */
    bool isBumpDetected();

    /** Write 1 if bump detected on that sensor, 0 otherwise.
     *  Note: this is already polarity-inverted from raw digital read. */
    void getBumpFlags(int flags[BUMP_SENSOR_COUNT]);

private:
    // Order MUST match FALL_IDX_* constants above and the EDGE payload
    // contract documented in the file header.
    const uint8_t _fallPins[FALL_SENSOR_COUNT] = {
        IR_PIN_FALL_FL, IR_PIN_FALL_FR, IR_PIN_FALL_RL, IR_PIN_FALL_RR
    };
    // Order MUST match BUMP_IDX_* constants above.
    const uint8_t _bumpPins[BUMP_SENSOR_COUNT] = {
        IR_PIN_BUMP_BACK
    };
};

// Keep the old class name as a typedef so unchanged callers still work
// during the refactor. New code should use `SensorIR`.
typedef SensorIR SensorLineTrack;

#endif // SENSOR_LINETRACK_H
