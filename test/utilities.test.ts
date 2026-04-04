/* tslint:disable:object-literal-sort-keys */
import { expect } from 'chai';
import { FormatStackTrace } from '../src/format-stack-trace';
import { ToOneLine } from '../src/to-one-line';
import { NewLineCharacter } from '../src/new-line-character';
import { sortObject } from '../src/sort-object';
import { jsonStringifySafe, getSerialize } from '../src/json-stringify-safe/stringify-safe';
import { safeObjectAssign } from '../src/safe-object-assign';
import { ErrorWithContext } from '../src/error-with-context';
import { getCallStack } from '../src/get-call-stack';
import { colorJson, supportsColor, defaultColorMap } from '../src/colors/colorize';
import sinon from 'sinon';

describe('ToOneLine', () => {
  it('removes \\n characters', () => {
    expect(ToOneLine('hello\nworld')).to.equal('helloworld');
  });

  it('removes \\r characters', () => {
    expect(ToOneLine('hello\rworld')).to.equal('helloworld');
  });

  it('removes \\r\\n characters', () => {
    expect(ToOneLine('hello\r\nworld')).to.equal('helloworld');
  });

  it('removes multiple newlines', () => {
    expect(ToOneLine('a\nb\nc\nd')).to.equal('abcd');
  });

  it('returns empty string unchanged', () => {
    expect(ToOneLine('')).to.equal('');
  });

  it('returns null unchanged', () => {
    expect(ToOneLine(null as any)).to.equal(null);
  });

  it('returns undefined unchanged', () => {
    expect(ToOneLine(undefined as any)).to.equal(undefined);
  });

  it('returns string without newlines unchanged', () => {
    expect(ToOneLine('no newlines here')).to.equal('no newlines here');
  });
});

describe('sortObject', () => {
  it('sorts object keys alphabetically', () => {
    const result = sortObject({ z: 1, a: 2, m: 3 });
    expect(Object.keys(result)).to.eql(['a', 'm', 'z']);
  });

  it('handles empty object', () => {
    const result = sortObject({});
    expect(result).to.eql({});
  });

  it('preserves values', () => {
    const result: any = sortObject({ b: 'beta', a: 'alpha' });
    expect(result.a).to.equal('alpha');
    expect(result.b).to.equal('beta');
  });

  it('handles single key', () => {
    const result = sortObject({ only: 'one' });
    expect(result).to.eql({ only: 'one' });
  });

  it('handles nested objects without sorting inner keys', () => {
    const result: any = sortObject({ b: { z: 1, a: 2 }, a: 'first' });
    expect(Object.keys(result)).to.eql(['a', 'b']);
    expect(result.b).to.eql({ z: 1, a: 2 });
  });
});

describe('NewLineCharacter', () => {
  const sandbox = sinon.createSandbox();
  process.env.CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS = '';

  afterEach(() => {
    sandbox.restore();
  });

  it('returns \\n by default', () => {
    expect(NewLineCharacter()).to.equal('\n');
  });

  it('returns " - " when CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS is true', () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS').value('true');
    expect(NewLineCharacter()).to.equal(' - ');
  });

  it('returns " - " when CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS is TRUE (case insensitive)', () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS').value('TRUE');
    expect(NewLineCharacter()).to.equal(' - ');
  });

  it('returns \\n when env var is set to something other than true', () => {
    sandbox.stub(process.env, 'CONSOLE_LOG_JSON_NO_NEW_LINE_CHARACTERS').value('yes');
    expect(NewLineCharacter()).to.equal('\n');
  });
});

