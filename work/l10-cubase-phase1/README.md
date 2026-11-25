# L10 DAWdex Phase 1

这一个目录只做 Cubase 之外的准备：虚拟 MIDI 演奏脚本、对照 MIDI、录制步骤。脚本不打开、不扫描、不控制 Cubase，也不改 Cubase 工程。

沿用 2026-11-07 的 V1 原型 `cubase-control-skeleton`，采用其中首选的「虚拟 MIDI 实时演奏」路线。音乐结构按 R-41/R-73：第 1–2 小节弹两遍，后半段只把低音 E 换成 D。上面声部逐音相同。

## 空跑

```bash
node phase1.mjs --dry --bpm=96
```

不打开 MIDI 口，只打印每个 Note On/Off、通道、音高、力度和时间。力度和小偏移按固定表生成，因此可重复。默认端口名会出现在打印里，但不会被打开。

## 导出 MIDI

```bash
node phase1.mjs --export --bpm=96 --out=out
node phase1.mjs --check --midi=out/phase1.mid
```

导出一个标准 MIDI 文件。检查脚本会重新解析写出的文件，对两遍逐音比较：tick、时值、力度都必须一样；除 Sub Bass 外不得有任何音高变化；Sub Bass 恰好 10 个音各降低 2 个半音。检查结果写到 `out/phase1.check.json`。本次已通过的检查结果留在 `artifacts/phase1.check.json`。

## 真实演奏

真实演奏是单独开关，默认关着。请先由人按 `RECORDING-STEPS.md` 在 Cubase 里建好轨、装好音源、打开输入监听和录音武装，再执行：

```bash
node phase1.mjs --live --armed --port="IAC Driver Bus 1" --bpm=96
```

`--armed` 是执行线自己的二次确认。没有它时脚本直接停，不打开端口。脚本只发送 Note On/Off 和结束时的 All Notes Off，不发送走带控制，不创建轨道，不加载音源。

真实演奏需要 `@julusian/midi`。它没安装时脚本会停在没有打开端口的位置。空跑和导出不需要这个依赖。这个依赖是有意可选的，不会随空跑安装。

## 边界

- 本次没有进 Cubase，没有验证录音、端口链路或音源映射。
- 真实演奏需要人先把 Cubase 准备好，并在结束时按停止。
- `out/phase1.mid` 是离线对照件，不替代 Cubase 录下来的 MIDI 片段。
