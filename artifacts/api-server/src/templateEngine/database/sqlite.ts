import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

// Project root (api-server)
const ROOT = process.cwd();

// Database location
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "adie.db");

// SQL schema
const SCHEMA_PATH = path.join(
    ROOT,
    "src",
    "templateEngine",
    "database",
    "schema.sql"
);

// Create data folder if it doesn't exist
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Open (or create) the database
const db = new Database(DB_PATH);

// Read schema.sql
const schema = fs.readFileSync(SCHEMA_PATH, "utf8");

// Create tables
db.exec(schema);

console.log("✅ ADIE database initialized.");

export default db;