describe('jsonStringifySafe', () => {
  it('stringifies a simple object', () => {
    expect(jsonStringifySafe({ a: 1, b: 'two' })).to.equal('{"a":1,"b":"two"}');
  });

  it('handles circular references at root level', () => {
    const obj: any = { name: 'test' };
    obj.self = obj;
    const result = jsonStringifySafe(obj);
    const parsed = JSON.parse(result);
    expect(parsed.name).to.equal('test');
    expect(parsed.self).to.equal('[Circular ~]');
  });

  it('handles circular references at nested level', () => {
    const obj: any = { name: 'root', child: { name: 'child' } };
    obj.child.parent = obj;
    const result = jsonStringifySafe(obj);
    const parsed = JSON.parse(result);
    expect(parsed.child.parent).to.include('[Circular');
  });

  it('handles indent parameter', () => {
    const result = jsonStringifySafe({ a: 1 }, undefined, 2);
    expect(result).to.include('\n');
    expect(result).to.include('  ');
  });

  it('handles custom serializer', () => {
    const serializer = (_key: string, value: any) => {
      if (typeof value === 'number') return value * 2;
      return value;
    };
    const result = jsonStringifySafe({ a: 5 }, serializer);
    expect(JSON.parse(result).a).to.equal(10);
  });

  it('handles custom decycler', () => {
    const obj: any = { name: 'test' };
    obj.self = obj;
    const decycler = (_key: string, _value: any) => '<CYCLE>';
    const result = jsonStringifySafe(obj, undefined, undefined, decycler);
    const parsed = JSON.parse(result);
    expect(parsed.self).to.equal('<CYCLE>');
  });

  it('handles null values', () => {
    expect(jsonStringifySafe({ a: null })).to.equal('{"a":null}');
  });

  it('handles arrays', () => {
    expect(jsonStringifySafe([1, 2, 3])).to.equal('[1,2,3]');
  });

  it('handles nested objects', () => {
    const result = jsonStringifySafe({ a: { b: { c: 1 } } });
    expect(JSON.parse(result).a.b.c).to.equal(1);
  });

  it('handles boolean values', () => {
    expect(jsonStringifySafe({ t: true, f: false })).to.equal('{"t":true,"f":false}');
  });
});

describe('getSerialize', () => {
  it('returns a function', () => {
    const result = getSerialize();
    expect(result).to.be.a('function');
  });
});

describe('FormatStackTrace', () => {
  it('toNewLines converts single-line stack to multi-line', () => {
    const stack = 'Error: test    at func1 (file1.ts:1:1)    at func2 (file2.ts:2:2)';
    const result = FormatStackTrace.toNewLines(stack);
    expect(result).to.include('Error: test');
    expect(result).to.include('func1');
    expect(result).to.include('func2');
  });

  it('toArray splits stack into array', () => {
    const stack = 'Error: test    at func1 (file1.ts:1:1)    at func2 (file2.ts:2:2)';
    const result = FormatStackTrace.toArray(stack);
    expect(result).to.be.an('array');
    expect(result.length).to.be.greaterThan(1);
  });

  it('toArray filters out console-log-json node_modules references', () => {
    const stack = 'Error: test    at func1 (file1.ts:1:1)    at something (node_modules/console-log-json/dist/logger.js:1:1)    at func2 (file2.ts:2:2)';
    const result = FormatStackTrace.toArray(stack);
    const hasConsoleLogJson = result.some((line) => line.includes('node_modules/console-log-json'));
    expect(hasConsoleLogJson).to.equal(false);
  });

  it('handles empty string', () => {
    const result = FormatStackTrace.toArray('');
    expect(result).to.be.an('array');
  });

  it('handles \\r\\n in stack trace', () => {
    const stack = 'Error: test\r\n    at func1 (file1.ts:1:1)\r\n    at func2 (file2.ts:2:2)';
    const result = FormatStackTrace.toArray(stack);
    expect(result.length).to.be.greaterThan(1);
  });

  it('divider is correct', () => {
    expect(FormatStackTrace.divider).to.equal('    at');
  });
});

