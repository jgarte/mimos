'use strict';
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var _Mimos_db, _a;
const Path = require('path');
const Hoek = require('@hapi/hoek');
const MimeDb = require('mime-db/db.json'); // Load JSON file to prevent loading or executing code
const internals = {
    compressibleRx: /^text\/|\+json$|\+text$|\+xml$/
};
exports.MimosEntry = class {
    constructor(type, mime) {
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
internals.insertEntry = function (type, entry, db) {
    db.byType.set(type, entry);
    for (const ext of entry.extensions) {
        db.byExtension.set(ext, entry);
        if (ext.length > db.maxExtLength) {
            db.maxExtLength = ext.length;
        }
    }
};
internals.compile = function (mimedb) {
    const db = {
        byType: new Map(),
        byExtension: new Map(),
        maxExtLength: 0
    };
    for (const type in mimedb) {
        const entry = new exports.MimosEntry(type, mimedb[type]);
        internals.insertEntry(type, entry, db);
    }
    return db;
};
internals.getTypePart = function (fulltype) {
    const splitAt = fulltype.indexOf(';');
    return splitAt === -1 ? fulltype : fulltype.slice(0, splitAt);
};
internals.applyPredicate = function (mime) {
    if (mime.predicate) {
        return mime.predicate(Hoek.clone(mime));
    }
    return mime;
};
exports.Mimos = (_a = class Mimos {
        constructor(options = {}) {
            _Mimos_db.set(this, internals.base);
            if (options.override) {
                Hoek.assert(typeof options.override === 'object', 'overrides option must be an object');
                // Shallow clone db
                __classPrivateFieldSet(this, _Mimos_db, Object.assign(Object.assign({}, __classPrivateFieldGet(this, _Mimos_db, "f")), { byType: new Map(__classPrivateFieldGet(this, _Mimos_db, "f").byType), byExtension: new Map(__classPrivateFieldGet(this, _Mimos_db, "f").byExtension) }), "f");
                // Apply overrides
                for (const type in options.override) {
                    const override = options.override[type];
                    Hoek.assert(!override.predicate || typeof override.predicate === 'function', 'predicate option must be a function');
                    const from = __classPrivateFieldGet(this, _Mimos_db, "f").byType.get(type);
                    const baseEntry = from ? Hoek.applyToDefaults(from, override) : override;
                    const entry = new exports.MimosEntry(type, baseEntry);
                    internals.insertEntry(type, entry, __classPrivateFieldGet(this, _Mimos_db, "f"));
                }
            }
        }
        path(path) {
            var _a;
            const extension = Path.extname(path).slice(1).toLowerCase();
            const mime = (_a = __classPrivateFieldGet(this, _Mimos_db, "f").byExtension.get(extension)) !== null && _a !== void 0 ? _a : {};
            return internals.applyPredicate(mime);
        }
        type(type) {
            type = internals.getTypePart(type);
            let mime = __classPrivateFieldGet(this, _Mimos_db, "f").byType.get(type);
            if (!mime) {
                // Retry with more expensive adaptations
                type = type.trim().toLowerCase();
                mime = __classPrivateFieldGet(this, _Mimos_db, "f").byType.get(type);
            }
            if (!mime) {
                mime = new exports.MimosEntry(type, {
                    source: 'mimos'
                });
                // Cache the entry
                internals.insertEntry(type, mime, __classPrivateFieldGet(this, _Mimos_db, "f"));
                return mime;
            }
            return internals.applyPredicate(mime);
        }
    },
    _Mimos_db = new WeakMap(),
    _a);
internals.base = internals.compile(MimeDb);
