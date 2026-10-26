#include "eye_display.h"

#include <math.h>

// ── Color palette (RGB565) ──
static constexpr uint16_t COL_BLACK    = 0x0000;
static constexpr uint16_t COL_WHITE    = 0xFFFF;
static constexpr uint16_t COL_CYAN     = 0x07FF;   // EMO-style bright cyan eyes
static constexpr uint16_t COL_CYAN_D   = 0x05DE;   // dimmer cyan (softer moods)
static constexpr uint16_t COL_RED      = 0xF800;
static constexpr uint16_t COL_BLUE     = 0x001F;
static constexpr uint16_t COL_YELLOW   = 0xFFE0;   // pure yellow
static constexpr uint16_t COL_ORANGE   = 0xFD20;   // for fire flames
static constexpr uint16_t COL_PINK     = 0xFB56;
static constexpr uint16_t COL_PINK_HI  = 0xFEDD;   // soft pink for heart highlight

void EyeDisplay::begin() {
    // Hardware reset once, for both displays (shared RES line).
    pinMode(EYE_PIN_RES, OUTPUT);
    digitalWrite(EYE_PIN_RES, HIGH);
    delay(5);
    digitalWrite(EYE_PIN_RES, LOW);
    delay(20);
    digitalWrite(EYE_PIN_RES, HIGH);
    delay(150);

    // Start hardware SPI on VSPI pins. MISO not needed (write-only displays).
    SPI.begin(EYE_PIN_SCK, -1, EYE_PIN_MOSI, -1);

    // SPI_MODE3 + double-init is required by "PS 240x240 ST7789" purple
    // clones — first init primes the regulators, second actually takes effect.
    // CS is hardwired to GND on both panels, so every SPI write drives both.
    _tftL.init(EYE_WIDTH, EYE_HEIGHT, SPI_MODE3);
    delay(20);
    _tftR.init(EYE_WIDTH, EYE_HEIGHT, SPI_MODE3);
    delay(20);

    _tftL.setSPISpeed(EYE_SPI_HZ);
    _tftL.setRotation(0);
    _tftL.invertDisplay(true);

    // Allocate the in-RAM canvas (240x240 RGB565 = 112 KB).
    _canvas = new GFXcanvas16(EYE_WIDTH, EYE_HEIGHT);
    if (!_canvas || !_canvas->getBuffer()) {
        Serial.println("[ERROR] Canvas alloc failed, animations disabled");
        if (_canvas) { delete _canvas; _canvas = nullptr; }
    } else {
        drawExprFrame(*_canvas, EYE_EXPR_NEUTRAL, 0);
    }

    // Initial face on display (canonical settled frame)
    drawExprFrame(_tftL, EYE_EXPR_NEUTRAL, 0);
    _lastAnimMs = millis();
    Serial.println("[DEBUG] EyeDisplay ready");
}

// Push rows [y, y+h) of the canvas directly to the display (fast).
void EyeDisplay::pushStrip(int16_t y, int16_t h) {
    if (!_canvas || h <= 0 || y < 0 || y + h > EYE_HEIGHT) return;
    uint16_t *buf = _canvas->getBuffer();
    _tftL.drawRGBBitmap(0, y, buf + y * EYE_WIDTH, EYE_WIDTH, h);
}

EyeExpr EyeDisplay::parseExpr(const char* name) {
    if (!name) return EYE_EXPR_NEUTRAL;
    if (strcmp(name, "neutral")   == 0) return EYE_EXPR_NEUTRAL;
    if (strcmp(name, "happy")     == 0) return EYE_EXPR_HAPPY;
    if (strcmp(name, "sad")       == 0) return EYE_EXPR_SAD;
    // "angry" intentionally unmapped (v4 removed it). Fall through to
    // NEUTRAL via the function's default return so any stale [EXPR:angry]
    // tags from the LLM render harmlessly as a neutral eye.
    if (strcmp(name, "surprise")  == 0) return EYE_EXPR_SURPRISE;
    if (strcmp(name, "surprised") == 0) return EYE_EXPR_SURPRISE;  // accept both
    if (strcmp(name, "sympathy")  == 0) return EYE_EXPR_SYMPATHY;
    if (strcmp(name, "worried")   == 0) return EYE_EXPR_WORRIED;
    if (strcmp(name, "confused")  == 0) return EYE_EXPR_CONFUSED;
    if (strcmp(name, "curious")   == 0) return EYE_EXPR_CURIOUS;
    if (strcmp(name, "bliss")     == 0) return EYE_EXPR_BLISS;
    if (strcmp(name, "scared")    == 0) return EYE_EXPR_SCARED;
    if (strcmp(name, "attentive") == 0) return EYE_EXPR_ATTENTIVE;
    if (strcmp(name, "sleepy")    == 0) return EYE_EXPR_SLEEPY;
    if (strcmp(name, "dizzy")     == 0) return EYE_EXPR_DIZZY;
    return EYE_EXPR_NEUTRAL;
}

