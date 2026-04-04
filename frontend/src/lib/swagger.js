// src/lib/swagger.js
import swaggerJsdoc from "swagger-jsdoc";
import path from "path";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "ML Pipeline API",
      version: "1.0.0",
      description: "API docs for ML Pipeline — Agnostic ML Inference SaaS",
    },
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "token",
        },
      },
    },
  },
  apis: [
    process.env.NODE_ENV === "production"
      ? path.join(process.cwd(), ".next/server/app/api/**/*.js")
      : path.join(process.cwd(), "src/app/api/**/*.js"),
  ],
};

export const swaggerSpec = swaggerJsdoc(options);