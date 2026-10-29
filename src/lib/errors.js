/**
 * Base custom application error class
 */
class AppError extends Error {
  /**
   * @param {string} message
   * @param {number} [statusCode=500]
   * @param {string} [code="INTERNAL_ERROR"]
   * @param {Array<unknown>} [details=[]]
   */
  constructor(message, statusCode = 500, code = "INTERNAL_ERROR", details = []) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message = "Validation failed", details = []) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
  }
}

class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
  }
}

class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404, "NOT_FOUND");
  }
}

class ConflictError extends AppError {
  constructor(message = "Resource conflict") {
    super(message, 409, "CONFLICT");
  }
}

class InstagramApiError extends AppError {
  /**
   * @param {string} message
   * @param {number} statusCode
   * @param {string|number} igCode
   * @param {string|number} [igSubcode]
   * @param {string} [errorType="transient"]
   */
  constructor(message, statusCode, igCode, igSubcode, errorType = "transient") {
    super(message, statusCode, "INSTAGRAM_API_ERROR");
    this.igCode = igCode;
    this.igSubcode = igSubcode;
    this.errorType = errorType; // "transient" | "permanent" | "auth"
  }
}

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  InstagramApiError,
};