describe('ErrorWithContext', () => {
  it('creates error with string message', () => {
    const err = new ErrorWithContext('test message');
    expect(err.message).to.equal('test message');
    expect(err).to.be.instanceOf(Error);
  });

  it('creates error with string message and extra context', () => {
    const err = new ErrorWithContext('test message', { key: 'value' });
    expect(err.message).to.equal('test message');
    expect((err as any).extraContext).to.eql({ key: 'value' });
  });

  it('wraps an existing error', () => {
    const inner = new Error('inner error');
    const outer = new ErrorWithContext(inner, { outer: 'context' });
    expect(outer.message).to.equal('inner error');
    expect((outer as any).extraContext.outer).to.equal('context');
  });

  it('wraps an existing error and preserves nested stack', () => {
    const inner = new Error('inner error');
    const outer = new ErrorWithContext(inner, { context: 'data' });
    expect(outer.stack).to.include('Caused By:');
  });

  it('wraps ErrorWithContext inside ErrorWithContext', () => {
    const innermost = new Error('innermost');
    const inner = new ErrorWithContext(innermost, { inner: 'context' });
    const outer = new ErrorWithContext(inner, { outer: 'context' });
    expect(outer.message).to.equal('innermost');
    expect((outer as any).extraContext.inner).to.equal('context');
    expect((outer as any).extraContext.outer).to.equal('context');
  });

  it('handles string as extraContext', () => {
    const err = new ErrorWithContext('base error', 'extra string' as any);
    expect(err.message).to.equal('base error - extra string');
  });

  it('handles string extraContext with Error object', () => {
    const inner = new Error('base error');
    const err = new ErrorWithContext(inner, 'extra string' as any);
    expect(err.message).to.include('base error');
    expect(err.message).to.include('extra string');
  });

  it('has a stack trace', () => {
    const err = new ErrorWithContext('test');
    expect(err.stack).to.be.a('string');
    expect(err.stack!.length).to.be.greaterThan(0);
  });

  it('handles null error with string extraContext', () => {
    // When error is null and extraContext is a string, the string becomes the error message
    const err = new ErrorWithContext(null as any, 'fallback' as any);
    expect(err.message).to.equal('fallback');
  });

  it('handles empty extra context object', () => {
    const err = new ErrorWithContext('msg', {});
    expect(err.message).to.equal('msg');
    expect((err as any).extraContext).to.eql({});
  });

  // Nested extraContext combination branches (error-with-context.ts lines 26-39)
  it('wraps error with object extraContext on both inner and outer', () => {
    const inner = new ErrorWithContext('inner', { innerKey: 'innerVal' });
    const outer = new ErrorWithContext(inner, { outerKey: 'outerVal' });
    expect(outer.message).to.equal('inner');
    expect((outer as any).extraContext.innerKey).to.equal('innerVal');
    expect((outer as any).extraContext.outerKey).to.equal('outerVal');
  });

  it('wraps error with string extraContext on inner, object on outer', () => {
    const inner = new ErrorWithContext('inner', 'inner context string' as any);
    const outer = new ErrorWithContext(inner, { outerKey: 'outerVal' });
    expect(outer.message).to.equal('inner - inner context string');
    // inner extraContext was a string, gets merged with outer object
    expect((outer as any).extraContext.outerKey).to.equal('outerVal');
  });

  it('wraps error with object extraContext on inner, string on outer', () => {
    const inner = new ErrorWithContext('inner', { innerKey: 'innerVal' });
    const outer = new ErrorWithContext(inner, 'outer context string' as any);
    expect(outer.message).to.include('inner');
    expect(outer.message).to.include('outer context string');
    expect((outer as any).extraContext.innerKey).to.equal('innerVal');
  });

  it('wraps error with string extraContext on both inner and outer', () => {
    const inner = new ErrorWithContext('inner', 'inner ctx' as any);
    const outer = new ErrorWithContext(inner, 'outer ctx' as any);
    expect(outer.message).to.include('inner');
    expect(outer.message).to.include('inner ctx');
    expect(outer.message).to.include('outer ctx');
  });
});

