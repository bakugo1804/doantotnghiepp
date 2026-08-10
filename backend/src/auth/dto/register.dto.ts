import { IsEmail, IsString, MinLength, IsOptional, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PASSWORD_MIN_LENGTH, PASSWORD_RULE_MESSAGE, USERNAME_PATTERN, USERNAME_RULE_MESSAGE } from '../../common/username';

export class RegisterDto {
  @ApiProperty({ example: 'Nguyen Van A' })
  @IsString()
  fullName: string;

  @ApiProperty({ example: 'user@customs.vn' })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'nguyenvana',
    required: false,
    description: 'Bỏ trống thì hệ thống tự suy ra từ email',
  })
  @IsOptional()
  @IsString()
  @Matches(USERNAME_PATTERN, { message: USERNAME_RULE_MESSAGE })
  username?: string;

  @ApiProperty({ example: 'Password@123' })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_RULE_MESSAGE })
  password: string;

  @ApiProperty({ example: '0901234567', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  companyId?: string;

  @ApiProperty({ required: false, example: 'Công ty mới sáng lập' })
  @IsOptional()
  @IsString()
  newCompanyName?: string;
}
