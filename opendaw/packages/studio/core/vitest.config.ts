import {defineConfig} from "vitest/config"
import * as path from "node:path"

export default defineConfig({
    test: {
        globals: true,
        environment: "jsdom"
    },
    esbuild: {
        target: "ESNext"
    },
    resolve: {
        alias: {
            "@test-files": path.resolve(__dirname, "../../../test-files")
        }
    }
})