import "@/monaco/imports"
import * as monaco from "monaco-editor"

const shadertoyGlobals = [
    "iResolution", "iTime", "iBeat", "iPeaks", "iTimeDelta", "iFrame",
    "iChannelResolution", "iChannel0", "iMidiCC", "iMidiNotes"
]

const shadertoyFunctions = [
    "midiCC",
    "midiNote"
]

const glslTypes = [
    "void", "bool", "int", "uint", "float", "double",
    "vec2", "vec3", "vec4", "ivec2", "ivec3", "ivec4",
    "uvec2", "uvec3", "uvec4", "bvec2", "bvec3", "bvec4",
    "mat2", "mat3", "mat4", "mat2x2", "mat2x3", "mat2x4",
    "mat3x2", "mat3x3", "mat3x4", "mat4x2", "mat4x3", "mat4x4",
    "sampler2D", "sampler3D", "samplerCube"
]

const glslKeywords = [
    "const", "uniform", "in", "out", "inout",
    "if", "else", "for", "while", "do", "switch", "case", "default",
    "break", "continue", "return", "discard",
    "struct", "precision", "highp", "mediump", "lowp"
]

const glslBuiltins = [
    "radians", "degrees", "sin", "cos", "tan", "asin", "acos", "atan",
    "sinh", "cosh", "tanh", "asinh", "acosh", "atanh",
    "pow", "exp", "log", "exp2", "log2", "sqrt", "inversesqrt",
    "abs", "sign", "floor", "ceil", "trunc", "round", "fract",
    "mod", "min", "max", "clamp", "mix", "step", "smoothstep",
    "length", "distance", "dot", "cross", "normalize", "faceforward",
    "reflect", "refract", "matrixCompMult", "outerProduct", "transpose",
    "determinant", "inverse", "lessThan", "lessThanEqual", "greaterThan",
    "greaterThanEqual", "equal", "notEqual", "any", "all", "not",
    "texture", "textureProj", "textureLod", "textureGrad",
    "texelFetch", "dFdx", "dFdy", "fwidth"
]

const uniformDetails: Record<string, string> = {
    iResolution: "vec3 – viewport resolution (width, height, 1.0)",
    iTime: "float – elapsed time in seconds",
    iTimeDelta: "float – time since last frame in seconds",
    iFrame: "int – frame counter",
    iChannelResolution: "vec3[1] – resolution of iChannel0 (512, 2, 1)",
    iChannel0: "sampler2D – audio texture (row 0 = waveform, row 1 = spectrum)",
    iMidiCC: "sampler2D – MIDI CC values (128x1 texture, use midiCC() to access)",
    iMidiNotes: "sampler2D – MIDI note velocities (128x1 texture, use midiNote() to access)"
}

const functionDetails: Record<string, string> = {
    midiCC: "float midiCC(int cc) – returns MIDI CC value (0.0-1.0) for controller 0-127",
    midiNote: "float midiNote(int pitch) – returns velocity (0.0-1.0) if note is on, 0.0 if off"
}

const allDetails = {...uniformDetails, ...functionDetails}

monaco.languages.register({id: "glsl"})

monaco.languages.setMonarchTokensProvider("glsl", {
    shadertoyGlobals,
    shadertoyFunctions,
    glslTypes,
    glslKeywords,
    glslBuiltins,
    tokenizer: {
        root: [
            [/[a-zA-Z_]\w*/, {
                cases: {
                    "@shadertoyGlobals": "variable.predefined",
                    "@shadertoyFunctions": "support.function",
                    "@glslTypes": "type",
                    "@glslKeywords": "keyword",
                    "@glslBuiltins": "support.function",
                    "@default": "identifier"
                }
            }],
            [/\/\/.*$/, "comment"],
            [/\/\*/, "comment", "@comment"],
            [/#\s*\w+/, "keyword.preprocessor"],
            [/\d+\.\d*([eE][-+]?\d+)?/, "number.float"],
            [/\d*\.\d+([eE][-+]?\d+)?/, "number.float"],
            [/\d+[eE][-+]?\d+/, "number.float"],
            [/\d+/, "number"],
            [/[{}()\[\]]/, "delimiter.bracket"],
            [/[<>](?!@)/, "delimiter.angle"],
            [/[;,.]/, "delimiter"],
            [/[+\-*/%&|^!~=<>?:]/, "operator"]
        ],
        comment: [
            [/[^/*]+/, "comment"],
            [/\*\//, "comment", "@pop"],
            [/[/*]/, "comment"]
        ]
    }
})

monaco.languages.setLanguageConfiguration("glsl", {
    comments: {
        lineComment: "//",
        blockComment: ["/*", "*/"]
    },
    brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"]
    ],
    autoClosingPairs: [
        {open: "{", close: "}"},
        {open: "[", close: "]"},
        {open: "(", close: ")"},
        {open: "\"", close: "\""}
    ],
    surroundingPairs: [
        {open: "{", close: "}"},
        {open: "[", close: "]"},
        {open: "(", close: ")"},
        {open: "\"", close: "\""}
    ]
})

monaco.languages.registerCompletionItemProvider("glsl", {
    provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position)
        const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn
        }
        const suggestions: monaco.languages.CompletionItem[] = [
            ...shadertoyGlobals.map(name => ({
                label: name,
                kind: monaco.languages.CompletionItemKind.Variable,
                insertText: name,
                detail: uniformDetails[name],
                range
            })),
            ...shadertoyFunctions.map(name => ({
                label: name,
                kind: monaco.languages.CompletionItemKind.Function,
                insertText: name + "($0)",
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                detail: functionDetails[name],
                range
            })),
            ...glslBuiltins.map(name => ({
                label: name,
                kind: monaco.languages.CompletionItemKind.Function,
                insertText: name + "($0)",
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range
            })),
            ...glslTypes.map(name => ({
                label: name,
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: name,
                range
            })),
            ...glslKeywords.map(name => ({
                label: name,
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: name,
                range
            })),
            {
                label: "mainImage",
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText: "void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n\t$0\n}",
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                detail: "Shadertoy entry point",
                range
            }
        ]
        return {suggestions}
    }
})

monaco.languages.registerHoverProvider("glsl", {
    provideHover: (model, position) => {
        const word = model.getWordAtPosition(position)
        if (!word) return null
        const detail = allDetails[word.word]
        if (!detail) return null
        return {
            range: {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn
            },
            contents: [{value: `**${word.word}**\n\n${detail}`}]
        }
    }
})

export {monaco}
export type Monaco = typeof monaco