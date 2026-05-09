import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { RegisterRequestDto } from './dto/register-request.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() body: RegisterRequestDto) {
    return this.authService.register(body);
  }
}
