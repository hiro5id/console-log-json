import stringify from 'json-stringify-safe';
import { sortObject } from './sort-object';
// tslint:disable-next-line:no-var-requires
/* tslint:disable:only-arrow-functions */

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

  function mergeDeep(theTarget: any, ...theSources: any): any {
    if (!theSources.length) {
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
            theTarget = sortObject(theTarget);
          }
          // noinspection JSUnfilteredForInLoop
          mergeDeep(theTarget[key], source[key]);
        } else {
          const targetMatchedKey = Object.keys(target).find((k) => k.toLowerCase() === key);
          if (
            targetMatchedKey != null &&
            mergeStringProperties != null &&
            mergeStringProperties.includes(targetMatchedKey) &&
            typeof theTarget[targetMatchedKey] === 'string' &&
            typeof source[targetMatchedKey] === 'string'
          ) {
            // merge the two strings together
            theTarget[targetMatchedKey] = `${theTarget[targetMatchedKey]} - ${source[targetMatchedKey]}`;
          } else {
            // noinspection JSUnfilteredForInLoop
            const targetKey = findNonConflictingKeyInTarget(theTarget, key);
            // noinspection JSUnfilteredForInLoop
            Object.assign(theTarget, { [targetKey]: source[key] });
          }
          theTarget = sortObject(theTarget);
        }
      }
    }

    return mergeDeep(theTarget, ...theSources);
  }

  const targetCopy = JSON.parse(stringify(target));
  const sourcesCopy = JSON.parse(stringify(sources));

  return mergeDeep(targetCopy, ...sourcesCopy);
}

function isObject(item: any) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

function findNonConflictingKeyInTarget(target: any, key: string): string {
  const targetContainsKey = Object.keys(target).find((k) => k.toLowerCase() === key);
  if (targetContainsKey != null) {
    return findNonConflictingKeyInTarget(target, `${conflictResolutionPrefix}${key}`);
  } else {
    return key;
  }
}

const conflictResolutionPrefix = '_';
