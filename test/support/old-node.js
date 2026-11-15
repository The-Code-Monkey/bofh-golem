// Test preload: make the installer see an old Node version.
Object.defineProperty(process.versions, "node", { value: "16.0.0" });
