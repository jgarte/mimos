import * as Path from 'path';
import * as Hoek from '@hapi/hoek';
import MimeDb from 'mime-db/db.json' with { type: 'json' };


export type MimeSource = 'iana' | 'apache' | 'nginx'; 

type MimosSource = MimeSource | 'mime-db' | 'mimos';

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
    type: MimeSource;
    source: MimosSource;
    extensions: string[];
    compressible: boolean | undefined;
    /**
     * Method with signature `function(mime)`.
     *
     * When this mime type is found in the database, this function will run.
     * This allows you to make customizations to `mime` based on developer criteria.
     */
    predicate?: <P extends MimosEntry>(mime: P) => P; 

    constructor(type: MimeSource, mime: MimeDbEntry) {
        this.type = type;
        this.source = 'mime-db';
        this.extensions = [];
        this.compressible = undefined;

        Object.assign(this, mime);

        if (this.compressible === undefined) {
            this.compressible = compressibleRx.test(type);
        }
    }
};

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
        const entry = new MimosEntry(type as MimeSource, mimedb[type] as never);
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

export interface MimosOptions {
    override?: Record<string, MimosEntry>;
}

export class Mimos {

    #db: MimosDb = compile(MimeDb as never);

    constructor(options: MimosOptions = {}) {

        if (options.override) {
            Hoek.assert(typeof options.override === 'object', 'overrides option must be an object');

            // Shallow clone db

            this.#db = {
                ...this.#db,
                byType: new Map(this.#db.byType),
                byExtension: new Map(this.#db.byExtension)
            };

            // Apply overrides

            for (const type in options.override) {
                const override = options.override[type] as MimosEntry;
                Hoek.assert(!override.predicate || typeof override.predicate === 'function', 'predicate option must be a function');

                const from = this.#db.byType.get(type);
                const baseEntry = from ? Hoek.applyToDefaults(from, override) : override;

                const entry = new MimosEntry(type as MimeSource, baseEntry as never);
                insertEntry(type, entry, this.#db);
            }
        }
    }

    path(path: string) {

        const extension = Path.extname(path).slice(1).toLowerCase();
        const mime = this.#db.byExtension.get(extension) ?? {};

        return applyPredicate(mime as never);
    }

    type(type: string) {

        type = getTypePart(type);

        let mime = this.#db.byType.get(type);
        if (!mime) {
            // Retry with more expensive adaptations

            type = type.trim().toLowerCase();
            mime = this.#db.byType.get(type);
        }

        if (!mime) {
            mime = new MimosEntry(type as MimeSource, {
                source: 'mimos' as MimeSource
            });

            // Cache the entry

            insertEntry(type, mime, this.#db);

            return mime;
        }

        return applyPredicate(mime);
    }
};