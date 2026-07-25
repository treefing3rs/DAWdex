import {spawn} from "node:child_process"
import {constants} from "node:fs"
import {access, mkdir, readFile, rename, writeFile} from "node:fs/promises"
import {homedir} from "node:os"
import {delimiter, join} from "node:path"

// ── DAWdex Local CLI Runtime Adapter ─────────────────────────────────────────
// 设计：docs/superpowers/specs/2026-07-25-local-cli-runtime-adapter-design.md
// 边界：只扫描注册表内的命令；只有服务端解析出的路径可以被启动；
// 不读取/复制任何 CLI 凭据；任何运行时失败都不允许改动工程状态。

export type LocalRuntimeId = "codex" | "kimi" | "qoder"
export type RuntimeAuthState = "unknown" | "authenticated" | "unauthenticated"

export type RuntimeModel = {
    readonly id: string
    readonly label: string
}

export type RuntimeSummary = {
    readonly id: LocalRuntimeId
    readonly name: string
    readonly available: boolean
    readonly selectable: boolean
    readonly displayPath: string | null
    readonly version: string | null
    readonly authState: RuntimeAuthState
    readonly models: ReadonlyArray<RuntimeModel>
    readonly modelsSource: "live" | "default" | "fallback"
    readonly diagnostic: string | null
    // 服务端内部使用：解析出的真实可执行路径，绝不出现在 HTTP 响应里
    readonly executable?: string
}

export type RuntimeSelection =
    | {readonly mode: "auto", readonly runtimeId: null, readonly model: null}
    | {readonly mode: "local-cli", readonly runtimeId: LocalRuntimeId, readonly model: string | null}
    | {readonly mode: "api-key", readonly runtimeId: null, readonly model: null}

export type PublicSelection = RuntimeSelection & {readonly lockedByEnvironment: boolean}

export type RuntimeSnapshot = {
    readonly scan: {
        readonly state: "complete"
        readonly startedAt: string
        readonly completedAt: string
    }
    readonly selection: PublicSelection
    readonly runtimes: ReadonlyArray<RuntimeSummary>
}

export type RuntimeSelectionInput = {
    readonly mode: "auto" | "local-cli" | "api-key"
    readonly runtimeId?: string | null
    readonly model?: string | null
}

export class SelectionError extends Error {
    readonly status: number
    constructor(status: number, message: string) {
        super(message)
        this.status = status
    }
}

type LocalCliDefinition = {
    readonly id: LocalRuntimeId
    readonly name: string
    readonly command: string
    readonly fallbackCommands: ReadonlyArray<string>
    readonly versionArgs: ReadonlyArray<string>
    readonly versionProbeTimeoutMs: number
    readonly supportsModelOverride: boolean
}

// 注册表：声明式定义，不含文件系统扫描与子进程状态
const REGISTRY: ReadonlyArray<LocalCliDefinition> = [
    {
        id: "codex",
        name: "Codex CLI",
        command: "codex",
        fallbackCommands: [],
        versionArgs: ["--version"],
        versionProbeTimeoutMs: 3_000,
        supportsModelOverride: false // 模型由 DAWDEX_CODEX_MODEL 运维覆盖
    },
    {
        id: "kimi",
        name: "Kimi CLI",
        command: "kimi",
        fallbackCommands: ["kimi-cli"],
        versionArgs: ["--version"],
        versionProbeTimeoutMs: 3_000,
        supportsModelOverride: true
    },
    {
        id: "qoder",
        name: "Qoder CLI",
        command: "qodercli",
        fallbackCommands: ["qoder"],
        versionArgs: ["--version"],
        versionProbeTimeoutMs: 3_000,
        supportsModelOverride: true
    }
]

const QODER_FALLBACK_MODELS: ReadonlyArray<string> = ["lite", "efficient", "auto", "performance", "ultimate"]

const DEFAULT_MODELS: ReadonlyArray<RuntimeModel> = [{id: "default", label: "Default (CLI config)"}]

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null

const errorMessage = (value: unknown): string =>
    value instanceof Error ? value.message : String(value)

// GUI 安全搜索路径：保留服务器自身 PATH，追加常见用户工具链目录
const buildSearchPath = (): Array<string> => {
    const home = homedir()
    const inherited = (process.env.PATH ?? "").split(delimiter).filter(entry => entry.length > 0)
    const extras = [
        join(home, ".local", "bin"),
        join(home, ".npm-global", "bin"),
        join(home, ".bun", "bin"),
        join(home, ".cargo", "bin"),
        "/opt/homebrew/bin",
        "/usr/local/bin"
    ]
    const seen = new Set<string>()
    return [...inherited, ...extras].filter(dir => {
        if (seen.has(dir)) {return false}
        seen.add(dir)
        return true
    })
}

