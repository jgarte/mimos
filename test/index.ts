import { describe, it } from 'node:test';
import Code from '@hapi/code';
import * as Mimos from '../lib/index.ts';


const expect = Code.expect;


describe('Mimos', () => {

    describe('path()', () => {

        it('returns the mime type from a file path', () => {

            const mimos = new Mimos.Mimos();

            const result = mimos.path('/static/javascript/app.js');
            expect(result).to.be.instanceof(Mimos.MimosEntry);
            if (result instanceof Mimos.MimosEntry) {
                expect(result.source).to.equal('iana');
                expect(result.charset).to.equal('UTF-8');
                expect(result.compressible).to.equal(true);
                expect(result.extensions).to.equal(['js', 'mjs']);
                expect(result.type).to.equal('text/javascript');
            }
        });

        it('returns empty object if a match can not be found', () => {

            const mimos = new Mimos.Mimos();

            expect(mimos.path('/static/javascript')).to.equal({});
        });

        it('can distinguish an empty return using instanceof', () => {

            const mimos = new Mimos.Mimos();

            expect(mimos.path('/static/javascript/app.js')).to.be.instanceof(Mimos.MimosEntry);
            expect(mimos.path('/static/javascript')).to.not.be.instanceof(Mimos.MimosEntry);
        });

        it('ignores extension upper case', () => {

            const lower = '/static/image/image.jpg';
            const upper = '/static/image/image.JPG';
            const mimos = new Mimos.Mimos();

            const lowerResult = mimos.path(lower);
            const upperResult = mimos.path(upper);
            if (lowerResult instanceof Mimos.MimosEntry && upperResult instanceof Mimos.MimosEntry) {
                expect(lowerResult.type).to.equal(upperResult.type);
            }
        });
    });

    describe('type()', () => {

        it('returns a found type', () => {

            const mimos = new Mimos.Mimos();

            const result = mimos.type('text/plain');
            expect(result.source).to.equal('iana');
            expect(result.compressible).to.equal(true);
            expect(result.extensions).to.equal(['txt', 'text', 'conf', 'def', 'list', 'log', 'in', 'ini']);
            expect(result.type).to.equal('text/plain');
        });

        it('returns a type when option is included', () => {

            const mimos = new Mimos.Mimos();

            const result = mimos.type('text/plain;charset=UTF-8');
            expect(result.source).to.equal('iana');
            expect(result.compressible).to.equal(true);
            expect(result.extensions).to.equal(['txt', 'text', 'conf', 'def', 'list', 'log', 'in', 'ini']);
            expect(result.type).to.equal('text/plain');
        });

        it('returns a missing type', () => {

            const mimos = new Mimos.Mimos();

            const result = mimos.type('hapi/test');
            expect(result.source).to.equal('mimos');
            expect(result.compressible).to.equal(false);
            expect(result.extensions).to.equal([]);
            expect(result.type).to.equal('hapi/test');
        });
    });

    it('accepts an override object to make adjustments to the internal mime database', () => {

        const nodeModule = {
            source: 'iana' as const,
            compressible: false,
            extensions: ['node', 'module', 'npm'],
            type: 'node/module'
        };
        const dbOverwrite = {
            override: {
                'node/module': nodeModule
            }
        };

        const mimos = new Mimos.Mimos(dbOverwrite);
        const typeResult = mimos.type('node/module');
        expect(typeResult.source).to.equal('iana');
        expect(typeResult.compressible).to.equal(false);
        expect(typeResult.extensions).to.equal(['node', 'module', 'npm']);
        expect(typeResult.type).to.equal('node/module');

        const pathResult = mimos.path('/node_modules/node/module.npm');
        if (pathResult instanceof Mimos.MimosEntry) {
            expect(pathResult.source).to.equal('iana');
            expect(pathResult.compressible).to.equal(false);
            expect(pathResult.extensions).to.equal(['node', 'module', 'npm']);
            expect(pathResult.type).to.equal('node/module');
        }
    });

    it('allows built-in types to be replaced with user mime data', () => {

        const jsModule = {
            source: 'iana' as const,
            charset: 'UTF-8',
            compressible: true,
            extensions: ['js', 'javascript'],
            type: 'text/javascript'
        };
        const dbOverwrite = {
            override: {
                'application/javascript': jsModule
            }
        };

        const mimos = new Mimos.Mimos(dbOverwrite);

        const typeResult = mimos.type('application/javascript');
        expect(typeResult.source).to.equal('iana');
        expect(typeResult.charset).to.equal('UTF-8');
        expect(typeResult.compressible).to.equal(true);
        expect(typeResult.extensions).to.equal(['js', 'javascript']);
        expect(typeResult.type).to.equal('text/javascript');

        const pathResult = mimos.path('/static/js/app.js');
        if (pathResult instanceof Mimos.MimosEntry) {
            expect(pathResult.source).to.equal('iana');
            expect(pathResult.charset).to.equal('UTF-8');
            expect(pathResult.compressible).to.equal(true);
            expect(pathResult.extensions).to.equal(['js', 'javascript']);
            expect(pathResult.type).to.equal('text/javascript');
        }
    });

    it('executes a predicate function if it is provided', () => {

        const jsModule = {
            predicate: function (mime: Mimos.MimosEntry & { foo?: string }) {

                return {
                    ...mime,
                    foo: 'bar',
                    type: mime.type
                } as Mimos.MimosEntry;
            },
            type: 'text/javascript'
        };
        const dbOverwrite = {
            override: {
                'application/javascript': jsModule
            }
        };

        const mimos = new Mimos.Mimos<{ foo?: string }>(dbOverwrite);

        const typeResult = mimos.type('application/javascript');

        expect(typeResult.foo).to.equal('bar');
        expect(typeResult.type).to.equal('text/javascript');

        const pathResult = mimos.path('/static/js/app.js');

        if (pathResult instanceof Mimos.MimosEntry) {
            expect((pathResult as any).foo).to.equal('bar');
            expect(pathResult.type).to.equal('text/javascript');
        }
    });

    it('throws an error if created without new', () => {

        expect(() => {

            // @ts-expect-error - testing runtime behavior
            Mimos.Mimos();
        }).to.throw(/cannot be invoked without 'new'/g);
    });

    it('throws an error if override is not an object', () => {

        expect(() => {

            // @ts-expect-error - testing runtime behavior
            new Mimos.Mimos({ override: true });
        }).to.throw('overrides option must be an object');
    });

    it('throws an error if the predicate option is not a functino', () => {

        expect(() => {

            new Mimos.Mimos({
                override: {
                    'application/javascript': {
                        // @ts-expect-error - testing runtime behavior
                        predicate: 'foo'
                    }
                }
            });
        }).to.throw('predicate option must be a function');
    });
});
