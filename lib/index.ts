'use strict';

import type { MimeDb, MimosEntry, MimosDeclaration, MimosOptions, Mimos } from './types';
import * as Path from 'path';
import * as Hoek from '@hapi/hoek';


const internals = {
    compressibleRx: /^text\/|\+json$|\+text$|\+xml$/
};


export class MimeEntry {
    type: MimeDb.MimeSource;
    source: string;
    extensions: string[];
    compressible: boolean | undefined;

    constructor(type: string, mime: any) {
        this.type = type;
        this.source = 'mime-db';
        this.extensions = [];
        this.compressible = undefined;

        Object.assign(this, mime);

        if (this.compressible === undefined) {
            this.compressible = internals.compressibleRx.test(type);
        }
    }
};


export const insertEntry = (type: string, entry: MimeEntry, db: any) => {

    db.byType.set(type, entry);
    for (const ext of entry.extensions) {
        db.byExtension.set(ext, entry);
        if (ext.length > db.maxExtLength) {
            db.maxExtLength = ext.length;
        }
    }
};


export const compile = mimedb => {

    const db = {
        byType: new Map(),
        byExtension: new Map(),
        maxExtLength: 0
    };

    for (const type in mimedb) {
        const entry = new exports.MimosEntry(type, mimedb[type]);
        insertEntry(type, entry, db);
    }

    return db;
};


export const getTypePart = (fulltype: string) => {

    const splitAt = fulltype.indexOf(';');
    return splitAt === -1 ? fulltype : fulltype.slice(0, splitAt);
};


export const applyPredicate = (mime: MimosDeclaration) => {

    if (mime.predicate) {
        return mime.predicate(Hoek.clone(mime));
    }

    return mime;
};


class Mimos {

    #db = internals.base;

    constructor(options = {}) {

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
                const override = options.override[type];
                Hoek.assert(!override.predicate || typeof override.predicate === 'function', 'predicate option must be a function');

                const from = this.#db.byType.get(type);
                const baseEntry = from ? Hoek.applyToDefaults(from, override) : override;

                const entry = new exports.MimosEntry(type, baseEntry);
                insertEntry(type, entry, this.#db);
            }
        }
    }

    path(path: string) {

        const extension = Path.extname(path).slice(1).toLowerCase();
        const mime = this.#db.byExtension.get(extension) ?? {};

        return applyPredicate(mime);
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
            mime = new exports.MimosEntry(type, {
                source: 'mimos'
            });

            // Cache the entry

            insertEntry(type, mime, this.#db);

            return mime;
        }

        return applyPredicate(mime);
    }
};