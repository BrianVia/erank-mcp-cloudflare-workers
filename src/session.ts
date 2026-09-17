import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env.js";

const BASE = "https://members.erank.com";
const BROWSER_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
  + "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const CACHE_TTL = 60 * 60_000;

type Cached = { value: unknown; expiresAt: number };

export class ErankSession extends DurableObject<Env> {
  private cookies?: Map<string, string>;
  private inflight?: Promise<void>;
  // ponytail: in-memory cache only; add persisted entries if eviction becomes costly.
  private cache = new Map<string, Cached>();
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  async api(path: string): Promise<unknown> {
    const pending = this.queue.then(() => this.get(path));
    this.queue = pending.catch(() => undefined);
    return pending;
  }

  async status(): Promise<{ authorized: boolean; loginAt: string | null; cached: number }> {
    const [cookies, loginAt] = await Promise.all([this.jar(), this.ctx.storage.get<number>("loginAt")]);
    return {
      authorized: cookies.size > 0,
      loginAt: loginAt === undefined ? null : new Date(loginAt).toISOString(),
      cached: this.cache.size,
    };
  }

  async invalidate(): Promise<void> {
    await this.clearCookies();
    this.cache.clear();
  }

  private async get(path: string): Promise<unknown> {
    const cached = this.cache.get(path);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if ((await this.jar()).size === 0) await this.login();
    const wait = 250 - (Date.now() - this.lastRequestAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    let response = await this.raw(path, { method: "GET" });
    this.lastRequestAt = Date.now();
    if ([301, 302, 401, 419].includes(response.status)) {
      await this.clearCookies();
      await this.login();
      response = await this.raw(path, { method: "GET" });
      this.lastRequestAt = Date.now();
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`eRank GET ${path} failed: HTTP ${response.status}${body ? ` — ${body.slice(0, 200)}` : ""}`);
    }
    const value: unknown = await response.json();
    this.cache.set(path, { value, expiresAt: Date.now() + CACHE_TTL });
    return value;
  }

  private async login(): Promise<void> {
    if (!this.inflight) this.inflight = this.authenticate().finally(() => { this.inflight = undefined; });
    return this.inflight;
  }

  private async authenticate(): Promise<void> {
    await this.raw("/sanctum/csrf-cookie", { method: "GET" });
    const xsrf = (await this.jar()).get("XSRF-TOKEN");
    if (!xsrf) throw new Error("eRank did not return an XSRF-TOKEN cookie.");
    const response = await this.raw("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-XSRF-TOKEN": decodeURIComponent(xsrf) },
      body: JSON.stringify({ email: this.env.ERANK_USERNAME, password: this.env.ERANK_PASSWORD }),
    });
    if (response.status >= 400) {
      throw new Error(`eRank login failed (HTTP ${response.status}). Check ERANK_USERNAME/ERANK_PASSWORD.`);
    }
    await this.ctx.storage.put("loginAt", Date.now());
  }

  private async raw(path: string, init: RequestInit): Promise<Response> {
    const cookies = await this.jar();
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    headers.set("User-Agent", BROWSER_USER_AGENT);
    if (cookies.size) headers.set("Cookie", [...cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    headers.set("Origin", BASE);
    headers.set("Referer", `${BASE}/`);
    headers.set("X-Requested-With", "XMLHttpRequest");
    headers.set("X-User-Agent", "erank-app/3.0");
    const response = await fetch(`${BASE}${path}`, {
      ...init, headers, redirect: "manual", signal: AbortSignal.timeout(30_000),
    });
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(";", 1)[0] ?? "", at = pair.indexOf("=");
      if (at > 0) cookies.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
    }
    await this.ctx.storage.put("cookies", Object.fromEntries(cookies));
    return response;
  }

  private async jar(): Promise<Map<string, string>> {
    if (!this.cookies) {
      const stored = await this.ctx.storage.get<Record<string, string>>("cookies");
      this.cookies = new Map(Object.entries(stored ?? {}));
    }
    return this.cookies;
  }

  private async clearCookies(): Promise<void> {
    this.cookies = new Map();
    await this.ctx.storage.delete("cookies");
  }
}
