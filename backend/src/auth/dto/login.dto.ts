import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PASSWORD_MIN_LENGTH, PASSWORD_RULE_MESSAGE } from '../../common/username';

export class LoginDto {
  @ApiProperty({
    example: 'admin',
    description: 'Email hoặc tên đăng nhập - hệ thống tự nhận diện theo dấu @',
  })
  @IsString()
  @MinLength(3, { message: 'Vui lòng nhập email hoặc tên đăng nhập' })
  identifier: string;

  @ApiProperty({ example: 'Admin@123456' })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_RULE_MESSAGE })
  password: string;
}
