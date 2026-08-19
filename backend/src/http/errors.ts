export const HttpStatus = {
  BAD_REQUEST: 400,
  CONFLICT: 409,
  GONE: 410,
  INTERNAL_SERVER_ERROR: 500,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  SERVICE_UNAVAILABLE: 503,
  TOO_MANY_REQUESTS: 429,
  UNAUTHORIZED: 401,
} as const;

export type HttpExceptionResponse = string | Record<string, unknown>;

export class HttpException extends Error {
  private readonly response: HttpExceptionResponse;
  private readonly status: number;

  constructor(response: HttpExceptionResponse, status: number) {
    super(resolveMessage(response));
    this.name = new.target.name;
    this.response = response;
    this.status = status;
  }

  getResponse(): HttpExceptionResponse {
    return this.response;
  }

  getStatus(): number {
    return this.status;
  }
}

export class BadRequestException extends HttpException {
  constructor(response?: HttpExceptionResponse) {
    super(
      createBody(response, 'Bad Request', HttpStatus.BAD_REQUEST),
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class UnauthorizedException extends HttpException {
  constructor(response?: HttpExceptionResponse) {
    super(
      createBody(response, 'Unauthorized', HttpStatus.UNAUTHORIZED),
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class NotFoundException extends HttpException {
  constructor(response?: HttpExceptionResponse) {
    super(
      createBody(response, 'Not Found', HttpStatus.NOT_FOUND),
      HttpStatus.NOT_FOUND,
    );
  }
}

export class ConflictException extends HttpException {
  constructor(response?: HttpExceptionResponse) {
    super(
      createBody(response, 'Conflict', HttpStatus.CONFLICT),
      HttpStatus.CONFLICT,
    );
  }
}

export class GoneException extends HttpException {
  constructor(response?: HttpExceptionResponse) {
    super(createBody(response, 'Gone', HttpStatus.GONE), HttpStatus.GONE);
  }
}

export class PayloadTooLargeException extends HttpException {
  constructor(response?: HttpExceptionResponse) {
    super(
      createBody(response, 'Payload Too Large', HttpStatus.PAYLOAD_TOO_LARGE),
      HttpStatus.PAYLOAD_TOO_LARGE,
    );
  }
}

export class InternalServerErrorException extends HttpException {
  constructor(response?: HttpExceptionResponse) {
    super(
      createBody(
        response,
        'Internal Server Error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      ),
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

export class ServiceUnavailableException extends HttpException {
  constructor(response?: HttpExceptionResponse) {
    super(
      createBody(
        response,
        'Service Unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      ),
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

function createBody(
  response: HttpExceptionResponse | undefined,
  error: string,
  statusCode: number,
): HttpExceptionResponse {
  if (response == null) {
    return { message: error, statusCode };
  }

  return typeof response === 'string'
    ? { error, message: response, statusCode }
    : response;
}

function resolveMessage(response: HttpExceptionResponse): string {
  if (typeof response === 'string') {
    return response;
  }

  return typeof response.message === 'string'
    ? response.message
    : 'Http Exception';
}
