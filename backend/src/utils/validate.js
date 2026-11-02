import { HttpError } from "./httpError.js";

export const requireFields = (body, fields) => {
  const missing = fields.filter(
    (field) =>
      body[field] === undefined ||
      body[field] === null ||
      body[field] === ""
  );

  if (missing.length) {
    throw new HttpError(
      400,
      `Missing required fields: ${missing.join(", ")}`
    );
  }
};