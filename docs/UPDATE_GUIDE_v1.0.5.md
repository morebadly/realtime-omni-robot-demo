# Update Guide v1.0.5

## 更新方式

Windows CMD：

```cmd
cd C:\Users\Administrator\Desktop\realtime-omni-robot-demo
npm install
npm run dev
```

## 验证 LocalDev Adapter Client

1. 打开 `http://127.0.0.1:5173/`。
2. 确认当前机器人处于 `local_dev` 模式。
3. 在 Omni Session 面板点击“构建 Omni 输入包”。
4. 点击“发送到 LocalDev Adapter”。
5. 如果本地服务未启动，行为日志会提示无法连接 `ws://127.0.0.1:8000/omni/realtime`。
6. 如果本地服务返回 `omni.output_turn.v1`，页面会更新模型回合、表情和工具意图。

## 本地服务返回格式

LocalDev Adapter 可直接返回：

```json
{
  "schema": "omni.output_turn.v1",
  "reply_text": "本地模型回复",
  "expression": { "type": "expression.update", "expression": "happy" },
  "tool_intents": []
}
```

也可以返回：

```json
{
  "type": "omni.output_turn",
  "turn": {
    "reply_text": "本地模型回复",
    "expression": { "type": "expression.update", "expression": "thinking" },
    "tool_intents": []
  }
}
```

## 注意

v1.0.5 只是 Adapter Client 骨架，不包含本地 Qwen2.5-Omni 服务本身。
