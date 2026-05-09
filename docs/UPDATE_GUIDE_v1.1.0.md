# Update Guide v1.1.0

## What changed

v1.1.0 adds real JPEG payloads to `omni.camera_frame.v1`. This means the LocalDev media bridge can now verify both microphone PCM chunks and camera keyframe payloads.

## Clean install

Windows CMD:

```cmd
cd C:\Users\Administrator\Desktop\realtime-omni-robot-demo
taskkill /F /IM node.exe
rmdir /s /q node_modules
rmdir /s /q dist
del package-lock.json
npm install
npm run dev
```

If `node_modules`, `dist`, or `package-lock.json` do not exist, ignore the warning and continue.

## LocalDev test

Terminal 1:

```cmd
cd C:\Users\Administrator\Desktop\realtime-omni-robot-demo
npm run mock:localdev
```

Terminal 2:

```cmd
cd C:\Users\Administrator\Desktop\realtime-omni-robot-demo
npm run dev
```

In the browser:

1. Open `http://localhost:5173`.
2. Make sure the active robot is in Local Dev mode.
3. Click **发送到 LocalDev Adapter** once to establish the WebSocket bridge.
4. Enable camera preview.
5. Watch the mock server log.

Expected camera log:

```text
media_frame schema=omni.camera_frame.v1 ... payload=yes bytes=... 640x... selector=...
```

Expected audio log, if microphone is enabled:

```text
media_frame schema=omni.audio_frame.v1 ... payload=yes bytes=48000 samples=12000 duration=250ms
```

## Notes

- This is still a Demo/Mock adapter path.
- The mock server validates payload delivery but does not perform real model inference.
- The next recommended step is mock streaming reply audio and playback state.
