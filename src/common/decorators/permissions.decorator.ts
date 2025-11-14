import { SetMetadata } from '@nestjs/common';
import { Permission } from '@prisma/client';

export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata('permissions', permissions);