describe('safeObjectAssign', () => {
  it('merges two simple objects', () => {
    const result = safeObjectAssign({ a: 1 }, [], { b: 2 });
    expect(result.a).to.equal(1);
    expect(result.b).to.equal(2);
  });

  it('handles empty target', () => {
    const result = safeObjectAssign({}, [], { a: 1 });
    expect(result.a).to.equal(1);
  });

  it('handles empty source', () => {
    const result = safeObjectAssign({ a: 1 }, [], {});
    expect(result.a).to.equal(1);
  });

  it('handles nested object merge', () => {
    const result = safeObjectAssign({ a: { x: 1 } }, [], { a: { y: 2 } });
    expect(result.a.x).to.equal(1);
    expect(result.a.y).to.equal(2);
  });

  it('handles multiple sources', () => {
    const result = safeObjectAssign({ a: 1 }, [], { b: 2 }, { c: 3 });
    expect(result.a).to.equal(1);
    expect(result.b).to.equal(2);
    expect(result.c).to.equal(3);
  });

  it('prefixes conflicting keys with underscore', () => {
    const result = safeObjectAssign({ name: 'first' }, [], { name: 'second' });
    expect(result.name).to.equal('first');
    expect(result._name).to.equal('second');
  });

  it('handles triple conflict with multiple underscores', () => {
    const result = safeObjectAssign({ name: 'first' }, [], { name: 'second' }, { name: 'third' });
    expect(result.name).to.equal('first');
    expect(result._name).to.equal('second');
    expect(result.__name).to.equal('third');
  });

  it('merges string properties when specified', () => {
    const result = safeObjectAssign({ msg: 'hello' }, ['msg'], { msg: 'world' });
    expect(result.msg).to.equal('hello - world');
  });

  it('handles circular references in source', () => {
    const circ: any = { a: 1 };
    circ.self = circ;
    const result = safeObjectAssign({ b: 2 }, [], circ);
    expect(result.b).to.equal(2);
    expect(result.a).to.equal(1);
  });

  it('handles array values', () => {
    const result = safeObjectAssign({}, [], { arr: [1, 2, 3] });
    expect(result.arr).to.eql([1, 2, 3]);
  });

  it('does not mutate original objects', () => {
    const target = { a: 1 };
    const source = { b: 2 };
    safeObjectAssign(target, [], source);
    expect(target).to.eql({ a: 1 });
    expect(source).to.eql({ b: 2 });
  });
});

describe('getCallStack', () => {
  it('returns a string', () => {
    const result = getCallStack();
    expect(result).to.be.a('string');
  });

  it('returns non-empty call stack', () => {
    const result = getCallStack();
    expect(result.length).to.be.greaterThan(0);
  });

  it('does not start with Error:', () => {
    const result = getCallStack();
    expect(result.startsWith('Error:')).to.equal(false);
  });
});

