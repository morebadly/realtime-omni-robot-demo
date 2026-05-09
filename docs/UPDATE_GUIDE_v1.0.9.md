# Update Guide v1.0.9

## What changed

v1.0.9 adds real browser microphone PCM chunk sending to the existing LocalDev media frame channel.

## Windows update steps

From the project directory:

```cmd
taskkill /F /IM node.exe
rmdir /s /q node_modules
rmdir /s /q dist
del package-lock.json
npm install
npm run dev
```

Open a second CMD for LocalDev Mock:

```cmd
cd C:\Users\Administrator\Desktop\realtime-omni-robot-demo
npm run mock:localdev
```

## Expected mock output

After starting the Web app, connecting LocalDev, and opening the microphone, the mock server should show lines similar to:

```text
media_frame schema=omni.audio_frame.v1 ... kind=audio codec=pcm_float32 payload=yes bytes=48000 samples=12000 duration=250ms
```

If `bytes=0`, the browser may have denied microphone access, the audio processor may not be running, or the page may not have established the LocalDev bridge yet.
