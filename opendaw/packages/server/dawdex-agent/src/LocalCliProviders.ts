import {spawn} from "node:child_process"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {z} from "zod"
import {
    createCreativeDirectorInput,
    createProducerInput,
    CREATIVE_DIRECTOR_INSTRUCTIONS,
    parseCreativeBrief,
    parseProducerPlan,
    ProducerOutputSchema,
    PRODUCER_INSTRUCTIONS
} from "./MusicPlan.ts"
import type {CreativeBrief, PlanOutput, ProjectSnapshot} from "./MusicPlan.ts"
import type {MidiCandidate} from "./MidiCatalog.ts"
import type {MidiBundle} from "./MidiBundleRanker.ts"

// ── 本地 CLI 规划 Provider（Kimi / Qoder） ──────────────────────────────────
// 两个 Provider 都实现与 CodexAppServer 相同的 StructuredPlanningProvider 接口，
// 输出走同一套 Zod 校验与 MIDI 候选校验后才允许进入 DAW 执行。
// 凭据归各 CLI 自己所有；DAWdex 不读取、不复制、不转发。

export interface StructuredPlanningProvider {
    createCreativeBrief(prompt: string, snapshot: ProjectSnapshot): Promise<CreativeBrief>

    createPlan(
        prompt: string,
        snapshot: ProjectSnapshot,
        brief: CreativeBrief,
        candidates: ReadonlyArray<MidiCandidate>,
        bundles: ReadonlyArray<MidiBundle>
    ): Promise<PlanOutput>
}

const BRIEF_SCHEMA_HINT = `

You MUST respond with ONLY a single valid JSON object matching this exact schema:
{
  "intent": "create" | "add" | "restyle" | "modify",
  "style": "<genre string>",
  "styleAlternatives": ["<alt1>", ...],
  "moods": ["<mood1>", ...],
  "decisionSummary": "<short summary in user language>",
  "instrumentation": ["<instrument1>", ...],
  "bpm": <number 30-240>,
  "key": "<key string like C minor>",
  "bars": 4 | 8,
  "energy": <number 0-1>,
  "swing": <number 0-1>,
  "preserveTrackIds": [],
  "targetRoles": ["drums", "bass", "keys"],
  "searchTerms": { "drums": ["<term>", ...], "bass": ["<term>", ...], "keys": ["<term>", ...] }
}
No markdown, no code fences, no explanation — just the raw JSON.`

const PRODUCER_SCHEMA_HINT = `

You MUST respond with ONLY a single valid JSON object matching this exact required JSON Schema:
${JSON.stringify(z.toJSONSchema(ProducerOutputSchema), null, 2)}
No markdown, no code fences, no explanation — just the raw JSON.`

const NO_TOOLS_RULE = `

Rules: Do not use any tools. Do not inspect the filesystem. Do not read or write files.
Return only the requested structured JSON data.`

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null

/** Extract JSON from model output (strips markdown fences if present) */
const extractJson = (text: string): unknown => {
    let cleaned = text.trim()
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) {cleaned = fenceMatch[1].trim()}
    // 有些 CLI 会在 JSON 前后输出引导语：截取最外层花括号区间兜底
    if (!cleaned.startsWith("{")) {
        const start = cleaned.indexOf("{")
        const end = cleaned.lastIndexOf("}")
        if (start >= 0 && end > start) {cleaned = cleaned.slice(start, end + 1)}
    }
    return JSON.parse(cleaned)
}

type RunCliOptions = {
    readonly input?: string
    readonly timeoutMs: number
    readonly cwd: string
    readonly maxOutputBytes?: number
}