describe('colorJson', () => {
  const sandbox = sinon.createSandbox();
  process.env.FORCE_NO_COLOR = '';
  process.env.FORCE_COLOR = '';
  process.env.DYNO = '';

  afterEach(() => {
    sandbox.restore();
  });

  it('returns colored JSON when colors are supported', () => {
    // Ensure no env vars that would disable color
    sandbox.stub(process.env, 'FORCE_NO_COLOR').value('');
    sandbox.stub(process.env, 'FORCE_COLOR').value('');
    sandbox.stub(process.env, 'DYNO').value('');

    const result = colorJson({ level: 'info', message: 'test' });
    // Should contain ANSI escape codes
    expect(result).to.include('\x1b[');
  });

  it('returns plain JSON when FORCE_NO_COLOR is set', () => {
    sandbox.stub(process.env, 'FORCE_NO_COLOR').value('true');
    sandbox.stub(process.env, 'FORCE_COLOR').value('');
    sandbox.stub(process.env, 'DYNO').value('');

    const result = colorJson({ level: 'info', message: 'test' });
    // Should be plain JSON without ANSI codes
    expect(result).to.not.include('\x1b[');
    const parsed = JSON.parse(result);
    expect(parsed.level).to.equal('info');
  });

  it('returns colored JSON when FORCE_COLOR overrides DYNO', () => {
    sandbox.stub(process.env, 'FORCE_NO_COLOR').value('');
    sandbox.stub(process.env, 'FORCE_COLOR').value('true');
    sandbox.stub(process.env, 'DYNO').value('true');

    const result = colorJson({ level: 'info', message: 'test' });
    expect(result).to.include('\x1b[');
  });

  it('returns plain JSON on Heroku (DYNO set)', () => {
    sandbox.stub(process.env, 'FORCE_NO_COLOR').value('');
    sandbox.stub(process.env, 'FORCE_COLOR').value('');
    sandbox.stub(process.env, 'DYNO').value('web.1');

    const result = colorJson({ level: 'info', message: 'test' });
    expect(result).to.not.include('\x1b[');
  });

  it('colors error level differently from info level', () => {
    sandbox.stub(process.env, 'FORCE_NO_COLOR').value('');
    sandbox.stub(process.env, 'FORCE_COLOR').value('');
    sandbox.stub(process.env, 'DYNO').value('');

    const errorResult = colorJson({ level: 'error', message: 'err msg' });
    const infoResult = colorJson({ level: 'info', message: 'info msg' });
    // Both have color but the level value color should differ
    expect(errorResult).to.include(defaultColorMap.red);
    expect(infoResult).to.include(defaultColorMap.lightTeal);
  });

  it('handles string input', () => {
    sandbox.stub(process.env, 'FORCE_NO_COLOR').value('true');
    sandbox.stub(process.env, 'FORCE_COLOR').value('');
    sandbox.stub(process.env, 'DYNO').value('');

    const result = colorJson('{"level":"info","message":"test"}');
    const parsed = JSON.parse(result);
    expect(parsed.level).to.equal('info');
  });

  it('handles boolean and null values', () => {
    sandbox.stub(process.env, 'FORCE_NO_COLOR').value('');
    sandbox.stub(process.env, 'FORCE_COLOR').value('');
    sandbox.stub(process.env, 'DYNO').value('');

    const result = colorJson({ active: true, deleted: false, extra: null });
    expect(result).to.include('true');
    expect(result).to.include('false');
    expect(result).to.include('null');
  });

  it('handles numeric values', () => {
    sandbox.stub(process.env, 'FORCE_NO_COLOR').value('');
    sandbox.stub(process.env, 'FORCE_COLOR').value('');
    sandbox.stub(process.env, 'DYNO').value('');

    const result = colorJson({ count: 42 });
    expect(result).to.include('42');
  });
});

describe('supportsColor', () => {
  const sandbox = sinon.createSandbox();
  process.env.FORCE_NO_COLOR = '';
  process.env.FORCE_COLOR = '';
  process.env.DYNO = '';

  afterEach(() => {
    sandbox.restore();
  });

  it('returns true by default (no special env vars)', () => {
    sandbox.stub(process.env, 'FORCE_NO_COLOR').value('');
    sandbox.stub(process.env, 'FORCE_COLOR').value('');
    sandbox.stub(process.env, 'DYNO').value('');
    expect(supportsColor()).to.equal(true);
  });

  it('returns false when FORCE_NO_COLOR is set', () => {
    sandbox.stub(process.env, 'FORCE_NO_COLOR').value('true');
    sandbox.stub(process.env, 'FORCE_COLOR').value('');
    sandbox.stub(process.env, 'DYNO').value('');
    expect(supportsColor()).to.equal(false);
  });

  it('returns false when DYNO is set', () => {
    sandbox.stub(process.env, 'FORCE_NO_COLOR').value('');
    sandbox.stub(process.env, 'FORCE_COLOR').value('');
    sandbox.stub(process.env, 'DYNO').value('web.1');
    expect(supportsColor()).to.equal(false);
  });

  it('returns true when FORCE_COLOR overrides DYNO', () => {
    sandbox.stub(process.env, 'FORCE_NO_COLOR').value('');
    sandbox.stub(process.env, 'FORCE_COLOR').value('true');
    sandbox.stub(process.env, 'DYNO').value('web.1');
    expect(supportsColor()).to.equal(true);
  });

  it('treats "false" as falsy for FORCE_NO_COLOR', () => {
    sandbox.stub(process.env, 'FORCE_NO_COLOR').value('false');
    sandbox.stub(process.env, 'FORCE_COLOR').value('');
    sandbox.stub(process.env, 'DYNO').value('');
    expect(supportsColor()).to.equal(true);
  });
});
