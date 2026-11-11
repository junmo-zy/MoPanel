import { useCallback, useMemo, useRef, useState } from "react";
import type { MihomoClient, ProxyGroup, ProxyNode } from "../api/types";
import { DELAY_TIMEOUT } from "../delay";

// A port of Clash Verge's DelayManager behaviour:
// - every node is tested on its own, 10 at a time, each start staggered by a
//   random 0–200 ms so the core is not hit all at once;
// - a test shows its loading state for at least 500 ms, and gives up at the
//   10 s timeout;
// - a group is tested with its own test URL when it has one;
// - results are cached for 30 minutes and win over older core history.

const CONCURRENCY = 10;
const MAX_STAGGER_MS = 200;
const MIN_VISIBLE_MS = 500;
const CACHE_TTL_MS = 30 * 60 * 1000;

export interface DelayResult {
  // Milliseconds; 0 means timeout or failure.
  delay: number;
  at: number;
}

export interface BatchProgress {
  done: number;
  total: number;
}

export interface DelayView {
  testing: ReadonlySet<string>;
  results: ReadonlyMap<string, DelayResult>;
  // Keyed by group name, plus "*" for a test-all run.
  progress: ReadonlyMap<string, BatchProgress>;
}

export interface DelayTesterOptions {
  timeout?: number;
  minVisibleMs?: number;
  maxStaggerMs?: number;
  now?: () => number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function liveDelay(view: DelayView | undefined, node: ProxyNode, now = Date.now()) {
  if (view?.testing.has(node.name)) return { testing: true, delay: node.delay, alive: node.alive };
  const result = view?.results.get(node.name);
  if (result && now - result.at < CACHE_TTL_MS) {
    return { testing: false, delay: result.delay > 0 ? result.delay : null, alive: result.delay > 0 };
  }
  return { testing: false, delay: node.delay, alive: node.alive };
}

export function useDelayTester(
  client: MihomoClient,
  defaultUrl: string,
  onSettled: () => Promise<unknown> | void,
  options: DelayTesterOptions = {},
) {
  const timeout = options.timeout ?? DELAY_TIMEOUT;
  const minVisible = options.minVisibleMs ?? MIN_VISIBLE_MS;
  const maxStagger = options.maxStaggerMs ?? MAX_STAGGER_MS;
  const [testing, setTesting] = useState<ReadonlySet<string>>(() => new Set());
  const [results, setResults] = useState<ReadonlyMap<string, DelayResult>>(() => new Map());
  const [progress, setProgress] = useState<ReadonlyMap<string, BatchProgress>>(() => new Map());
  // Several batches may overlap (two groups sharing a node); count claims.
  const claims = useRef(new Map<string, number>());

  const claim = useCallback((names: string[], delta: 1 | -1) => {
    for (const name of names) {
      const next = (claims.current.get(name) || 0) + delta;
      if (next > 0) claims.current.set(name, next);
      else claims.current.delete(name);
    }
    setTesting(new Set(claims.current.keys()));
  }, []);

  const measure = useCallback(async (node: ProxyNode, url: string) => {
    const started = performance.now();
    let delay = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      delay = await Promise.race([
        client.testProxy(node, url, timeout),
        new Promise<number>((resolve) => { timer = setTimeout(() => resolve(0), timeout); }),
      ]);
    } catch {
      delay = 0;
    } finally {
      clearTimeout(timer);
    }
    const elapsed = performance.now() - started;
    if (elapsed < minVisible) await sleep(minVisible - elapsed);
    setResults((current) => new Map(current).set(node.name, { delay, at: Date.now() }));
    claim([node.name], -1);
    return delay;
  }, [claim, client, minVisible, timeout]);

  const runBatch = useCallback(async (keys: string[], jobs: Array<{ node: ProxyNode; url: string }>) => {
    const unique = [...new Map(jobs.map((job) => [job.node.name, job])).values()];
    claim(unique.map((job) => job.node.name), 1);
    const setDone = (done: number) => setProgress((current) => {
      const next = new Map(current);
      for (const key of keys) next.set(key, { done, total: unique.length });
      return next;
    });
    setDone(0);
    let index = 0;
    let done = 0;
    let failed = 0;
    const worker = async () => {
      while (index < unique.length) {
        const job = unique[index];
        index += 1;
        if (index > 1 && maxStagger > 0) await sleep(Math.random() * maxStagger);
        if (await measure(job.node, job.url) <= 0) failed += 1;
        done += 1;
        setDone(done);
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, unique.length) }, worker));
    } finally {
      setProgress((current) => {
        const next = new Map(current);
        for (const key of keys) next.delete(key);
        return next;
      });
      await onSettled();
    }
    return { total: unique.length, failed };
  }, [claim, maxStagger, measure, onSettled]);

  const testGroup = useCallback((group: ProxyGroup) => (
    runBatch([group.name], group.nodes.map((node) => ({ node, url: group.testUrl || defaultUrl })))
  ), [defaultUrl, runBatch]);

  const testGroups = useCallback((groups: ProxyGroup[]) => (
    runBatch(["*", ...groups.map((group) => group.name)], groups.flatMap((group) => (
      group.nodes.map((node) => ({ node, url: group.testUrl || defaultUrl }))
    )))
  ), [defaultUrl, runBatch]);

  const testNode = useCallback(async (node: ProxyNode, group?: ProxyGroup) => {
    claim([node.name], 1);
    const delay = await measure(node, group?.testUrl || defaultUrl);
    await onSettled();
    return delay;
  }, [claim, defaultUrl, measure, onSettled]);

  const view: DelayView = useMemo(() => ({ testing, results, progress }), [testing, results, progress]);
  return { view, testGroup, testGroups, testNode };
}
