import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';

const runPs = jest.fn<(...args: unknown[]) => Promise<{ stdout: string }>>();
const realpath = jest.fn<(name: string) => Promise<string>>();
const readlink = jest.fn<(name: string) => Promise<string>>();
const readFile = jest.fn<(...args: unknown[]) => Promise<string>>();
const logger = { warn: jest.fn(), error: jest.fn() };
const root = '/fixture/managed-mud';

jest.unstable_mockModule('node:util', () => ({ promisify: () => runPs }));
jest.unstable_mockModule('node:fs/promises', () => ({ default: { realpath, readlink, readFile } }));
jest.unstable_mockModule('../../utils/logger.js', () => ({ default: logger }));
jest.unstable_mockModule('../../config/environment.js', () => ({
  getBackendConfiguration: () => ({ mud: { directory: root } }),
}));

const { getDmsProcessStats } = await import('../processMonitor.js');

beforeEach(() => {
  jest.clearAllMocks();
  realpath.mockResolvedValue(root);
  readlink.mockImplementation(async (name) =>
    name.endsWith('/cwd') ? root : `${root}/bin/server/dms`,
  );
  const stat = Array<string>(24).fill('0');
  stat[0] = '303';
  stat[1] = '(dms)';
  stat[13] = '10';
  stat[14] = '20';
  readFile.mockResolvedValue(stat.join(' '));
  runPs.mockResolvedValue({ stdout: '303 0.1 512 42 dms\n' });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('configured MUD process monitoring', () => {
  it('uses one snapshot for identity, memory and finite uptime', async () => {
    const stats = await getDmsProcessStats();
    expect(stats).toMatchObject({ isRunning: true, pid: 303, memory: 0.5, uptime: 42 });
    expect(Number.isFinite(stats.cpu)).toBe(true);
    expect(runPs).toHaveBeenCalledTimes(1);
  });

  it('ignores another checkout even when its process name matches', async () => {
    runPs.mockResolvedValue({ stdout: '101 0.1 512 9 dms_new\n303 0.1 512 42 dms\n' });
    readlink.mockImplementation(async (name) => {
      const directory = name.includes('/101/') ? '/fixture/isolated-mud' : root;
      return name.endsWith('/cwd') ? directory : `${directory}/bin/server/dms`;
    });
    expect(await getDmsProcessStats()).toMatchObject({ isRunning: true, pid: 303, uptime: 42 });
  });

  it('rejects a different executable launched from the managed directory', async () => {
    readlink.mockImplementation(async (name) =>
      name.endsWith('/cwd') ? root : '/fixture/cache/dms_new',
    );
    expect(await getDmsProcessStats()).toMatchObject({ isRunning: false, pid: null, uptime: 0 });
  });

  it('accepts the configured legacy root binary', async () => {
    readlink.mockImplementation(async (name) => (name.endsWith('/cwd') ? root : `${root}/dms`));
    expect(await getDmsProcessStats()).toMatchObject({ isRunning: true, pid: 303 });
  });

  it('accepts the configured staged binary and an unlinked running image', async () => {
    runPs.mockResolvedValue({ stdout: '303 0.1 512 42 dms_new\n' });
    readlink.mockImplementation(async (name) =>
      name.endsWith('/cwd') ? root : `${root}/bin/server/dms_new (deleted)`,
    );
    expect(await getDmsProcessStats()).toMatchObject({ isRunning: true, pid: 303 });
  });

  it.each([
    '',
    '303 0.1 512 dms',
    '303 0.1 512 NaN dms',
    '303 0.1 512 -1 dms',
    '303 0.1 512 9007199254740991 dms',
    '303 NaN 512 42 dms',
    '303 0.1 512 42 dms_other',
  ])('returns stopped for missing or invalid process data: %s', async (stdout) => {
    runPs.mockResolvedValue({ stdout });
    expect(await getDmsProcessStats()).toEqual({
      cpu: 0,
      memory: 0,
      memoryPercent: 0,
      uptime: 0,
      pid: null,
      isRunning: false,
    });
  });

  it('handles process exit during identity inspection', async () => {
    readlink.mockRejectedValue(Object.assign(new Error('Process exited'), { code: 'ENOENT' }));
    expect(await getDmsProcessStats()).toMatchObject({ isRunning: false, pid: null });
  });

  it('refuses ambiguous matching processes', async () => {
    runPs.mockResolvedValue({ stdout: '303 0.1 512 42 dms\n404 0.1 512 12 dms\n' });
    expect(await getDmsProcessStats()).toMatchObject({ isRunning: false, pid: null });
    expect(logger.warn).toHaveBeenCalledWith(
      'Multiple DMS processes match the configured checkout',
    );
  });

  it('keeps CPU finite when samples share a timestamp', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(123456);
    await getDmsProcessStats();
    expect((await getDmsProcessStats()).cpu).toBe(0);
  });
});
