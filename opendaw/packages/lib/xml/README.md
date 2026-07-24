_This package is part of the openDAW SDK_

# @opendaw/lib-xml

Library to parse and serialize XML with validator in a typed schema.

### Schema

```typescript
import {Xml} from "@opendaw/lib-xml"

export enum Unit {
    LINEAR = "linear",
    NORMALIZED = "normalized",
    PERCENT = "percent",
    DECIBEL = "decibel",
    HERTZ = "hertz",
    SEMITONES = "semitones",
    SECONDS = "seconds",
    BEATS = "beats",
    BPM = "bpm"
}

@Xml.Class("Application")
export class ApplicationSchema {
    @Xml.Attribute("name", Xml.StringRequired)
    readonly name!: string

    @Xml.Attribute("version", Xml.StringRequired)
    readonly version!: string
}

@Xml.Class("RealParameter")
export class RealParameterSchema {
    @Xml.Attribute("value", Xml.NumberOptional)
    readonly value?: number

    @Xml.Attribute("unit")
    readonly unit!: Unit

    @Xml.Attribute("min", Xml.NumberOptional)
    readonly min?: number

    @Xml.Attribute("max", Xml.NumberOptional)
    readonly max?: number
}

@Xml.Class("TimeSignature")
export class TimeSignatureParameterSchema {
    @Xml.Attribute("nominator", Xml.NumberOptional)
    readonly nominator?: number

    @Xml.Attribute("denominator", Xml.NumberOptional)
    readonly denominator?: number
}

@Xml.Class("Transport")
export class TransportSchema {
    @Xml.Element("Tempo", RealParameterSchema)
    readonly tempo?: RealParameterSchema

    @Xml.Element("TimeSignature", TimeSignatureParameterSchema)
    readonly timeSignature?: TimeSignatureParameterSchema
}

@Xml.Class("Project")
export class ProjectSchema {
    @Xml.Attribute("version", Xml.StringRequired)
    readonly version!: "1.0"

    @Xml.Element("Application", ApplicationSchema)
    readonly application!: ApplicationSchema

    @Xml.Element("Transport", TransportSchema)
    readonly transport?: TransportSchema

    @Xml.Element("Structure", Array)
    readonly structure!: ReadonlyArray<LaneSchema>

    @Xml.Element("Arrangement", ArrangementSchema)
    readonly arrangement?: ArrangementSchema

    @Xml.Element("Scenes", Array)
    readonly scenes?: ReadonlyArray<SceneSchema>
}

// ...
```

### Example

```typescript
const project = Xml.element({
    version: "1.0",
    application: Xml.element({
        name: "openDAW",
        version: "0.1"
    }, ApplicationSchema),
    transport: Xml.element({
        tempo: Xml.element({
            unit: Unit.BPM,
            value: 120
        }, RealParameterSchema),
        timeSignature: Xml.element({
            nominator: 4,
            denominator: 4
        }, TimeSignatureParameterSchema)
    }, TransportSchema),
    structure: [
        Xml.element({
            id: "0",
            contentType: "notes",
            channel: Xml.element({
                audioChannels: 2,
                mute: Xml.element({value: true}, BooleanParameterSchema)
            }, ChannelSchema),
            tracks: [
                Xml.element({
                    id: "01",
                    contentType: "audio"
                }, TrackSchema),
                Xml.element({
                    id: "02",
                    contentType: "audio"
                }, TrackSchema)
            ]
        }, TrackSchema),
        Xml.element({
            id: "1",
            contentType: "audio"
        }, TrackSchema)
    ]
}, ProjectSchema)

console.debug(Xml.pretty(Xml.toElement("Project", project)))
```

### Result

```xml
<Project version="1.0">
    <Application name="openDAW" version="0.1"/>
    <Transport>
        <Tempo unit="bpm" value="120"/>
        <TimeSignature nominator="4" denominator="4"/>
    </Transport>
    <Structure>
        <Track id="0" contentType="notes">
            <Channel audioChannels="2">
                <Mute value="true"/>
            </Channel>
            <Track>
                <Track id="01" contentType="audio"/>
                <Track id="02" contentType="audio"/>
            </Track>
        </Track>
        <Track id="1" contentType="audio"/>
    </Structure>
</Project>
```