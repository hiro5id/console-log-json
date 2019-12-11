export function sortObject(foo: any): object {
  const keys = Object.keys(foo);
  const objectArray: Array<{ key: string; val: object }> = [];
  keys.forEach((k: string) => {
    objectArray.push({ key: k, val: foo[k] });
  });

  const sorted = objectArray.sort((a, b) => {
    return a.key === b.key ? 0 : a.key < b.key ? -1 : 1;
  });

  const sortedObject: any = {};
  sorted.forEach(p => {
    sortedObject[p.key] = p.val;
  });
  return sortedObject;
}
