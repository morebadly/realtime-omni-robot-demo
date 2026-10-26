# ESP32 当前固件

当前工程是用户确认正在使用的 `esp32_cerebellum原版`，面向经典 ESP32 WROOM-32E。源码完整放在 [`esp32_cerebellum/`](esp32_cerebellum/)，入口为 [`esp32_cerebellum.ino`](esp32_cerebellum/esp32_cerebellum.ino)。不要按 ESP32-S3 量产方案的引脚直接烧录这套样机固件。

## 文件和依赖

请保留整个草图目录：主 `.ino`，以及 `comm_protocol`、`motor_driver`、`servo_driver`、`eye_display`、`sensor_linetrack`、`sensor_ultrasonic`、`sensor_touch`、`selftest` 的相关 `.h` / `.cpp`。只复制 `.ino` 无法构建。

Arduino IDE 需安装 Espressif 的 ESP32 开发板支持。WROOM-32E 可从 `ESP32 Dev Module` 开始核对板型；原工程未提供确定的开发板包版本、Flash 分区和上传配置，不能据此声称复现了原烧录环境。电机驱动源码包含 Arduino-ESP32 2.x 与 3.x 的 LEDC API 分支。

源码引用的第三方库如下，版本是整理时这台电脑已有库的版本，仅供复现参考，尚未完成交叉编译验证。

| Arduino Library Manager 名称 | 本机参考版本 | 用途 |
| --- | --- | --- |
| ArduinoJson | 6.21.6 | 串口 JSON，原代码使用 `StaticJsonDocument` |
| Adafruit GFX Library | 1.12.6 | 眼睛图形和画布 |
| Adafruit ST7735 and ST7789 Library | 1.11.0 | ST7789 屏幕 |
| Adafruit PWM Servo Driver Library | 3.0.3 | PCA9685 |
| Adafruit BusIO | 随上述库安装兼容依赖 | I2C / SPI 支持 |

`Wire.h`、`SPI.h`、`Arduino.h` 由开发板包提供。实际源码使用 Adafruit 显示库，不使用旧上下文所写的 TFT_eSPI。

## 以实际宏定义为准的接线

部分源码文件头保留了旧接线说明。以下以 `.h` 内实际宏和初始化代码为准；上电前仍需与当前样机核对。

| 外设 | 当前定义 |
| --- | --- |
| TB6612 A 路 | AIN1=16，AIN2=17，PWMA=5 |
| TB6612 B 路 | BIN1=15，BIN2=14，PWMB=13；STBY 接高电平 |
| PCA9685 | SDA=21，SCL=22，I2C 地址 0x40 |
| HC-SR04 | TRIG=4，ECHO=19；ECHO 需降到 ESP32 可接受的 3.3V 电平 |
| 前左/前右/后左/后右防跌落 | 36 / 39 / 35 / 32，EDGE 数组顺序 `[FL, FR, RL, RR]` |
| 后方碰撞 | 34，BUMP 数组仅 1 项 |
| 头顶/侧面触摸 | 26 / 25，不是旧注释里的 2 / 12 |
| 双 ST7789 | SCK=18，MOSI=23，DC=27，RES=33，240×240；两屏 CS 在硬件上接地，软件 CS=-1，背光接 3V3 |

当前固件的三个检测开关 `ENABLE_EDGE_SAFETY`、`ENABLE_BUMP_DETECT`、`ENABLE_OBSTACLE` 均为 1。它与“（2）”版的 3 路防跌落、2 路碰撞和检测关闭配置不兼容。

**当前电机有样机专用配置。** `motor_driver.h` 的 `MOTOR_TB6612_A_DEAD=1` 会把左右速度合并到 B 路，源码说明对应 A 路损坏、两电机并联 BO1/BO2 的临时接法。该设置原样保留，不能视为标准差速驱动配置。更换驱动板后的配置必须根据实际接线另行确认。

## 编译和烧录步骤

1. 用 Arduino IDE 打开 `esp32_cerebellum/esp32_cerebellum.ino`，确认同目录的所有文件均存在。
2. 安装上述开发板支持和依赖库，选择与实际 ESP32 模块、Flash 和 USB 串口对应的参数。
3. 先执行“验证/编译”，通过后再在需要时选择串口上传；本次整理未连接或烧录设备。
4. 串口设置为 115200、8N1。主机程序使用 USB-UART，对应 Linux 上常见的 `/dev/ttyUSB0`；实际设备名应现场确认。

固件启动会初始化舵机并将其置于源码中心角。`SELFTEST` 会动作舵机和电机，并在约 35 秒内阻塞常规传感器检查，不能把它当作无动作的连通性检查。

## 串口协议

每条消息是 UTF-8 单行 JSON，以 `\n` 结束。调试文本与 JSON 共用串口，主机解析器应跳过非 JSON 行，并容忍无效 JSON。详细命令见 [`comm_protocol.h`](esp32_cerebellum/comm_protocol.h) 和 `.ino` 的 `handleCommand()`，数组维度以上表为准。

```json
{"cmd":"PING"}
{"cmd":"QUERY"}
```

这两个命令分别回复 `PONG`、`SENSOR_DATA`，不会请求电机或舵机动作；`QUERY` 会采样传感器。主机有效命令会重置约 30 秒的通信看门狗。其他已有命令包括 `SET_MOTOR`、`SET_SERVO`、`SERVO_SEQ`、`STOP_ALL`、`RESUME`、`SET_EXPR`、`SET_REFLEX`、`SET_CONFIG`、`I2C_SCAN`、`SELFTEST`。

`STOP_ALL` 的实现是电机停止并让舵机回中，不是独立的硬件断电。STBY 接高电平的这套样机不具备软件以外的电机使能切断。

固件目前仅实现 ESP32 串口 JSON 协议。仓库 Web 页面和现有 Node 网关尚未实现到该串口的适配，打开 Web 页面不会直接控制此工程。