const executableCandidates = (command: string): Array<string> =>
    process.platform === "win32" ? [`${command}.exe`, `${command}.cmd`, `${command}.bat`, command] : [command]

const resolveExecutable = async (
    searchPath: ReadonlyArray<string>,
    definition: LocalCliDefinition
): Promise<string | null> => {
    for (const command of [definition.command, ...definition.fallbackCommands]) {
        for (const dir of searchPath) {
            for (const candidate of executableCandidates(command)) {
                const path = join(dir, candidate)
                if (await access(path, constants.X_OK).then(() => true, () => false)) {
                    return path
                }
            }
        }
    }
    return null
}

// 有界版本探测：证明解析出的可执行文件真的能启动
const probeVersion = (
    executable: string,
    args: ReadonlyArray<string>,
    timeoutMs: number
): Promise<{started: boolean, version: string | null, diagnostic: string | null}> =>
    new Promise(resolve => {
        let child
        try {
            child = spawn(executable, [...args], {stdio: ["ignore", "pipe", "pipe"], windowsHide: true})
        } catch (error) {
            resolve({started: false, version: null, diagnostic: errorMessage(error)})
            return
        }
        let settled = false
        let stdout = ""
        let stderr = ""
        const finish = (result: {started: boolean, version: string | null, diagnostic: string | null}): void => {
            if (settled) {return}
            settled = true
            clearTimeout(timer)
            resolve(result)
        }
        const timer = setTimeout(() => {
            child.kill("SIGTERM")
            finish({started: true, version: null, diagnostic: `version probe timed out after ${timeoutMs}ms`})
        }, timeoutMs)
        child.stdout.setEncoding("utf8")
        child.stderr.setEncoding("utf8")
        child.stdout.on("data", (chunk: string) => {
            if (stdout.length < 4_096) {stdout += chunk}
        })
        child.stderr.on("data", (chunk: string) => {
            if (stderr.length < 2_048) {stderr += chunk}
        })
        child.once("error", (error: NodeJS.ErrnoException) => {
            const unavailable = ["ENOENT", "ENOTDIR", "EACCES"].includes(error.code ?? "")
            finish({
                started: !unavailable,
                version: null,
                diagnostic: unavailable ? `cannot spawn: ${error.code}` : errorMessage(error)
            })
        })
        child.once("exit", code => {
            if (code === 126 || code === 127) {
                finish({started: false, version: null, diagnostic: `version command exited ${code}`})
                return
            }
            const firstLine = stdout.split("\n").map(line => line.trim()).find(line => line.length > 0) ?? null
            if (code === 0) {
                finish({started: true, version: firstLine, diagnostic: null})
                return
            }
            // 程序确实启动了，只是版本参数失败：可用、版本未知
            finish({
                started: true,
                version: null,
                diagnostic: `version command exited ${code}${stderr.trim() ? `: ${stderr.trim().slice(0, 120)}` : ""}`
            })
        })
    })

// Qoder 实时模型列表：--list-models，失败时回退到文档化的五档
const probeQoderModels = (
    executable: string
): Promise<{models: ReadonlyArray<RuntimeModel>, source: "live" | "fallback"}> =>
    new Promise(resolve => {
        let child
        try {
            child = spawn(executable, ["--list-models"], {stdio: ["ignore", "pipe", "pipe"], windowsHide: true})
        } catch {
            resolve({models: QODER_FALLBACK_MODELS.map(id => ({id, label: id})), source: "fallback"})
            return
        }
        let stdout = ""
        const timer = setTimeout(() => {
            child.kill("SIGTERM")
            resolve({models: QODER_FALLBACK_MODELS.map(id => ({id, label: id})), source: "fallback"})
        }, 5_000)
        child.stdout.setEncoding("utf8")
        child.stdout.on("data", (chunk: string) => {
            if (stdout.length < 16_384) {stdout += chunk}
        })
        child.once("error", () => {
            clearTimeout(timer)
            resolve({models: QODER_FALLBACK_MODELS.map(id => ({id, label: id})), source: "fallback"})
        })
        child.once("exit", code => {
            clearTimeout(timer)
            if (code !== 0) {
                resolve({models: QODER_FALLBACK_MODELS.map(id => ({id, label: id})), source: "fallback"})
                return
            }
            const ids = stdout.split("\n")
                .map(line => line.trim())
                .filter(line => /^[\w][\w.\-:]{0,63}$/.test(line))
                .filter((line, index, all) => all.indexOf(line) === index)
                .slice(0, 12)
            if (ids.length === 0) {
                resolve({models: QODER_FALLBACK_MODELS.map(id => ({id, label: id})), source: "fallback"})
                return
            }
            resolve({models: ids.map(id => ({id, label: id})), source: "live"})
        })
    })

const displayPath = (path: string): string => {
    const home = homedir()
    return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path
}

