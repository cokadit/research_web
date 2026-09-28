import { CRAWL } from '../../config/limits';

interface DomainState {
  tail: Promise<void>;
  lastFinishedAt: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * One request at a time per domain, with a minimum gap between the end of one
 * request and the start of the next. Shared by every fetch path in the process.
 */
export class PolitenessGate {
  private readonly domains = new Map<string, DomainState>();

  constructor(
    private readonly minGapMs: number = CRAWL.minGapPerDomainMs,
    private readonly now: () => number = Date.now,
    private readonly wait: (ms: number) => Promise<void> = sleep,
  ) {}

  async run<T>(domain: string, task: () => Promise<T>): Promise<T> {
    const state = this.domains.get(domain) ?? { tail: Promise.resolve(), lastFinishedAt: 0 };
    this.domains.set(domain, state);

    const previous = state.tail;
    let release!: () => void;
    state.tail = new Promise<void>((resolve) => (release = resolve));

    await previous;
    try {
      const gap = state.lastFinishedAt + this.minGapMs - this.now();
      if (state.lastFinishedAt > 0 && gap > 0) await this.wait(gap);
      return await task();
    } finally {
      state.lastFinishedAt = this.now();
      release();
    }
  }
}

export const politeness = new PolitenessGate();
