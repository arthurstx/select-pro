import { z } from "zod";

import type { UserRow, NewUser, UserUpdate } from "./database.schema";

export const UserSchema = z.object({
  id: z.string().uuid("ID inválido").optional(),
  role_id: z.string().min(1, "Role é obrigatória"),
  email: z.string().email("Email inválido"),
  name: z.string().min(3, "O nome deve ter no mínimo 3 caracteres"),
  password: z.string().min(8, "A senha deve ter no mínimo 8 caracteres").nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().nullable().optional(),
});

export type User = z.infer<typeof UserSchema>;

export const CreateUserSchema = UserSchema.omit({ id: true, created_at: true, updated_at: true });
export type CreateUserDTO = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = UserSchema.partial().extend({ id: z.string().uuid() });
export type UpdateUserDTO = z.infer<typeof UpdateUserSchema>;
