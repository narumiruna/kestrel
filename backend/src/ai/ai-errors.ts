import { HttpException } from '../http/errors';

export function aiError(code: string, status = 400): never {
  throw new HttpException({ code, message: code, statusCode: status }, status);
}

export function objectInput(input: unknown): Record<string, unknown> {
  if (input == null || typeof input !== 'object' || Array.isArray(input))
    return aiError('AI_INVALID_INPUT');
  return input as Record<string, unknown>;
}

export function generationInput(value: unknown): number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 0 ||
    Number(value) >= 2147483647
  )
    return aiError('AI_INVALID_GENERATION');
  return Number(value);
}

export function hasControlCharacters(value: string): boolean {
  return [...value].some(
    (character) =>
      character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  );
}

export function boundedString(value: unknown, maximum = 512): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > maximum ||
    hasControlCharacters(value)
  )
    return aiError('AI_INVALID_INPUT');
  return value;
}
