import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const run = jest.fn<(command: string, args: string[]) => Promise<{ stdout: string }>>();
const readlink = jest.fn<(file: string) => Promise<string>>();
const readFile = jest.fn<() => Promise<string>>();

jest.unstable_mockModule('node:child_process', () => ({ execFile: jest.fn() }));
jest.unstable_mockModule('node:util', () => ({ promisify: () => run }));
jest.unstable_mockModule('node:fs/promises', () => ({
  default: { realpath: async () => '/mud', readlink, readFile },
}));
jest.unstable_mockModule('../../config/environment.js', () => ({
  getBackendConfiguration: () => ({ mud: { directory: '/mud' } }),
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { error: jest.fn(), warn: jest.fn() },
}));

const { getDmsProcessStats } = await import('../processMonitor.js');

beforeEach(() => {
  run.mockReset();
  readlink.mockReset();
  readFile.mockReset();
  run.mockResolvedValue({ stdout: '123 1.5 2048 90 dms\n' });
  readlink.mockImplementation(async (file) =>
    file.endsWith('/cwd') ? '/mud' : '/mud/bin/server/dms',
  );
  readFile.mockResolvedValue(Array.from({ length: 24 }, () => '0').join(' '));
});

describe('configured MUD process discovery', () => {
  it.each(['/mud/bin/server/dms', '/mud/dms', '/mud/bin/server/dms (deleted)'])(
    'recognizes the configured executable %s regardless of command spelling',
    async (executable) => {
      readlink.mockImplementation(async (file) => (file.endsWith('/cwd') ? '/mud' : executable));
      await expect(getDmsProcessStats()).resolves.toMatchObject({
        pid: 123,
        isRunning: true,
        memory: 2,
        memoryPercent: 1.5,
        uptime: 90,
      });
      expect(run).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects a same-named process from another checkout', async () => {
    readlink.mockResolvedValue('/other/mud/bin/server/dms');
    await expect(getDmsProcessStats()).resolves.toMatchObject({ pid: null, isRunning: false });
  });

  it('fails closed when multiple matching game processes exist', async () => {
    run.mockResolvedValue({ stdout: '123 1.5 2048 90 dms\n456 2.0 4096 30 dms\n' });
    await expect(getDmsProcessStats()).resolves.toMatchObject({ pid: null, isRunning: false });
  });

  it('handles no matching process and process exit races', async () => {
    run.mockRejectedValueOnce({ code: 1 });
    await expect(getDmsProcessStats()).resolves.toMatchObject({ isRunning: false });
    readlink.mockRejectedValueOnce(new Error('process exited'));
    await expect(getDmsProcessStats()).resolves.toMatchObject({ isRunning: false });
  });
});
