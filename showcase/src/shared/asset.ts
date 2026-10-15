/** Resolves a file in /public. The Remotion entry swaps this for `staticFile`. */
type Env = { env?: { BASE_URL?: string } };
let resolver = (p: string) => (((import.meta as unknown as Env).env?.BASE_URL) ?? '/') + p;
export const asset = (p: string) => resolver(p);
export const setAssetResolver = (fn: (p: string) => string) => { resolver = fn; };
