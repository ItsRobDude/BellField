import { workerLog, type WorkerLogContext } from '../common/logger';

export type WorkerJobRunContext = {
  signal: AbortSignal;
};

export type WorkerJob = {
  name: string;
  intervalMs: number;
  runOnStart?: boolean;
  run: (context: WorkerJobRunContext) => Promise<void> | void;
};

type JobRunnerLog = (level: 'info' | 'error', message: string, context?: WorkerLogContext) => void;

export type JobRunnerOptions = {
  shutdownTimeoutMs?: number;
  log?: JobRunnerLog;
};

const defaultShutdownTimeoutMs = 10_000;

export class JobRunner {
  private readonly timers = new Set<NodeJS.Timeout>();
  private readonly running = new Set<Promise<void>>();
  private readonly abortController = new AbortController();
  private readonly log: JobRunnerLog;
  private readonly shutdownTimeoutMs: number;
  private stopping = false;
  private started = false;

  constructor(
    private readonly jobs: WorkerJob[],
    options: JobRunnerOptions = {}
  ) {
    this.log = options.log ?? workerLog;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? defaultShutdownTimeoutMs;
  }

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    for (const job of this.jobs) {
      this.schedule(job, job.runOnStart ? 0 : job.intervalMs);
    }
  }

  async stop(): Promise<void> {
    if (this.stopping) {
      return;
    }

    this.stopping = true;
    this.abortController.abort();

    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();

    if (this.running.size === 0) {
      return;
    }

    const timeout = new Promise<void>((resolve) => {
      setTimeout(resolve, this.shutdownTimeoutMs);
    });
    await Promise.race([Promise.allSettled([...this.running]), timeout]);
  }

  private schedule(job: WorkerJob, delayMs: number): void {
    if (this.stopping) {
      return;
    }

    const timer = setTimeout(() => {
      this.timers.delete(timer);
      this.runJob(job);
    }, delayMs);
    this.timers.add(timer);
  }

  private runJob(job: WorkerJob): void {
    if (this.stopping) {
      return;
    }

    const run = (async () => {
      try {
        await job.run({ signal: this.abortController.signal });
      } catch (error) {
        this.log('error', 'Worker job failed.', {
          jobName: job.name,
          errorMessage: error instanceof Error ? error.message : String(error)
        });
      }
    })();

    this.running.add(run);
    void run.finally(() => {
      this.running.delete(run);
      this.schedule(job, job.intervalMs);
    });
  }
}
