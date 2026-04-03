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
        userIdHeader: {
          type: "apiKey",
          in: "header",
          name: "x-user-id",
          description: "Your user ID",
        },
        userRoleHeader: {
          type: "apiKey",
          in: "header",
          name: "x-user-role",
          description: "Your role (e.g., owner, analyst)",
        },
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
      ? path.join(process.cwd(), ".next/server/app/api/**/*.ts")
      : path.join(process.cwd(), "src/app/api/**/*.ts"),
  ],
};

export const swaggerSpec = swaggerJsdoc(options);