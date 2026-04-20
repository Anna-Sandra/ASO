import type { NextFunction, Request, Response } from "express";

export function asyncHandler<
  Req extends Request = Request,
  Res extends Response = Response
>(fn: (req: Req, res: Res, next: NextFunction) => Promise<unknown>) {
  return (req: Req, res: Res, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

