"use client";

import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

export default function SwaggerUi() {
  return <SwaggerUI url="/api-docs/spec" docExpansion="none" />;
}
