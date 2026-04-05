export function sortObject(foo: any): object {
  const keys = Object.keys(foo).sort();
  const sortedObject: any = {};
  for (const key of keys) {
    sortedObject[key] = foo[key];
  }
  return sortedObject;
}
