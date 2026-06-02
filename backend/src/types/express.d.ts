import type { AdminLevel, UserRole } from "../modules/auth/user.model";
import type { AdminPermissionsMap } from "../modules/admin/adminPermissions";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: UserRole; adminLevel?: AdminLevel };
      /** Resolved platform permissions for limited admins (super admins have all). */
      adminPermissions?: AdminPermissionsMap;
    }
  }
}

export {};

