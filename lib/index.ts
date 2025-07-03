import * as Path from 'path';
import * as Hoek from '@hapi/hoek';
import MimeDb from 'mime-db/db.json' with { type: 'json' };


export type MimeSource = 'iana' | 'apache' | 'nginx';

type MimosSource = MimeSource | 'mime-db' | 'mimos';

// Helpers
type NoInfer<T> = [T][T extends any ? 0 : never];

export interface MimeDbEntry {

    /**
     * String with identifier for the source of the data.
     */
    source?: MimeSource;

    /**
     * Array of strings with possible lowercased file extensions, without the
     * dot.
     */
    extensions?: ReadonlyArray<string>;

    /**
     * Boolean that indicates if the contents is likely to become smaller if
     * gzip or similar compression is applied.
     */
    compressible?: boolean;

    /**
     * Charset for type.
     */
    charset?: string;
}

const compressibleRx = /^text\/|\+json$|\+text$|\+xml$/;


export class MimosEntry {
    /**
     * String with the content-type.
     */
    type: string;

    /**
     * String with identifier for the source of the data.
     */
    source: MimosSource;

    /**
     * Array of strings with possible lowercased file extensions, without the
     * dot.
     */
    extensions: string[];

    /**
     * Boolean that indicates if the contents is likely to become smaller if
     * gzip or similar compression is applied.
     */
    compressible: boolean;

    /**
     * Optional charset for type.
     */
    charset?: string;

    /**
     * Method with signature `function(mime)`.
     *
     * When this mime type is found in the database, this function will run.
     * This allows you to make customizations to `mime` based on developer criteria.
     */
    predicate?: (mime: MimosEntry) => MimosEntry;

    constructor(type: string, mime: MimeDbEntry) {

        this.type = type;
        this.source = 'mime-db';
        this.extensions = [];
        this.compressible = false;

        Object.assign(this, mime);

        if (mime.compressible === undefined) {
            this.compressible = compressibleRx.test(type);
        }
    }
}

export interface MimosDeclaration<P extends object = {}> extends MimeDbEntry {

    /**
     * The `type` value of result objects, defaults to `key`.
     */
    type?: string;

    /**
     * Method with signature `function(mime)`.
     *
     * When this mime type is found in the database, this function will run.
     * This allows you make customizations to `mime` based on developer criteria.
     */
    predicate?: (mime: MimosEntry & P) => MimosEntry;
}

class MimosDb {
    byType: Map<string, MimosEntry> = new Map();
    byExtension: Map<string, MimosEntry> = new Map();
    maxExtLength: number = 0;
}

export const insertEntry = (type: string, entry: MimosEntry, db: MimosDb) => {

    db.byType.set(type, entry);

    for (const ext of entry.extensions) {

        db.byExtension.set(ext, entry);

        if (ext.length > db.maxExtLength) {
            db.maxExtLength = ext.length;
        }
    }
};


export const compile = (mimedb: MimeDbEntry[]) => {

    const db = new MimosDb();

    for (const type in mimedb) {
        const entry = new MimosEntry(type as MimeSource, mimedb[type] as MimeDbEntry);
        insertEntry(type, entry, db);
    }

    return db;
};


export const getTypePart = (fulltype: string) => {

    const splitAt = fulltype.indexOf(';');
    return splitAt === -1 ? fulltype : fulltype.slice(0, splitAt);
};


export const applyPredicate = (mime: MimosEntry) => {

    if (mime.predicate) {
        return mime.predicate(Hoek.clone(mime));
    }

    return mime;
};

export interface MimosOptions<P extends object = {}> {

    /**
     * An object hash that is merged into the built-in mime information from
     * {@link https://github.com/jshttp/mime-db}.
     */
    override?: {
        [type: string]: MimosDeclaration<P> & P;
    };
}

export class Mimos<P extends object = {}> {

    // @ts-ignore
    #db: MimosDb = compile(MimeDb as MimeDbEntry[]);

    /**
     * Create a Mimos object for mime lookups.
     */
    constructor(options?: MimosOptions<NoInfer<P>>) {

        if (options?.override) {
            Hoek.assert(typeof options.override === 'object', 'overrides option must be an object');

            // Shallow clone db

            this.#db = {
                ...this.#db,
                byType: new Map(this.#db.byType),
                byExtension: new Map(this.#db.byExtension)
            };

            // Apply overrides

            for (const type in options.override) {
                const override: (MimosDeclaration<P> & P) = options.override[type]!;
                Hoek.assert(!override.predicate || typeof override.predicate === 'function', 'predicate option must be a function');

                const from = this.#db.byType.get(type);
                const baseEntry = from ? Hoek.applyToDefaults(from, override) : override;

                const entry = new MimosEntry(type, baseEntry as MimeDbEntry);
                insertEntry(type, entry, this.#db);
            }
        }
    }

    /**
     * Extract extension from file path and lookup mime information.
     *
     * @param path - Path to file
     *
     * @return Found mime object, or {} if no match.
     */
    path(path: string): (Readonly<MimosEntry & Partial<P>>) | {} {

        const extension = Path.extname(path).slice(1).toLowerCase();
        const mime = this.#db.byExtension.get(extension);

        if (!mime) {
            return {};
        }

        return applyPredicate(mime);
    }

    /**
     * Lookup mime information.
     *
     * @param type - The content-type to find mime information about.
     *
     * @return Mime object for provided type.
     */
    type(type: string): Readonly<MimosEntry & Partial<P>> {

        type = getTypePart(type);

        let mime = this.#db.byType.get(type);
        if (!mime) {
            // Retry with more expensive adaptations

            type = type.trim().toLowerCase();
            mime = this.#db.byType.get(type);
        }

        if (!mime) {
            mime = new MimosEntry(type, {
                source: 'mimos' as MimeSource
            });

            // Cache the entry

            insertEntry(type, mime, this.#db);

            return mime as Readonly<MimosEntry & Partial<P>>;
        }

        return applyPredicate(mime) as Readonly<MimosEntry & Partial<P>>;
    }
}
