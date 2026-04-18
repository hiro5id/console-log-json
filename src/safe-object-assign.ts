import { sortObject } from './sort-object';
// tslint:disable-next-line:no-var-requires
/* tslint:disable:only-arrow-functions */

const MAX_DEPTH = 50;
const MAX_CONFLICT_PREFIX_DEPTH = 20;

/**
 * Deep clone an object, replacing circular references with "[Circular ~.path]" strings.
 * This replaces the previous JSON.parse(jsonStringifySafe(...)) approach for better performance.
 */
function deepClone(obj: any, visited: Map<any, string> = new Map(), path: string = ''): any {
  if (obj == null || typeof obj !== 'object') {
    return obj;
  }
  if (visited.has(obj)) {
    return `[Circular ~${visited.get(obj)}]`;
  }
  if (Array.isArray(obj)) {
    visited.set(obj, path);
    const arr: any[] = [];
    for (let i = 0; i < obj.length; i++) {
      // tslint:disable-line:prefer-for-of
      arr[i] = deepClone(obj[i], visited, `${path}.${i}`);
    }
    return arr;
  }
  visited.set(obj, path);
  const clone: any = {};
  const keys = Object.keys(obj);
  for (const key of keys) {
    clone[key] = deepClone(obj[key], visited, path.length > 0 ? `${path}.${key}` : `.${key}`);
  }
  return clone;
}

/**
 * Safe deep merge two objects by handling circular references and conflicts
 *
 * in case of conflicting property, it will be merged with a modified property by adding a prefix
 * @param target
 * @param mergeStringProperties
 * @param sources
 */
export function safeObjectAssign(target: any, mergeStringProperties: string[], ...sources: any): any {
  const traversedProps = new Set();
  const mergeStringPropertySet = new Set((mergeStringProperties || []).map((value) => value.toLowerCase()));

  function mergeDeep(theTarget: any, depth: number, ...theSources: any): any {
    if (!theSources.length || depth > MAX_DEPTH) {
      return theTarget;
    }
    let source = theSources.shift();

    if (traversedProps.has(source)) {
      source = { circular: 'circular' };
    }
    traversedProps.add(source);

    if (isObject(theTarget) && isObject(source)) {
      for (const key in source) {
        // noinspection JSUnfilteredForInLoop
        if (isObject(source[key])) {
          // noinspection JSUnfilteredForInLoop
          if (!theTarget[key]) {
            // noinspection JSUnfilteredForInLoop
            Object.assign(theTarget, { [key]: {} });
          }
          // noinspection JSUnfilteredForInLoop
          mergeDeep(theTarget[key], depth + 1, source[key]);
        } else {
          const targetMatchedKey = findCaseInsensitiveKey(theTarget, key);
          if (
            targetMatchedKey != null &&
            mergeStringPropertySet.has(targetMatchedKey.toLowerCase()) &&
            typeof theTarget[targetMatchedKey] === 'string' &&
            typeof source[key] === 'string'
          ) {
            // merge the two strings together
            theTarget[targetMatchedKey] = `${theTarget[targetMatchedKey]} - ${source[key]}`;
          } else {
            // noinspection JSUnfilteredForInLoop
            const targetKey = findNonConflictingKeyInTarget(theTarget, key, 0);
            // noinspection JSUnfilteredForInLoop
            Object.assign(theTarget, { [targetKey]: source[key] });
          }
        }
      }
    }

    return mergeDeep(theTarget, depth, ...theSources);
  }

  const targetCopy = deepClone(target);
  const sourcesCopy = deepClone(sources);

  return deepSortObject(mergeDeep(targetCopy, 0, ...sourcesCopy));
}

function isObject(item: any) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

function findNonConflictingKeyInTarget(target: any, key: string, depth: number): string {
  if (depth > MAX_CONFLICT_PREFIX_DEPTH) {
    return `${conflictResolutionPrefix}${key}`;
  }
  const targetContainsKey = findCaseInsensitiveKey(target, key);
  if (targetContainsKey != null) {
    return findNonConflictingKeyInTarget(target, `${conflictResolutionPrefix}${key}`, depth + 1);
  } else {
    return key;
  }
}

function findCaseInsensitiveKey(target: any, key: string): string | undefined {
  const lowerKey = key.toLowerCase();
  const keys = Object.keys(target);
  for (const existingKey of keys) {
    if (existingKey.toLowerCase() === lowerKey) {
      return existingKey;
    }
  }
  return undefined;
}

function deepSortObject(value: any): any {
  if (Array.isArray(value)) {
    return value.map((item) => deepSortObject(item));
  }
  if (!isObject(value)) {
    return value;
  }

  const sortedObject = sortObject(value) as any;
  for (const key of Object.keys(sortedObject)) {
    sortedObject[key] = deepSortObject(sortedObject[key]);
  }
  return sortedObject;
}

const conflictResolutionPrefix = '_';