// 有界子进程：参数数组（绝不走 shell）、输出上限、超时终止、stderr 只留短诊断尾巴
const runCli = (executable: string, args: ReadonlyArray<string>, options: RunCliOptions): Promise<string> =>
    new Promise((resolve, reject) => {
        const maxOutput = options.maxOutputBytes ?? 1024 * 1024
        let child
        try {
            child = spawn(executable, [...args], {
                cwd: options.cwd,
                env: process.env,
                stdio: ["pipe", "pipe", "pipe"],
                windowsHide: true
            })
        } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)))
            return
        }
        let settled = false
        let stdout = ""
        let stderr = ""
        let truncated = false
        const fail = (error: Error): void => {
            if (settled) {return}
            settled = true
            clearTimeout(timer)
            reject(error)
        }
        const timer = setTimeout(() => {
            child.kill("SIGTERM")
            fail(new Error(`CLI invocation timed out after ${options.timeoutMs}ms`))
        }, options.timeoutMs)
        child.stdout.setEncoding("utf8")
        child.stderr.setEncoding("utf8")
        child.stdout.on("data", (chunk: string) => {
            if (stdout.length < maxOutput) {stdout += chunk}
            else if (!truncated) {
                truncated = true
                child.kill("SIGTERM")
                fail(new Error("CLI output exceeded the safety cap"))
            }
        })
        child.stderr.on("data", (chunk: string) => {
            stderr = `${stderr}${chunk}`.slice(-2_048)
        })
        child.once("error", error => fail(error))
        child.once("exit", code => {
            if (settled) {return}
            settled = true
            clearTimeout(timer)
            if (code === 0) {
                resolve(stdout)
            } else {
                const tail = stderr.trim()
                reject(new Error(`CLI exited with code ${code ?? "unknown"}${tail ? `: ${tail.slice(0, 300)}` : ""}`))
            }
        })
        if (options.input !== undefined) {
            child.stdin.write(options.input)
        }
        child.stdin.end()
    })

const withTempWorkspace = async <T>(prefix: string, run: (workdir: string) => Promise<T>): Promise<T> => {
    const workdir = await mkdtemp(join(tmpdir(), prefix))
    try {
        return await run(workdir)
    } finally {
        await rm(workdir, {recursive: true, force: true}).catch(() => {})
    }
}

// ── Kimi CLI：--prompt 非交互模式，--output-format text ─────────────────────
export class KimiCliProvider implements StructuredPlanningProvider {
    readonly #executable: string
    readonly #model: string | null
    readonly #timeoutMs: number

    constructor(executable: string, model: string | null = null) {
        this.#executable = executable
        this.#model = model
        this.#timeoutMs = Number(process.env.DAWDEX_KIMI_TIMEOUT_MS ?? "90000")
    }

