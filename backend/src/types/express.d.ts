import type { UserRole } from "../modules/auth/user.model";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: UserRole };
    }
  }
}

export {};

