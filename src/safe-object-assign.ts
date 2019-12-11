import { sortObject } from './sort-object';

export function mergeDeepSafe(target: any, ...sources: any): any {
  if (!sources.length) {
    return target;
  }
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      // noinspection JSUnfilteredForInLoop
      if (isObject(source[key])) {
        // noinspection JSUnfilteredForInLoop
        if (!target[key]) {
          // noinspection JSUnfilteredForInLoop
          Object.assign(target, { [key]: {} });
          target = sortObject(target);
        }
        // noinspection JSUnfilteredForInLoop
        mergeDeepSafe(target[key], source[key]);
      } else {
        // noinspection JSUnfilteredForInLoop
        const targetKey = findNonConflictingKeyInTarget(target, key);
        // noinspection JSUnfilteredForInLoop
        Object.assign(target, { [targetKey]: source[key] });
        target = sortObject(target);
      }
    }
  }

  return mergeDeepSafe(target, ...sources);
}

function isObject(item: any) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

function findNonConflictingKeyInTarget(target: any, key: string): string {
  const targetContainsKey = Object.keys(target).find(k => k.toLowerCase() === key);
  if (targetContainsKey != null) {
    return findNonConflictingKeyInTarget(target, `_${key}`);
  } else {
    return key;
  }
}
