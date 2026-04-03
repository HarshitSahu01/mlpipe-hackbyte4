import swaggerJsdoc from "swagger-jsdoc";
import path from "path";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Website Blocker API",
      version: "1.0.0",
      description: "API docs for Website Blocker auth routes",
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
  // Tell swagger-jsdoc where your route files are
  apis: [
    process.env.NODE_ENV === "production"
      ? path.join(process.cwd(), ".next/server/app/api/**/*.js")
      : path.join(process.cwd(), "src/app/api/**/*.js"),
  ],
};

export const swaggerSpec = swaggerJsdoc(options);