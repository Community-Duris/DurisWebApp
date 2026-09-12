import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getBackendConfiguration } from '../config/environment.js';
import logger from '../utils/logger.js';

const execFileAsync = promisify(execFile);

export interface ProcessStats {
  cpu: number; // CPU usage percentage
  memory: number; // Memory usage in MB
  memoryPercent: number; // Memory usage percentage
  uptime: number; // Process uptime in seconds
  pid: number | null; // Process ID
  isRunning: boolean;
}

// Cache for CPU calculation
let lastCpuStats: { pid: number; utime: number; stime: number; timestamp: number } | null = null;
const numCpus = os.cpus().length;

/**
 * Get CPU and memory usage for the DMS process
 */
export async function getDmsProcessStats(): Promise<ProcessStats> {
  try {
    // Read uptime in the same snapshot as the PID. A second ps call can race
    // process exit and return empty output, which previously became NaN.
    const { stdout } = await execFileAsync('ps', ['-eo', 'pid=,pmem=,rss=,etimes=,comm='], {
      env: { ...process.env, LC_ALL: 'C' },
    });
    const mudRoot = await fs.realpath(getBackendConfiguration().mud.directory);
    const binaries = new Set([
      ...['dms', 'dms_new'].map((name) => path.join(mudRoot, 'bin/server', name)),
      path.join(mudRoot, 'dms'),
    ]);
    const candidates: { pid: number; memoryPercent: number; rss: number; uptime: number }[] = [];
    for (const line of stdout.trim().split('\n')) {
      const fields = line.trim().split(/\s+/);
      if (fields.length !== 5 || !['dms', 'dms_new'].includes(fields[4])) continue;
      const [pid, memoryPercent, rss, uptime] = fields.slice(0, 4).map(Number);
      if (
        !Number.isSafeInteger(pid) ||
        pid <= 0 ||
        !Number.isFinite(memoryPercent) ||
        memoryPercent < 0 ||
        !Number.isSafeInteger(rss) ||
        rss < 0 ||
        !Number.isSafeInteger(uptime) ||
        uptime < 0 ||
        !Number.isFinite(new Date(Date.now() - uptime * 1000).getTime())
      )
        continue;
      try {
        const [cwd, executable] = await Promise.all([
          fs.readlink(`/proc/${pid}/cwd`),
          fs.readlink(`/proc/${pid}/exe`),
        ]);
        // Other checkouts and regression fixtures are not the managed MUD.
        if (cwd === mudRoot && binaries.has(executable.replace(/ \(deleted\)$/, ''))) {
          candidates.push({ pid, memoryPercent, rss, uptime });
        }
      } catch {
        // Processes can exit between the ps snapshot and the identity reads.
        continue;
      }
    }
    if (candidates.length !== 1) {
      lastCpuStats = null;
      if (candidates.length > 1)
        logger.warn('Multiple DMS processes match the configured checkout');
      return { cpu: 0, memory: 0, memoryPercent: 0, uptime: 0, pid: null, isRunning: false };
    }
    const { pid, memoryPercent, rss, uptime } = candidates[0];
    const memoryMiB = rss / 1024; // Convert to MiB

    // Get real-time CPU usage from /proc/[pid]/stat
    let cpu = 0;
    try {
      const statContent = await fs.readFile(`/proc/${pid}/stat`, 'utf-8');
      const statParts = statContent.split(' ');
      const utime = parseInt(statParts[13], 10); // User mode time
      const stime = parseInt(statParts[14], 10); // Kernel mode time
      const totalTime = utime + stime;

      // Calculate CPU percentage if we have previous stats
      if (Number.isFinite(totalTime) && lastCpuStats && lastCpuStats.pid === pid) {
        const timeDiffMs = Date.now() - lastCpuStats.timestamp;
        const cpuTimeDiff = totalTime - (lastCpuStats.utime + lastCpuStats.stime);

        // CPU usage calculation:
        // cpuTimeDiff is in clock ticks (HZ=100 per second on Linux)
        // timeDiffMs is in milliseconds
        const clockTicks = 100; // Linux HZ (ticks per second)
        const timeDiffSec = timeDiffMs / 1000;

        // CPU % = (ticks_used / ticks_per_second) / seconds_elapsed * 100 / num_cpus
        // cpu_seconds = ticks / ticks_per_second
        // cpu_percent_per_core = (cpu_seconds / elapsed_seconds) * 100
        // cpu_percent_total = cpu_percent_per_core / num_cpus
        if (timeDiffSec > 0 && cpuTimeDiff >= 0) {
          cpu = ((cpuTimeDiff / clockTicks / timeDiffSec) * 100) / numCpus;
        }
        cpu = Math.max(0, Math.min(100, cpu)); // Clamp between 0 and 100
      }

      // Update cache
      lastCpuStats = Number.isFinite(totalTime)
        ? { pid, utime, stime, timestamp: Date.now() }
        : null;
    } catch {
      // If we can't read /proc, fall back to 0
      cpu = 0;
    }

    return {
      cpu: Math.round(cpu * 10) / 10, // Round to 1 decimal place
      memory: memoryMiB, // Keep full precision, let frontend handle rounding
      memoryPercent,
      uptime,
      pid,
      isRunning: true,
    };
  } catch (error) {
    logger.error('Error getting DMS process stats:', error);
    return {
      cpu: 0,
      memory: 0,
      memoryPercent: 0,
      uptime: 0,
      pid: null,
      isRunning: false,
    };
  }
}
