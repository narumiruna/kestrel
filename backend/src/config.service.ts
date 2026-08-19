export class ConfigService {
  get<T extends string = string>(key: string): T | undefined {
    return process.env[key] as T | undefined;
  }
}
