import type { Repository } from './types';
import { createDemoRepository } from './demo';

/** A browser-only demo in every build, including Vercel production deployments. */
export function createRepository(referralCode?: string, demoChain?: string): Repository {
  return createDemoRepository({ referralCode, demoChain });
}

export const repository = createRepository(
  typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('ref') || undefined
    : undefined,
  typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('demo_chain') || undefined
    : undefined,
);
