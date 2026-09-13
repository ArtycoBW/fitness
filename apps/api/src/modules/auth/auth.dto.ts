import {
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateBy,
} from "class-validator";
import { Transform } from "class-transformer";
import { passwordError, normalizePhone } from "@fitness/validation";
const NewPassword = () =>
  ValidateBy({
    name: "newPassword",
    validator: {
      validate: (value: unknown) =>
        typeof value === "string" && !passwordError(value),
      defaultMessage: (args) =>
        typeof args?.value === "string"
          ? (passwordError(args.value) ?? "Укажите надёжный пароль")
          : "Укажите пароль",
    },
  });
export class LoginDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @Length(12, 128) password!: string;
}
export class RegisterDto extends LoginDto {
  @NewPassword() declare password: string;
  @IsString() @Length(2, 100) name!: string;
  @IsIn([true]) consent!: boolean;
}
export class EmailDto {
  @IsEmail() @MaxLength(254) email!: string;
}
export class TokenDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) token!: string;
}
export class ResetDto extends TokenDto {
  @IsString() @NewPassword() password!: string;
}
export class ProfileDto {
  @IsOptional() @IsString() @Length(2, 100) name?: string;
  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === "string" ? (normalizePhone(value) ?? value) : value,
  )
  @Matches(/^\+7\d{10}$/, {
    message: "Укажите телефон в формате +7 (999) 123-45-67",
  })
  phone?: string;
}
export class PasswordDto {
  @IsString() @Length(12, 128) currentPassword!: string;
  @IsString() @NewPassword() password!: string;
}
export class InviteDto extends EmailDto {
  @IsString() @Length(2, 100) name!: string;
  @IsArray()
  @IsIn(["ADMIN", "RECEPTION", "TRAINER"], { each: true })
  roles!: Array<"ADMIN" | "RECEPTION" | "TRAINER">;
}
export class AcceptInviteDto extends ResetDto {}
export class RolesDto {
  @IsArray()
  @IsIn(["ADMIN", "RECEPTION", "TRAINER", "CLIENT"], { each: true })
  roles!: Array<"ADMIN" | "RECEPTION" | "TRAINER" | "CLIENT">;
}
export class BlockDto {
  @IsIn([true, false]) blocked!: boolean;
  @IsString() @Length(3, 500) reason!: string;
}
