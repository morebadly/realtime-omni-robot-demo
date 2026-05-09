import { useEffect, useMemo, useRef, useState } from 'react';

function meterLabel(level) {
  if (level > 0.65) return '输入较强';
  if (level > 0.32) return '正在说话';
  if (level > 0.08) return '有声音';
  return '安静';
}

function encodeFloat32ToBase64(samples) {
  const bytes = new Uint8Array(samples.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function calculateRms(samples) {
  if (!samples?.length) return 0;
  let sum = 0;
  for (const value of samples) sum += value * value;
  return Math.min(1, Math.sqrt(sum / samples.length) * 3.2);
}

export default function RealtimeAudioPanel({ robot, session, route, onStatus, onAudioFrame }) {
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const sourceRef = useRef(null);
  const processorRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const audioFrameSeqRef = useRef(0);
  const pcmQueueRef = useRef([]);
  const queuedSamplesRef = useRef(0);
  const [level, setLevel] = useState(session?.level || 0);
  const [chunkStats, setChunkStats] = useState({ byteLength: 0, sampleCount: 0, durationMs: 0, sequence: 0 });
  const [error, setError] = useState('');
  const active = Boolean(session?.active);
  const canStream = Boolean(route?.canStream);

  const meterWidth = useMemo(() => `${Math.round(level * 100)}%`, [level]);

  useEffect(() => {
    return () => stopMic(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function report(next) {
    onStatus?.({
      ...session,
      ...next,
      level: typeof next.level === 'number' ? next.level : level,
      route: route?.route,
      audioInput: 'raw_audio_stream',
      asrUsage: 'subtitles_logs_debug_plugin_keywords_only',
      lastUpdatedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false })
    });
  }

  function drainPcmSamples(targetSamples) {
    const count = Math.min(targetSamples, queuedSamplesRef.current);
    if (!count) return new Float32Array(0);
    const output = new Float32Array(count);
    let offset = 0;
    while (offset < count && pcmQueueRef.current.length) {
      const chunk = pcmQueueRef.current[0];
      const remaining = count - offset;
      if (chunk.length <= remaining) {
        output.set(chunk, offset);
        offset += chunk.length;
        queuedSamplesRef.current -= chunk.length;
        pcmQueueRef.current.shift();
      } else {
        output.set(chunk.subarray(0, remaining), offset);
        pcmQueueRef.current[0] = chunk.slice(remaining);
        queuedSamplesRef.current -= remaining;
        offset += remaining;
      }
    }
    return output;
  }

  function emitPcmFrameIfReady() {
    const context = audioContextRef.current;
    if (!context) return;
    const sampleRate = context.sampleRate || 48000;
    const targetSamples = Math.max(1024, Math.round(sampleRate * 0.25));
    if (queuedSamplesRef.current < targetSamples) return;

    const samples = drainPcmSamples(targetSamples);
    if (!samples.length) return;

    const rms = calculateRms(samples);
    const byteLength = samples.byteLength;
    const durationMs = Math.round((samples.length / sampleRate) * 1000);
    audioFrameSeqRef.current += 1;
    const sequence = audioFrameSeqRef.current;
    const emittedAt = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const payloadBase64 = encodeFloat32ToBase64(samples);

    setLevel(rms);
    setChunkStats({ byteLength, sampleCount: samples.length, durationMs, sequence });
    onAudioFrame?.({
      level: rms,
      sampleRate,
      sequence,
      emittedAt,
      codec: 'pcm_float32',
      payloadIncluded: true,
      payloadBase64,
      byteLength,
      sampleCount: samples.length,
      durationMs,
      channels: 1
    });
  }

  async function startMic() {
    setError('');
    if (!canStream) {
      setError(route?.detail || '当前模式或权限不允许打开实时音频流。');
      report({ active: false, micActive: false });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContextClass();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      let processor = null;
      if (context.createScriptProcessor) {
        processor = context.createScriptProcessor(2048, 1, 1);
        processor.onaudioprocess = (event) => {
          const input = event.inputBuffer.getChannelData(0);
          const copy = new Float32Array(input.length);
          copy.set(input);
          pcmQueueRef.current.push(copy);
          queuedSamplesRef.current += copy.length;
          emitPcmFrameIfReady();
        };
        source.connect(processor);
        processor.connect(context.destination);
      }

      streamRef.current = stream;
      audioContextRef.current = context;
      sourceRef.current = source;
      processorRef.current = processor;
      analyserRef.current = analyser;
      pcmQueueRef.current = [];
      queuedSamplesRef.current = 0;
      audioFrameSeqRef.current = 0;
      report({
        active: true,
        micActive: true,
        startedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        sampleRate: context.sampleRate,
        audioChunkCodec: processor ? 'pcm_float32' : 'metadata_fallback',
        audioChunkNote: processor ? '浏览器麦克风 PCM Float32 chunk 已接入 LocalDev 媒体帧通道。' : '当前浏览器不支持 ScriptProcessorNode，只能回退到音量元数据。'
      });
      tickMeter();
    } catch (err) {
      setError('无法打开麦克风。请检查浏览器权限，或确认麦克风没有被其他软件占用。');
      report({ active: false, micActive: false });
    }
  }

  function tickMeter() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const value of data) {
      const normalized = (value - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.min(1, Math.sqrt(sum / data.length) * 3.2);
    setLevel(rms);
    rafRef.current = window.requestAnimationFrame(tickMeter);
  }

  function stopMic(emit = true) {
    if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    processorRef.current?.disconnect?.();
    processorRef.current = null;
    sourceRef.current?.disconnect?.();
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    audioContextRef.current?.close?.();
    audioContextRef.current = null;
    analyserRef.current = null;
    pcmQueueRef.current = [];
    queuedSamplesRef.current = 0;
    setLevel(0);
    if (emit) report({ active: false, micActive: false, level: 0 });
  }

  return (
    <section className="audio-card">
      <div className="camera-header">
        <div>
          <p className="eyebrow">Realtime Audio Stream</p>
          <h2>原始语音音频流输入，不把 ASR 文本当主输入</h2>
        </div>
        <span className={active ? 'tag camera-live' : 'tag'}>{active ? 'audio live' : route?.route || 'audio idle'}</span>
      </div>

      <div className="audio-route-box">
        <div>
          <small>当前路由</small>
          <strong>{route?.label}</strong>
          <p>{route?.detail}</p>
        </div>
        <div>
          <small>ASR 文本用途</small>
          <strong>字幕 / 日志 / 调试 / 插件关键词辅助</strong>
          <p>主链路仍是原始音频流 → Omni Adapter。</p>
        </div>
      </div>

      <div className="audio-meter-wrap">
        <div className="audio-meter">
          <span style={{ width: meterWidth }} />
        </div>
        <strong>{meterLabel(level)}</strong>
      </div>

      <div className="camera-actions">
        {active ? <button onClick={() => stopMic(true)}>停止实时音频</button> : <button onClick={startMic}>开启实时音频</button>}
        <button onClick={() => report({ active: false, micActive: false, level: 0 })}>仅记录会话状态</button>
      </div>

      <div className="camera-meta">
        <div><small>输入</small><strong>raw audio stream</strong></div>
        <div><small>媒体帧协议</small><strong>omni.audio_frame.v1</strong></div>
        <div><small>编码</small><strong>{chunkStats.byteLength ? 'pcm_float32 payload' : '等待音频 chunk'}</strong></div>
        <div><small>最近 Chunk</small><strong>{chunkStats.byteLength ? `${chunkStats.byteLength} bytes` : '未发送'}</strong></div>
        <div><small>Samples</small><strong>{chunkStats.sampleCount || '未启动'}</strong></div>
        <div><small>Duration</small><strong>{chunkStats.durationMs ? `${chunkStats.durationMs}ms` : '未启动'}</strong></div>
        <div><small>模式</small><strong>{robot.mode}</strong></div>
        <div><small>Sample Rate</small><strong>{session?.sampleRate || '未启动'}</strong></div>
        <div><small>权限</small><strong>{canStream ? '允许打开链路' : '已阻止'}</strong></div>
      </div>
      {error && <p className="camera-error">{error}</p>}
    </section>
  );
}
