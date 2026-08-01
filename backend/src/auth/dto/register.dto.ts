import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'Nguyen Van A' })
  @IsString()
  fullName: string;

  @ApiProperty({ example: 'user@customs.vn' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password@123' })
  @IsString()
  @MinLength(8)
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
