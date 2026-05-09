# Release Notes v1.0.3

## 核心改动

- 新增 `ToolIntentRouter`，Mock Omni 输出的 `tool_intents` 会尝试映射回插件触发器。
- 新增 `Mock Tool Engine`，将空调、邮件、表情、动作和角色切换的 Demo 执行逻辑从 `PluginEngine` 拆出。
- 插件执行链保持统一：工具意图或事实事件进入插件后，仍然必须经过 `plugin.run`、manifest 权限声明和动作权限检查。
- 新增 `VisualFrameBuffer` 摘要模块，Omni 输入包现在包含最近关键帧摘要、缓存摘要和选择策略。

## 架构约束

- 仍不接真实邮件、真实空调、真实硬件或真实云 API。
- ASR 文本仍只用于字幕、日志、调试和插件关键词辅助，不作为主输入。
- 摄像头仍不做前端情绪摘要；关键帧摘要只用于说明 Frame Buffer / Frame Selector 状态。
- `robot_id` 继续作为稳定内部身份，`display_name` 只影响展示和对话身份。

## 继续保留

- v1.0 Omni Session Bridge。
- v1.0.1 Robot Registry 多机器人控制。
- v1.0.2 Robot Registry 删除守卫和 active robot fallback。
