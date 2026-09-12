import {
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from "class-validator";
export class LoginDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @Length(12, 128) password!: string;
}
export class RegisterDto extends LoginDto {
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
  @IsString() @Length(12, 128) password!: string;
}
export class ProfileDto {
  @IsOptional() @IsString() @Length(2, 100) name?: string;
  @IsOptional() @IsString() @Matches(/^\+?[0-9 ()-]{10,20}$/) phone?: string;
}
export class PasswordDto {
  @IsString() @Length(12, 128) currentPassword!: string;
  @IsString() @Length(12, 128) password!: string;
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
