import { strict as assert } from "node:assert";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, makeXlsx, makeZip, sheetNames, colName } from "../src/lib/zipCore.ts";

/** The hand-rolled ZIP / XLSX writer behind the Collab export. */

test("crc32 matches the reference value", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("column names and Excel-safe sheet names", () => {
  assert.equal(colName(0), "A");
  assert.equal(colName(25), "Z");
  assert.equal(colName(26), "AA");
  assert.deepEqual(sheetNames(["J12 matrix", "j12 matrix", "a/b"]), ["J12 matrix", "j12 matrix (2)", "a b"]);
});

test("a zip opens with the system unzip and round-trips its contents", (t) => {
  let hasUnzip = true;
  try { execFileSync("unzip", ["-v"], { stdio: "ignore" }); } catch { hasUnzip = false; }
  if (!hasUnzip) return t.skip("unzip not installed");
  const dir = mkdtempSync(join(tmpdir(), "zip-"));
  const file = join(dir, "a.zip");
  writeFileSync(file, makeZip([{ name: "one.csv", data: "a,b\r\n1,2\r\n" }, { name: "two.txt", data: "ünïcødé" }]));
  execFileSync("unzip", ["-tq", file]);
  assert.equal(execFileSync("unzip", ["-p", file, "two.txt"]).toString(), "ünïcødé");
});

test("an xlsx is a zip with a workbook and one sheet per table", (t) => {
  let hasUnzip = true;
  try { execFileSync("unzip", ["-v"], { stdio: "ignore" }); } catch { hasUnzip = false; }
  if (!hasUnzip) return t.skip("unzip not installed");
  const dir = mkdtempSync(join(tmpdir(), "xlsx-"));
  const file = join(dir, "a.xlsx");
  writeFileSync(file, makeXlsx([{ name: "About", rows: [["k", "v"], ["a<b", 1]] }, { name: "Timeline", rows: [["year"], [2025]] }]));
  const list = execFileSync("unzip", ["-Z1", file]).toString();
  assert.match(list, /xl\/worksheets\/sheet2\.xml/);
  const s1 = execFileSync("unzip", ["-p", file, "xl/worksheets/sheet1.xml"]).toString();
  assert.match(s1, /a&lt;b/);
  assert.match(s1, /<v>1<\/v>/);
});