// ─── Per-emotion transition profile ─────────────────────────────────────
// Tune these to adjust how each expression feels when we SWITCH TO it.
struct TransitionProfile {
    uint8_t  closeFrames;     // # close-eyelid frames
    uint16_t closeMs;         // total close-phase duration (ms)
    bool     closeEaseIn;     // true = accelerating close (snap), false = linear
    uint16_t pauseMs;         // fully-black pause
    uint8_t  openFrames;
    uint16_t openMs;
    bool     openEaseOut;     // true = decelerating open (soft land)
    uint8_t  preAction;       // 0=none, 1=squint, 2=narrow, 3=flashRed
    uint16_t preActionMs;
};

static TransitionProfile getProfile(EyeExpr e) {
    switch (e) {
        //                     clsF clsMs ease pMs  opnF opnMs ease preAct preMs
        case EYE_EXPR_SCARED:  return {  3,  80, true, 50,   4, 140, false, 0,   0 }; // snap shut
        case EYE_EXPR_SLEEPY:  return { 10, 420, true,100,  10, 520, true,  0,   0 }; // slow heavy close
        case EYE_EXPR_DIZZY:   return {  5, 180, false, 60,  5, 240, false, 0,   0 }; // smooth wobble in
        case EYE_EXPR_SURPRISE:return {  3,  60, true, 30,   3,  60, true,  3, 120 }; // red flash + pop
        // EYE_EXPR_ANGRY removed in v4; falls through to default profile.
        case EYE_EXPR_HAPPY:   return {  5, 110, true, 20,   6, 180, true,  1, 100 }; // squint cute anticipation
        case EYE_EXPR_BLISS:   return {  6, 160, true, 30,   7, 240, true,  1, 120 }; // gentle squint -> bliss
        case EYE_EXPR_SAD:     return {  8, 280, true, 80,   8, 340, true,  0,   0 }; // slow droop
        case EYE_EXPR_WORRIED: return {  7, 220, true, 50,   7, 240, true,  0,   0 };
        case EYE_EXPR_SYMPATHY:return {  7, 220, true, 50,   7, 260, true,  0,   0 };
        case EYE_EXPR_CONFUSED:return {  5, 150, true, 30,   5, 180, true,  0,   0 };
        case EYE_EXPR_CURIOUS: return {  5, 130, true, 20,   5, 150, true,  0,   0 };
        case EYE_EXPR_ATTENTIVE:return{  5, 110, true, 20,   4, 100, false, 0,   0 }; // alert snap
        case EYE_EXPR_NEUTRAL:
        default:               return {  5, 130, true, 30,   5, 170, true,  0,   0 };
    }
}

// ── Priority hold-time table (must match OPi behavior_engine.py) ──
// Index = priority level; value = milliseconds the expression at that
// priority "holds" the display against lower-priority preemption.
static const unsigned long HOLD_MS[4] = {
    1500,   // P0 highest (scared / safety-critical)
    1000,   // P1 high    (attentive / wake word)
     500,   // P2 medium  (LLM / local touch reflex)
       0,   // P3 lowest  (neutral / idle blink)
};

