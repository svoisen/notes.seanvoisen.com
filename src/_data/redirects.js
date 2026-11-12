import fs from "node:fs";
import path from "node:path";

// Already normalized by the publish command; the build only renders it.
export default function () {
  const file = path.resolve("publish/redirects.json");
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
