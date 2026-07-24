import {describe, it} from "vitest"
import {fileURLToPath} from "url"
import * as path from "node:path"
import * as fs from "node:fs"
import {DawProject} from "./DawProject"
import {DawProjectImport} from "./DawProjectImporter"

describe("DawProjectImport", () => {
    it("import", async () => {
        const __dirname = path.dirname(fileURLToPath(import.meta.url))
        const testFile = "../../../../../test-files/eq.dawproject"
        const buffer = fs.readFileSync(path.join(__dirname, testFile))
        const {project, resources} = await DawProject.decode(buffer)
        const {skeleton} = await DawProjectImport.read(project, resources)
    })
})