    async createCreativeBrief(prompt: string, snapshot: ProjectSnapshot): Promise<CreativeBrief> {
        const text = await this.#run(
            `${CREATIVE_DIRECTOR_INSTRUCTIONS}${BRIEF_SCHEMA_HINT}${NO_TOOLS_RULE}\n\n${createCreativeDirectorInput(prompt, snapshot)}`
        )
        return parseCreativeBrief(extractJson(text))
    }

    async createPlan(
        prompt: string,
        snapshot: ProjectSnapshot,
        brief: CreativeBrief,
        candidates: ReadonlyArray<MidiCandidate>,
        bundles: ReadonlyArray<MidiBundle>
    ): Promise<PlanOutput> {
        const text = await this.#run(
            `${PRODUCER_INSTRUCTIONS}${PRODUCER_SCHEMA_HINT}${NO_TOOLS_RULE}\n\n${createProducerInput(prompt, snapshot, brief, candidates, bundles)}`
        )
        return parseProducerPlan(extractJson(text), {prompt, snapshot})
    }

    async #run(fullPrompt: string): Promise<string> {
        const args = ["--prompt", fullPrompt, "--output-format", "text"]
        // --model 只在用户做出经过校验的非默认选择时追加
        if (this.#model !== null && this.#model !== "default") {args.push("--model", this.#model)}
        // 不传 --auto / --yolo：意外的权限请求无法被自动批准，会随超时终止
        return withTempWorkspace("dawdex-kimi-", workdir =>
            runCli(this.#executable, args, {timeoutMs: this.#timeoutMs, cwd: workdir}))
    }
}

// ── Qoder CLI：-p 打印模式 + stream-json，prompt 走 stdin ────────────────────
export class QoderCliProvider implements StructuredPlanningProvider {
    readonly #executable: string
    readonly #model: string | null
    readonly #timeoutMs: number

    constructor(executable: string, model: string | null = null) {
        this.#executable = executable
        this.#model = model
        this.#timeoutMs = Number(process.env.DAWDEX_QODER_TIMEOUT_MS ?? "90000")
    }

    async createCreativeBrief(prompt: string, snapshot: ProjectSnapshot): Promise<CreativeBrief> {
        const text = await this.#run(
            `${CREATIVE_DIRECTOR_INSTRUCTIONS}${BRIEF_SCHEMA_HINT}${NO_TOOLS_RULE}\n\n${createCreativeDirectorInput(prompt, snapshot)}`
        )
        return parseCreativeBrief(extractJson(text))
    }

    async createPlan(
        prompt: string,
        snapshot: ProjectSnapshot,
        brief: CreativeBrief,
        candidates: ReadonlyArray<MidiCandidate>,
        bundles: ReadonlyArray<MidiBundle>
    ): Promise<PlanOutput> {
        const text = await this.#run(
            `${PRODUCER_INSTRUCTIONS}${PRODUCER_SCHEMA_HINT}${NO_TOOLS_RULE}\n\n${createProducerInput(prompt, snapshot, brief, candidates, bundles)}`
        )
        return parseProducerPlan(extractJson(text), {prompt, snapshot})
    }

    async #run(fullPrompt: string): Promise<string> {
        return withTempWorkspace("dawdex-qoder-", async workdir => {
            const args = [
                "-p",
                "--output-format", "stream-json",
                "--permission-mode", "dont_ask", // 失败即关闭，不会打开审批提示
                "--tools", "", // 移除内置工具：只要结构化规划，不要自主改动
                "--no-session-persistence",
                "--max-output-tokens", "8192",
                "-w", workdir
            ]
            if (this.#model !== null && this.#model !== "default") {args.push("--model", this.#model)}
            const output = await runCli(this.#executable, args, {
                input: fullPrompt,
                timeoutMs: this.#timeoutMs,
                cwd: workdir
            })
            return parseQoderStreamJson(output)
        })
    }
}

// 解析 Qoder stream-json（JSONL）：拼接 assistant 文本块；result 记录 is_error 即失败
const parseQoderStreamJson = (output: string): string => {
    const texts: Array<string> = []
    let resultError: string | null = null
    let sawResult = false
    for (const line of output.split("\n")) {
        const trimmed = line.trim()
        if (trimmed.length === 0) {continue}
        let record: unknown
        try {
            record = JSON.parse(trimmed)
        } catch {
            continue // 容忍非 JSON 行（横幅/进度输出）
        }
        if (!isObject(record)) {continue}
        if (record.type === "assistant" && isObject(record.message)) {
            const content = record.message.content
            if (Array.isArray(content)) {
                for (const block of content) {
                    if (isObject(block) && block.type === "text" && typeof block.text === "string") {
                        texts.push(block.text)
                    }
                }
            }
        } else if (record.type === "result") {
            sawResult = true
            if (record.is_error === true) {
                resultError = typeof record.result === "string"
                    ? record.result
                    : typeof record.error === "string" ? record.error : "Qoder CLI reported an error"
            } else if (typeof record.result === "string" && texts.length === 0) {
                texts.push(record.result)
            }
        }
    }
    if (resultError !== null) {throw new Error(resultError)}
    const text = texts.join("").trim()
    if (text.length === 0) {
        throw new Error(sawResult
            ? "Qoder CLI completed without assistant text"
            : "Qoder CLI output did not contain stream-json records")
    }
    return text
}
