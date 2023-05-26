export type EntryProcessor = (key: string, value: any) => any;

/**
 *  Stringifies JSON objects into strings in a safe way so that it can handle recursion and cyclical references
 *
 * @param obj the object to serialize
 * @param serializer custom serializer
 * @param indent indent for JSON formatting
 * @param decycler a function to use when a cyclical refernce is found
 * @returns the JSON string represantation
 */
export function jsonStringifySafe(obj: any, serializer?: EntryProcessor, indent?: string | number, decycler?: EntryProcessor): string {
  const foo = getSerialize(serializer, decycler);
  return JSON.stringify(obj, foo as any, indent);
}

export function getSerialize(serializer?: EntryProcessor, decycler?: EntryProcessor): EntryProcessor {
  const stack: any[] = [];
  const keys: any[] = [];

  if (decycler == null)
    decycler = (_key: any, value: any) => {
      if (stack[0] === value) return '[Circular ~]';
      return '[Circular ~.' + keys.slice(0, stack.indexOf(value)).join('.') + ']';
    };

  return function (key, value) {
    if (stack.length > 0) {
      const thisPos = stack.indexOf(this);
      if (thisPos === -1) {
        stack.push(this);
      } else {
        stack.splice(thisPos + 1);
      }
      if (thisPos === -1) {
        keys.push(key);
      } else {
        keys.splice(thisPos, Infinity, key);
      }
      if (stack.includes(value)) value = decycler!.call(this, key, value);
    } else {
      stack.push(value);
    }

    return serializer == null ? value : serializer.call(this, key, value);
  };
}
