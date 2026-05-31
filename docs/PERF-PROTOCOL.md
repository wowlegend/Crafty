# Crafty — Real-Device Performance Protocol

The headless/SwiftShader FPS number is meaningless (S0). Frame-rate is acceptance-gated on REAL hardware only.

## Devices (minimum)
- iPad (Safari) — primary touch target
- A mid-range Android phone (Chrome)
- A desktop/laptop (baseline)

## Procedure
1. `npm run build && npm run preview`, open the LAN URL on the device (same Wi-Fi), or deploy a preview.
2. Enter the world; play 60s covering: idle, running, combat (multiple mobs), a weather state.
3. Record at each quality tier (Low/Med/High): median FPS, 1%-low FPS, and whether PerformanceMonitor changed tiers.
4. Record the numbers in this file under a dated run heading.

## Targets (S1 acceptance)
- iPad @ Med: median >= 45 FPS, 1%-low >= 30 FPS, no multi-second hitches.
- Desktop @ High: median >= 60 FPS.

## Runs
<!-- append dated measurement tables here -->
