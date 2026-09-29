const {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  InstagramApiError,
} = require("../../src/lib/errors");

describe("Custom AppError classes", () => {
  it("creates AppError with correct defaults", () => {
    const error = new AppError("Something went wrong");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.message).toBe("Something went wrong");
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.details).toEqual([]);
    expect(error.isOperational).toBe(true);
  });

  it("creates ValidationError with status 400", () => {
    const details = [{ field: "mediaId", message: "Required" }];
    const error = new ValidationError("Invalid payload", details);
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.details).toEqual(details);
  });

  it("creates UnauthorizedError with status 401", () => {
    const error = new UnauthorizedError();
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("UNAUTHORIZED");
    expect(error.message).toBe("Unauthorized");
  });

  it("creates ForbiddenError with status 403", () => {
    const error = new ForbiddenError("Custom forbidden");
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe("FORBIDDEN");
    expect(error.message).toBe("Custom forbidden");
  });

  it("creates NotFoundError with status 404", () => {
    const error = new NotFoundError("Not found");
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("NOT_FOUND");
  });

  it("creates ConflictError with status 409", () => {
    const error = new ConflictError("Rule already exists");
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe("CONFLICT");
  });

  it("creates InstagramApiError with API properties", () => {
    const error = new InstagramApiError("Rate limited", 429, 32, undefined, "transient");
    expect(error.statusCode).toBe(429);
    expect(error.code).toBe("INSTAGRAM_API_ERROR");
    expect(error.igCode).toBe(32);
    expect(error.errorType).toBe("transient");
  });
});
