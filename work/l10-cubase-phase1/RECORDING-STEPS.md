# Cubase 录制步骤

这一页只写人和总管在 Cubase 里点什么。脚本不会打开、扫描或控制 Cubase。

1. 先别打开 Cubase。双击「音频 MIDI 设置」，在「窗口」里选「显示 MIDI 工作室」。
2. 双击 IAC Driver，勾上「设备在线」，加一条总线并命名为 Bus 1，按「应用」。
3. 打开 Cubase 15，新建空工程，把速度设为 96，拍号设为 4/4。
4. 在「工作室 > 工作室设置 > MIDI 端口设置」里确认 IAC Driver Bus 1 可见，输入已打开。
5. 新建四条乐器轨，按顺序命名为 Felt Piano、Sub Bass、Dust Pad、Frame Drum。
6. 给四条轨各装一个已备好的音源；第一条用钢琴，第二条用贝斯，第三条用 pad，第四条用鼓。
7. 把四条轨的 MIDI 输入都设为 IAC Driver Bus 1。通道分别设为 1、2、3、10；不要用 Any。
8. 把四条轨都打开录音武装，并打开输入监听。确认没有别的轨处于录音武装状态。
9. 打开节拍器，设置一小节预备拍。把录音模式设为 MIDI 替换，或先清空目标片段。
10. 在「Studio > Studio Setup > MIDI Port Setup」确认 Cubase 没有把 IAC Driver Bus 1 的输入关闭。
11. 在终端空跑：`node phase1.mjs --dry --bpm=96`。先确认打印出的音高是 40、52、38、50，其它声部两遍相同。
12. 在终端导出 MIDI：`node phase1.mjs --export --bpm=96`。再跑 `node phase1.mjs --check`，确认 `ok` 是 `true`。
13. 在 Cubase 里把播放头放到第 1 小节第 1 拍，按录音键。等一小节预备拍结束。
14. 在另一个终端跑真实演奏：`node phase1.mjs --live --armed --port="IAC Driver Bus 1" --bpm=96`。这一步前不要再改 Cubase 的焦点。
15. 等八拍加八拍结束，终端出现 all notes off 后，在 Cubase 里按停止。
16. 检查四条轨：每条应有一段 8 小节的 MIDI 片段；Sub Bass 的前两小节低音是 E，后两小节同位置的低音是 D。
17. 打开钢琴卷帘，逐音看后半段：Piano、Pad、Drum 两遍完全一样，只有 Sub Bass 的十个音低了两个半音。
18. 如果听见长音，立刻在终端按 Control-C；脚本会发 All Notes Off。修好 note off 再重录。
19. 录屏要同时看到 Cubase 走带、钢琴卷帘和终端事件流。不要只拍音源界面。
20. 录完把工程另存为 Phase 1 的录制工程。备用文件是本目录的 `out/phase1.mid`，它是离线检查用的，不是 Cubase 录音。
