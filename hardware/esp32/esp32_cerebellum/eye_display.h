/**
 * Dual ST7789 IPS LCD eye display (240x240 each)
 *
 * Wiring (shared SPI bus, per-eye CS):
 *   SCK  -> GPIO 18   (VSPI SCK)
 *   MOSI -> GPIO 23   (VSPI MOSI)
 *   DC   -> GPIO 27   (shared)
 *   RES  -> GPIO 33   (shared, manual reset once in begin)
 *   CS_L -> GPIO 25   (left eye)
 *   CS_R -> GPIO 26   (right eye)
 *   BLC  -> 3V3       (backlight tied HIGH, always on)
 *
 * Library: Adafruit_GFX + Adafruit_ST7789 (via SPI class on hardware VSPI)
 *
 * Expressions supported (14 total, drawn with geometric primitives):
 *   neutral, happy, sad, angry, surprise, sympathy, worried, confused,
 *   curious, bliss, scared, attentive, sleepy, blink
 *
 * API notes:
 *   - setExpression(expr)        changes BOTH eyes at once.
 *                                If expr="blink", runs a one-shot animation.
 *   - setExpressionSingle(eye,expr)  changes one eye only (0=left, 1=right)
 *   - blink() starts a non-blocking blink animation; call update() in loop()
 */

#ifndef EYE_DISPLAY_H
#define EYE_DISPLAY_H

#include <Arduino.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>

// ── Pin map ──
#define EYE_PIN_SCK   18
#define EYE_PIN_MOSI  23
#define EYE_PIN_DC    27
#define EYE_PIN_RES   33
// CS=-1: the PS 240x240 panels have CS hard-tied to GND on the PCB, so the
// library must NOT drive any GPIO as CS. Using -1 tells Adafruit_ST7789 to
// skip the pinMode(cs, OUTPUT) call — leaving GPIO 25/26 free for TTP223
// touchpads.
#define EYE_PIN_CS_L  -1
#define EYE_PIN_CS_R  -1

#define EYE_WIDTH     240
#define EYE_HEIGHT    240
#define EYE_SPI_HZ    20000000UL    // 20 MHz — snappy for animation, still stable

// ── Continuous-animation framework ──
// Every EYE_ANIM_FRAME_MS, update() repaints the canvas with the next
// animation frame and pushes it to both LCDs. A 240x240 canvas push
// costs ~50 ms at 20 MHz SPI; 70 ms throttle gives ~14 fps which is
// the sweet spot between visibly fluid motion and starving the rest
// of loop() (sensors, motors, serial).
#define EYE_ANIM_FRAME_MS  70UL

// Upper-2/3 safe area. Expressions live in the top 2/3 of the panel
// (Y < 160) with the bottom 1/3 left blank. Drawings + animation
// offsets must fit inside (40, 5) - (200, 155). 160 wide x 150 tall,
// center (120, 80).
#define EYE_BOUND_X       40
#define EYE_BOUND_Y       5
#define EYE_BOUND_W       160
#define EYE_BOUND_H       150
#define EYE_BOUND_RIGHT   (EYE_BOUND_X + EYE_BOUND_W)   // 200
#define EYE_BOUND_BOTTOM  (EYE_BOUND_Y + EYE_BOUND_H)   // 155
#define EYE_BOUND_CX      120
#define EYE_BOUND_CY      80

// ── Expression codes (internal) ──
enum EyeExpr : uint8_t {
    EYE_EXPR_NEUTRAL   = 0,
    EYE_EXPR_HAPPY     = 1,
    EYE_EXPR_SAD       = 2,
    EYE_EXPR_ANGRY     = 3,
    EYE_EXPR_SURPRISE  = 4,
    EYE_EXPR_SYMPATHY  = 5,
    EYE_EXPR_WORRIED   = 6,
    EYE_EXPR_CONFUSED  = 7,
    EYE_EXPR_CURIOUS   = 8,
    EYE_EXPR_BLISS     = 9,
    EYE_EXPR_SCARED    = 10,
    EYE_EXPR_ATTENTIVE = 11,
    EYE_EXPR_SLEEPY    = 12,
    EYE_EXPR_DIZZY     = 13,    // spinning Archimedean-spiral eyes (Eilik style)
    EYE_EXPR_COUNT
    // Note: "blink" is handled as an animation, not a persistent expression.
};

