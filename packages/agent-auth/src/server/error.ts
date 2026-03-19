type HTTPStatus =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PRECONDITION_FAILED"
  | "INTERNAL_SERVER_ERROR";

const STATUS_CODES: Record<HTTPStatus, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  INTERNAL_SERVER_ERROR: 500,
};

export class AgentAuthError extends Error {
  readonly statusCode: number;
  readonly status: HTTPStatus;
  readonly body: Record<string, unknown>;
  readonly headers: Record<string, string>;

  constructor(
    status: HTTPStatus,
    body: Record<string, unknown>,
    headers: Record<string, string> = {},
  ) {
    super((body.message as string) ?? (body.error as string) ?? status);
    this.status = status;
    this.statusCode = STATUS_CODES[status];
    this.body = body;
    this.headers = headers;
  }

  toResponse(): Response {
    return new Response(JSON.stringify(this.body), {
      status: this.statusCode,
      headers: {
        "Content-Type": "application/json",
        ...this.headers,
      },
    });
  }
}

export interface ErrorDef {
  readonly code: string;
  readonly message: string;
}

export function agentError(
  status: HTTPStatus,
  err: ErrorDef,
  overrideMessage?: string,
  headers?: Record<string, string>,
  extra?: Record<string, unknown>,
): AgentAuthError {
  return new AgentAuthError(
    status,
    {
      error: err.code,
      message: overrideMessage ?? err.message,
      ...extra,
    },
    headers ?? {},
  );
}

export function agentAuthChallenge(baseURL: string): Record<string, string> {
  const origin = new URL(baseURL).origin;
  return {
    "WWW-Authenticate": `AgentAuth discovery="${origin}/.well-known/agent-configuration"`,
  };
}
