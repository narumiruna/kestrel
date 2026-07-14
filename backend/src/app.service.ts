import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma/prisma.service';

type HealthResponse = {
  service: string;
  status: 'ok';
};

type ServiceInfoResponse = {
  environment: string;
  phase: 'bootstrap';
  service: string;
};

@Injectable()
export class AppService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
  ) {}

  async getHealth(): Promise<HealthResponse> {
    try {
      await this.prismaService.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('database is not ready');
    }

    return {
      service: 'kestrel-cloud-api',
      status: 'ok',
    };
  }

  getServiceInfo(): ServiceInfoResponse {
    return {
      environment: this.configService.get<string>('NODE_ENV') ?? 'development',
      phase: 'bootstrap',
      service: 'kestrel-cloud-api',
    };
  }
}
