"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import "swagger-ui-react/swagger-ui.css";
const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false });
export default function ApiDocs() {
  const [spec, setSpec] = useState(null);
  useEffect(() => {
    fetch("/api/docs")
      .then((r) => r.json())
      .then(setSpec);
  }, []);
  if (!spec) return <div style={{ padding: 40 }}>Loading docs...</div>;
  return <SwaggerUI spec={spec} />;
}