bool EyeDisplay::applyExpression(const char* name, uint8_t priority) {
    if (!name) return false;
    if (priority > 3) priority = 3;

    // "blink" is a transient overlay animation, not a state change.
    // Always allowed. Doesn't alter _curExprL / _curPriority.
    if (strcmp(name, "blink") == 0) {
        blink();
        return true;
    }

    EyeExpr newExpr = parseExpr(name);

    // ── Guard C: same-name zero-cost skip ──
    // Hitting the same expression again mid-animation would cause jitter.
    if (newExpr == _curExprL) {
        return true;
    }

    // ── Guard B: priority + minimum-hold arbitration ──
    unsigned long now = millis();
    unsigned long elapsed = now - _curSetTime;
    if (priority > _curPriority && elapsed < HOLD_MS[_curPriority]) {
        // Lower-urgency request arrived while the current expression still
        // has mandatory hold time remaining -> reject silently.
        return false;
    }

    // ── Guard A: this is THE one pixel-writing path ──
    // Cancel any armed idle-return (the host is taking control)
    _idleDueMs = 0;
    runTransition(newExpr);
    _curExprL = newExpr;
    _curExprR = newExpr;
    _curPriority = priority;
    _curSetTime  = now;
    return true;
}

void EyeDisplay::armIdleReturn(uint32_t delayMs) {
    if (delayMs == 0) { _idleDueMs = 0; return; }
    _idleDueMs = millis() + delayMs;
    if (_idleDueMs == 0) _idleDueMs = 1;   // avoid sentinel value clash
}

void EyeDisplay::runTransition(EyeExpr e) {
    const TransitionProfile p = getProfile(e);
    const int HALF_H = EYE_HEIGHT / 2;

    // ── Phase 0: pre-action (performed on OLD expression) ──────────────
    // Canvas currently holds OLD expression. Pre-actions rely on canvas for
    // "restoration", so if canvas is unavailable (alloc failed), skip them.
    switch (_canvas ? p.preAction : 0) {
        case 1: {
            // Squint: partially close eyes (lid=30), hold, then release.
            // Used for happy/bliss - a cute "I'm about to smile" anticipation.
            const int sLid = 32;
            _tftL.fillRect(0, 0,                 EYE_WIDTH, sLid, COL_BLACK);
            _tftL.fillRect(0, EYE_HEIGHT - sLid, EYE_WIDTH, sLid, COL_BLACK);
            delay(p.preActionMs);
            // Restore: push back the canvas strips we just painted black
            pushStrip(0, sLid);
            pushStrip(EYE_HEIGHT - sLid, sLid);
            delay(40);
            break;
        }
        case 2: {
            // Narrow: bigger squint, like an angry glare before striking.
            const int nLid = 55;
            _tftL.fillRect(0, 0,                 EYE_WIDTH, nLid, COL_BLACK);
            _tftL.fillRect(0, EYE_HEIGHT - nLid, EYE_WIDTH, nLid, COL_BLACK);
            delay(p.preActionMs);
            pushStrip(0, nLid);
            pushStrip(EYE_HEIGHT - nLid, nLid);
            delay(50);
            break;
        }
        case 3: {
            // Red flash: used for surprise. Briefly fills screen with red
            // (scare/startle), then restores canvas.
            _tftL.fillScreen(0xF800);
            delay(p.preActionMs);
            pushStrip(0, EYE_HEIGHT);
            delay(40);
            break;
        }
        default: break;
    }

    // ── Phase 1: close eyelids over OLD expression ──────────────────────
    uint16_t closeFrameMs = p.closeMs / p.closeFrames;
    for (uint8_t i = 1; i <= p.closeFrames; i++) {
        float t = (float)i / p.closeFrames;
        if (p.closeEaseIn) t = t * t;   // quadratic ease-in (snap close)
        int lid = (int)(HALF_H * t);
        _tftL.fillRect(0, 0,                EYE_WIDTH, lid, COL_BLACK);
        _tftL.fillRect(0, EYE_HEIGHT - lid, EYE_WIDTH, lid, COL_BLACK);
        delay(closeFrameMs);
    }
    _tftL.fillScreen(COL_BLACK);

    // ── Phase 2: render NEW expression into RAM canvas while eyes closed ─
    // Reset the animation frame counter so the "open" reveal shows the
    // settled / canonical frame; the next update() tick takes over and
    // advances the animation from there.
    _animFrame  = 0;
    _lastAnimMs = millis();
    if (_canvas) drawExprFrame(*_canvas, e, 0);
    delay(p.pauseMs);

    // ── Phase 3: open eyelids, revealing NEW expression strip by strip ───
    if (_canvas) {
        uint16_t openFrameMs = p.openMs / p.openFrames;
        int prevLid = HALF_H;
        for (uint8_t i = 1; i <= p.openFrames; i++) {
            float t = (float)i / p.openFrames;
            if (p.openEaseOut) t = 1.0f - (1.0f - t) * (1.0f - t);  // ease-out
            int lid = (int)(HALF_H * (1.0f - t));
            // Push the newly-revealed top & bottom strips from canvas
            if (prevLid > lid) {
                pushStrip(lid,                   prevLid - lid);
                pushStrip(EYE_HEIGHT - prevLid,  prevLid - lid);
            }
            prevLid = lid;
            delay(openFrameMs);
        }
        // Final full push guarantees no rounding gaps in the middle
        pushStrip(0, EYE_HEIGHT);
    } else {
        // Fallback without canvas: single draw (no open animation)
        drawExprFrame(_tftL, e, 0);
    }
}

