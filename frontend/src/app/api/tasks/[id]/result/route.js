import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";

// ─── Recursively find all files matching a pattern ───────────────────────────
function findFiles(dir, predicate, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findFiles(fullPath, predicate, results);
    } else if (entry.isFile() && predicate(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function flattenObject(obj, prefix = "") {
  const rows = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      rows.push(...flattenObject(v, key));
    } else if (Array.isArray(v)) {
      if (v.length === 0) {
        rows.push({ Key: key, Value: "[]" });
      } else if (typeof v[0] !== "object") {
        rows.push({ Key: key, Value: v.join(", ") });
      }
      // arrays-of-objects are handled as separate sheets
    } else {
      rows.push({ Key: key, Value: v ?? "" });
    }
  }
  return rows;
}

function styleSheet(ws, headerColor = "4F81BD") {
  if (!ws["!ref"]) return;
  const range = XLSX.utils.decode_range(ws["!ref"]);

  for (let C = range.s.c; C <= range.e.c; C++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c: C });
    if (!ws[addr]) continue;
    ws[addr].s = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: headerColor } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: { bottom: { style: "thin", color: { rgb: "CCCCCC" } } },
    };
  }

  const colWidths = [];
  for (let C = range.s.c; C <= range.e.c; C++) {
    let max = 10;
    for (let R = range.s.r; R <= range.e.r; R++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (cell?.v != null) max = Math.max(max, String(cell.v).length + 2);
    }
    colWidths.push({ wch: Math.min(max, 60) });
  }
  ws["!cols"] = colWidths;
  ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft" };
}

function buildWorkbook(result) {
  const wb = XLSX.utils.book_new();

  if (Array.isArray(result)) {
    const rows = result.length > 0 && typeof result[0] === "object"
      ? result
      : result.map((v) => ({ Value: v }));
    const ws = XLSX.utils.json_to_sheet(rows);
    styleSheet(ws, "4F81BD");
    XLSX.utils.book_append_sheet(wb, ws, "Results");
    return wb;
  }

  if (typeof result === "object" && result !== null) {
    const summaryRows = [];
    const arraySections = {};

    for (const [k, v] of Object.entries(result)) {
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") {
        arraySections[k] = v;
      } else if (Array.isArray(v)) {
        summaryRows.push({ Key: k, Value: v.join(", ") });
      } else if (typeof v === "object" && v !== null) {
        summaryRows.push(...flattenObject(v, k));
      } else {
        summaryRows.push({ Key: k, Value: v ?? "" });
      }
    }

    if (summaryRows.length > 0) {
      const ws = XLSX.utils.json_to_sheet(summaryRows);
      styleSheet(ws, "4F81BD");
      XLSX.utils.book_append_sheet(wb, ws, "Summary");
    }

    for (const [key, rows] of Object.entries(arraySections)) {
      const ws = XLSX.utils.json_to_sheet(rows);
      styleSheet(ws, "70AD47");
      XLSX.utils.book_append_sheet(wb, ws, key.slice(0, 31));
    }

    if (wb.SheetNames.length > 0) return wb;
  }

  // Fallback
  const ws = XLSX.utils.aoa_to_sheet([["Raw Output"], [JSON.stringify(result, null, 2)]]);
  XLSX.utils.book_append_sheet(wb, ws, "Raw JSON");
  return wb;
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(req, { params }) {
  try {
    const { id } = await params;

    const basePath = path.join(process.cwd(), "..", "shared_storage", "outputs", id);

    if (!fs.existsSync(basePath)) {
      return NextResponse.json({ error: "Task output not found" }, { status: 404 });
    }

    // ✅ Recursively find all real files ending in _output.json
    const outputFiles = findFiles(basePath, (name) => name.endsWith("_output.json"));

    if (outputFiles.length === 0) {
      // Debug: log what IS in the directory tree so you can inspect
      console.error(
        "[result] No _output.json file found. Directory contents:",
        JSON.stringify(findFiles(basePath, () => true), null, 2)
      );
      return NextResponse.json({ error: "Output file missing" }, { status: 404 });
    }

    // ✅ Sort to ensure we pick the output from the last node (e.g., node_1 over node_0)
    outputFiles.sort((a, b) => {
      const getIndex = (fp) => {
        // match something like node_5_output in the path
        const match = fp.match(/node_(\d+)_output/);
        return match ? parseInt(match[1], 10) : -1;
      };
      return getIndex(b) - getIndex(a); // descending: highest index first
    });

    // Use the match from the highest node; log if there are multiple
    if (outputFiles.length > 1) {
      console.warn("[result] Multiple output files found, using the one from the last node:", outputFiles[0]);
    }

    const filePath = outputFiles[0];
    console.log("[result] Reading:", filePath);

    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    const result = parsed?.json?.[2] ?? parsed;

    const wb = buildWorkbook(result);

    const xlsxBuffer = XLSX.write(wb, {
      type: "buffer",
      bookType: "xlsx",
      cellStyles: true,
    });

    return new NextResponse(xlsxBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="task_${id}_result.xlsx"`,
      },
    });
  } catch (err) {
    console.error("[result] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}