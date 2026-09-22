import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const webRoot = join(root, "apps", "web");
const files = {
  "/app/": join(webRoot, "dist"),
  "/pkg/ui/": join(root, "packages", "ui", "dist"),
  "/pkg/contracts/": join(root, "packages", "contracts", "dist"),
  "/pkg/application/": join(root, "packages", "application", "dist"),
};
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

function inside(directory, target) {
  const base = resolve(directory);
  const full = resolve(target);
  return full === base || full.startsWith(base + sep);
}

export function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

function sendStatic(res, body, type) {
  res.writeHead(200, { "content-type": type, "cache-control": "no-store", "access-control-allow-origin": "*" });
  res.end(body);
}

export function handlePage(res, url, mount = "") {
  const pathname = mount && (url.pathname === mount || url.pathname.startsWith(`${mount}/`))
    ? url.pathname.slice(mount.length) || "/"
    : url.pathname;
  if (pathname === "/" || pathname === "/index.html") {
    const html = readFileSync(join(webRoot, "index.html"), "utf8");
    sendStatic(res, mount ? html.replaceAll('="/', `="${mount}/`).replaceAll('": "/pkg/', `": "${mount}/pkg/`) : html, types[".html"]);
    return true;
  }
  if (pathname === "/lab.css") {
    sendStatic(res, readFileSync(join(webRoot, "lab.css")), types[".css"]);
    return true;
  }
  if (pathname === "/runtime-config.js") {
    sendStatic(res, readFileSync(join(webRoot, "runtime-config.js")), types[".js"]);
    return true;
  }
  const route = Object.entries(files).find(([prefix]) => pathname.startsWith(prefix));
  if (!route) return false;
  const [prefix, directory] = route;
  const relative = decodeURIComponent(pathname.slice(prefix.length));
  if (relative.includes("\0") || relative.split("/").includes("..")) return false;
  if (prefix === "/pkg/application/" && relative !== "lab.js") return false;
  const type = types[extname(relative)];
  const target = join(directory, relative);
  if (!type || !inside(directory, target) || !existsSync(target) || !statSync(target).isFile()) return false;
  sendStatic(res, readFileSync(target), type);
  return true;
}
