# Update Guide v1.1.6

## 适用对象

从 v1.1.5 或 Codex 后续本地提交更新到 v1.1.6。

## 更新步骤

1. 覆盖源码后进入项目目录：

```cmd
cd /d C:\Users\Administrator\Desktop\realtime-omni-robot-demo
```

2. 清理本地生成物并重新安装：

```bash
npm run clean
npm install
```

如果覆盖前没有 `clean` 脚本，也可以手动执行：

```cmd
rmdir /s /q node_modules
rmdir /s /q dist
del package-lock.json
```

3. 验证：

```bash
npm run verify
```

4. 提交并打标签：

```bash
git status
git add .
git commit -m "chore: stabilize project maintenance scripts"
git tag v1.1.6
git push origin main
git push origin v1.1.6
```

## 新命令

```bash
npm run verify:quick
npm run verify
npm run clean
npm run test:smoke
npm run test:version-doctor
```

## 注意事项

- `clean` 会删除 `node_modules/`，执行后需要重新 `npm install`。
- `verify` 不会默认连接真实云 API、真实邮件、真实空调或真实硬件。
- 如果 `test:version-doctor` 失败，先检查版本号和新 release/update 文档是否齐全。
- 不要把 `node_modules/`、`dist/`、`package-lock.json`、`.env` 或本地日志提交到 Git。
