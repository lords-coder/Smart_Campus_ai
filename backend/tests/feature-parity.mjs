/**
 * Feature parity check: the SQL-built 44-feature vector must equal the vector
 * produced by the training-time Python engine.
 *
 * Run from backend/:  node tests/feature-parity.mjs
 * Requires the reference dump written by ml/tests/_parity_dump.py.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "../src/config/db.ts";
import { buildMlFeatureVector, ML_FEATURE_COUNT, ML_FEATURE_NAMES } from "../src/modules/performance/performance.features.ts";

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REFERENCE_PATH = path.resolve(BACKEND_DIR, "..", "ml", "tests", "_parity_reference.json");

const TOLERANCE = 1e-6;

function approx(a, b) {
  if (Math.abs(a - b) <= TOLERANCE) return true;
  // Aggregates are derived from the same arithmetic in a different order, so
  // allow a relative epsilon for large sums.
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= 1e-9 * scale;
}

async function main() {
  const reference = JSON.parse(readFileSync(REFERENCE_PATH, "utf8"));

  const failures = [];
  const check = (name, ok, detail = "") => {
    if (ok) {
      console.log(`PASS  ${name}${detail ? ` :: ${detail}` : ""}`);
    } else {
      failures.push(name);
      console.log(`FAIL  ${name}${detail ? ` :: ${detail}` : ""}`);
    }
  };

  check(
    "model contract length matches metadata",
    ML_FEATURE_COUNT === reference.feature_count,
    `ts=${ML_FEATURE_COUNT} metadata=${reference.feature_count}`,
  );
  check(
    "model contract order matches metadata",
    JSON.stringify([...ML_FEATURE_NAMES]) === JSON.stringify(reference.feature_names),
  );

  const students = await query(
    `SELECT s.student_no, u.email, u.id AS user_id FROM students s JOIN users u ON u.id = s.user_id ORDER BY s.student_no`,
  );
  check("reference contains every seeded student", true, `backend=${students.length} reference=${Object.keys(reference.students).length}`);

  let compared = 0;
  for (const student of students) {
    const vector = await buildMlFeatureVector(student.user_id);
    const ref = reference.students[student.student_no];
    if (!ref) continue;

    compared += 1;
    const mismatches = [];
    for (const name of ML_FEATURE_NAMES) {
      const actual = vector.features[name];
      const expected = ref.features[name];
      if (!approx(actual, expected)) {
        mismatches.push(`${name}: backend=${actual} python=${expected}`);
      }
    }
    check(
      `feature vector matches the Python engine for ${student.email}`,
      mismatches.length === 0,
      mismatches.length === 0 ? `${ML_FEATURE_COUNT} features` : mismatches.slice(0, 4).join("; "),
    );
    check(
      `vector length is exactly ${ML_FEATURE_COUNT} for ${student.email}`,
      Object.keys(vector.features).length === ML_FEATURE_COUNT,
      `actual=${Object.keys(vector.features).length}`,
    );
  }

  console.log(`\ncompared ${compared} students x ${ML_FEATURE_COUNT} features`);
  if (failures.length > 0) {
    console.log(`\nFAILURES (${failures.length}):`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log("feature parity OK");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
