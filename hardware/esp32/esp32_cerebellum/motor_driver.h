/**
 * TB6612FNG dual motor driver
 *
 * Wiring:
 *   TB6612FNG     ESP32 GPIO
 *   ─────────────────────────
 *   AIN1    <->   16
 *   AIN2    <->   17
 *   PWMA    <->   5
 *   BIN1    <->   15
 *   BIN2    <->   14
 *   PWMB    <->   13
 *   STBY    <->   3V3 (HARD-TIED HIGH, no software control)
 *
 * NOTE: Because STBY is hard-tied to the rail, emergencyStop() can only
 *       perform a soft stop (PWM=0, IN=0). There is no longer a hardware
 *       cutoff. A stuck firmware can leave motors spinning.
 *
 * NOTE: PWMA / PWMB are explicitly assigned to LEDC channels 2 and 0
 *       respectively, on DIFFERENT timers (ch 0/1 share timer 0,
 *       ch 2/3 share timer 1). This avoids a duty-cycle corruption bug
 *       seen when both motors auto-shared the same timer.
 *
 * NOTE: GPIO 5 is a strapping pin (boot-mode select). It is fine to use
 *       as an output AFTER boot, but never wire anything that pulls it
 *       LOW during boot. The TB6612 PWMA input is high-impedance, so
 *       boot is unaffected.
 *
 * ─────────────────────────────────────────────────────────────────────
 *  TEMPORARY HACK while waiting for a replacement TB6612:
 *  ─────────────────────────────────────────────────────────────────────
 *  The A-channel PWMA input is internally shorted to GND (verified:
 *  GPIO 5 with 10k pull-up reads 4mV at the TB6612 PWMA pin). Until the
 *  module is swapped, set MOTOR_TB6612_A_DEAD to 1 and wire BOTH motors
 *  in parallel on BO1/BO2. setSpeed() will route everything through the
 *  good B-channel.
 *
 *  When the new module arrives:
 *    1. wire the left motor back to AO1/AO2
 *    2. set MOTOR_TB6612_A_DEAD to 0
 *    3. recompile + flash
 */

#ifndef MOTOR_DRIVER_H
#define MOTOR_DRIVER_H

#include <Arduino.h>

// ── Pin assignments ──
#define MOTOR_AIN1   16
#define MOTOR_AIN2   17
#define MOTOR_PWMA   5
#define MOTOR_BIN1   15
#define MOTOR_BIN2   14
#define MOTOR_PWMB   13

// ── LEDC PWM config ──
// Channels chosen on different timers (0/1 share T0; 2/3 share T1; ...)
// so the two motor PWMs cannot interfere with each other.
#define PWM_CHANNEL_A  2    // timer 1
#define PWM_CHANNEL_B  0    // timer 0
#define PWM_FREQ       5000
#define PWM_RESOLUTION 8    // 0-255

// ── Slew-rate (soft start) config ──
// 2026-04-26: the LCD eye backlight is hard-tied to 3V3 with no PWM
// dimming (eye_display.h line 11). Every time the motors stepped from 0
// directly to ~200 PWM, the inrush current dragged 5V down by 0.3-0.5 V,
// which dropped the on-board AMS1117 LDO output enough to visibly dim
// both eyes. Hardware fix would be a 1000 uF bulk cap on 5V; doing it in
// firmware instead by ramping setSpeed() targets at a controlled rate.
//
// Rough math:
//   step every 5 ms (200 Hz tick), 8 PWM per step
//   => 0 -> 200 PWM takes ~125 ms, 0 -> 255 PWM ~160 ms.
// That spreads the motor inrush over ~25 PWM/ms instead of the previous
// "all in one cycle". Adjust if the bot feels sluggish or if eyes still
// flicker (smaller step / longer interval = gentler ramp).
#define MOTOR_RAMP_TICK_MS    5
#define MOTOR_RAMP_PWM_STEP   8

// ── Temporary single-channel mode ──
// 1 = both motors are wired in parallel on BO1/BO2 (TB6612 A-channel is dead)
// 0 = normal differential drive (default; use after replacing the TB6612)
#define MOTOR_TB6612_A_DEAD  1

class MotorDriver {
public:
    /**
     * Attaches AIN/BIN as outputs and PWMA/PWMB as real PWM outputs on
     * separate LEDC timers.
     */
    void begin();

    /**
     * Set both motor TARGETS (not the immediate PWM). The actual PWM is
     * ramped toward the target by update(), at MOTOR_RAMP_PWM_STEP per
     * MOTOR_RAMP_TICK_MS, to avoid the 3V3-rail brown-out that happens
     * when the inrush current dips 5V by half a volt.
     *
     * @param left   -255..255, positive = forward, negative = reverse
     * @param right  -255..255
     */
    void setSpeed(int left, int right);

    /** Set targets to 0 (ramped). For an immediate hard stop, call
     *  emergencyStop() instead. */
    void stop();

    /** Hard emergency stop -- PWM=0 NOW (no ramp), IN=0, disable further
     *  setSpeed() until resume(). Used by the EDGE safety path; ramp would
     *  defeat the whole point of cliff prevention. */
    void emergencyStop();

    void resume();

    /**
     * Advance the soft-start ramp by one tick if MOTOR_RAMP_TICK_MS has
     * elapsed since last call. Must be called from the main loop()
     * frequently (every loop iteration is fine; it self-throttles). No-op
     * after emergencyStop() until resume() flips _enabled back.
     */
    void update();

private:
    void setMotorA(int speed);
    void setMotorB(int speed);
    void writePWM(uint8_t pin, uint8_t duty);
    bool _enabled = true;

    // Soft-start ramp state. _currentX is the PWM we're physically driving;
    // _targetX is what setSpeed() last requested. update() walks current
    // toward target.
    int _targetA       = 0;
    int _targetB       = 0;
    int _currentA      = 0;
    int _currentB      = 0;
    unsigned long _lastRampMs = 0;
};

#endif // MOTOR_DRIVER_H
