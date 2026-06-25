import { describe, it, expect } from 'vitest';
import { MethodLibrary } from '../method-library.js';
import { STANDARD_METHODS } from '../data/standard-methods.js';

const lib = new MethodLibrary(STANDARD_METHODS);

describe('MethodLibrary', () => {
  it('finds an entry by name, case-insensitively', () => {
    expect(lib.find('Plain Bob Major')?.stage).toBe(8);
    expect(lib.find('plain bob major')?.stage).toBe(8);
    expect(lib.find('PLAIN BOB MAJOR')?.notation).toBe('&-18-18-18-18,12');
  });

  it('returns undefined for an unknown method', () => {
    expect(lib.find('Nonexistent Method')).toBeUndefined();
    expect(lib.method('Nonexistent Method')).toBeUndefined();
  });

  it('builds a usable Method via method()', () => {
    const pb = lib.method('Plain Bob Major')!;
    expect(pb.leadLength).toBe(16);
    expect(pb.leadHead().toString()).toBe('13527486');
  });

  it('builds Grandsire Triples with the documented lead head 1253746', () => {
    const g = lib.method('Grandsire Triples')!;
    expect(g.leadHead().toString()).toBe('1253746');
  });

  it('filters by stage', () => {
    const major = lib.byStage(8).map((e) => e.name);
    expect(major).toContain('Plain Bob Major');
    expect(major).toContain('Cambridge Surprise Major');
    expect(lib.byStage(6).map((e) => e.name)).toContain('Plain Bob Minor');
  });

  it('filters by classification', () => {
    expect(lib.byClass('Surprise').map((e) => e.name)).toEqual(['Cambridge Surprise Major']);
    expect(lib.byClass('Bob').length).toBeGreaterThanOrEqual(3);
  });

  it('is iterable and reports its size', () => {
    expect([...lib].length).toBe(lib.size);
    expect(lib.size).toBe(STANDARD_METHODS.length);
  });
});
