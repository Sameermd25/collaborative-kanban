export const notFound = (req, res, next) => {
  const error = new Error(
    `Route not found: ${req.method} ${req.originalUrl}`
  );

  error.statusCode = 404;
  next(error);
};

export const errorHandler = (error, req, res, next) => {
  const status =
    error.statusCode ||
    (error.name === "ValidationError" ? 400 : 500);

  if (process.env.NODE_ENV !== "production") {
    console.error(error);
  }

  res.status(status).json({
    success: false,
    message: error.message || "Internal server error",
    ...(error.details ? { details: error.details } : {})
  });
};