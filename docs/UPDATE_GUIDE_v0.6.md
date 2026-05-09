# v0.4 → v0.6 更新指南

## 推荐更新方式

1. 备份你本地的 v0.4 项目。
2. 解压本更新包。
3. 在项目根目录执行：

```bash
rm -rf node_modules dist
npm install
npm run dev
```

Windows PowerShell 可以用：

```powershell
Remove-Item -Recurse -Force node_modules, dist -ErrorAction SilentlyContinue
npm install
npm run dev
```

## 为什么建议重新 npm install

旧 v0.4 压缩包里包含 `node_modules`，其中 Vite/Rolldown 的 native optional dependency 可能只适配打包机器的系统。跨系统直接运行旧 `node_modules` 可能报 native binding 缺失。更新包默认不携带 `node_modules`，用本机重新安装最稳。

## 手动合并时需要重点覆盖的目录

```text
src/
docs/
README.md
package.json
package-lock.json
```

## 本版本不做的事情

- 不接真实邮件发送。
- 不接真实空调控制。
- 不接真实机器人硬件。
- 不接长期复杂记忆。
- 不把摄像头画面在前端转成情绪摘要。
- 不把 ASR 文本作为唯一主输入。

这些能力都已经在 Runtime / Adapter / Permission / Plugin 架构中预留位置。
