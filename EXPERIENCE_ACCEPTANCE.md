---
artifact: experience-acceptance-checklist
status: public-experimental
acceptance_result: not-run
scope: local-synthetic-portfolio-preview-only
target_url: http://127.0.0.1:4175
real_private_data_allowed: false
production_approval: false
---

# Flow Lens 纯体验验收

## 先做 2 分钟无提示检查

打开 `http://127.0.0.1:4175`，立即开始计时。**前 2 分钟不要继续阅读本文。**

2 分钟结束时，先写下自己的答案：

1. 这个工具要帮助我做什么？
2. 我现在看到的数据是真的吗？
3. 我接下来要完成什么？
4. 最终差值能证明什么，不能证明什么？

如果必须先读 README、源码或本文才能回答，first-run 验收失败。

## 验收范围

这是本地 synthetic/manual portfolio preview 的体验检查。目标是确认一个不了解项目的人能从界面理解范围、完成合成证据复核、写下一项可逆改动，并自己选择保留、撤销或证据不足。

本次验收不是目标用户研究、MVP 验收、真实视频试用、生产发布、隐私合规评估或产品批准。所有默认 source、事件与数字都是程序化合成示例。

运行前请先完成 [docs/TESTING.md](docs/TESTING.md) 中的质量门。这些自动化结果不代替你本人的体验验收。

## 建议顺序

1. 桌面 happy path；
2. 五类对比 blocker；
3. 390 px 和 320 px 移动流程；
4. 键盘、focus、reduced motion 和 forced colors；
5. reset 与本地视频边界。

## 逐步场景

| 场景 | 必做动作 | 期望结果 | 失败判据 |
|---|---|---|---|
| First-run | 无提示打开并计时 2 分钟 | 能回答开头四问；主 CTA 与本地限制清楚 | 需读文档；误以为是真实数据、AI 分析或效率结果 |
| 合成范围 | 点击“开始合成体验”，确认范围 | 持续显示“所有数字都是示例”；任务、进度、下一步同屏 | 合成标识消失；不知道当前任务 |
| Source 联动 | 选择记录与 observation，seek source | source、timeline、map、inspector 使用同一时间、区域与 active revision | 任一视图仍显示旧 revision 或连续补路径 |
| Zone | 展开区域设置，修改一个区域 | zone version/fingerprint 改变；coverage 与 comparison 阻断，直到逐记录重新确认 | 区域改变后旧指标仍显示 current |
| Observation | 处理 LC01；修订一个 confirmed event；restore | proposed/uncertain/rejected/edit-draft 不进指标；edit-final/restore 追加 revision，不覆盖历史 | 默认确认；draft 入指标；undo 删除历史 |
| Coverage | 切换到 `coverage-gap` | 显示 unknown/unreviewed 和受影响记录；无指标且不显示 0 | 只显示 generic error；允许强制比较或把 unknown 当 0 |
| 3+3 | 在 eligible 场景逐次标记 3 Before + 3 After 已查看 | 六个记录同时满足 event review、coverage、zone 与 computed metric 才完成 | 少一个记录或一个条件失败仍进入 complete |
| One change | 写并锁定一项自己提出的可逆改动 | 输入默认空；系统不推荐；新版本清除旧 decision | 预填“最佳改动”或推荐答案 |
| Compare | 读资格、claim boundary、3 个 signed difference；展开 trace | 先看见 synthetic、descriptive、alternatives、attribution not established；exact trace 可展开 | 出现提升、优化、节省、最佳、winner 色彩或隐藏 caveat |
| Decision | 选择 keep/revert/uncertain | 三项中立；只有 shown ClaimPackage + locked change 才能记录；证据不足也能完成 | 对比阻断时仍可决定；系统默认选择 |
| Bad cases | 依次打开 coverage-gap、incomparable、observability-shift、guardrail-harm、source-mismatch | 每项给具体 blocker、受影响记录、恢复动作；不泄漏 partial result | 只说“失败”；仍显示差值或允许决定 |
| Local | 打开本地来源限制；只用 committed generated fixture 验证 decode recovery | 明示每 phase 一个、1+1 不能 3+3、无 CV、未上传；失败 URL revoke 且另一侧保留 | 暗示真实视频获批、自动分析或安全删除 |
| Mobile | 在 390 px 和 320 px 走 来源 → 时间轴 → 区域 → 观察 → 对比 → 决定 | 是分步体验；active panel 获 focus；transport/seek/next action 可达；无页面横滚 | 桌面内容简单纵向堆叠；核心动作隐藏；focus 留在隐藏 panel |
| Keyboard/a11y | 不用鼠标完成 scope、zone、event、coverage、3+3、change、decision、reset | focus 可见并正确恢复；Dialog error 获 focus；状态不只靠颜色；reduced motion/forced colors 可用 | focus 回 body、键盘死路、颜色专属语义或 serious/critical axe |
| Reset | 清除会话 | 只声称清 app state 与 object URL reference | 声称安全删除浏览器、OS、源文件或 backup |

## 全局 hard fail

出现任一项即为 `CHANGES REQUIRED`：

- coverage、zone fingerprint、comparability、observability、guardrail、source identity 或 ClaimPackage gate 被绕过；
- synthetic 数字看起来像真实改善、效率或因果结论；
- 1+1 本地来源进入 3+3 complete；
- blocked/no-claim 状态仍可锁定改动或记录 decision；
- 390/320 出现页面级横向滚动或核心操作丢失；
- 键盘死路、focus 丢失、仅颜色语义或 serious/critical axe finding；
- 非本地请求、production CSP 放宽或 console error；
- 删除断言、隐藏 bad case 或新增非预期 skip 来获得 PASS。

## 已知限制

- 所有默认结果仅在程序化 synthetic fixture 中证明；
- 本地视频每 phase 一个，不能完成有效 3+3；
- 无 CV、模型、自动 action understanding、2.5D 或 3D；
- coverage finalization 是 prototype 用户断言，不是双标注或 miss audit；
- 无 persistence、export、真实 purge receipt、backup control 或 production threat model；
- 自动化主要覆盖 Chromium desktop/mobile；axe + keyboard 不是完整 AT/browser certification。

## 不能得出的结论

本轮通过也不能证明：目标用户需求、陌生用户普遍可用性、真实视频可靠性、人工复核正确性、纠错负担、权利/合规、生产安全、因果或稳定改善、经济性或 production readiness。

## 反馈格式

```text
Verdict: PASS | CHANGES REQUIRED
Viewport/device:
Scenario ID:
Expected:
Observed:
Could continue: yes/no
What I thought the number meant:
Screenshot/time:
```

请把每个失败单独记录，不要只给总体印象。`PASS` 只表示本地 pure experience acceptance；不会把这个实验性 preview 变成 validated product。
