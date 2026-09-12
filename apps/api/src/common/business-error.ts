import { HttpException } from "@nestjs/common";
export function fail(
  code: string,
  message: string,
  status = 409,
  details?: Record<string, unknown>,
): never {
  throw new HttpException({ code, message, details }, status);
}
