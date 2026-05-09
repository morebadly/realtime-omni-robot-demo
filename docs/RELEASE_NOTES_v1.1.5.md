# Release Notes v1.1.5

## 标题

点击式调试工作台与插件中心标签页。

## 背景

v1.1.4 已经把顶部架构标签和可见信息面板压缩，但页面仍然偏长，尤其是插件中心会一次性展开动作库、无代码插件表单、代码插件表单、插件列表和 manifest，不适合频繁调试实时通话链路。

## 新增内容

- Maintenance patch: `src/runtime/localDevProtocol.js` now owns LocalDev envelope schemas and builders for `omni.input_packet`, media frames, and `omni.interrupt`, preparing the real LocalDev adapter compatibility layer without changing Mock runtime semantics.
- Added `docs/LOCALDEV_ADAPTER_CONTRACT.md` as the minimum WebSocket contract for a future real Qwen2.5-Omni LocalDev service.
- Added `scripts/localdev-omni-adapter-skeleton.mjs` and `npm run adapter:localdev:skeleton` as a contract-compatible placeholder service before real Qwen2.5-Omni inference is wired in.
- Split placeholder inference into `scripts/localdev-omni-placeholder-provider.mjs`, leaving the adapter skeleton focused on WebSocket contract handling, media frames, output states, and interrupt control.
- Added `scripts/localdev-omni-provider-registry.mjs`, `scripts/localdev-omni-qwen-provider-stub.mjs`, and `npm run adapter:localdev:qwen-stub` so the skeleton can switch provider boundaries before real Qwen2.5-Omni wiring.
- Added `scripts/localdev-qwen-http-client.mjs` to define Qwen provider config, request shape, and output-turn normalization without making external model calls yet.
- Added provider error normalization so missing config, dry-run, timeout-ready failures, and provider exceptions map to `omni.output_state.v1:error` plus a readable `omni.output_turn.v1`.
- Added `scripts/localdev-qwen-realtime-client.mjs` so the Qwen boundary is explicitly realtime-session based rather than `reply_text -> streaming playback`.
- Surfaced Qwen realtime boundary status in output state reasons and normalized output turn provider metadata so dry-run/stub states are visible in Web debugging.
- Added `scripts/localdev-qwen-realtime-transport.mjs` and `npm run adapter:localdev:qwen-loopback` so real realtime transports can be inserted without changing the adapter skeleton.
- Added `scripts/localdev-adapter-contract-smoke.mjs`, `npm run test:localdev-adapter-contract`, and `npm run test:localdev-adapter-contract:qwen-loopback` as one-shot LocalDev adapter protocol smoke tests. The default scenario validates placeholder reply audio; the Qwen loopback scenario validates the realtime session boundary without fake model audio.
- `DebugNavigation` 从锚点跳转改为点击式视图切换。
- 主页面默认只显示实时控制常用区域。
- 新增独立视图：实时控制、Omni 会话、插件中心、权限中心、可见信息、行为日志。
- `PluginCenter` 内部新增标签页：已安装插件、新增无代码插件、新增代码插件、动作库。
- 插件 manifest 和代码源码改为可折叠详情，默认不撑开页面。
- 保留 v1.1.1-v1.1.3 的 realtime session、reply_audio_frame、interrupt 和状态机能力。

## 不改变的安全边界

- 不接真实 Omni API。
- 不接真实 TTS。
- 不接真实邮箱、空调或硬件。
- 插件仍必须经过 Permission Engine 和 Tool Engine。
- `reply_text` 仍只用于字幕、日志和调试。
