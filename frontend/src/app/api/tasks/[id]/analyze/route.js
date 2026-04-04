import { NextResponse } from "next/server";
import fs from "fs/promises";
import { requireAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Task from "@/models/Task";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * @swagger
 * /api/tasks/{id}/analyze:
 *   post:
 *     summary: Analyze failed pipeline task logs using Gemini LLM
 *     description: Reads logs of a failed task and generates a structured debugging summary using Gemini.
 *     tags:
 *       - Tasks
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Task ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Analysis generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 analysis:
 *                   type: string
 *                   example: |
 *                     ERROR SUMMARY: Model crashed
 *                     ROOT CAUSE: Invalid input format
 *                     RESOLUTION: Fix schema mismatch
 *                     NOTES: Ensure validation
 *       400:
 *         description: Task not failed
 *       404:
 *         description: Task or logs not found
 *       500:
 *         description: Server error
 */
export async function POST(req, { params }) {
  const { session, response } = await requireAuth();
  if (response) return response;

  try {
    const { id } = await params;
    await connectDB();

    const task = await Task.findOne({ _id: id, userId: session.userId })
      .populate("pipelineId", "name")
      .populate("modelId", "name dockerImage");

    if (!task) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    if (task.status !== "failed") {
      return NextResponse.json(
        { error: "Analysis only available for failed tasks." },
        { status: 400 },
      );
    }

    if (!task.localLogsPath) {
      return NextResponse.json(
        { error: "No logs exist for this task." },
        { status: 404 },
      );
    }

    // 1. Read Logs
    const logContent = await fs
      .readFile(task.localLogsPath, "utf-8")
      .catch(() => null);
    if (!logContent) {
      return NextResponse.json(
        { error: "Log file on disk is missing or unreadable." },
        { status: 404 },
      );
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured in environment." },
        { status: 500 },
      );
    }

    // 2. Build the precise prompt
    const prompt = `Output format (plain text, strictly follow):

ERROR SUMMARY:
Provide a concise but descriptive summary of the failure, clearly mentioning the affected component and the type of failure.

ROOT CAUSE:
Provide a detailed technical explanation of the underlying issue. Include probable triggers such as invalid schema, missing file, memory overflow, API failure, dependency mismatch, or runtime exceptions. Explain the failure mechanism clearly in paragraph form.

RESOLUTION:
Provide step-by-step corrective actions in paragraph form. Include the immediate fix, preventive measures, and any required configuration or code changes. Ensure the steps are actionable and technically accurate.

NOTES:
Include any additional relevant insights in paragraph form. This may include observed anomalies in logs, potential edge cases, and recommendations for improving logging, monitoring, or validation.

Constraints:
Be precise, technical, and focused on diagnosis. Do not repeat or dump logs. Avoid generic advice. Infer intelligently if logs are partial or truncated. Focus on root cause rather than symptoms. Maintain strict section formatting with uppercase labels.
`;

    // 3. Call Gemini
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2, // Low temp for analytical consistency
            maxOutputTokens: 1000,
          },
        }),
      },
    );

    if (!geminiRes.ok) {
      const errorData = await geminiRes.text();
      console.error("[AI Analysis] Gemini API Error:", errorData);
      return NextResponse.json(
        { error: "Failed to communicate with LLM provider." },
        { status: 502 },
      );
    }

    const data = await geminiRes.json();
    const candidateText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No analysis generated.";

    return NextResponse.json({ analysis: candidateText.trim() });
  } catch (error) {
    console.error("[AI Analysis] API Error:", error);
    return NextResponse.json(
      { error: "Internal server error analyzing logs." },
      { status: 500 },
    );
  }
}
