import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() body: unknown) {
    return this.authService.register(body);
  }

  @Post('totp/setup')
  setupTotp(@Body() body: unknown) {
    return this.authService.setupTotp(body);
  }

  @Post('totp/verify')
  verifyTotp(@Body() body: unknown) {
    return this.authService.verifyTotp(body);
  }
}