void EyeDisplay::setExpressionSingle(uint8_t eye, const char* exprName) {
    // Mirror mode cannot address eyes independently — both always show the same.
    // Fall back to both-eye behavior.
    (void)eye;
    setExpression(exprName);
}

void EyeDisplay::blink() {
    if (_blinking) return;  // already in progress
    _blinking      = true;
    _blinkStage    = 0;
    _blinkStepTime = millis();
}

void EyeDisplay::update() {
    unsigned long now = millis();

    // ── Idle-return timer (highest precedence) ──
    if (_idleDueMs != 0 && (long)(now - _idleDueMs) >= 0) {
        setExpression("neutral");
        return;
    }

    // ── Blink overlay (preempts continuous animation while playing) ──
    if (_blinking) {
        static const uint16_t FRAME_MS = 18;
        if (now - _blinkStepTime < FRAME_MS) return;
        _blinkStepTime = now;

        static uint8_t frame    = 0;
        static int     prevLid  = 0;

        // Stage 0: closing  | Stage 1: fully closed | Stage 2: opening (canvas reveal)
        if (_blinkStage == 0) {
            frame++;
            float t = (float)frame / 6.0f;
            int lid = (int)((EYE_HEIGHT / 2) * t * t);
            drawBlinkFrame((uint8_t)lid);
            if (frame >= 6) { frame = 0; _blinkStage = 1; prevLid = EYE_HEIGHT / 2; }
        } else if (_blinkStage == 1) {
            drawBlinkFrame((uint8_t)(EYE_HEIGHT / 2));
            frame++;
            if (frame >= 3) { frame = 0; _blinkStage = 2; }
        } else if (_blinkStage == 2) {
            frame++;
            float t = (float)frame / 6.0f;
            t = 1.0f - (1.0f - t) * (1.0f - t);
            int lid = (int)((EYE_HEIGHT / 2) * (1.0f - t));
            if (_canvas && prevLid > lid) {
                pushStrip(lid,                         prevLid - lid);
                pushStrip(EYE_HEIGHT - prevLid,        prevLid - lid);
            }
            prevLid = lid;
            if (frame >= 6) {
                frame = 0;
                _blinkStage = 3;
                if (_canvas) pushStrip(0, EYE_HEIGHT);
                else drawExprFrame(_tftL, _curExprL, _animFrame);
                _blinking = false;
                _lastAnimMs = millis();   // resync so the next anim tick
                                          // doesn't fire a back-to-back
                                          // redraw.
            }
        }
        return;
    }

    // ── Continuous expression animation ──
    // Repaint the canvas with the next animation frame and push it to
    // both LCDs (CS hard-tied GND -> mirrored). 100 ms throttle yields
    // ~10 fps which is what a 240 x 240 SPI panel @ 20 MHz can sustain
    // without starving the rest of loop().
    if (_canvas && (now - _lastAnimMs) >= EYE_ANIM_FRAME_MS) {
        _lastAnimMs = now;
        _animFrame++;                    // wraps at 65535, fine for sin LUT
        drawExprFrame(*_canvas, _curExprL, _animFrame);
        pushStrip(0, EYE_HEIGHT);
    }
}

void EyeDisplay::drawBlinkFrame(uint8_t lidHeight) {
    _tftL.fillRect(0, 0,                    EYE_WIDTH, lidHeight, COL_BLACK);
    _tftL.fillRect(0, EYE_HEIGHT-lidHeight, EYE_WIDTH, lidHeight, COL_BLACK);
}

