// src/app/api/github/proxy/route.js
import { NextResponse } from "next/server";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const endpoint = searchParams.get("endpoint");

  if (!endpoint) {
    return NextResponse.json({ error: "Endpoint is required" }, { status: 400 });
  }

  try {
    // Basic validation to prevent arbitrary URL proxying
    if (!endpoint.startsWith("https://api.github.com/repos/")) {
       return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });
    }

    const response = await fetch(endpoint, {
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "ML Pipeline-App"
      }
    });

    if (!response.ok) {
       const errorData = await response.json();
       return NextResponse.json(errorData, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("GitHub Proxy Error:", error);
    return NextResponse.json({ error: "Failed to fetch from GitHub" }, { status: 500 });
  }
}
