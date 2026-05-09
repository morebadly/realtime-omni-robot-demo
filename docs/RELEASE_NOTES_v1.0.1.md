# Release Notes v1.0.1

## 核心新增

- 新增 Robot Registry 面板，为一个 Web/App 控制多个机器人预留正式入口。
- 默认预置三个机器人实例：本地调试、家庭 Wi-Fi 云端、外出 eSIM。
- 支持新增机器人占位。
- 支持切换 active robot，当前页面只控制 active robot。
- Robot Identity Profile 改为按 robot_id 存储。
- 表情、运行模式、网络状态、插件触发摘要会同步到当前机器人注册信息。

## 设计修正

之前 v1.0 只有单机器人身份档案，容易让人误解为 Web 只能控制一个机器人。v1.0.1 补上 Robot Registry 层，明确：

- robot_id 是稳定内部身份。
- display_name 是用户可修改昵称。
- Web/App 是 Client Layer，可以在多个 robot_id 之间切换。
- 后期云端 Registry / Robot Gateway 会负责真实设备绑定、在线状态、远程连接和多机器人权限。
