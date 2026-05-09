# Release Notes v1.0.2

## 核心修复

- 修复 Robot Registry 只能新增、切换，不能删除机器人实例的问题。
- Robot Registry 卡片新增“删除”按钮。
- 删除 active robot 时，Runtime 会自动切换到下一个可用 robot_id，避免页面进入空状态。
- 禁止删除最后一个机器人实例，保证 Web/App 控制台始终有 active robot。
- 删除机器人时同步清理该 robot_id 对应的本地 Robot Identity Profile。
- 删除动作会写入 Action Log 和 Runtime Trace，方便后期接云端审计。

## 继续推进的架构点

- 明确 Demo 里的删除只是“移除本地注册占位”。成熟产品里，真实删除/解绑应该由 Cloud Robot Registry 处理：设备证书、云端绑定关系、历史日志、权限分组、订阅关系和数据保留策略都不能只靠前端删除。
- Robot Registry 的核心原则保持不变：内部稳定身份使用 `robot_id`，用户可见名称使用 `display_name`，Web/App 永远通过 `active_robot_id` 决定当前控制对象。

## 小修复

- 修复插件测试时 Action Log 重复写入两条相同日志的问题。
