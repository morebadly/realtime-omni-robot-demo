/**
 * Hardware self-test runner.
 *
 * Triggered by host via {"cmd":"SELFTEST"}; this BLOCKS loop() for the
 * entire duration (~35 s) and streams a sub-protocol of SELFTEST_*
 * events back to the host. The host (cpet_cli.py selftest) prompts the
 * operator between stages for the things ESP32 cannot self-verify
 * (LCD pixels, head motion, motor motion, touch press), then assembles
 * a final diagnostic report.
 *
 * During the test:
 *   - Heartbeats are suppressed (loop() doesn't run).
 *   - Watchdog is kept fresh by periodically updating lastCmdTime.
 *   - Safety triggers (EDGE/BUMP/OBSTACLE) do NOT fire because their
 *     check functions are inside loop() too.
 *
 * Stages:
 *   1. bus      I2C scan, PCA9685 register roundtrip, IR/touch raw
 *               sample, ultrasonic single ping. No human needed.
 *   2. lcd      Sequence of full-screen RED / GREEN / BLUE / checkerboard
 *               on both eyes. Operator visually verifies both eyes
 *               render every frame.
 *   3. servo_scan
 *               Pulse all 16 PCA9685 channels in turn (60° -> 120° ->
 *               90°), 1 s each. Operator notes which channels actually
 *               drive the head (PAN/TILT). Detects miswired channels.
 *   4. motor    Forward 0.5 s -> stop -> reverse 0.5 s -> stop. Operator
 *               confirms tracks moved in both directions.
 *   5. touch    Wait up to 5 s each for press on TOP, then SIDE.
 *               Self-detected, no operator prompt needed.
 */

#ifndef CPET_SELFTEST_H
#define CPET_SELFTEST_H

#include <Arduino.h>

/** Run the entire self-test and stream JSON events to OPI_SERIAL.
 *  Blocks until done (~35 s). Restores `eyes` to neutral and `motors`
 *  to stopped before returning. Sets the `selfTestActive` flag in the
 *  main .ino while running so other code paths can branch if needed. */
void runSelfTest();

#endif // CPET_SELFTEST_H