// ═══════════════════════════════════════════════════════════════════════
//  Expression rendering — animated EMO style
//
//  All shapes live in the upper-2/3 safe box (40, 5) - (200, 155).
//  The bottom 1/3 of the panel (Y >= 160) is intentionally left black.
//  `frame` is EyeDisplay::_animFrame, advanced every EYE_ANIM_FRAME_MS
//  (70 ms ≈ 14 fps).
// ═══════════════════════════════════════════════════════════════════════

static inline float sinNorm(float t)   { return sinf(t); }
static inline float halfSin(float t)   { float s = sinf(t); return s < 0 ? 0.f : s; }

// (drawHeart helper removed in v4 -- no expression uses hearts now that
//  BLISS is the smiling-arch design.)

// ─── helper: draw a SOLID thick ring (no gaps) ────────────────────────
// v4 used 3 adjacent drawCircle calls to fake thickness, but Bresenham's
// 1-px circles leave hairline gaps between adjacent radii on a 240x240
// LCD -- the user reported it looking like "two circles" because of it.
// v5 uses fill-then-subtract: a filled outer disc minus a filled inner
// disc gives a guaranteed-solid ring of (r_outer - r_inner) thickness.
static void drawThickRing(Adafruit_GFX& g, int cx, int cy, int r,
                           int thickness, uint16_t col) {
    g.fillCircle(cx, cy, r, col);
    g.fillCircle(cx, cy, r - thickness, COL_BLACK);
}

// ─── helper: draw a smile-shape "∪" eye ───────────────────────────────
// v4 had this shape inverted (∩). User pointed out the direction was
// wrong -- they want the curve at the BOTTOM with corners turning up,
// i.e. ︶, which reads as "happy mouth" / "smiling eye". Same thick-ring
// trick, but we mask the TOP half instead of the bottom.
static void drawSmileEye(Adafruit_GFX& g, int cx, int cy, int r,
                          int thickness, uint16_t col) {
    g.fillCircle(cx, cy, r, col);
    g.fillCircle(cx, cy, r - thickness, COL_BLACK);
    // Mask the TOP half -> keep bottom -> ∪ smile shape
    g.fillRect(cx - r - 2, cy - r - 2, 2 * r + 4, r + 2, COL_BLACK);
}

// ─── helper: stamp ONE Archimedean-spiral eye ─────────────────────────
// 60 line segments approximate the spiral; doubled-up offset draws make
// the stroke ~2 px wide so it's visible after the LCD's natural blur.
static void drawSpiralEye(Adafruit_GFX& g, int cx, int cy, float maxR,
                           float startAngle, bool clockwise, uint16_t col) {
    const int N = 60;
    const float TURNS = 2.6f;
    const float dir = clockwise ? -1.0f : 1.0f;

    int prevX = cx, prevY = cy;
    for (int i = 1; i <= N; i++) {
        float t     = (float)i / N;
        float r     = t * maxR;
        float theta = startAngle + dir * t * TURNS * 6.2832f;
        int x = cx + (int)(r * cosf(theta));
        int y = cy + (int)(r * sinf(theta));
        g.drawLine(prevX,     prevY,     x,     y,     col);
        g.drawLine(prevX + 1, prevY,     x + 1, y,     col);
        g.drawLine(prevX,     prevY + 1, x,     y + 1, col);
        prevX = x; prevY = y;
    }
}

// ─── 14 expressions, all animated, upper-2/3 layout ────────────────────

static void drawNeutralFrame(Adafruit_GFX& g, uint16_t frame) {
    // Visible breathing: height pulses ±10 px.
    g.fillScreen(COL_BLACK);
    int h    = 130 + (int)(sinNorm(frame * 0.13f) * 10);
    int yTop = EYE_BOUND_CY - h / 2;
    g.fillRoundRect(EYE_BOUND_X, yTop, EYE_BOUND_W, h, 30, COL_CYAN);
}

static void drawHappyFrame(Adafruit_GFX& g, uint16_t frame) {
    // Squinty eye bounces ±8 px in the upper portion.
    g.fillScreen(COL_BLACK);
    int yOff = (int)(sinNorm(frame * 0.22f) * 8);
    int wOff = (int)(halfSin(frame * 0.22f) * 6);
    g.fillRoundRect(EYE_BOUND_X - wOff / 2, 60 + yOff,
                    EYE_BOUND_W + wOff, 50, 22, COL_CYAN);
}

