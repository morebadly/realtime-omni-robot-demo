import { useEffect, useRef, useState } from 'react';
import { summarizeRealtimeOutputChannel } from '../runtime/realtimeOutputChannel';

function decodePcmFloat32Base64(payload) {
  if (!payload || typeof atob === 'undefined') return new Float32Array();
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

function getAudioContext() {
  const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
  return AudioContextImpl ? new AudioContextImpl() : null;
}

export default function RealtimeAudioOutputPlayer({ output, onFramePlayed, onInterrupt }) {
  const audioContextRef = useRef(null);
  const playingRef = useRef(false);
  const currentSourceRef = useRef(null);
  const seenFrameIdsRef = useRef(new Set());
  const lastTurnIdRef = useRef(null);
  const lastInterruptTokenRef = useRef(null);
  const [playbackDetail, setPlaybackDetail] = useState('等待 omni.reply_audio_frame.v1');

  useEffect(() => {
    if (output?.turnId && output.turnId !== lastTurnIdRef.current) {
      lastTurnIdRef.current = output.turnId;
      seenFrameIdsRef.current = new Set();
    }
  }, [output?.turnId]);

  useEffect(() => {
    const token = output?.interruptToken;
    if (!token || token === lastInterruptTokenRef.current) return;
    lastInterruptTokenRef.current = token;
    try {
      currentSourceRef.current?.stop();
    } catch {
      // Stopping an already-ended source is safe to ignore in this mock player.
    }
    currentSourceRef.current = null;
    playingRef.current = false;
    seenFrameIdsRef.current = new Set();
    setPlaybackDetail('已收到 interrupt：停止当前播放并清空本地输出队列。');
  }, [output?.interruptToken]);

  useEffect(() => {
    const frames = output?.queuedAudioFrames || [];
    const nextFrame = frames.find((frame) => frame?.frameId && !seenFrameIdsRef.current.has(frame.frameId));
    if (!nextFrame || playingRef.current || output?.state === 'interrupted') return;

    let cancelled = false;
    async function playFrame(frame) {
      playingRef.current = true;
      seenFrameIdsRef.current.add(frame.frameId);
      try {
        const audio = frame.audio || {};
        const samples = decodePcmFloat32Base64(audio.payload);
        if (!samples.length) {
          setPlaybackDetail(`跳过空输出音频帧：${frame.frameId}`);
          onFramePlayed?.(frame.frameId);
          return;
        }
        const ctx = audioContextRef.current || getAudioContext();
        audioContextRef.current = ctx;
        if (!ctx) throw new Error('当前浏览器不支持 Web Audio AudioContext。');
        if (ctx.state === 'suspended') await ctx.resume();
        const buffer = ctx.createBuffer(audio.channels || 1, samples.length, audio.sampleRate || 24000);
        buffer.copyToChannel(samples, 0);
        const source = ctx.createBufferSource();
        currentSourceRef.current = source;
        source.buffer = buffer;
        source.connect(ctx.destination);
        setPlaybackDetail(`正在播放 reply_audio_frame seq=${frame.sequence ?? 'unknown'} · ${audio.byteLength || 0} bytes`);
        await new Promise((resolve) => {
          source.onended = resolve;
          source.start();
        });
        if (!cancelled && currentSourceRef.current === source) onFramePlayed?.(frame.frameId);
      } catch (error) {
        setPlaybackDetail(`播放 reply_audio_frame 失败：${error?.message || String(error)}`);
        if (!cancelled) onFramePlayed?.(frame.frameId);
      } finally {
        currentSourceRef.current = null;
        playingRef.current = false;
      }
    }

    playFrame(nextFrame);
    return () => { cancelled = true; };
  }, [output?.queuedAudioFrames, output?.state, onFramePlayed]);

  const canInterrupt = Boolean(output?.playbackActive || output?.queuedAudioFrames?.length || output?.state === 'speaking');

  return (
    <section className="realtime-output-player">
      <div>
        <small>Realtime Omni Output</small>
        <strong>{summarizeRealtimeOutputChannel(output)}</strong>
        <p>{playbackDetail}</p>
      </div>
      <div>
        <small>协议语义</small>
        <strong>omni.reply_audio_frame.v1</strong>
        <p>服务端输出音频帧直接进入 Web Audio 播放队列；reply_text 只用于字幕、日志和调试，不进入 TTS。</p>
      </div>
      <div>
        <small>Barge-in Mock Control</small>
        <button type="button" className="danger-button" onClick={onInterrupt} disabled={!canInterrupt}>模拟用户插话 / Interrupt</button>
        <p>v1.1.2 只允许手动发送 omni.interrupt.v1；麦克风 audio_frame 不会自动打断，避免 Omni 自己打断自己。</p>
      </div>
    </section>
  );
}
