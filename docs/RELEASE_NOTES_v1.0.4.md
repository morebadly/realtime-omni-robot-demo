# Release Notes v1.0.4

## 核心改动

- 新增 `RobotRuntimeConfigStore`，按 `robot_id` 保存 Runtime 配置。
- 权限、插件和 Model Adapter 配置从全局 Demo 状态升级为 per-robot 配置。
- 点击 Robot Registry 中的 `robot_id` 会进入该机器人的专属调控界面。
- 切换 active robot 时，Runtime 会加载对应机器人的权限、插件和模型配置。
- 删除机器人时同步清理该 `robot_id` 的本地身份档案和 Runtime 配置。

## 仍然保持的边界

- WebUI 仍是控制台，不是机器人核心。
- 当前配置存储仍是浏览器本地 Demo 存储，不接真实云端。
- 不接真实邮件、真实空调、真实硬件或真实 Omni API。
- `display_name` 仍只影响展示和对话身份，权限、配置和日志继续绑定稳定 `robot_id`。

## 验证重点

- 切换到不同 `robot_id` 后，权限中心和插件中心应显示该机器人的专属状态。
- 在一台机器人上关闭某个权限，再切换到另一台机器人，该权限不应被同步关闭。
- 保存某台机器人的 Model Adapter 配置，不应影响其他机器人。
