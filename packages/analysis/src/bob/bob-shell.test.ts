/**
 * bob-shell.test.ts — Bob Shell subprocess transport with injected exec fakes.
 * Never spawns a real process.
 */

import {
  createShellCompleter,
  resolveCliBin,
  BobShellError,
  type ShellExecFn,
} from './bob-shell.js';

const OK_JSON = JSON.stringify({
  type: 'result',
  status: 'success',
  last_message: '{"assumptions": []}',
});

function execOk(stdout: string = OK_JSON): ShellExecFn {
  return () => Promise.resolve({ stdout, stderr: '' });
}

describe('createShellCompleter', () => {
  it('returns the last_message from a successful run', async () => {
    const completer = createShellCompleter({ execFn: execOk() });
    await expect(completer.complete('sys', 'user')).resolves.toBe('{"assumptions": []}');
    expect(completer.model).toBe('bob-shell');
  });

  it('passes run/mode/format/max-cost/trust args and pipes the prompt', async () => {
    let seenArgs: string[] = [];
    let seenInput = '';
    const completer = createShellCompleter({
      maxCostCoins: 0.25,
      execFn: (args, input) => {
        seenArgs = args;
        seenInput = input;
        return Promise.resolve({ stdout: OK_JSON, stderr: '' });
      },
    });
    await completer.complete('SYSTEM', 'USER');
    expect(seenArgs).toEqual([
      'run',
      '--mode',
      'ask',
      '--format',
      'json',
      '--max-cost',
      '0.25',
      '--trust',
    ]);
    expect(seenInput).toContain('SYSTEM');
    expect(seenInput).toContain('USER');
  });

  it('rejects non-JSON stdout', async () => {
    const completer = createShellCompleter({ execFn: execOk('not json') });
    await expect(completer.complete('s', 'u')).rejects.toBeInstanceOf(BobShellError);
  });

  it('rejects non-success status', async () => {
    const completer = createShellCompleter({
      execFn: execOk(JSON.stringify({ type: 'result', status: 'error', last_message: 'x' })),
    });
    await expect(completer.complete('s', 'u')).rejects.toThrow(/success/);
  });

  it('rejects empty messages', async () => {
    const completer = createShellCompleter({
      execFn: execOk(JSON.stringify({ type: 'result', status: 'success', last_message: '  ' })),
    });
    await expect(completer.complete('s', 'u')).rejects.toBeInstanceOf(BobShellError);
  });

  it('wraps spawn failures without leaking arguments', async () => {
    const completer = createShellCompleter({
      execFn: () => Promise.reject(new Error('spawn ENOENT')),
    });
    const err = await completer.complete('s', 'u').catch((e) => e);
    expect(err).toBeInstanceOf(BobShellError);
    expect(String(err.message)).not.toContain('BOB_API_KEY');
  });

  it('rejects invalid cost configuration', () => {
    expect(() => createShellCompleter({ maxCostCoins: 0 })).toThrow(BobShellError);
  });
});

describe('resolveCliBin', () => {
  it('appends .cmd on Windows for bare names', () => {
    expect(resolveCliBin('bob', 'win32')).toBe('bob.cmd');
    expect(resolveCliBin('bob.cmd', 'win32')).toBe('bob.cmd');
    expect(resolveCliBin('/usr/local/bin/bob', 'win32')).toBe('/usr/local/bin/bob.cmd');
  });

  it('leaves names untouched off Windows', () => {
    expect(resolveCliBin('bob', 'linux')).toBe('bob');
    expect(resolveCliBin('bob', 'darwin')).toBe('bob');
  });
});