static void drawSadFrame(Adafruit_GFX& g, uint16_t frame) {
    // Drooping eye + a heavy blue tear that drops through the LOWER part
    // of the safe box (it still has to STAY inside Y < 160 -- the bottom
    // 1/3 of the panel is the "blank" area that the user wants kept dark).
    g.fillScreen(COL_BLACK);
    g.fillRoundRect(EYE_BOUND_X, 30, EYE_BOUND_W, 80, 22, COL_CYAN);
    int cyc = frame % 70;
    if (cyc < 30) {
        int tearY = 115 + cyc;                           // 115..145
        int tearH = 6 + cyc / 5;                         // stretches
        g.fillCircle(EYE_BOUND_CX, tearY, 6, COL_BLUE);
        g.fillRect(EYE_BOUND_CX - 2, tearY - tearH, 4, tearH, COL_BLUE);
    }
}

// ANGRY v4: REMOVED. The fire visual was rejected by the user; an
// "angry" tag from the LLM now renders as NEUTRAL via parseExpr's
// fall-through. Keeping this comment as a tombstone so future readers
// know why there's no drawAngryFrame in the switch.

static void drawSurpriseFrame(Adafruit_GFX& g, uint16_t frame) {
    // Round eye dilates 65..75.
    g.fillScreen(COL_BLACK);
    int r = 65 + (int)(halfSin(frame * 0.4f) * 10);
    g.fillCircle(EYE_BOUND_CX, EYE_BOUND_CY, r, COL_CYAN);
    g.fillCircle(EYE_BOUND_CX - r / 3, EYE_BOUND_CY - r / 3, r / 5, COL_WHITE);
}

static void drawSympathyFrame(Adafruit_GFX& g, uint16_t frame) {
    // Soft rounded shape that color-cycles cyan-dim ↔ pink-hi ↔ pink.
    g.fillScreen(COL_BLACK);
    int phase = frame % 30;
    uint16_t col = (phase < 10) ? COL_CYAN_D
                 : (phase < 20) ? COL_PINK_HI
                                : COL_PINK;
    g.fillRoundRect(EYE_BOUND_X, 15, EYE_BOUND_W, 130, 35, col);
}

static void drawWorriedFrame(Adafruit_GFX& g, uint16_t frame) {
    // Eye + worry brow. Brow at the TOP of the safe box; eye below it.
    g.fillScreen(COL_BLACK);
    int twitchPhase = frame % 28;
    int xOff = 0;
    if (twitchPhase < 4) xOff = (twitchPhase & 1) ? 10 : -10;
    g.fillRect(EYE_BOUND_X + xOff, 25, EYE_BOUND_W, 10, COL_CYAN);
    g.fillRoundRect(EYE_BOUND_X + xOff, 45, EYE_BOUND_W, 90, 22, COL_CYAN);
}

// ⭐ CONFUSED v5 = a single SOLID thick ring, centered. v4's three
// adjacent 1-px circles left visible gaps that read as "two circles";
// v5's fill-subtract approach gives one cleanly solid 6-px-thick ring
// per canvas. Each LCD shows the same canvas, so the bot has one ring
// per physical eye, matching the reference photo.
static void drawConfusedFrame(Adafruit_GFX& g, uint16_t frame) {
    g.fillScreen(COL_BLACK);
    int r = 42 + (int)(sinNorm(frame * 0.13f) * 5);   // 37 .. 47
    drawThickRing(g, EYE_BOUND_CX, EYE_BOUND_CY, r, 6, COL_CYAN);
}

static void drawCuriousFrame(Adafruit_GFX& g, uint16_t frame) {
    // Tall open eye scans L/R ±20.
    g.fillScreen(COL_BLACK);
    int xOff = (int)(sinNorm(frame * 0.12f) * 20);
    g.fillRoundRect(EYE_BOUND_X + xOff, 10, EYE_BOUND_W, 140, 38, COL_CYAN);
}

