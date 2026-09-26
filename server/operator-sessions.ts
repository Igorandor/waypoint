import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { ApiError } from './upstream.js';
export type OperatorSession = {
  auth: string;
  csrf: string;
  info: any;
  activity: any[];
  expires: number;
  idleUntil: number;
};
export class Operators {
  private records: Record<string, OperatorSession> = Object.create(null);
  private logins = new Map<string, number[]>();
  constructor(
    private clock: () => number,
    private secure: boolean,
  ) {}
  budget(address: string) {
    const cutoff = this.clock() - 60000;
    for (const [key, times] of this.logins) {
      const recent = times.filter((time) => time >= cutoff);
      if (recent.length) this.logins.set(key, recent);
      else this.logins.delete(key);
    }
    const recent = this.logins.get(address) ?? [];
    if (recent.length >= 10) throw new ApiError(429, 'Sign-in limit reached. Wait one minute.');
    this.logins.set(address, [...recent, this.clock()]);
  }
  establish(req: Request, res: Response, auth: string, info: any) {
    this.expire();
    if (Object.keys(this.records).length >= 100)
      throw new ApiError(503, 'All operator session slots are in use.');
    this.remove(req, res, false);
    const id = randomBytes(32).toString('hex'),
      csrf = randomBytes(32).toString('hex'),
      time = this.clock();
    this.records[id] = {
      auth,
      csrf,
      info,
      activity: [],
      expires: time + 8 * 3600000,
      idleUntil: time + 30 * 60000,
    };
    res.cookie('waypoint_session', id, {
      path: '/',
      sameSite: 'strict',
      httpOnly: true,
      secure: this.secure,
      maxAge: 8 * 3600000,
    });
    return { info, csrf };
  }
  private expire() {
    for (const [id, record] of Object.entries(this.records))
      if (this.clock() > Math.min(record.expires, record.idleUntil)) delete this.records[id];
  }
  remove(req: Request, res: Response, clear = true) {
    delete this.records[req.cookies?.waypoint_session];
    if (clear) res.clearCookie('waypoint_session', { path: '/' });
  }
  require = (req: Request, res: Response, next: NextFunction) => {
    this.expire();
    const session = this.records[req.cookies?.waypoint_session];
    if (!session) throw new ApiError(401, 'Your session has ended. Sign in to continue.');
    if (!['GET', 'HEAD'].includes(req.method)) {
      const received = Buffer.from(req.get('x-csrf-token') ?? ''),
        expected = Buffer.from(session.csrf);
      if (received.length !== expected.length || !timingSafeEqual(received, expected))
        throw new ApiError(403, 'Invalid request token.');
    }
    session.idleUntil = this.clock() + 30 * 60000;
    res.locals.session = session;
    next();
  };
}