class EyeDisplay {
public:
    /** Initialize both displays. Safe to call after peripherals are up. */
    void begin();

    /**
     * Unified entry point for ALL expression changes (the only place that
     * actually modifies pixels). Enforces three safety rails:
     *
     *   A. single state machine — every source (touch reflex, SET_EXPR from
     *      host, idle-return, etc.) must come through here; no bypass.
     *   B. priority + minimum hold time — a new request is rejected if it
     *      has lower urgency (higher number) than the current expression
     *      AND the current expression hasn't held long enough.
     *   C. same-name request is cheaply skipped (no redraw).
     *
     * Priority scale (must match OPi's behavior_engine.py):
     *   0 = highest (e.g. scared, safety-critical)
     *   1 = high    (e.g. attentive on wake word)
     *   2 = medium  (e.g. LLM-suggested expression, local touch reflex)
     *   3 = lowest  (e.g. neutral, idle blink)
     *
     * @return true if accepted & rendered, false if rejected by guard B.
     */
    bool applyExpression(const char* name, uint8_t priority = 3);

    /** Legacy shim — forwards to applyExpression at priority 3 (lowest). */
    void setExpression(const char* exprName) { applyExpression(exprName, 3); }

    /** Single-eye API kept for future per-eye hardware; in mirror mode
     *  it falls back to both-eye behavior. */
    void setExpressionSingle(uint8_t eye, const char* exprName);

    /** Start a non-blocking blink animation (both eyes). */
    void blink();

    /** Arm a non-blocking "return to neutral" after `delayMs` milliseconds.
     *  If delayMs == 0, any pending idle-return is cancelled.
     *  Any subsequent setExpression() call (from reflex or host) cancels
     *  the timer — caller must re-arm if they want the auto-return. */
    void armIdleReturn(uint32_t delayMs);

    /** Cancel any pending idle-return. */
    void cancelIdleReturn() { _idleDueMs = 0; }

    /** Call this in the main loop to advance the blink animation
     *  and process any pending idle-return to neutral. */
    void update();

    /** Direct drawing helpers (advanced). */
    Adafruit_ST7789* left()  { return &_tftL; }
    Adafruit_ST7789* right() { return &_tftR; }

private:
    Adafruit_ST7789 _tftL = Adafruit_ST7789(&SPI, EYE_PIN_CS_L, EYE_PIN_DC, -1);
    Adafruit_ST7789 _tftR = Adafruit_ST7789(&SPI, EYE_PIN_CS_R, EYE_PIN_DC, -1);

    // 240x240 RGB565 canvas in RAM (~112 KB). Allocated lazily in begin().
    // Holds the current expression's pixels so we can "reveal" strips during
    // the opening animation without re-running the heavy draw functions.
    class GFXcanvas16* _canvas = nullptr;

    EyeExpr _curExprL = EYE_EXPR_NEUTRAL;
    EyeExpr _curExprR = EYE_EXPR_NEUTRAL;

    // Blink animation state
    bool          _blinking      = false;
    uint8_t       _blinkStage    = 0;   // 0=closing 1=closed 2=opening 3=done
    unsigned long _blinkStepTime = 0;

    // Idle-return timer (set by armIdleReturn, fired by update)
    unsigned long _idleDueMs     = 0;   // 0 = disabled

    // Priority arbitration state (guard B)
    uint8_t       _curPriority   = 3;   // lowest = easiest to override
    unsigned long _curSetTime    = 0;   // millis() when current expression
                                        // was accepted. Used with HOLD_MS[]
                                        // table in the .cpp to decide if a
                                        // lower-priority request can now win.

    // Continuous animation state
    unsigned long _lastAnimMs    = 0;   // millis() of last anim-frame push
    uint16_t      _animFrame     = 0;   // monotonic frame counter, wraps

    static EyeExpr parseExpr(const char* name);
    /** Render a single animation frame of `expr` to `gfx`. `frame` is the
     *  monotonic counter advanced by update(); `frame=0` is the canonical
     *  "settled / no-motion" frame used by runTransition Phase 2. */
    void drawExprFrame(class Adafruit_GFX& gfx, EyeExpr expr, uint16_t frame);
    void drawBlinkFrame(uint8_t lidHeight);  // 0..120
    void pushStrip(int16_t y, int16_t h);    // push canvas rows [y, y+h) to display
    void runTransition(EyeExpr newExpr);
};

#endif // EYE_DISPLAY_H