// ⭐ BLISS v4 = a single curved-arch "smiling-eye" (∩). Each LCD shows
// the same canvas, so the bot ends up with two squinted ︵ ︵ smiling
// eyes physically -- exactly like the reference photo the user sent.
// Hearts were dropped per the v4 spec. Animation: gentle vertical bob +
// slight thickness pulse so the smile feels "alive".
static void drawBlissFrame(Adafruit_GFX& g, uint16_t frame) {
    g.fillScreen(COL_BLACK);

    int   yOff      = (int)(sinNorm(frame * 0.18f) * 4);   // ±4 px bob
    int   thickness = 12 + (int)(halfSin(frame * 0.25f) * 3); // 12..15
    drawSmileEye(g, EYE_BOUND_CX,
                    EYE_BOUND_CY + yOff,
                    50, thickness, COL_CYAN);
}

static void drawScaredFrame(Adafruit_GFX& g, uint16_t frame) {
    // Small jittering eye in upper-2/3.
    g.fillScreen(COL_BLACK);
    int xOff = (int)((frame * 7919U)  % 17) - 8;
    int yOff = (int)((frame * 1471U)  % 17) - 8;
    g.fillRoundRect(75 + xOff, 55 + yOff, 90, 50, 22, COL_CYAN);
}

static void drawAttentiveFrame(Adafruit_GFX& g, uint16_t frame) {
    // Big alert eye, focus-pulse ±7 px on each side.
    g.fillScreen(COL_BLACK);
    int sz = (int)(sinNorm(frame * 0.16f) * 7);
    g.fillRoundRect(EYE_BOUND_X - sz,
                    EYE_BOUND_Y - sz,
                    EYE_BOUND_W + sz * 2,
                    EYE_BOUND_H + sz * 2,
                    38, COL_CYAN);
}

static void drawSleepyFrame(Adafruit_GFX& g, uint16_t frame) {
    // Heavy eyelid: thickness oscillates 14..40.
    g.fillScreen(COL_BLACK);
    int h    = 27 + (int)(sinNorm(frame * 0.06f) * 13);
    int yTop = EYE_BOUND_CY - h / 2;
    g.fillRoundRect(EYE_BOUND_X, yTop, EYE_BOUND_W, h, 12, COL_CYAN);
}

// ⭐ DIZZY = two Archimedean-spiral eyes, counter-rotating.
static void drawDizzyFrame(Adafruit_GFX& g, uint16_t frame) {
    g.fillScreen(COL_BLACK);

    const int LCX = 75,  LCY = EYE_BOUND_CY;
    const int RCX = 165, RCY = EYE_BOUND_CY;
    const float MAX_R = 38.0f;

    float angL = frame * 0.16f;          // left  rotates CCW
    float angR = frame * -0.18f;         // right rotates CW (slightly off
                                         // speed -> "drunk" feel)
    drawSpiralEye(g, LCX, LCY, MAX_R, angL, false, COL_CYAN);
    drawSpiralEye(g, RCX, RCY, MAX_R, angR, true,  COL_CYAN);
}

void EyeDisplay::drawExprFrame(Adafruit_GFX& g, EyeExpr expr, uint16_t frame) {
    switch (expr) {
        case EYE_EXPR_HAPPY:     drawHappyFrame(g, frame);     break;
        case EYE_EXPR_SAD:       drawSadFrame(g, frame);       break;
        // EYE_EXPR_ANGRY removed in v4 -- falls through to default = neutral.
        case EYE_EXPR_SURPRISE:  drawSurpriseFrame(g, frame);  break;
        case EYE_EXPR_SYMPATHY:  drawSympathyFrame(g, frame);  break;
        case EYE_EXPR_WORRIED:   drawWorriedFrame(g, frame);   break;
        case EYE_EXPR_CONFUSED:  drawConfusedFrame(g, frame);  break;
        case EYE_EXPR_CURIOUS:   drawCuriousFrame(g, frame);   break;
        case EYE_EXPR_BLISS:     drawBlissFrame(g, frame);     break;
        case EYE_EXPR_SCARED:    drawScaredFrame(g, frame);    break;
        case EYE_EXPR_ATTENTIVE: drawAttentiveFrame(g, frame); break;
        case EYE_EXPR_SLEEPY:    drawSleepyFrame(g, frame);    break;
        case EYE_EXPR_DIZZY:     drawDizzyFrame(g, frame);     break;
        case EYE_EXPR_NEUTRAL:
        default:                 drawNeutralFrame(g, frame);   break;
    }
}
