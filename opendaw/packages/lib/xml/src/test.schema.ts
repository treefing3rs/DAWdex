import {Xml} from "./index"

export abstract class BookSchema {
    @Xml.Attribute("title", Xml.StringRequired)
    readonly title!: string

    @Xml.Attribute("author", Xml.StringRequired)
    readonly author!: string
}

@Xml.Class("Shelf")
export class ShelfSchema {
    @Xml.Attribute("id", Xml.StringRequired)
    readonly id!: string

    @Xml.ElementRef(BookSchema)
    readonly books?: BookSchema[]
}

@Xml.Class("Review")
export class ReviewSchema {
    @Xml.Attribute("score", Xml.NumberRequired)
    readonly score!: number

    @Xml.Element("text", String)
    readonly text?: string
}

@Xml.Class("Novel")
export class NovelSchema extends BookSchema {
    @Xml.Attribute("pages", Xml.NumberOptional)
    readonly pages?: number

    @Xml.Element("Review", ReviewSchema)
    readonly review?: ReviewSchema
}

@Xml.Class("Comic")
export class ComicSchema extends BookSchema {
    @Xml.Attribute("illustrator", Xml.StringOptional)
    readonly illustrator?: string

    @Xml.Element("Review", ReviewSchema)
    readonly review?: ReviewSchema
}

@Xml.Class("Textbook")
export class TextbookSchema extends BookSchema {
    @Xml.Attribute("edition", Xml.NumberOptional)
    readonly edition?: number
}

@Xml.Class("Section")
export class SectionSchema {
    @Xml.Attribute("id", Xml.StringRequired)
    readonly id!: string

    @Xml.Attribute("name", Xml.StringRequired)
    readonly name!: string

    @Xml.ElementRef(ShelfSchema)
    readonly shelves!: ShelfSchema[]
}

@Xml.Class("Library")
export class LibrarySchema {
    @Xml.Attribute("name", Xml.StringRequired)
    readonly name!: string

    @Xml.Attribute("location", Xml.StringOptional)
    readonly location?: string

    @Xml.ElementRef(SectionSchema, "Sections")
    readonly sections!: SectionSchema[]
}