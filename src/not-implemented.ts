/** Marks a module that exists in the final architecture but is not yet written. */
export function notImplemented(what: string): never {
  throw new Error(`not implemented: ${what}`);
}
