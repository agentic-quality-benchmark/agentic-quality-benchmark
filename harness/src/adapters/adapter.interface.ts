/**
 * AQB Tool Adapter Interface
 *
 * Implement this interface to evaluate any QE tool against the AQB corpus.
 *
 * @example
 * ```typescript
 * import { AQBToolAdapter, CorpusSample, Finding } from '@aqb/harness';
 *
 * export class SemgrepAdapter implements AQBToolAdapter {
 *   name = 'semgrep';
 *   version = '1.x.x';
 *
 *   async analyze(sample: CorpusSample): Promise<Finding[]> {
 *     // Write sample files to temp directory
 *     // Run semgrep against them
 *     // Parse output into Finding[] format
 *     // Return findings
 *   }
 * }
 * ```
 */

export type { AQBToolAdapter, CorpusSample, Finding } from '../types.js';
