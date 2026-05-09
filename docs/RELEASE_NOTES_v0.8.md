# Release Notes v0.8

## 目标

v0.8 的目标是继续把 Demo 从“页面状态驱动”推进到“Runtime 中枢驱动”。Web 仍然是控制台，但机器人身份、模型配置、插件 manifest、权限执行链和 Runtime Trace 已经开始放入 Runtime 层。

## 新增

- `src/runtime/useRuntimeCore.js`
  - 统一管理机器人状态、运行模式、事实事件、插件执行、权限检查、模型配置和行为日志。
- `src/runtime/robotProfile.js`
  - 管理 Robot Identity Profile：display_name、wake_name、owner_calling、default_role、voice_style、personality。
- `src/runtime/pluginManifest.js`
  - 为模板插件和代码插件生成 manifest。
- `src/runtime/storage.js`
  - 封装浏览器 localStorage 的安全读写。
- `src/components/RobotProfilePanel.jsx`
  - 正式的机器人身份档案编辑入口。
- `src/components/RuntimeArchitecturePanel.jsx`
  - 展示 RuntimeCore 模块与最近 Runtime Trace。

## 改进

- 用户可把机器人命名为 CloudGenie，但不会把 CloudGenie 硬编码为平台名。
- `robot_id` 与 `display_name` 分离，为后续 Robot Registry、云端绑定和多机器人管理预留空间。
- Model Adapter 配置可持久化到浏览器本地；API Key 不持久化，避免 Demo 泄露敏感信息。
- 插件执行时新增 manifest 权限声明校验：代码插件即使返回了高风险动作，如果 manifest 没声明对应权限，也会被阻止。
- App.jsx 变薄，主要负责布局和组件挂载。

## 保留

- LOOI 风格表情系统。
- LocalDevOmniAdapter / ThirdPartyCloudOmniAdapter / SelfHostedCloudOmniAdapter / OfflinePetEngine 架构。
- 原始音频流直给 Omni、摄像头关键帧直给 Omni、触摸/NFC 只作为事实事件的输入策略。
- 无代码插件动作编排与代码插件 Demo Worker 沙箱。
- 权限中心、行为日志、可见上下文面板。
