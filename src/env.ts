import type { ErankSession } from "./session.js";

export interface Env {
  ERANK_USERNAME: string;
  ERANK_PASSWORD: string;
  MCP_BEARER: string;
  ERANK_SESSION: DurableObjectNamespace<ErankSession>;
}

let current: Env;
export const setEnv = (value: Env) => { current = value; };
export const env = () => current;
