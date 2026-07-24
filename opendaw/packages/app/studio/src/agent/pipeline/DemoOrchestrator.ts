/**
 * Demo Orchestrator — drives the sequential track entry and project reset for live demos.
 *
 * This is the runtime glue between the pipeline (data) and the DAW (audio engine).
 * It uses setTimeout to stagger track creation, emits state events for the UI,
 * and provides a reset function to return the project to a clean state.
 */

import {clamp} from "@opendaw/lib-std"
import {PPQN} from "@opendaw/lib-dsp"
import {InstrumentFactories} from "@opendaw/studio-adapters"
import type {StudioService} from "@/service/StudioService"
import type {PreparedMusicPart} from "./MidiPipeline"
import type {MusicRole} from "./QualityGate"
import {scheduleSequential} from "./SequentialScheduler"
import {runDemoSession} from "./DemoSession"

// ─── Types ───────────────────────────────────────────────────────────────────

export type RoleState = "waiting" | "preparing" | "queued" | "performing" | "failed"

export type OrchestratorEvent =
    | { readonly type: "role.stateChanged"; readonly role: MusicRole; readonly state: RoleState }
    | { readonly type: "track.added"; readonly role: MusicRole; readonly noteCount: number }
    | { readonly type: "demo.started"; readonly energy: string }
    | { readonly type: "demo.completed"; readonly usedFallback: boolean }
    | { readonly type: "demo.reset" }

export type OrchestratorListener = (event: OrchestratorEvent) => void

// ─── Orchestrator ────────────────────────────────────────────────────────────

export class DemoOrchestrator {
    readonly #service: StudioService
    readonly #listeners: Set<OrchestratorListener> = new Set()
    readonly #pendingTimers: Set<ReturnType<typeof setTimeout>> = new Set()
    readonly #createdTrackNames: Set<string> = new Set()
    #isRunning = false

    constructor(service: StudioService) {
        this.#service = service
    }

    // ─── Public API ──────────────────────────────────────────────────────────

    get isRunning(): boolean { return this.#isRunning }

    /**
     * Subscribe to orchestrator events (for UI integration).
     */
    subscribe(listener: OrchestratorListener): () => void {
        this.#listeners.add(listener)
        return () => this.#listeners.delete(listener)
    }

    /**
     * Run a complete demo session: parse prompt → prepare parts → schedule → write to DAW.
     * Tracks are added one at a time with real timing delays.
     * Automatically creates a new project if none is open.
     */
    async run(prompt: string): Promise<void> {
        if (this.#isRunning) {
            console.log("[DAWdex] Demo already running, ignoring input:", prompt)
            return
        }

        // If tracks are already written, reset first so new input feels fresh
        if (this.#createdTrackNames.size > 0) {
            this.reset()
            // Small delay so UI shows reset before re-building
            await new Promise(r => setTimeout(r, 300))
        }

        this.#isRunning = true

        // Auto-create project if needed
        if (!this.#service.hasProfile) {
            await this.#service.newProject()
        }
        if (!this.#service.hasProfile) {
            this.#isRunning = false
            this.#emit({type: "role.stateChanged", role: "drums", state: "failed"})
            return
        }

        // Prepare the arrangement
        const result = await runDemoSession(prompt)
        this.#emit({type: "demo.started", energy: result.energy})

        // Schedule sequential entry
        const schedule = scheduleSequential(result.parts)

        // Set up timed writes
        for (const entry of schedule) {
            const role = entry.part.role

            // Immediately mark as "preparing"
            const prepTimer = setTimeout(() => {
                this.#emit({type: "role.stateChanged", role, state: "preparing"})
            }, Math.max(0, entry.delayMs - 2000))
            this.#pendingTimers.add(prepTimer)

            // Mark as "queued" 500ms before entry
            const queueTimer = setTimeout(() => {
                this.#emit({type: "role.stateChanged", role, state: "queued"})
            }, Math.max(0, entry.delayMs - 500))
            this.#pendingTimers.add(queueTimer)

            // Actually write the track at entry time
            const writeTimer = setTimeout(() => {
                this.#writeTrack(entry.part, entry.startBar)
                this.#emit({type: "role.stateChanged", role, state: "performing"})
                this.#emit({type: "track.added", role, noteCount: entry.part.notes.length})

                // Auto-play after first track (drums) is written
                if (this.#createdTrackNames.size === 1 && !this.#service.engine.isPlaying.getValue()) {
                    this.#service.engine.play()
                }

                // Check if all tracks are written
                if (this.#createdTrackNames.size >= schedule.length) {
                    this.#isRunning = false
                    this.#emit({type: "demo.completed", usedFallback: result.usedFallback})
                }
            }, entry.delayMs)
            this.#pendingTimers.add(writeTimer)
        }

        // Mark all roles as "waiting" initially
        for (const entry of schedule) {
            this.#emit({type: "role.stateChanged", role: entry.part.role, state: "waiting"})
        }
    }

    /**
     * Stop any in-progress demo and cancel pending track additions.
     */
    stop(): void {
        for (const timer of this.#pendingTimers) {
            clearTimeout(timer)
        }
        this.#pendingTimers.clear()
        this.#isRunning = false
    }

    /**
     * Reset the project: remove all DAWdex-created tracks, restore to blank 120 BPM state.
     * The project can then be demo'd again from scratch.
     */
    reset(): void {
        this.stop()

        if (!this.#service.hasProfile) {
            this.#createdTrackNames.clear()
            this.#emit({type: "demo.reset"})
            return
        }

        const project = this.#service.project

        // Undo all DAWdex edits by repeatedly calling undo
        // (each pipeline write is one undo step)
        project.editing.modify(() => {
            // Reset BPM to 120
            project.api.setBpm(120)
        })

        // Undo all our edits (one per track we created)
        const undoCount = this.#createdTrackNames.size
        for (let i = 0; i < undoCount; i++) {
            if (project.editing.canUndo()) {
                project.editing.undo()
            }
        }

        this.#createdTrackNames.clear()
        this.#emit({type: "demo.reset"})
    }

    // ─── Private ─────────────────────────────────────────────────────────────

    #writeTrack(part: PreparedMusicPart, startBar: number): void {
        if (!this.#service.hasProfile) return
        const project = this.#service.project
        const name = `DAWdex ${part.role.charAt(0).toUpperCase() + part.role.slice(1)}`

        try {
            project.editing.modify(() => {
                const {trackBox} = project.api.createInstrument(
                    InstrumentFactories.Vaporisateur, {name}
                )
                const regionDuration = 4 * PPQN.Bar
                const region = project.api.createNoteRegion({
                    trackBox,
                    position: (startBar - 1) * PPQN.Bar,
                    duration: regionDuration,
                    name
                })
                for (const note of part.notes) {
                    project.api.createNoteEvent({
                        owner: region,
                        position: note.position,
                        duration: note.duration,
                        pitch: clamp(Math.round(note.pitch), 0, 127),
                        velocity: clamp(note.velocity, 0.0, 1.0)
                    })
                }
            })
            this.#createdTrackNames.add(name)
        } catch (e) {
            console.warn(`[DAWdex] Failed to write track ${name}:`, e)
            this.#emit({type: "role.stateChanged", role: part.role, state: "failed"})
        }
    }

    #emit(event: OrchestratorEvent): void {
        for (const listener of this.#listeners) {
            try { listener(event) } catch { /* swallow listener errors */ }
        }
    }
}
