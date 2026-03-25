/**
 * Corpus Loader
 *
 * Loads corpus samples from a directory by recursively finding
 * all JSON files and parsing them as CorpusSample objects.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CorpusSample } from '../types.js';
import type { Manifest, ManifestDomain } from './validator.js';

/**
 * Recursively find all JSON files in a directory.
 */
function findJsonFiles(dir: string): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...findJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      // Skip manifest.json at the root level
      if (entry.name === 'manifest.json') continue;
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Load all corpus samples from a directory.
 *
 * Recursively finds all `*.json` files (excluding manifest.json),
 * parses each as a CorpusSample, and returns the array.
 *
 * @param dir - Path to the corpus directory
 * @returns Array of parsed CorpusSample objects
 * @throws If a JSON file cannot be parsed
 */
export function loadCorpusFromDirectory(dir: string): CorpusSample[] {
  const jsonFiles = findJsonFiles(dir);
  const samples: CorpusSample[] = [];

  for (const filePath of jsonFiles) {
    const raw = fs.readFileSync(filePath, 'utf-8');

    try {
      const parsed = JSON.parse(raw) as CorpusSample;
      samples.push(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse ${filePath}: ${message}`);
    }
  }

  return samples;
}

/**
 * Load the manifest.json from a corpus directory.
 *
 * @param dir - Path to the corpus directory
 * @returns The manifest domains map, or undefined if not found
 */
export function loadManifest(dir: string): Manifest | undefined {
  const manifestPath = path.join(dir, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    return undefined;
  }

  const raw = fs.readFileSync(manifestPath, 'utf-8');
  const parsed = JSON.parse(raw) as { domains?: Record<string, ManifestDomain> };

  return parsed.domains;
}
