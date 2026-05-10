# Maintenance Guide v1.2.0

## v1.2.0 Verification Rule

For v1.2.0, `npm run verify` must cover:

```bash
npm run build
npm run test:version-doctor
npm run test:localdev-adapter-contract
npm run test:realtime-readiness
npm run test:localdev-preflight
npm run test:smoke
```

This remains a safe Mock-first verification flow. It must not connect real Qwen/DashScope cloud traffic, real hardware, real email, real AC, or real TTS.

本项目从 v1.1.6 开始按“小版本稳定迭代”维护。目标是让每次改动都能被 Git、文档、脚本和 smoke tests 追踪，而不是继续把功能堆进一个越来越长的 Demo 页面。

## 1. 每次开始前

先进入项目目录：

```cmd
cd /d C:\Users\Administrator\Desktop\realtime-omni-robot-demo
```

检查本地状态：

```bash
git status
git log --oneline --decorate -5
git pull
```

如果 `git status` 不是 clean，先确认改动来源，不要直接覆盖。

## 2. 本地运行

开发调试：

```bash
npm install
npm run dev
```

另开一个终端启动 LocalDev Mock Server：

```bash
npm run mock:localdev
```

## 3. 验证命令

小改动至少跑：

```bash
npm run verify:quick
```

发 zip、打 tag、push 前跑：

```bash
npm run verify
```

`verify` 包含构建和当前安全 smoke suite。它不会默认连接真实云 API、真实邮箱、真实空调或真实硬件。

## 4. 打包前清理

```bash
npm run clean
```

这个命令会删除：

```text
node_modules/
dist/
package-lock.json
localdev-mock.out.log
localdev-mock.err.log
vite-dev.out.log
vite-dev.err.log
```

它只清理本地生成物，不删除源码、文档或 Git 历史。

## 5. Git 提交流程

```bash
git status
npm run verify
git add .
git commit -m "feat: stabilize localdev adapter contract"
git tag v1.2.0
git push origin main
git push origin v1.2.0
```

如果只是日常小改，可以不打 tag；只有稳定版本才 tag。

## 6. 版本一致性

版本号需要同时更新：

```text
package.json
README.md
AGENTS.md
docs/ARCHITECTURE.md
docs/IMPLEMENTATION_PLAN.md
docs/RELEASE_NOTES_vX.Y.Z.md
docs/UPDATE_GUIDE_vX.Y.Z.md
```

用下面命令检查：

```bash
npm run test:version-doctor
```

## 7. 架构红线

- 不退化为 `ASR -> LLM -> TTS`。
- `reply_text` 只用于字幕、日志和调试。
- `omni.reply_audio_frame.v1` 是输出媒体帧，不是 TTS 文件。
- `omni.audio_frame.v1` 不自动触发 interrupt。
- `omni.interrupt.v1` 是当前 Mock barge-in 的唯一打断控制事件。
- 插件动作必须走 Permission Engine 和 Tool Engine。
- 用户代码插件只能返回 action intents。
- 真实 Qwen / DashScope / 邮件 / 空调 / 硬件默认关闭，必须显式配置和授权。

## 8. 推荐后续版本节奏

```text
v1.1.x  维护、UI、Mock realtime、测试和文档稳定
v1.2.x  LocalDev Adapter Contract 稳定版
v1.3.x  云端 Omni Provider 预接入与 health check
v1.4.x  Robot Body Client 协议预留
v2.0.0  第一个真实可用 Omni Provider 闭环
```
