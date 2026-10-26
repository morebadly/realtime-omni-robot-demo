# 设备端文件与补齐状态

本目录收录实际已有的设备文件。Web 控制台、旧 CyberPet_OS、ESP32 固件是三个不同部分；复制文件不等于完成它们之间的集成。

| 部分 | 仓库位置 | 当前状态 |
| --- | --- | --- |
| Web 控制台与 Node 网关 | 根目录 `src/`、`scripts/` | 原仓库已有 |
| ESP32 WROOM-32E 固件 | [`esp32/esp32_cerebellum/`](esp32/esp32_cerebellum/) | 已补齐当前使用的 16 个源码文件，未改动源码 |
| ESP32 依赖、引脚与使用说明 | [`esp32/README.md`](esp32/README.md) | 已补齐，按代码中的宏定义核对 |
| 香橙派现有网关部署步骤 | [`orangepi/README.md`](orangepi/README.md) | 已整理，仅运行仓库已有的 Mock 网关 |
| 香橙派 CyberPet_OS Python 运行时 | 仍在香橙派上 | 待读取原文件；本仓库未包含，不能据说明重建为“原版源码” |

## 来源和取舍

ESP32 文件来自用户提供的 `gyztbsd/机器人/esp32_cerebellum原版/`，用户确认它是当前使用版本。入口统一放在名为 `esp32_cerebellum` 的目录中，符合 Arduino 草图目录名与主 `.ino` 文件同名的要求。文件内容逐字节复制，大小和 SHA-256 记录在 [`esp32/source-manifest.json`](esp32/source-manifest.json)。

`esp32_cerebellum（2）` 是另一套硬件配置，未混入当前工程。小程序、独立 YOLO 情绪识别实验、虚拟环境、私人接管上下文与 Word 原件未上传。旧接管上下文含有账号信息；这里只保留与设备文件定位有关的事实。

旧 CyberPet_OS 说明中的 ASR、MiniMax 文本对话与 TTS 路径，不等同于当前仓库的原生实时 Omni 音频路径。后续取回时需要明确作为旧设备实现保存，再设计 Gateway 适配；不能直接替换现有模型适配层。

## 已做和未做的核验

- 当前固件 16 个源码文件与来源一致，所有带双引号的本地 `#include` 均能在工程内找到。
- 已检查两套固件的传感器布局和安全开关差异，按用户确认只导入“原版”。
- 原仓库 Web 构建及 `verify:quick` 已通过；该检查不能验证 ESP32 固件可编译或实机正常。
- 当前环境未完成 ESP32 交叉编译、烧录、串口或电机/舵机/显示屏测试。
- 未连接香橙派，未读取其源码，未在 ARM Linux 上运行网关。

完整硬件接入方向见 [`docs/HARDWARE_INTEGRATION_GUIDE.md`](../docs/HARDWARE_INTEGRATION_GUIDE.md)。本次没有新增硬件控制接口。
