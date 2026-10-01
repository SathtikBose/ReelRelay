const pino = require("pino");
const pinoHttp = require("pino-http");
const { env } = require("../config/env");

const redactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['x-hub-signature-256']",
  "res.headers['set-cookie']",
  "access_token",
  "token",
  "password",
  "adminPassword",
  "sessionSecret",
  "csrfSecret",
  "encryptionKey",
  "tokenCipher",
  "tokenIv",
  "tokenTag",
  "*.access_token",
  "*.password",
  "*.tokenCipher",
];

const logger = pino({
  level: env.LOG_LEVEL || "info",
  redact: {
    paths: redactPaths,
    censor: "[REDACTED]",
  },
  base: {
    service: "reelrelay",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Express HTTP logger middleware using pino-http
 */
const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.headers["x-request-id"] || req.id,
  autoLogging: {
    ignore: (_req) => true, // Silences all routine HTTP request spam
  },
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return "error";
    if (res.statusCode >= 400) return "warn";
    return "silent";
  },
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      query: req.query,
      params: req.params,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});

module.exports = {
  logger,
  httpLogger,
};