type ProbeCodexAuth = () => Promise<RuntimeAuthState>

export class LocalRuntimeService {
    readonly #searchPath: Array<string>
    readonly #selectionFile: string
    readonly #probeCodexAuth: ProbeCodexAuth | null
    #snapshot: RuntimeSnapshot | null = null
    #inflightScan: Promise<RuntimeSnapshot> | null = null
    #scanListeners: Array<(runtime: RuntimeSummary) => void> = []

    constructor(options: {stateDir?: string, probeCodexAuth?: ProbeCodexAuth} = {}) {
        this.#searchPath = buildSearchPath()
        const stateDir = options.stateDir ?? process.env.DAWDEX_STATE_DIR ?? join(homedir(), ".dawdex")
        this.#selectionFile = join(stateDir, "runtime-selection.json")
        this.#probeCodexAuth = options.probeCodexAuth ?? null
    }

    // 环境变量运维锁定：设置具体 provider 时，UI 选择被忽略并在状态里标明
    #environmentLock(): boolean {
        const preference = process.env.DAWDEX_AGENT_PROVIDER
        return preference === "codex" || preference === "openai" || preference === "kimi" || preference === "qoder"
    }

    async snapshot(): Promise<RuntimeSnapshot> {
        if (this.#snapshot !== null) {return this.#publicSnapshot(this.#snapshot)}
        return this.scan(() => {})
    }

    // 并发扫描共享同一个 in-flight Promise；每个完成的探测即时推给监听者
    async scan(onRuntime: (runtime: RuntimeSummary) => void): Promise<RuntimeSnapshot> {
        this.#scanListeners.push(onRuntime)
        try {
            if (this.#inflightScan === null) {
                this.#inflightScan = this.#runScan().finally(() => {
                    this.#inflightScan = null
                })
            }
            return this.#publicSnapshot(await this.#inflightScan)
        } finally {
            const index = this.#scanListeners.indexOf(onRuntime)
            if (index >= 0) {this.#scanListeners.splice(index, 1)}
        }
    }

    async select(input: RuntimeSelectionInput): Promise<RuntimeSnapshot> {
        if (this.#environmentLock()) {
            throw new SelectionError(409, "Runtime selection is locked by DAWDEX_AGENT_PROVIDER")
        }
        const mode = input.mode
        if (mode !== "auto" && mode !== "local-cli" && mode !== "api-key") {
            throw new SelectionError(400, `Unknown execution mode "${String(mode)}"`)
        }
        let selection: RuntimeSelection
        if (mode === "local-cli") {
            const runtimeId = input.runtimeId
            const definition = REGISTRY.find(entry => entry.id === runtimeId)
            if (definition === undefined) {
                throw new SelectionError(400, `Unknown runtime "${String(runtimeId)}"`)
            }
            const snapshot = await this.#internalSnapshot()
            const summary = snapshot.runtimes.find(entry => entry.id === definition.id)
            if (summary === undefined || !summary.available || summary.executable === undefined) {
                throw new SelectionError(400, `${definition.name} is not available on this machine`)
            }
            const model = input.model ?? null
            if (model !== null) {
                if (!definition.supportsModelOverride) {
                    throw new SelectionError(400, `${definition.name} does not support model selection`)
                }
                if (!/^[\w][\w.\-:]{0,63}$/.test(model)) {
                    throw new SelectionError(400, "Invalid model identifier")
                }
                if (definition.id === "qoder" && !summary.models.some(entry => entry.id === model)) {
                    throw new SelectionError(400, `Model "${model}" is not offered by the installed Qoder CLI`)
                }
            }
            selection = {mode: "local-cli", runtimeId: definition.id, model}
        } else {
            selection = mode === "auto"
                ? {mode: "auto", runtimeId: null, model: null}
                : {mode: "api-key", runtimeId: null, model: null}
        }
        await this.#persist(selection)
        // 选择变化立即可见于下一次 snapshot 读取
        if (this.#snapshot !== null) {
            this.#snapshot = {...this.#snapshot, selection: {...selection, lockedByEnvironment: false}}
            return this.#publicSnapshot(this.#snapshot)
        }
        return this.snapshot()
    }

    // 当前生效选择（含环境锁定态），规划路由与状态端点共用
    async currentSelection(): Promise<PublicSelection> {
        if (this.#environmentLock()) {
            const stored = await this.#readStored()
            return {...stored, lockedByEnvironment: true}
        }
        return {...await this.#readStored(), lockedByEnvironment: false}
    }

    // 选中的本地运行时（供规划路由实例化 Provider）；不可用时返回 null
    async selectedRuntime(): Promise<RuntimeSummary | null> {
        const selection = await this.currentSelection()
        if (selection.mode !== "local-cli") {return null}
        const snapshot = await this.#internalSnapshot()
        const summary = snapshot.runtimes.find(entry => entry.id === selection.runtimeId) ?? null
        return summary !== null && summary.available && summary.executable !== undefined ? summary : null
    }

    // 内部快照：保留服务端专用字段（executable），不出 HTTP 边界
    async #internalSnapshot(): Promise<RuntimeSnapshot> {
        if (this.#snapshot === null) {await this.scan(() => {})}
        return this.#snapshot as RuntimeSnapshot
    }

    async #runScan(): Promise<RuntimeSnapshot> {
        const startedAt = new Date().toISOString()
        const previous = this.#snapshot
        const summaries = await Promise.all(REGISTRY.map(definition => this.#probeDefinition(definition)))
        // 之前选中、本次消失的运行时保留一行，方便设置屏解释失效状态
        const selection = await this.currentSelection()
        for (const summary of summaries) {
            for (const listener of this.#scanListeners) {listener(this.#publicSummary(summary))}
        }
        void previous
        const snapshot: RuntimeSnapshot = {
            scan: {state: "complete", startedAt, completedAt: new Date().toISOString()},
            selection,
            runtimes: summaries
        }
        this.#snapshot = snapshot
        return snapshot
    }

    async #probeDefinition(definition: LocalCliDefinition): Promise<RuntimeSummary> {
        const executable = await resolveExecutable(this.#searchPath, definition)
        if (executable === null) {
            return {
                id: definition.id,
                name: definition.name,
                available: false,
                selectable: false,
                displayPath: null,
                version: null,
                authState: "unknown",
                models: DEFAULT_MODELS,
                modelsSource: "default",
                diagnostic: "command not found"
            }
        }
        const probe = await probeVersion(executable, definition.versionArgs, definition.versionProbeTimeoutMs)
        if (!probe.started) {
            return {
                id: definition.id,
                name: definition.name,
                available: false,
                selectable: false,
                displayPath: displayPath(executable),
                version: null,
                authState: "unknown",
                models: DEFAULT_MODELS,
                modelsSource: "default",
                diagnostic: probe.diagnostic
            }
        }
        let authState: RuntimeAuthState = "unknown"
        if (definition.id === "codex" && this.#probeCodexAuth !== null) {
            authState = await this.#probeCodexAuth().catch((): RuntimeAuthState => "unknown")
        }
        let models: ReadonlyArray<RuntimeModel> = DEFAULT_MODELS
        let modelsSource: RuntimeSummary["modelsSource"] = "default"
        if (definition.id === "qoder") {
            const qoderModels = await probeQoderModels(executable)
            models = qoderModels.models
            modelsSource = qoderModels.source
        }
        return {
            id: definition.id,
            name: definition.name,
            available: true,
            selectable: true,
            displayPath: displayPath(executable),
            version: probe.version,
            authState,
            models,
            modelsSource,
            diagnostic: probe.diagnostic,
            executable
        }
    }

    // 出站快照：剥离服务端内部字段（真实可执行路径不出服务边界）
    #publicSummary(summary: RuntimeSummary): RuntimeSummary {
        const {executable: _executable, ...rest} = summary
        return rest
    }

    #publicSnapshot(snapshot: RuntimeSnapshot): RuntimeSnapshot {
        return {...snapshot, runtimes: snapshot.runtimes.map(entry => this.#publicSummary(entry))}
    }

    async #readStored(): Promise<RuntimeSelection> {
        let text: string
        try {
            text = await readFile(this.#selectionFile, "utf8")
        } catch {
            return {mode: "auto", runtimeId: null, model: null}
        }
        try {
            const value = JSON.parse(text) as unknown
            if (!isObject(value)) {throw new Error("not an object")}
            if (value.mode === "local-cli") {
                const runtimeId = value.runtimeId
                const model = value.model
                if (REGISTRY.some(entry => entry.id === runtimeId)
                    && (model === null || typeof model === "string")) {
                    return {mode: "local-cli", runtimeId: runtimeId as LocalRuntimeId, model: model as string | null}
                }
            } else if (value.mode === "api-key") {
                return {mode: "api-key", runtimeId: null, model: null}
            } else if (value.mode === "auto") {
                return {mode: "auto", runtimeId: null, model: null}
            }
        } catch {
            // 损坏的选择文件：忽略并回退 auto
        }
        return {mode: "auto", runtimeId: null, model: null}
    }

    async #persist(selection: RuntimeSelection): Promise<void> {
        const dir = join(this.#selectionFile, "..")
        await mkdir(dir, {recursive: true})
        const temporary = `${this.#selectionFile}.tmp`
        await writeFile(temporary, `${JSON.stringify(selection, null, 2)}\n`, "utf8")
        await rename(temporary, this.#selectionFile)
    }
}
